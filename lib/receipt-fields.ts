import { lineItemTotal, type ArithmeticField } from "./arithmetic";
import type { Receipt } from "./receipt-schema";

/** The confidence below which the app asks the visitor to check a field. */
export const REVIEW_THRESHOLD = 0.8;

export type FieldRow = {
  label: string;
  /** The value exactly as the app holds it. Null means the receipt did not print it. */
  value: string | null;
  confidence: number | null;
  /**
   * The identifier an arithmetic warning names, on the rows a check can compare.
   * The panel matches a warning to a row by this key rather than by its label or
   * its position.
   */
  field?: ArithmeticField;
  /** True on a row the app computed rather than one the receipt printed. */
  computed?: boolean;
  /** A short line the panel prints under the value, when there is one to print. */
  note?: string;
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
    {
      label: "Subtotal",
      value: receipt.subtotal,
      confidence: receipt.subtotalConfidence,
      field: "subtotal",
    },
    ...itemTotalRow(receipt),
    ...(receipt.taxes ?? []).map((tax) => ({
      label: tax.label ? `Tax: ${tax.label}` : "Tax",
      value: tax.amount,
      confidence: tax.amountConfidence,
    })),
    { label: "Tip", value: receipt.tip, confidence: receipt.tipConfidence },
    { label: "Total", value: receipt.total, confidence: receipt.totalConfidence, field: "total" },
    {
      label: "Payment method",
      value: receipt.paymentMethod,
      confidence: receipt.paymentMethodConfidence,
    },
    { label: "Card last 4", value: receipt.cardLast4, confidence: receipt.cardLast4Confidence },
  ];
}

/**
 * The item total row, which sits beside `subtotal` so a visitor compares the two
 * without scrolling.
 *
 * A receipt the app read no items from gets no row at all, because a row reading
 * 0.00 would claim the items add up to nothing. The panel says it read no line
 * items instead. An item whose amount the model could not read leaves the row in
 * place with the value absent, so the visitor sees why no sum appeared.
 */
function itemTotalRow(receipt: Receipt): FieldRow[] {
  const items = lineItemTotal(receipt);

  if (items.status === "none") {
    return [];
  }

  const shared = {
    label: "Line item total",
    confidence: null,
    field: "lineItemsTotal" as const,
    computed: true,
  };

  if (items.status === "incomplete") {
    return [
      {
        ...shared,
        value: null,
        note: "One item amount is missing, so the app did not sum the items.",
      },
    ];
  }

  return [{ ...shared, value: items.value, note: "Computed by the app from the line items." }];
}

export type LineItemRow = {
  /** The item's position in the printed order, counting from 1. */
  position: number;
  description: FieldRow;
  quantity: FieldRow;
  unitPrice: FieldRow;
  amount: FieldRow;
};

/**
 * The line items as panel rows, in the order the model returned them, which the
 * prompt asks to be the printed order.
 *
 * Each of the four values keeps its own confidence, so the panel flags the row
 * whenever one of them falls below the review threshold.
 */
export function lineItemRows(receipt: Receipt): LineItemRow[] {
  return (receipt.lineItems ?? []).map((item, index) => ({
    position: index + 1,
    description: cell("Description", item.description, item.descriptionConfidence),
    quantity: cell("Quantity", item.quantity, item.quantityConfidence),
    unitPrice: cell("Unit price", item.unitPrice, item.unitPriceConfidence),
    amount: cell("Amount", item.amount, item.amountConfidence),
  }));
}

function cell(label: string, value: string | null, confidence: number | null): FieldRow {
  return { label, value, confidence };
}

/** The four cells of an item row, which is what the panel iterates and flags. */
export function lineItemCells(row: LineItemRow): FieldRow[] {
  return [row.description, row.quantity, row.unitPrice, row.amount];
}

/** True when one of an item's four values sits below the review threshold. */
export function itemNeedsReview(row: LineItemRow): boolean {
  return lineItemCells(row).some(needsReview);
}

/** True when the app read no line items at all, whether as a null or an empty array. */
export function readNoLineItems(receipt: Receipt): boolean {
  return (receipt.lineItems ?? []).length === 0;
}

/** True when the panel shows the value as absent rather than as a number. */
export function isAbsent(row: FieldRow): boolean {
  return row.value === null;
}

/** True when the panel flags the row for review. */
export function needsReview(row: FieldRow): boolean {
  return row.confidence !== null && row.confidence < REVIEW_THRESHOLD;
}
