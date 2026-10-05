import { z } from "zod";

/**
 * The extracted field set, shared between the server route and the browser.
 *
 * Two rules shape every line below.
 *
 * Strict Structured Outputs requires every property to appear in `required`, so
 * a field a receipt may not print is nullable rather than optional. Nothing here
 * uses `.optional()`.
 *
 * Money is a decimal string, never a float, so each amount is typed `string` and
 * a regex checks its shape on the way back from the model.
 *
 * Confidence and source text sit beside each value as flat suffixed keys
 * (`total`, `totalConfidence`, `totalSourceText`) because the extraction spec
 * requires `total` itself to hold the string "42.00", and strict mode forbids an
 * object keyed by open-ended field paths.
 */

/** A decimal amount: digits, with an optional fractional part of one to three places. */
export const DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d{1,3})?$/;

/** An ISO calendar date with no timezone attached. */
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A 24-hour clock time, seconds optional. */
export const TIME_24H_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

/** An ISO 4217 currency code. */
export const CURRENCY_PATTERN = /^[A-Z]{3}$/;

/** The last four digits printed on a card receipt. */
export const CARD_LAST4_PATTERN = /^\d{4}$/;

type BuildOptions = {
  /**
   * Whether string fields carry their regexes.
   *
   * The validating schema does, because the regex is the control that keeps a
   * float out of a money field. The schema the model sees does not, because this
   * slice does not depend on strict Structured Outputs honouring `pattern`, and
   * a plain `string` is the shape the model has to satisfy either way.
   */
  patterns: boolean;
};

function buildReceiptSchema({ patterns }: BuildOptions) {
  const confidence = () => z.number().min(0).max(1).nullable();
  const sourceText = () => z.string().nullable();

  const text = () => z.string().nullable();
  const shaped = (pattern: RegExp) =>
    patterns ? z.string().regex(pattern).nullable() : z.string().nullable();

  const money = () => shaped(DECIMAL_PATTERN);

  return z.object({
    /** False when the upload is not a receipt. The route still answers 200. */
    isReceipt: z.boolean(),
    /** Why the model refused, when `isReceipt` is false. */
    reason: z.string().nullable(),

    merchant: text(),
    merchantConfidence: confidence(),
    merchantSourceText: sourceText(),

    merchantAddress: text(),
    merchantAddressConfidence: confidence(),
    merchantAddressSourceText: sourceText(),

    date: shaped(ISO_DATE_PATTERN),
    dateConfidence: confidence(),
    dateSourceText: sourceText(),

    time: shaped(TIME_24H_PATTERN),
    timeConfidence: confidence(),
    timeSourceText: sourceText(),

    currency: shaped(CURRENCY_PATTERN),
    currencyConfidence: confidence(),
    currencySourceText: sourceText(),

    subtotal: money(),
    subtotalConfidence: confidence(),
    subtotalSourceText: sourceText(),

    taxes: z
      .array(
        z.object({
          label: text(),
          labelConfidence: confidence(),
          labelSourceText: sourceText(),
          amount: money(),
          amountConfidence: confidence(),
          amountSourceText: sourceText(),
        }),
      )
      .nullable(),

    tip: money(),
    tipConfidence: confidence(),
    tipSourceText: sourceText(),

    total: money(),
    totalConfidence: confidence(),
    totalSourceText: sourceText(),

    paymentMethod: text(),
    paymentMethodConfidence: confidence(),
    paymentMethodSourceText: sourceText(),

    cardLast4: shaped(CARD_LAST4_PATTERN),
    cardLast4Confidence: confidence(),
    cardLast4SourceText: sourceText(),

    /**
     * One entry per purchased line, in the order the receipt printed them.
     *
     * Nullable rather than optional, the way `taxes` already is, because strict
     * Structured Outputs puts every property in `required`. Null and an empty
     * array both mean the app read no items, and the arithmetic checker treats
     * the two the same.
     *
     * `quantity` is a decimal string on the same pattern as an amount, so a
     * weighed item's "0.734" survives as the receipt printed it.
     */
    lineItems: z
      .array(
        z.object({
          description: text(),
          descriptionConfidence: confidence(),
          descriptionSourceText: sourceText(),
          quantity: money(),
          quantityConfidence: confidence(),
          quantitySourceText: sourceText(),
          unitPrice: money(),
          unitPriceConfidence: confidence(),
          unitPriceSourceText: sourceText(),
          amount: money(),
          amountConfidence: confidence(),
          amountSourceText: sourceText(),
        }),
      )
      .nullable(),
  });
}

/** The schema the server validates the model's answer against. */
export const receiptSchema = buildReceiptSchema({ patterns: true });

/** The schema the request sends to the model, which strict mode turns into JSON Schema. */
export const modelReceiptSchema = buildReceiptSchema({ patterns: false });

export type Receipt = z.infer<typeof receiptSchema>;
export type ReceiptTax = Receipt["taxes"] extends (infer Entry)[] | null
  ? Entry
  : never;
export type ReceiptLineItem = Receipt["lineItems"] extends (infer Entry)[] | null
  ? Entry
  : never;

/** The error identifiers the route answers with. The browser keys its copy off these. */
export const EXTRACTION_ERROR_CODES = [
  "unsupported_type",
  "too_large",
  "model_call_failed",
  "validation_failed",
] as const;

export type ExtractionErrorCode = (typeof EXTRACTION_ERROR_CODES)[number];

export type ExtractionError = {
  error: { code: ExtractionErrorCode; message: string };
};

/** What the route answers: either a validated receipt or one error code. */
export type ExtractionResponse = Receipt | ExtractionError;

export function isExtractionError(
  body: ExtractionResponse,
): body is ExtractionError {
  return typeof body === "object" && body !== null && "error" in body;
}

/** Field paths whose value the panel renders as money, and the export keeps as a string. */
export const MONEY_FIELDS = ["subtotal", "tip", "total"] as const;
