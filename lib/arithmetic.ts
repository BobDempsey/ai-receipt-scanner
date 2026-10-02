import {
  absolute,
  equals,
  isNegative,
  parseDecimal,
  render,
  subtract,
  sum,
  type Decimal,
} from "./decimal";
import type { Receipt } from "./receipt-schema";

/**
 * The two arithmetic checks, run in code over the validated object the browser
 * already holds.
 *
 * The line item amounts sum to `subtotal`, and `subtotal` plus every
 * `taxes[].amount` plus `tip` equals `total`. A mismatch produces a warning
 * naming the difference. Nothing here rewrites a value to close a gap, and
 * nothing here asks the model anything: the function is pure, reads only the
 * receipt it was given, and makes no request of any kind.
 *
 * Comparison is exact at a common scale, with no tolerance of a cent. A receipt
 * that rounds its own tax line and a model that misread a digit look the same to
 * the app, and the visitor is the one who can tell them apart, so the app names
 * the 0.01 rather than hiding it.
 */

/** Which comparison raised a warning. */
export type ArithmeticCheck = "line-items-sum" | "total-sum";

/** The rows a warning can name. The field panel keys its rows off these. */
export type ArithmeticField = "lineItemsTotal" | "subtotal" | "total";

export type ArithmeticWarning = {
  /** The comparison that failed. */
  check: ArithmeticCheck;
  /** The two rows the panel marks, in the order the message names them. */
  fields: [ArithmeticField, ArithmeticField];
  /** What the app computed, as a decimal string. */
  computed: string;
  /** What the receipt printed, as a decimal string. */
  printed: string;
  /** The size of the gap, as a decimal string at the common scale, with no sign. */
  difference: string;
  /** The sentence the panel and the export both read off this warning. */
  message: string;
};

/** The sum of the line item amounts, when every item carries one. */
export type LineItemTotal =
  | { status: "computed"; value: string }
  /** `lineItems` is null or empty: the app read no items. */
  | { status: "none" }
  /** At least one item amount is null, so a sum would name a gap the receipt has not got. */
  | { status: "incomplete" };

/**
 * Sums the line item amounts.
 *
 * One null amount makes the sum unusable rather than smaller, because summing the
 * rest would name a difference the receipt does not have, so the function reports
 * `incomplete` and the check that wanted it skips.
 */
export function lineItemTotal(receipt: Receipt): LineItemTotal {
  const items = receipt.lineItems ?? [];

  if (items.length === 0) {
    return { status: "none" };
  }

  const amounts: Decimal[] = [];
  for (const item of items) {
    if (item.amount === null) {
      return { status: "incomplete" };
    }
    amounts.push(parseDecimal(item.amount));
  }

  return { status: "computed", value: render(sum(amounts)) };
}

/** "more than" or "less than", so the visitor reads a direction rather than a sign. */
function direction(computed: Decimal, printed: Decimal): string {
  return isNegative(subtract(computed, printed)) ? "less than" : "more than";
}

/**
 * Compares two decimal strings and returns a warning when they differ.
 *
 * The wording lives here so the panel and the export read the same sentence off
 * the same object rather than each composing its own.
 */
function compareOrWarn(
  check: ArithmeticCheck,
  fields: [ArithmeticField, ArithmeticField],
  computedText: string,
  printedText: string,
  describe: (parts: {
    computed: string;
    printed: string;
    difference: string;
    direction: string;
  }) => string,
): ArithmeticWarning | null {
  const computed = parseDecimal(computedText);
  const printed = parseDecimal(printedText);

  if (equals(computed, printed)) {
    return null;
  }

  const gap = absolute(subtract(computed, printed));
  const difference = render(gap);

  return {
    check,
    fields,
    computed: computedText,
    printed: printedText,
    difference,
    message: describe({
      computed: computedText,
      printed: printedText,
      difference,
      direction: direction(computed, printed),
    }),
  };
}

/** The line item amounts against the printed `subtotal`. */
function checkLineItemsSum(receipt: Receipt): ArithmeticWarning | null {
  const items = lineItemTotal(receipt);

  if (items.status !== "computed" || receipt.subtotal === null) {
    return null;
  }

  return compareOrWarn(
    "line-items-sum",
    ["lineItemsTotal", "subtotal"],
    items.value,
    receipt.subtotal,
    ({ computed, printed, difference, direction: sense }) =>
      `The line items sum to ${computed}, which is ${difference} ${sense} the printed subtotal of ${printed}.`,
  );
}

/** `subtotal` plus every tax plus `tip` against the printed `total`. */
function checkTotalSum(receipt: Receipt): ArithmeticWarning | null {
  if (receipt.subtotal === null || receipt.total === null) {
    return null;
  }

  const parts: Decimal[] = [parseDecimal(receipt.subtotal)];

  for (const tax of receipt.taxes ?? []) {
    // A tax line the model could not read a figure for contributes nothing. An
    // absent taxes array does the same, which is what the spec's no-tip and
    // no-tax scenarios ask for.
    if (tax.amount !== null) {
      parts.push(parseDecimal(tax.amount));
    }
  }

  if (receipt.tip !== null) {
    parts.push(parseDecimal(receipt.tip));
  }

  return compareOrWarn(
    "total-sum",
    ["subtotal", "total"],
    render(sum(parts)),
    receipt.total,
    ({ computed, printed, difference, direction: sense }) =>
      `The subtotal, taxes and tip add up to ${computed}, which is ${difference} ${sense} the printed total of ${printed}.`,
  );
}

/**
 * Every warning the two checks raise, in the order the panel reads them.
 *
 * The receipt is read and never written. A caller holds the returned array beside
 * the receipt rather than folding it in, so nothing the Zod schema governs gains
 * a key the schema rejects.
 */
export function arithmeticWarnings(receipt: Receipt): ArithmeticWarning[] {
  const warnings: ArithmeticWarning[] = [];

  const items = checkLineItemsSum(receipt);
  if (items) {
    warnings.push(items);
  }

  const total = checkTotalSum(receipt);
  if (total) {
    warnings.push(total);
  }

  return warnings;
}

/** The warnings naming a given row, which is how the panel marks both sides of a gap. */
export function warningsForField(
  warnings: ArithmeticWarning[],
  field: ArithmeticField,
): ArithmeticWarning[] {
  return warnings.filter((warning) => warning.fields.includes(field));
}
