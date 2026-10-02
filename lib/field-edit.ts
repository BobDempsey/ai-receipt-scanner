import type { ZodType } from "zod";
import { receiptSchema, type Receipt, type ReceiptLineItem } from "./receipt-schema";

/**
 * What a visitor's correction is, and what the app does with it.
 *
 * Three rules shape every function below.
 *
 * The rules a value follows live in `receiptSchema` and nowhere else. This module
 * reads a validator off that schema for each field it edits, so a change to
 * `DECIMAL_PATTERN` reaches the edit path with no second edit here and no regex
 * of its own.
 *
 * Every function is pure. It reads the receipt it was given, returns a new one,
 * and writes nothing back, so the Node test environment reaches every rule an
 * edit follows without a renderer.
 *
 * Money is a decimal string. A committed amount keeps the digits the visitor
 * typed, so "42.5" stays "42.5" and nothing here pads it, rounds it or localizes
 * it.
 */

/** The flat fields a visitor may change, in the order the panel lists them. */
export const EDITABLE_FLAT_FIELDS = [
  "merchant",
  "merchantAddress",
  "date",
  "time",
  "currency",
  "subtotal",
  "tip",
  "total",
  "paymentMethod",
  "cardLast4",
] as const;

export type EditableFlatField = (typeof EDITABLE_FLAT_FIELDS)[number];

/** The two cells a tax entry prints. */
export const EDITABLE_TAX_CELLS = ["label", "amount"] as const;

export type EditableTaxCell = (typeof EDITABLE_TAX_CELLS)[number];

/** The four cells a line item prints. */
export const EDITABLE_ITEM_CELLS = ["description", "quantity", "unitPrice", "amount"] as const;

export type EditableItemCell = (typeof EDITABLE_ITEM_CELLS)[number];

/**
 * Which value an edit lands on.
 *
 * The three shapes mirror the three shapes the receipt holds: a flat field, a
 * cell on one tax entry, and a cell on one line item entry.
 */
export type FieldAddress =
  | { kind: "flat"; field: EditableFlatField }
  | { kind: "tax"; index: number; cell: EditableTaxCell }
  | { kind: "item"; index: number; cell: EditableItemCell };

/**
 * The string form the export carries: `total`, `taxes.1.amount`, `lineItems.3.amount`.
 *
 * It is the property path the receipt already uses, so a reader of the downloaded
 * file sees which field a correction landed on rather than an opaque id.
 */
export function addressKey(address: FieldAddress): string {
  if (address.kind === "flat") {
    return address.field;
  }
  const collection = address.kind === "tax" ? "taxes" : "lineItems";
  return `${collection}.${address.index}.${address.cell}`;
}

/** The addresses a visitor may edit on a given receipt. */
export function editableAddresses(receipt: Receipt): FieldAddress[] {
  const addresses: FieldAddress[] = EDITABLE_FLAT_FIELDS.map((field) => ({
    kind: "flat" as const,
    field,
  }));

  (receipt.taxes ?? []).forEach((_, index) => {
    for (const cell of EDITABLE_TAX_CELLS) {
      addresses.push({ kind: "tax", index, cell });
    }
  });

  (receipt.lineItems ?? []).forEach((_, index) => {
    for (const cell of EDITABLE_ITEM_CELLS) {
      addresses.push({ kind: "item", index, cell });
    }
  });

  return addresses;
}

/** What the field accepts, which decides the sentence a refusal carries. */
type FieldKind = "text" | "date" | "time" | "currency" | "money" | "cardLast4";

const FLAT_FIELD_KINDS: Record<EditableFlatField, FieldKind> = {
  merchant: "text",
  merchantAddress: "text",
  date: "date",
  time: "time",
  currency: "currency",
  subtotal: "money",
  tip: "money",
  total: "money",
  paymentMethod: "text",
  cardLast4: "cardLast4",
};

const TAX_CELL_KINDS: Record<EditableTaxCell, FieldKind> = {
  label: "text",
  amount: "money",
};

const ITEM_CELL_KINDS: Record<EditableItemCell, FieldKind> = {
  description: "text",
  quantity: "money",
  unitPrice: "money",
  amount: "money",
};

/**
 * The sentence a refused edit carries, one per kind of field.
 *
 * Zod's own issue text names a regex and a path, which is for whoever wrote the
 * schema. The visitor needs to read what the field takes, so the wording lives
 * here the way the arithmetic wording lives in one place, and the panel prints
 * what this module composed.
 */
const REFUSAL_SENTENCES: Record<FieldKind, string> = {
  text: "This field takes text. Clear it to record that the receipt did not print it.",
  date: "This field takes an ISO calendar date, such as 2026-10-02.",
  time: "This field takes a 24-hour time, such as 18:45.",
  currency: "This field takes a three-letter ISO 4217 code, such as USD.",
  money:
    "This field takes a decimal amount with up to three decimal places, such as 42.00, and no comma or currency symbol.",
  cardLast4: "This field takes the four digits printed on the card line, such as 4417.",
};

/** Which kind of value sits at an address. */
export function fieldKind(address: FieldAddress): FieldKind {
  if (address.kind === "flat") {
    return FLAT_FIELD_KINDS[address.field];
  }
  if (address.kind === "tax") {
    return TAX_CELL_KINDS[address.cell];
  }
  return ITEM_CELL_KINDS[address.cell];
}

const taxShape = receiptSchema.shape.taxes.unwrap().element.shape;
const itemShape = receiptSchema.shape.lineItems.unwrap().element.shape;

/**
 * The validator for one address, pulled off `receiptSchema` rather than restated.
 *
 * A flat field is `shape[key]`. A tax or an item cell sits inside a nullable
 * array, so the lookup unwraps the nullable, takes the array element and reads
 * its shape. Both steps use the public schema surface, so an upgrade that moves
 * either one fails the test that resolves every address rather than passing a
 * stale regex.
 */
export function validatorFor(address: FieldAddress): ZodType<string | null> {
  if (address.kind === "flat") {
    return receiptSchema.shape[address.field];
  }
  if (address.kind === "tax") {
    return taxShape[address.cell];
  }
  return itemShape[address.cell];
}

/** A committed edit the app refused, with the sentence the panel prints. */
export type EditRejection = {
  address: FieldAddress;
  /** The string form, so the panel can key a refusal to a control. */
  key: string;
  /** The text the visitor typed, which the receipt did not take. */
  text: string;
  /** What the field accepts, in a sentence. */
  message: string;
};

export type EditResult =
  | { accepted: true; receipt: Receipt }
  | { accepted: false; rejection: EditRejection };

/**
 * Turns the text a visitor committed into the value the receipt holds.
 *
 * An emptied field commits as absent rather than as an empty string, because a
 * field the receipt does not print is already absent in the extracted field set.
 * Surrounding whitespace goes, because a trailing space is a typing artifact
 * rather than something the receipt printed. Nothing else about the text changes.
 */
export function committedValue(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}

function writeFlat(receipt: Receipt, field: EditableFlatField, value: string | null): Receipt {
  return {
    ...receipt,
    [field]: value,
    [`${field}Confidence`]: null,
  } as Receipt;
}

function writeEntry<Entry extends object>(
  entries: Entry[],
  index: number,
  cell: string,
  value: string | null,
): Entry[] {
  return entries.map((entry, position) =>
    position === index ? ({ ...entry, [cell]: value, [`${cell}Confidence`]: null } as Entry) : entry,
  );
}

/**
 * Applies one committed edit, or refuses it.
 *
 * An accepted edit writes three things: the value, a null confidence on that
 * field, and the `…SourceText` left exactly as the model gave it. Null is a value
 * the schema already permits and already means the app holds no model confidence
 * for the field, so the review flag clears with no second rule, and nothing
 * claims a certainty on the visitor's behalf. The source text stays because it
 * records the characters on the paper rather than what the field now holds.
 *
 * A refused edit returns the rejection and the receipt it was given goes back
 * untouched, which is what leaves every warning as it was.
 */
export function applyEdit(receipt: Receipt, address: FieldAddress, text: string): EditResult {
  const value = committedValue(text);
  const parsed = validatorFor(address).safeParse(value);

  if (!parsed.success) {
    return {
      accepted: false,
      rejection: {
        address,
        key: addressKey(address),
        text,
        message: REFUSAL_SENTENCES[fieldKind(address)],
      },
    };
  }

  if (address.kind === "flat") {
    return { accepted: true, receipt: writeFlat(receipt, address.field, value) };
  }

  if (address.kind === "tax") {
    const taxes = receipt.taxes ?? [];
    if (address.index >= taxes.length) {
      return { accepted: true, receipt };
    }
    return {
      accepted: true,
      receipt: { ...receipt, taxes: writeEntry(taxes, address.index, address.cell, value) },
    };
  }

  const items = receipt.lineItems ?? [];
  if (address.index >= items.length) {
    return { accepted: true, receipt };
  }
  return {
    accepted: true,
    receipt: { ...receipt, lineItems: writeEntry(items, address.index, address.cell, value) },
  };
}

/** The addresses the visitor has edited, in the string form the export carries. */
export type EditedFields = readonly string[];

/**
 * Records one address as edited.
 *
 * A field stays recorded once it has been edited, even when the visitor types the
 * model's original value back, because the app holds no model confidence for it
 * any more and the panel has to say so.
 */
export function recordEdited(edited: EditedFields, address: FieldAddress): EditedFields {
  const key = addressKey(address);
  return edited.includes(key) ? edited : [...edited, key];
}

/** True when the visitor typed the value at this address. */
export function isEdited(edited: EditedFields, address: FieldAddress): boolean {
  return edited.includes(addressKey(address));
}

/** A line item with every value and every sibling absent, which is what add gives the visitor. */
export function blankLineItem(): ReceiptLineItem {
  return {
    description: null,
    descriptionConfidence: null,
    descriptionSourceText: null,
    quantity: null,
    quantityConfidence: null,
    quantitySourceText: null,
    unitPrice: null,
    unitPriceConfidence: null,
    unitPriceSourceText: null,
    amount: null,
    amountConfidence: null,
    amountSourceText: null,
  };
}

/** A new receipt and the edited list that goes with it, which add and remove both return. */
export type ItemChange = { receipt: Receipt; edited: EditedFields };

/**
 * Adds an empty line item to the end of the list.
 *
 * Nothing is invented into the description, and the entry records no edit until
 * the visitor commits a value into one of its cells. A receipt the model
 * itemized nothing from comes back with a one-item list, because null and an
 * empty array both mean the app read no items.
 */
export function addLineItem(receipt: Receipt, edited: EditedFields): ItemChange {
  return {
    receipt: { ...receipt, lineItems: [...(receipt.lineItems ?? []), blankLineItem()] },
    edited,
  };
}

/**
 * Removes one line item and follows the recorded edits through the shift.
 *
 * Removing the second of four items moves the third into its index, so an edit
 * recorded against `lineItems.2.amount` would start describing a different line.
 * Every recorded address above the removed index drops by one, and the addresses
 * on the removed item go with it. Removing the only item leaves an empty list
 * rather than a null, which is the shape the panel's no-items message reads.
 */
export function removeLineItem(receipt: Receipt, index: number, edited: EditedFields): ItemChange {
  const items = receipt.lineItems ?? [];

  if (index < 0 || index >= items.length) {
    return { receipt, edited };
  }

  return {
    receipt: { ...receipt, lineItems: items.filter((_, position) => position !== index) },
    edited: remapEditedOnRemove(edited, index),
  };
}

/**
 * One address string after an item leaves the list.
 *
 * An address on the removed item returns null, because the value it named has
 * gone. An address above it drops one place, so it follows the item it belongs
 * to rather than describing the line that took its index. Anything else comes
 * back unchanged.
 */
export function remapAddressOnRemove(key: string, index: number): string | null {
  const parts = key.split(".");

  if (parts.length !== 3 || parts[0] !== "lineItems") {
    return key;
  }

  const position = Number(parts[1]);

  if (position === index) {
    return null;
  }

  return position > index ? `lineItems.${position - 1}.${parts[2]}` : key;
}

/** The edited list after one item leaves: its own addresses go, the ones above it shift down. */
export function remapEditedOnRemove(edited: EditedFields, index: number): EditedFields {
  const remapped: string[] = [];

  for (const key of edited) {
    const next = remapAddressOnRemove(key, index);
    if (next !== null) {
      remapped.push(next);
    }
  }

  return remapped;
}
