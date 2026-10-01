import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { EXTRACTION_MODEL, EXTRACTION_PROMPT } from "./model";
import {
  modelReceiptSchema,
  receiptSchema,
  type ExtractionErrorCode,
  type Receipt,
} from "./receipt-schema";

/** The only file type slice 1 wires. Later slices add PNG, WebP and PDF. */
export const ACCEPTED_MIME_TYPE = "image/jpeg";

/**
 * The file size the app refuses above. Slice 7 owns the full cap, including the
 * client-side downscale that Vercel's smaller request-body ceiling forces.
 */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

/** What one call to the model returns: the raw text of its structured answer. */
export type ModelCaller = (dataUrl: string) => Promise<string>;

export type ExtractionOutcome =
  | { status: 200; body: Receipt }
  | { status: number; body: { error: { code: ExtractionErrorCode; message: string } } };

/** The copy the browser falls back to. The page keys its own wording off the code. */
const ERROR_MESSAGES: Record<ExtractionErrorCode, string> = {
  not_jpeg: "This slice reads JPEG photographs only.",
  too_large: "That file is larger than the app accepts.",
  model_call_failed: "The extraction did not finish.",
  validation_failed: "The model's answer did not match the shape the app expects.",
};

function fail(code: ExtractionErrorCode, status: number): ExtractionOutcome {
  return { status, body: { error: { code, message: ERROR_MESSAGES[code] } } };
}

/** One OpenAI call, with the image carried inline as a base64 data URL. */
async function callOpenAI(dataUrl: string): Promise<string> {
  const client = new OpenAI({ apiKey: readApiKey() });

  const response = await client.responses.create({
    model: EXTRACTION_MODEL,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: EXTRACTION_PROMPT },
          { type: "input_image", image_url: dataUrl, detail: "high" },
        ],
      },
    ],
    text: { format: zodTextFormat(modelReceiptSchema, "receipt") },
  });

  return response.output_text;
}

/**
 * Reads the key on the server at call time. Nothing imports this from a client
 * component, and the value never reaches a response body.
 */
function readApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY is not set on the server");
  }
  return key;
}

/**
 * Carries one chosen file through to a validated receipt.
 *
 * The bytes stay in memory for the length of the call. Nothing here writes to
 * disk, to object storage or to OpenAI's Files API, because the storage policy on
 * the page says the upload lives in memory for the length of the request.
 *
 * `callModel` is injected so the tests exercise every branch without a key and
 * without a network call.
 */
export async function extractReceipt(
  form: FormData,
  callModel: ModelCaller = callOpenAI,
): Promise<ExtractionOutcome> {
  const file = form.get("file");

  if (!(file instanceof File)) {
    return fail("not_jpeg", 400);
  }

  if (file.type !== ACCEPTED_MIME_TYPE) {
    return fail("not_jpeg", 415);
  }

  if (file.size > MAX_FILE_BYTES) {
    return fail("too_large", 413);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${ACCEPTED_MIME_TYPE};base64,${bytes.toString("base64")}`;

  let answer: string;
  try {
    answer = await callModel(dataUrl);
  } catch (error) {
    // The provider's own wording never reaches the browser.
    console.error("extract: the model call failed", describe(error));
    return fail("model_call_failed", 502);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(answer);
  } catch {
    console.error("extract: the model's answer did not parse as JSON");
    return fail("validation_failed", 502);
  }

  const validated = receiptSchema.safeParse(parsed);

  if (!validated.success) {
    // The failing field paths are enough to diagnose the failure. Neither the
    // uploaded bytes nor the model's answer goes anywhere near the log.
    console.error(
      "extract: validation failed at",
      validated.error.issues.map((issue) => issue.path.join(".")).join(", "),
    );
    return fail("validation_failed", 502);
  }

  return { status: 200, body: validated.data };
}

/** A one-line description of a thrown value, with no provider text in it. */
function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.name;
  }
  return typeof error;
}
