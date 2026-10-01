import type { Receipt } from "./receipt-schema";

/** The confidence below which the app asks the visitor to check a field. */
export const REVIEW_THRESHOLD = 0.8;

export type FieldRow = {
  label: string;
  /** The value exactly as the app holds it. Null means the receipt did not print it. */
  value: string | null;
  confidence: number | null;
};

/**
 * The rows the field panel prints, in the order a receipt prints them.
 *
 * Nothing here formats a value. A monetary string arrives as the model gave it and
 * leaves the same way, so the panel cannot round "42.00" down to 42.
 */
export function fieldRows(receipt: Receipt): FieldRow[] {
  return [
    { label: "Merchant", value: receipt.merchant, confidence: receipt.merchantConfidence },
    {
      label: "Address",
      value: receipt.merchantAddress,
      confidence: receipt.merchantAddressConfidence,
    },
    { label: "Date", value: receipt.date, confidence: receipt.dateConfidence },
    { label: "Time", value: receipt.time, confidence: receipt.timeConfidence },
    { label: "Currency", value: receipt.currency, confidence: receipt.currencyConfidence },
    { label: "Subtotal", value: receipt.subtotal, confidence: receipt.subtotalConfidence },
    ...(receipt.taxes ?? []).map((tax) => ({
      label: tax.label ? `Tax: ${tax.label}` : "Tax",
      value: tax.amount,
      confidence: tax.amountConfidence,
    })),
    { label: "Tip", value: receipt.tip, confidence: receipt.tipConfidence },
    { label: "Total", value: receipt.total, confidence: receipt.totalConfidence },
    {
      label: "Payment method",
      value: receipt.paymentMethod,
      confidence: receipt.paymentMethodConfidence,
    },
    { label: "Card last 4", value: receipt.cardLast4, confidence: receipt.cardLast4Confidence },
  ];
}

/** True when the panel shows the value as absent rather than as a number. */
export function isAbsent(row: FieldRow): boolean {
  return row.value === null;
}

/** True when the panel flags the row for review. */
export function needsReview(row: FieldRow): boolean {
  return row.confidence !== null && row.confidence < REVIEW_THRESHOLD;
}
