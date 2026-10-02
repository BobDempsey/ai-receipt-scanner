import type { ArithmeticWarning } from "./arithmetic";
import type { Receipt } from "./receipt-schema";

/**
 * The envelope a visitor downloads.
 *
 * `receipt` holds the object that passed server-side validation, every field
 * beside its `…Confidence` and `…SourceText` siblings, with `isReceipt`, `reason`
 * and the `lineItems` array. `warnings` holds what the arithmetic checks found.
 *
 * The two sit side by side rather than mixed, because the warnings are derived in
 * the browser and the Zod schema governs what is under `receipt`. `warnings` is
 * always present, empty when both checks pass, so a reader can tell a receipt the
 * app checked from one it did not.
 */
export type ReceiptExport = {
  receipt: Receipt;
  warnings: ArithmeticWarning[];
};

/**
 * Every amount stays the decimal string the app holds, in the field set and in
 * each warning's difference, because `JSON.stringify` prints a string as a string.
 * Nothing here alters a value to close a gap a warning names.
 */
export function receiptToJson(receipt: Receipt, warnings: ArithmeticWarning[]): string {
  const envelope: ReceiptExport = { receipt, warnings };
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

/** The download filename. Slice 6 settles the batch shape. */
export const RECEIPT_JSON_FILENAME = "receipt.json";
