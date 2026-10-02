import { lineItemTotal, type ArithmeticField } from "./arithmetic";
import { isEdited, type EditedFields, type FieldAddress } from "./field-edit";
import type { Receipt } from "./receipt-schema";

/** The confidence below which the app asks the visitor to check a field. */
export const REVIEW_THRESHOLD = 0.8;

export type FieldRow = {
  label: string;
  /**
   * Which value the row's control writes. A row the app computed carries none,
   * which is what keeps the line item total text the visitor reads.
   */
  address?: FieldAddress;
  /**
   * True on a value the visitor typed, read off the edited list rather than off
   * a null confidence, because the model gives a null confidence of its own.
   */
  edited?: boolean;
  /**
   * The second control a tax row carries, holding the label the receipt printed.
   * The row's own `label` stays the header the panel prints.
   */
  labelCell?: FieldRow;
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
export function fieldRows(receipt: Receipt, edited: EditedFields = []): FieldRow[] {
  const flat = (
    label: string,
    key: FlatField,
    value: string | null,
    confidence: number | null,
    warned?: ArithmeticField,
  ): FieldRow => {
    const address: FieldAddress = { kind: "flat", field: key };
    return {
      label,
      value,
      confidence,
      address,
      edited: isEdited(edited, address),
      ...(warned ? { field: warned } : {}),
    };
  };

  return [
    flat("Merchant", "merchant", receipt.merchant, receipt.merchantConfidence),
    flat("Address", "merchantAddress", receipt.merchantAddress, receipt.merchantAddressConfidence),
    flat("Date", "date", receipt.date, receipt.dateConfidence),
    flat("Time", "time", receipt.time, receipt.timeConfidence),
    flat("Currency", "currency", receipt.currency, receipt.currencyConfidence),
    flat("Subtotal", "subtotal", receipt.subtotal, receipt.subtotalConfidence, "subtotal"),
    ...itemTotalRow(receipt),
    ...(receipt.taxes ?? []).map((tax, index) => taxRow(tax, index, edited)),
    flat("Tip", "tip", receipt.tip, receipt.tipConfidence),
    flat("Total", "total", receipt.total, receipt.totalConfidence, "total"),
    flat("Payment method", "paymentMethod", receipt.paymentMethod, receipt.paymentMethodConfidence),
    flat("Card last 4", "cardLast4", receipt.cardLast4, receipt.cardLast4Confidence),
  ];
}

type FlatField = Extract<FieldAddress, { kind: "flat" }>["field"];

/**
 * One tax entry, whose amount is the row's value and whose label is a second
 * control beside it.
 *
 * The header keeps the label the receipt printed, so a visitor reads which tax
 * the row names before they reach either control.
 */
function taxRow(
  tax: NonNullable<Receipt["taxes"]>[number],
  index: number,
  edited: EditedFields,
): FieldRow {
  const amount: FieldAddress = { kind: "tax", index, cell: "amount" };
  const label: FieldAddress = { kind: "tax", index, cell: "label" };

  return {
    label: tax.label ? `Tax: ${tax.label}` : "Tax",
    value: tax.amount,
    confidence: tax.amountConfidence,
    address: amount,
    edited: isEdited(edited, amount),
    labelCell: {
      label: "Label",
      value: tax.label,
      confidence: tax.labelConfidence,
      address: label,
      edited: isEdited(edited, label),
    },
  };
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
  /** The item's index in the list, which is what an address and a remove name. */
  index: number;
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
export function lineItemRows(receipt: Receipt, edited: EditedFields = []): LineItemRow[] {
  return (receipt.lineItems ?? []).map((item, index) => {
    const cell = (
      label: string,
      itemCell: ItemCell,
      value: string | null,
      confidence: number | null,
    ): FieldRow => {
      const address: FieldAddress = { kind: "item", index, cell: itemCell };
      return { label, value, confidence, address, edited: isEdited(edited, address) };
    };

    return {
      position: index + 1,
      index,
      description: cell("Description", "description", item.description, item.descriptionConfidence),
      quantity: cell("Quantity", "quantity", item.quantity, item.quantityConfidence),
      unitPrice: cell("Unit price", "unitPrice", item.unitPrice, item.unitPriceConfidence),
      amount: cell("Amount", "amount", item.amount, item.amountConfidence),
    };
  });
}

type ItemCell = Extract<FieldAddress, { kind: "item" }>["cell"];

/** The four cells of an item row, which is what the panel iterates and flags. */
export function lineItemCells(row: LineItemRow): FieldRow[] {
  return [row.description, row.quantity, row.unitPrice, row.amount];
}

/** True when the visitor typed one of an item's four values. */
export function itemVisitorTyped(row: LineItemRow): boolean {
  return lineItemCells(row).some(isVisitorTyped);
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

/** True when the visitor typed the value rather than the model reading it. */
export function isVisitorTyped(row: FieldRow): boolean {
  return row.edited === true;
}

/** True when the panel flags the row for review. */
export function needsReview(row: FieldRow): boolean {
  return row.confidence !== null && row.confidence < REVIEW_THRESHOLD;
}
