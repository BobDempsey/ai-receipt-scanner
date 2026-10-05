import type { Receipt, ReceiptLineItem, ReceiptTax } from "./receipt-schema";

/**
 * The CSV a visitor downloads, for one receipt or for a whole session.
 *
 * One function builds both files. `receiptsToCsv` takes a list, and the
 * single-receipt download is that list with one entry in it, so the two shapes
 * cannot drift apart as later slices add columns.
 *
 * The column order is a property of the arrays below rather than of the order
 * somebody wrote a template, which is what makes a script written against last
 * week's export read this week's. A reader groups or pivots on the receipt
 * columns, so those repeat on every row the receipt contributes.
 *
 * The file carries no `…Confidence` and no `…SourceText` column. Thirty fields
 * each gaining two siblings would triple the width of a row a visitor opened to
 * read amounts, and the JSON export already carries both.
 *
 * Nothing here formats a value. A money field reaches the file as the decimal
 * string the app holds, with no thousands separator, no currency symbol and no
 * leading apostrophe to stop a spreadsheet reformatting a date, because a file
 * that adds a symbol has changed the value it was asked to carry.
 */

/** One row's worth of input: a receipt, and the line item this row speaks for. */
export type CsvRow = {
  receipt: Receipt;
  /** Null on the single row a receipt that itemized nothing still gets. */
  item: ReceiptLineItem | null;
};

/** A column: the name printed in the header, and the reader that fills a cell. */
export type CsvColumn = {
  name: string;
  read: (row: CsvRow) => string | null;
};

/**
 * Rows end CRLF, which is what RFC 4180 specifies and what Excel writes on
 * Windows. A lone LF would also import, so the choice is about matching the
 * format the file claims to be rather than about a reader that cannot cope.
 * A newline inside a cell is a different thing and survives untouched inside
 * its quotes, whichever way the receipt held it.
 */
export const CSV_ROW_TERMINATOR = "\r\n";

/**
 * The receipt's own fields, in the order the field panel prints them, named by
 * their property names in snake case. A spreadsheet header with a space in it is
 * awkward to reference in a formula, and the camel-case names already live in the
 * JSON export.
 *
 * `isReceipt` and `reason` get no column. A refused upload has no value in any
 * other column, so a row for it would be a line of empty cells with a sentence of
 * model prose at one end, and `reason` is a paragraph in a format whose rows a
 * reader scans for amounts. `receiptsToCsv` drops such a receipt rather than
 * printing that row, and the JSON export is where the refusal and its reason
 * stay readable.
 */
export const RECEIPT_COLUMNS: readonly CsvColumn[] = [
  { name: "merchant", read: ({ receipt }) => receipt.merchant },
  { name: "merchant_address", read: ({ receipt }) => receipt.merchantAddress },
  { name: "date", read: ({ receipt }) => receipt.date },
  { name: "time", read: ({ receipt }) => receipt.time },
  { name: "currency", read: ({ receipt }) => receipt.currency },
  { name: "subtotal", read: ({ receipt }) => receipt.subtotal },
  { name: "tip", read: ({ receipt }) => receipt.tip },
  { name: "total", read: ({ receipt }) => receipt.total },
  { name: "payment_method", read: ({ receipt }) => receipt.paymentMethod },
  { name: "card_last4", read: ({ receipt }) => receipt.cardLast4 },
];

/**
 * The line item columns, prefixed so a reader can tell an item amount from the
 * receipt total. A reader who sees `amount` alone cannot tell the two apart,
 * which is the mistake the prefix exists to prevent.
 */
export const ITEM_COLUMNS: readonly CsvColumn[] = [
  { name: "item_description", read: ({ item }) => item?.description ?? null },
  { name: "item_quantity", read: ({ item }) => item?.quantity ?? null },
  { name: "item_unit_price", read: ({ item }) => item?.unitPrice ?? null },
  { name: "item_amount", read: ({ item }) => item?.amount ?? null },
];

/** The taxes a receipt carries, treating a null array and an empty one the same. */
function taxesOf(receipt: Receipt): readonly ReceiptTax[] {
  return receipt.taxes ?? [];
}

/**
 * How many tax pairs the header needs: the count the widest receipt in the export
 * carries. One header has to serve every row in the file, so sizing is one
 * maximum over the set rather than a special case the batch export adds.
 */
export function widestTaxCount(receipts: readonly Receipt[]): number {
  return receipts.reduce((widest, receipt) => Math.max(widest, taxesOf(receipt).length), 0);
}

/**
 * The numbered tax pairs, counting from 1 so the first column reads `tax_1_label`
 * rather than `tax_0_label`. A receipt carrying fewer taxes than the header leaves
 * its extra cells empty, which says the receipt printed no such tax where a zero
 * would claim it printed one of nothing.
 */
export function taxColumns(count: number): CsvColumn[] {
  const columns: CsvColumn[] = [];

  for (let index = 0; index < count; index += 1) {
    const number = index + 1;
    columns.push(
      { name: `tax_${number}_label`, read: ({ receipt }) => taxesOf(receipt)[index]?.label ?? null },
      {
        name: `tax_${number}_amount`,
        read: ({ receipt }) => taxesOf(receipt)[index]?.amount ?? null,
      },
    );
  }

  return columns;
}

/** The whole column spec for an export: receipt fields, then tax pairs, then items. */
export function csvColumns(receipts: readonly Receipt[]): CsvColumn[] {
  return [...RECEIPT_COLUMNS, ...taxColumns(widestTaxCount(receipts)), ...ITEM_COLUMNS];
}

/** The characters that force a cell into quotes. */
const MUST_QUOTE = /[",\r\n]/;

/**
 * A cell as it reaches the file.
 *
 * A comma, a double quote or a line break forces quotes, an inner double quote
 * doubles, and everything else stays bare, which is RFC 4180 without the parts
 * nothing here needs. A null field becomes an empty cell rather than a 0, matching
 * how the field panel shows a value the receipt did not print.
 */
export function quoteCell(value: string | null): string {
  if (value === null) {
    return "";
  }

  if (!MUST_QUOTE.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '""')}"`;
}

/**
 * One row per line item, so a spreadsheet can group or pivot on any receipt field.
 *
 * A receipt that itemized nothing, such as a card slip printing a total alone,
 * still gets one row with its item columns empty. Dropping it would lose the
 * receipt from the file entirely, and a zero in its item amount would claim it
 * printed an item worth nothing.
 */
export function csvRowsFor(receipt: Receipt): CsvRow[] {
  const items = receipt.lineItems ?? [];

  if (items.length === 0) {
    return [{ receipt, item: null }];
  }

  return items.map((item) => ({ receipt, item }));
}

/**
 * True when the receipt holds values a CSV can carry. A refused upload holds none,
 * and the reason it holds instead belongs in the JSON export.
 */
export function carriesValues(receipt: Receipt): boolean {
  return receipt.isReceipt;
}

/**
 * One CSV over any number of receipts, in the order the list gives them. The
 * single-receipt export is this over a list of one.
 *
 * The header is always written, even when every receipt was refused, because a
 * file holding a header and no data row reads as an export of nothing where an
 * empty file reads as a download that failed.
 */
export function receiptsToCsv(receipts: readonly Receipt[]): string {
  const carrying = receipts.filter(carriesValues);
  const columns = csvColumns(carrying);

  const lines = [columns.map((column) => quoteCell(column.name)).join(",")];

  for (const receipt of carrying) {
    for (const row of csvRowsFor(receipt)) {
      lines.push(columns.map((column) => quoteCell(column.read(row))).join(","));
    }
  }

  return `${lines.join(CSV_ROW_TERMINATOR)}${CSV_ROW_TERMINATOR}`;
}
