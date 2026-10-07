import {
  EDITABLE_FLAT_FIELDS,
  EDITABLE_ITEM_CELLS,
  EDITABLE_TAX_CELLS,
  addressKey,
  type FieldAddress,
} from "./field-edit";
import type { Receipt } from "./receipt-schema";

/**
 * How one extraction is scored against the label the fixture was drawn from.
 *
 * Four rules shape every function below, and each of them exists to stop the
 * figure flattering the app.
 *
 * A value is compared as the string the app holds. Money is a decimal string and
 * a date is an ISO string, so nothing here reaches for `lib/decimal.ts` and
 * nothing parses a value into a number on the way to a comparison. "42.00"
 * against "42.0" is a miss, because the app's contract is the string, and a
 * comparison that lifted both to a common scale would measure the arithmetic
 * rather than the reading.
 *
 * A null matches only a null. A label of null against an actual of "0.00" is a
 * miss, because inventing a zero the receipt did not print is the failure this
 * app exists to avoid, and a label with a value against an actual null is a miss
 * too rather than a field the harness skips.
 *
 * A refused answer counts every field of the label wrong. Dropping a refusal
 * from the denominator would raise the figure by removing the hardest fixtures,
 * which is the specific way an accuracy number lies.
 *
 * Every function is pure. The harness reads the fixtures, calls the model and
 * writes the report; this module only compares, so the whole of it is reachable
 * from the Node test environment with no model call and no file on disk.
 */

/** What one fixture's extraction scored, field by field. */
export type FixtureComparison = {
  fixtureId: string;
  /** True when the model answered that the fixture was not a receipt. */
  refused: boolean;
  /** One entry per compared field, including the item cells. */
  fields: FieldComparison[];
};

export type FieldComparison = {
  /** The field's name as a visitor would read it, such as `total` or `lineItems.3.amount`. */
  field: string;
  /** The family the figures group by: `total`, `date`, `lineItems` or the field's own name. */
  group: string;
  expected: string | null;
  actual: string | null;
  matched: boolean;
  /** The model's confidence for that field, where it gave one. */
  confidence: number | null;
};

/**
 * The two fields compared case-insensitively, after collapsing whitespace.
 *
 * The app never promised to preserve the receipt's capitalisation or its spacing,
 * so "HARBOUR STREET GROCERS" against "Harbour Street Grocers" is a read the app
 * got right, and counting it wrong would measure the receipt's typography. These
 * two are the whole of the exception: a merchant name and a line item
 * description. Every other field, money and dates included, is exact. The names
 * here are the leaf names an address carries, and `description` belongs to a line
 * item alone, so a tax entry's `label` is not caught by it.
 */
export const COLLAPSED_CASE_FIELDS = ["merchant", "description"] as const;

/** The three published figures and the per-field breakdown. */
export type AccuracyFigures = {
  /** Matched fields over compared fields, across every fixture. */
  fieldAccuracy: number;
  totalAccuracy: number;
  dateAccuracy: number;
  /** Field name to its own ratio, for the report. */
  perField: Record<string, number>;
  comparedFields: number;
  matchedFields: number;
  fixtureCount: number;
  refusedCount: number;
};

/**
 * The family a field's figure rolls up into.
 *
 * A flat field is its own family, so `total` and `date` fall out of this as the
 * two the published figures break out. The two collections roll up instead,
 * because a report listing `lineItems.7.unitPrice` across forty fixtures names
 * several hundred rows and tells a reader nothing about how the app reads an item.
 */
function groupFor(address: FieldAddress): string {
  if (address.kind === "item") {
    return "lineItems";
  }
  if (address.kind === "tax") {
    return "taxes";
  }
  return address.field;
}

/** The leaf name a loose comparison is decided on: the flat field, or the cell. */
function leafOf(address: FieldAddress): string {
  return address.kind === "flat" ? address.field : address.cell;
}

/**
 * The addresses one fixture is scored on: every flat field, plus a cell for every
 * tax entry and every line item either side holds.
 *
 * The count comes from the longer of the two sides on purpose. An item the label
 * has and the model missed has to cost something, and so does an item the model
 * invented, so both sides contribute their length and the cells of an entry only
 * one side holds are counted as misses below.
 */
function comparedAddresses(expected: Receipt, actual: Receipt | null): FieldAddress[] {
  const taxCount = Math.max(expected.taxes?.length ?? 0, actual?.taxes?.length ?? 0);
  const itemCount = Math.max(expected.lineItems?.length ?? 0, actual?.lineItems?.length ?? 0);

  const addresses: FieldAddress[] = EDITABLE_FLAT_FIELDS.map((field) => ({
    kind: "flat" as const,
    field,
  }));

  for (let index = 0; index < taxCount; index += 1) {
    for (const cell of EDITABLE_TAX_CELLS) {
      addresses.push({ kind: "tax", index, cell });
    }
  }

  for (let index = 0; index < itemCount; index += 1) {
    for (const cell of EDITABLE_ITEM_CELLS) {
      addresses.push({ kind: "item", index, cell });
    }
  }

  return addresses;
}

/**
 * The value at an address, or `undefined` when the entry itself is not there.
 *
 * The two absences are kept apart deliberately. A null is a value the receipt did
 * not print, which can match another null; an `undefined` is an entry one side
 * does not have at all, which may never match anything.
 */
function valueAt(receipt: Receipt, address: FieldAddress): string | null | undefined {
  if (address.kind === "flat") {
    return receipt[address.field];
  }
  if (address.kind === "tax") {
    const entry = receipt.taxes?.[address.index];
    return entry ? entry[address.cell] : undefined;
  }
  const entry = receipt.lineItems?.[address.index];
  return entry ? entry[address.cell] : undefined;
}

/** The confidence the model reported beside that value, where there was one. */
function confidenceAt(receipt: Receipt, address: FieldAddress): number | null {
  if (address.kind === "flat") {
    return receipt[`${address.field}Confidence`];
  }
  if (address.kind === "tax") {
    const entry = receipt.taxes?.[address.index];
    return entry ? entry[`${address.cell}Confidence`] : null;
  }
  const entry = receipt.lineItems?.[address.index];
  return entry ? entry[`${address.cell}Confidence`] : null;
}

/** Case folded, with every run of whitespace reduced to one space and the ends trimmed. */
function collapsed(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function isCollapsedCaseField(leaf: string): boolean {
  return (COLLAPSED_CASE_FIELDS as readonly string[]).includes(leaf);
}

/**
 * Whether one value matched, given which field it is.
 *
 * Exact string equality, with the two named exceptions and nothing else. A null
 * on one side matches only a null on the other, so the identity comparison here
 * is the whole of that rule.
 */
function valuesMatch(leaf: string, expected: string | null, actual: string | null): boolean {
  if (expected === null || actual === null) {
    return expected === actual;
  }
  if (isCollapsedCaseField(leaf)) {
    return collapsed(expected) === collapsed(actual);
  }
  return expected === actual;
}

/**
 * Scores one extraction against one label.
 *
 * An `actual` of null, or one answering `isReceipt: false`, is a refusal. The
 * refusal is read as the app failing that receipt completely: every field of the
 * label is reported with an actual of null and a miss, rather than the fixture
 * leaving the denominator.
 */
export function compareReceipt(
  fixtureId: string,
  expected: Receipt,
  actual: Receipt | null,
): FixtureComparison {
  const refused = actual === null || !actual.isReceipt;
  /** A refused answer is read as having returned nothing, whatever fields it carried. */
  const answer = refused ? null : actual;

  const fields = comparedAddresses(expected, answer).map((address): FieldComparison => {
    const expectedValue = valueAt(expected, address);
    const actualValue = answer ? valueAt(answer, address) : undefined;
    const leaf = leafOf(address);

    /**
     * An entry only one side holds never matches. A missing item's cells are
     * misses because the app did not read the item, and an invented item's cells
     * are misses because a line the receipt never printed is not free.
     */
    const bothPresent = expectedValue !== undefined && actualValue !== undefined;

    return {
      field: addressKey(address),
      group: groupFor(address),
      expected: expectedValue ?? null,
      actual: actualValue ?? null,
      matched: bothPresent && valuesMatch(leaf, expectedValue, actualValue),
      confidence: answer ? confidenceAt(answer, address) : null,
    };
  });

  return { fixtureId, refused, fields };
}

/**
 * A ratio that reads 0 rather than 1 when nothing was compared.
 *
 * A group no fixture carried has not been measured, and a figure of 1 would claim
 * the app read it perfectly. Reporting 0 is the reading that cannot overstate
 * what the run showed, and `comparedFields` beside it is what tells a reader
 * which of the two happened.
 */
function ratio(matched: number, compared: number): number {
  return compared === 0 ? 0 : matched / compared;
}

/** The three published figures and the per-group breakdown, over a whole run. */
export function accuracyFigures(
  comparisons: readonly FixtureComparison[],
): AccuracyFigures {
  const groups = new Map<string, { matched: number; compared: number }>();
  let comparedFields = 0;
  let matchedFields = 0;

  for (const comparison of comparisons) {
    for (const field of comparison.fields) {
      comparedFields += 1;
      if (field.matched) {
        matchedFields += 1;
      }

      const tally = groups.get(field.group) ?? { matched: 0, compared: 0 };
      tally.compared += 1;
      if (field.matched) {
        tally.matched += 1;
      }
      groups.set(field.group, tally);
    }
  }

  const perField: Record<string, number> = {};
  for (const [group, tally] of groups) {
    perField[group] = ratio(tally.matched, tally.compared);
  }

  const groupRatio = (group: string) => {
    const tally = groups.get(group);
    return tally ? ratio(tally.matched, tally.compared) : 0;
  };

  return {
    fieldAccuracy: ratio(matchedFields, comparedFields),
    totalAccuracy: groupRatio("total"),
    dateAccuracy: groupRatio("date"),
    perField,
    comparedFields,
    matchedFields,
    fixtureCount: comparisons.length,
    refusedCount: comparisons.filter((comparison) => comparison.refused).length,
  };
}
