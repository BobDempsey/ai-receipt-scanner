import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ACCEPTED_IMAGE_TYPES,
  extractReceipt,
  isAcceptedImageType,
  type ModelCaller,
} from "./extract-receipt";
import type { Receipt } from "./receipt-schema";

/** A minimal receipt the stubbed model answers with. */
function answer(overrides: Partial<Receipt> = {}): Receipt {
  const nulls = {
    merchantAddress: null,
    merchantAddressConfidence: null,
    merchantAddressSourceText: null,
    time: null,
    timeConfidence: null,
    timeSourceText: null,
    tip: null,
    tipConfidence: null,
    tipSourceText: null,
    paymentMethod: null,
    paymentMethodConfidence: null,
    paymentMethodSourceText: null,
    cardLast4: null,
    cardLast4Confidence: null,
    cardLast4SourceText: null,
    lineItems: null,
  };

  return {
    isReceipt: true,
    reason: null,
    merchant: "Pier Cafe",
    merchantConfidence: 0.95,
    merchantSourceText: "PIER CAFE",
    date: "2026-09-18",
    dateConfidence: 0.92,
    dateSourceText: "18/09/2026",
    currency: "GBP",
    currencyConfidence: 0.9,
    currencySourceText: "£",
    subtotal: "38.40",
    subtotalConfidence: 0.93,
    subtotalSourceText: "SUBTOTAL 38.40",
    taxes: [
      {
        label: "VAT 20%",
        labelConfidence: 0.9,
        labelSourceText: "VAT 20%",
        amount: "3.60",
        amountConfidence: 0.91,
        amountSourceText: "3.60",
      },
    ],
    total: "42.00",
    totalConfidence: 0.96,
    totalSourceText: "TOTAL 42.00",
    ...nulls,
    ...overrides,
  };
}

/** A refusal, with every field value null. */
function refusal(): Receipt {
  const blank = answer();
  const emptied = Object.fromEntries(
    Object.keys(blank).map((key) => [key, null]),
  ) as unknown as Receipt;

  return { ...emptied, isReceipt: false, reason: "This photograph shows a menu." };
}

function form(file: File | null): FormData {
  const data = new FormData();
  if (file) {
    data.set("file", file);
  }
  return data;
}

function jpeg(bytes = 64): File {
  return new File([new Uint8Array(bytes)], "receipt.jpg", { type: "image/jpeg" });
}

function stub(body: unknown): { caller: ModelCaller; calls: string[] } {
  const calls: string[] = [];
  const caller: ModelCaller = async (dataUrl) => {
    calls.push(dataUrl);
    return typeof body === "string" ? body : JSON.stringify(body);
  };
  return { caller, calls };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("extractReceipt", () => {
  it.each(ACCEPTED_IMAGE_TYPES)("reads a %s upload", async (type) => {
    const { caller, calls } = stub(answer());
    const file = new File([new Uint8Array(16)], "receipt", { type });

    const outcome = await extractReceipt(form(file), caller);

    expect(outcome.status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it("refuses a PDF by name without calling the model", async () => {
    const { caller, calls } = stub(answer());
    const pdf = new File([new Uint8Array(8)], "invoice.pdf", {
      type: "application/pdf",
    });

    const outcome = await extractReceipt(form(pdf), caller);

    expect(outcome.status).toBe(415);
    expect(outcome.body).toEqual({
      error: { code: "unsupported_type", message: expect.any(String) },
    });
    expect(calls).toHaveLength(0);
  });

  it("refuses a file whose type the browser left empty", async () => {
    const { caller, calls } = stub(answer());
    const unnamed = new File([new Uint8Array(8)], "receipt.jpg", { type: "" });

    const outcome = await extractReceipt(form(unnamed), caller);

    expect(outcome.status).toBe(415);
    expect(outcome.body).toMatchObject({ error: { code: "unsupported_type" } });
    expect(calls).toHaveLength(0);
  });

  it("names PDF in the refusal message, because the page accepts one", async () => {
    const { caller } = stub(answer());
    const heic = new File([new Uint8Array(8)], "receipt.heic", { type: "image/heic" });

    const outcome = await extractReceipt(form(heic), caller);

    const body = outcome.body as { error: { message: string } };
    expect(body.error.message).toContain("PDF");
    expect(body.error.message).toContain("JPEG");
    expect(body.error.message).toContain("PNG");
    expect(body.error.message).toContain("WebP");
  });

  it("carries the file's own type in the data URL", async () => {
    const { caller, calls } = stub(answer());
    const png = new File([new Uint8Array(16)], "receipt.png", { type: "image/png" });

    await extractReceipt(form(png), caller);

    expect(calls[0]).toMatch(/^data:image\/png;base64,/);
  });

  it("refuses a request carrying no file", async () => {
    const { caller, calls } = stub(answer());

    const outcome = await extractReceipt(form(null), caller);

    expect(outcome.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("refuses a file above the size cap without calling the model", async () => {
    const { caller, calls } = stub(answer());
    const huge = new File([new Uint8Array(9 * 1024 * 1024)], "big.jpg", {
      type: "image/jpeg",
    });

    const outcome = await extractReceipt(form(huge), caller);

    expect(outcome.status).toBe(413);
    expect(outcome.body).toMatchObject({ error: { code: "too_large" } });
    expect(calls).toHaveLength(0);
  });

  it("makes exactly one model call per request, with the image inline", async () => {
    const { caller, calls } = stub(answer());

    const outcome = await extractReceipt(form(jpeg()), caller);

    expect(outcome.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("returns the validated receipt with its money as decimal strings", async () => {
    const { caller } = stub(answer());

    const outcome = await extractReceipt(form(jpeg()), caller);

    expect(outcome.status).toBe(200);
    expect(outcome.body).toMatchObject({ total: "42.00", subtotal: "38.40" });
  });

  it("answers 200 with the reason and null fields when the image is not a receipt", async () => {
    const { caller } = stub(refusal());

    const outcome = await extractReceipt(form(jpeg()), caller);

    expect(outcome.status).toBe(200);
    expect(outcome.body).toMatchObject({
      isReceipt: false,
      reason: "This photograph shows a menu.",
      total: null,
      merchant: null,
    });
  });

  it("reports a validation failure without any Zod text, field path or model output", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { caller } = stub(answer({ total: 42 as unknown as string }));

    const outcome = await extractReceipt(form(jpeg()), caller);

    expect(outcome.status).toBe(502);
    const serialized = JSON.stringify(outcome.body);
    expect(JSON.parse(serialized)).toEqual({
      error: {
        code: "validation_failed",
        message: "The model's answer did not match the shape the app expects.",
      },
    });
    expect(serialized).not.toContain("42");
    expect(serialized).not.toContain("total");
    expect(serialized).not.toContain("Pier Cafe");
  });

  it("logs the failing field paths and neither the bytes nor the model's answer", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { caller } = stub(answer({ total: 42 as unknown as string }));

    await extractReceipt(form(jpeg()), caller);

    const line = logged.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(line).toContain("total");
    expect(line).not.toContain("Pier Cafe");
    expect(line).not.toContain("base64");
  });

  it("reports a validation failure when the answer is not JSON at all", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { caller } = stub("I am afraid I cannot read that receipt.");

    const outcome = await extractReceipt(form(jpeg()), caller);

    expect(outcome.body).toMatchObject({ error: { code: "validation_failed" } });
  });

  it("reports a failed model call without the provider's wording", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const caller: ModelCaller = async () => {
      throw new Error("401 Incorrect API key provided: sk-secret");
    };

    const outcome = await extractReceipt(form(jpeg()), caller);

    expect(outcome.status).toBe(502);
    expect(JSON.stringify(outcome.body)).not.toContain("sk-secret");
    expect(outcome.body).toMatchObject({ error: { code: "model_call_failed" } });
  });
});

describe("isAcceptedImageType", () => {
  it("accepts each of the three types the route reads", () => {
    for (const type of ACCEPTED_IMAGE_TYPES) {
      expect(isAcceptedImageType(type)).toBe(true);
    }
  });

  it("refuses a PDF, a HEIC and an empty type", () => {
    expect(isAcceptedImageType("application/pdf")).toBe(false);
    expect(isAcceptedImageType("image/heic")).toBe(false);
    expect(isAcceptedImageType("")).toBe(false);
  });
});
