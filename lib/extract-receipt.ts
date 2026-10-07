import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { EXTRACTION_MODEL, EXTRACTION_PROMPT } from "./model";
import { checkRateLimit, IP_HOURLY_LIMIT, type RateLimitOutcome } from "./rate-limit";
import {
  modelReceiptSchema,
  receiptSchema,
  type ExtractionError,
  type ExtractionErrorCode,
  type Receipt,
} from "./receipt-schema";

/**
 * The types the route reads, which are images alone.
 *
 * A visitor can also pick a PDF, and the page rasterizes its first page before it
 * posts, so a PDF reaches the route as one of these three. Accepting
 * `application/pdf` here would be dead code with no PDF parser behind it.
 */
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number];

/**
 * The file size the app refuses above. Slice 7 owns the full cap, including the
 * client-side downscale that Vercel's smaller request-body ceiling forces.
 */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

/**
 * The most files the route reads from one request.
 *
 * The app's own picker submits one file, so this cap only ever answers a
 * crafted request. It is enforced here because the route is the only place a
 * request carrying several files can arrive.
 */
export const MAX_FILES_PER_REQUEST = 5;

/** What one call to the model returns: the raw text of its structured answer. */
export type ModelCaller = (dataUrl: string) => Promise<string>;

/** What the route asks of the limiter, injected so the tests drive a stand-in. */
export type RateLimitCheck = (headers: Headers, cost?: number) => Promise<RateLimitOutcome>;

export type ExtractionOutcome =
  | { status: 200; body: Receipt }
  | { status: number; body: ExtractionError };

/** The copy the browser falls back to. The page keys its own wording off the code. */
const ERROR_MESSAGES: Record<ExtractionErrorCode, string> = {
  // The message names the four types a visitor can pick, not the three the route
  // reads, because a refusal that left PDF out would read as the app rejecting a
  // type the page offers.
  unsupported_type: "The app reads JPEG, PNG and WebP images and PDF receipts.",
  too_large: "That file is larger than the app accepts.",
  model_call_failed: "The extraction did not finish.",
  validation_failed: "The model's answer did not match the shape the app expects.",
  rate_limited:
    `This address has used its ${IP_HOURLY_LIMIT} extractions for the hour.` +
    " The allowance is shared by everyone sending from the same address.",
  // The browser refuses on the session cap before it posts, so the route never
  // answers with this message. It is here because the table covers the union.
  session_cap_reached: "This session has used every extraction it is allowed.",
};

/** What a visitor reads when the app could not reach its own counter. */
const LIMIT_UNCHECKED_MESSAGE =
  "The app could not check its own hourly limit, so it did not run the extraction." +
  " Try again in a minute.";

/** What a visitor reads when a request carries more files than the route reads. */
const TOO_MANY_FILES_MESSAGE = `The app reads at most ${MAX_FILES_PER_REQUEST} files in one request.`;

/** Whether the route reads this media type. */
export function isAcceptedImageType(type: string): type is AcceptedImageType {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type);
}

function fail(code: ExtractionErrorCode, status: number): ExtractionOutcome {
  return { status, body: { error: { code, message: ERROR_MESSAGES[code] } } };
}

/**
 * A refusal whose wording is not the code's own.
 *
 * Two refusals need this. A request carrying nine files fails on its count
 * rather than on one file's size, and the limiter failing to answer is a
 * different sentence from a visitor who spent their allowance. Both reuse a
 * code, because the error vocabulary stays small on purpose.
 */
function failWith(
  code: ExtractionErrorCode,
  status: number,
  message: string,
  resetAt?: number,
): ExtractionOutcome {
  return { status, body: { error: { code, message, ...(resetAt ? { resetAt } : {}) } } };
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
 * The hourly allowance is checked first, before the multipart body is parsed, so
 * a refused request costs as little as possible and never reads the bytes. That
 * puts the file count, the type and the size after it, which is the order a
 * visitor is better served by: an address over its allowance learns that rather
 * than learning its file was the wrong type.
 *
 * `callModel` and `checkLimit` are both injected, so the tests exercise every
 * branch without a key, without a counter store and without a network call.
 */
export async function extractReceipt(
  request: Request,
  callModel: ModelCaller = callOpenAI,
  checkLimit: RateLimitCheck = checkRateLimit,
): Promise<ExtractionOutcome> {
  // One unit, because this route makes one model call per request whatever the
  // form carries. A request with several files is refused on the count below
  // rather than extracted file by file, so the cost is known before the body is.
  const allowance = await checkLimit(request.headers, 1);

  if (allowance.status === "limited") {
    return failWith("rate_limited", 429, ERROR_MESSAGES.rate_limited, allowance.resetAt);
  }

  if (allowance.status === "unavailable") {
    // Failing open on a route that spends money is the wrong default, so an
    // unreachable counter refuses the extraction. The refusal carries no reset
    // time, because with no count there is no window to name, and it says
    // nothing about the store it could not reach.
    return failWith("rate_limited", 503, LIMIT_UNCHECKED_MESSAGE);
  }

  // `unconfigured` falls through and runs the extraction. The limiter has
  // already logged it loudly; taking the demo down over a deployment nobody
  // finished would be the worse failure.

  const form = await request.formData();
  const files = [...form.values()].filter((value) => value instanceof File);

  if (files.length > MAX_FILES_PER_REQUEST) {
    return failWith("too_large", 413, TOO_MANY_FILES_MESSAGE);
  }

  const file = form.get("file");

  if (!(file instanceof File)) {
    return fail("unsupported_type", 400);
  }

  // A browser that reports an empty `type` fails this check, which is the answer
  // the route wants: it refuses what it cannot name rather than reading an
  // extension and guessing.
  if (!isAcceptedImageType(file.type)) {
    return fail("unsupported_type", 415);
  }

  if (file.size > MAX_FILE_BYTES) {
    return fail("too_large", 413);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  // The file's own type, so a PNG reaches the model as a PNG rather than as bytes
  // mislabelled by a constant.
  const dataUrl = `data:${file.type};base64,${bytes.toString("base64")}`;

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
