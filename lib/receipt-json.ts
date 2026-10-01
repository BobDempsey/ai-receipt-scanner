import type { Receipt } from "./receipt-schema";

/**
 * The JSON a visitor downloads: the object that passed server-side validation,
 * every field beside its `…Confidence` and `…SourceText` siblings, with `isReceipt`
 * and `reason`. Every amount stays the decimal string the app holds, because
 * `JSON.stringify` prints a string as a string.
 */
export function receiptToJson(receipt: Receipt): string {
  return `${JSON.stringify(receipt, null, 2)}\n`;
}

/** The download filename. Slice 1 keeps it plain. */
export const RECEIPT_JSON_FILENAME = "receipt.json";
