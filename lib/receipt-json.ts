import type { ArithmeticWarning } from "./arithmetic";
import type { EditedFields } from "./field-edit";
import type { Receipt } from "./receipt-schema";

/**
 * The envelope a visitor downloads.
 *
 * `receipt` holds the field set as the visitor has it after any correction, every
 * field beside its `…Confidence` and `…SourceText` siblings, with `isReceipt`,
 * `reason` and the `lineItems` array. `warnings` holds what the arithmetic checks
 * found on the last run. `edited` names each field the visitor typed into, in the
 * property path the receipt already uses, so a reader can tell a typed value from
 * a read one.
 *
 * The three sit side by side rather than mixed, because the warnings and the
 * edited list are derived in the browser and the Zod schema governs what is under
 * `receipt`. `warnings` and `edited` are both always present, each empty when
 * there is nothing to report, so a reader can tell a receipt the app checked from
 * one it did not and an untouched receipt from one whose edits went unrecorded.
 */
export type ReceiptExport = {
  receipt: Receipt;
  warnings: ArithmeticWarning[];
  edited: string[];
};

/**
 * Every amount stays the decimal string the app holds, in the field set and in
 * each warning's difference, because `JSON.stringify` prints a string as a string.
 * Nothing here alters a value to close a gap a warning names.
 */
export function receiptToJson(
  receipt: Receipt,
  warnings: ArithmeticWarning[],
  edited: EditedFields = [],
): string {
  const envelope: ReceiptExport = { receipt, warnings, edited: [...edited] };
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

/** The download filename. Slice 6 settles the batch shape. */
export const RECEIPT_JSON_FILENAME = "receipt.json";
