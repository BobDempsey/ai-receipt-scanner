import type {
  EditableItemCell,
  EditableTaxCell,
  FieldAddress,
  EditableFlatField,
} from "./field-edit";
import type { Receipt } from "./receipt-schema";

/**
 * The characters the model says it read a value from, by address.
 *
 * Two callers want this. The matcher scores a `sourceText` against the words the
 * OCR pass measured, and the field panel reads it to tell the two absent cases
 * apart: a receipt that printed no such value at all against a value whose text
 * the pass could not find on the image.
 *
 * The lookup mirrors the shape `lib/field-edit.ts` already uses for values, so a
 * field added to the schema is added to both modules or to neither. The schema
 * keeps each source text as a flat suffixed sibling (`total`, `totalConfidence`,
 * `totalSourceText`), which is why the key is composed from the field name
 * rather than read out of a table repeated here.
 */

function flatKey(field: EditableFlatField): `${EditableFlatField}SourceText` {
  return `${field}SourceText`;
}

function taxKey(cell: EditableTaxCell): `${EditableTaxCell}SourceText` {
  return `${cell}SourceText`;
}

function itemKey(cell: EditableItemCell): `${EditableItemCell}SourceText` {
  return `${cell}SourceText`;
}

/**
 * The `sourceText` sitting at one address, or null.
 *
 * Null covers three cases the callers treat alike: the model read the value from
 * nothing it could quote, the receipt printed no such value, and the address
 * names an entry the list no longer holds. An address past the end of `taxes` or
 * `lineItems` answers null rather than throwing, because the region map runs
 * over a receipt a visitor is still editing and a removed item must not break
 * the pass.
 */
export function sourceTextFor(receipt: Receipt, address: FieldAddress): string | null {
  if (address.kind === "flat") {
    return receipt[flatKey(address.field)];
  }

  if (address.kind === "tax") {
    const tax = (receipt.taxes ?? [])[address.index];
    return tax ? tax[taxKey(address.cell)] : null;
  }

  const item = (receipt.lineItems ?? [])[address.index];
  return item ? item[itemKey(address.cell)] : null;
}
