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

/**
 * Every receipt of a session in one file, each keeping the envelope the single
 * export uses, so a reader who can parse one file can parse the other and a
 * one-receipt session produces the same shape rather than a special case.
 *
 * `receipts` is the only key. A count would restate `receipts.length`, which
 * gives a reader two places to disagree, and a timestamp would make two exports
 * of identical data differ byte for byte, so a visitor could not tell a changed
 * receipt from a second download. `receipts` is always present and empty for a
 * session holding nothing, which is what slice 2 settled for `warnings` and
 * slice 3 for `edited`.
 */
export type SessionExport = { receipts: ReceiptExport[] };

/**
 * The batch file. Each entry is the envelope `receiptToJson` writes, so the
 * single export stays the shape three slices of behaviour already depend on and
 * the batch adds one key around it rather than a second format.
 *
 * Every amount stays the decimal string the app holds, for the same reason the
 * single export keeps it: `JSON.stringify` prints a string as a string, and
 * nothing here alters a value to close a gap a warning names.
 */
export function receiptsToJson(exports: readonly ReceiptExport[]): string {
  const envelope: SessionExport = { receipts: [...exports] };
  return `${JSON.stringify(envelope, null, 2)}
`;
}

/**
 * The four download filenames, in one place so the workspace names no file of
 * its own.
 *
 * `receipt.json` keeps the value a production-verified download already uses.
 * The other three follow from it: `receipt.` names the one receipt on screen and
 * `session-receipts.` names every receipt the session holds, so a visitor with
 * all four in a downloads folder reads which is which off the name.
 */
export const RECEIPT_JSON_FILENAME = "receipt.json";
export const RECEIPT_CSV_FILENAME = "receipt.csv";
export const SESSION_JSON_FILENAME = "session-receipts.json";
export const SESSION_CSV_FILENAME = "session-receipts.csv";
