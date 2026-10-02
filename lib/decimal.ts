/**
 * Exact decimal arithmetic over the strings the model returned.
 *
 * Money is a decimal string in this app and never a float, so the arithmetic
 * checks cannot hand a value to `Number` on the way to a comparison. This module
 * parses a decimal string into a signed `BigInt` of its digits plus a scale, the
 * count of fractional places, and adds, subtracts and compares two values by
 * lifting both to the wider of the two scales first. Every operation stays in
 * `BigInt`, so "0.07" plus "0.01" is "0.08" rather than the 0.08000000000000002 a
 * float gives.
 *
 * The module covers parse, add, subtract, compare and render, which is what the
 * two arithmetic checks ask for. It deliberately offers no multiply, no divide and
 * no rounding mode. If a later slice needs a per-item `quantity` times `unitPrice`
 * check, `big.js` replaces the internals behind these same function names.
 */

/**
 * The shape this module parses. The validating schema caps a money field at three
 * fractional places; the parser accepts any count, because a sum at a wider scale
 * is still exact and the schema is the control on what reaches it.
 */
const PARSEABLE_DECIMAL = /^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?$/;

/** A decimal held as a signed integer of digits and the scale those digits sit at. */
export type Decimal = {
  /** The digits as a signed integer: "47.60" is 4760n at scale 2. */
  readonly digits: bigint;
  /** How many of the digits are fractional. */
  readonly scale: number;
};

/** Thrown when a string is not a decimal this module can read. */
export class DecimalParseError extends Error {
  constructor(value: string) {
    super(`not a decimal string: ${JSON.stringify(value)}`);
    this.name = "DecimalParseError";
  }
}

/**
 * Reads a decimal string. A malformed string throws rather than coercing to zero,
 * because a check that silently reads a bad value as 0 names a difference the
 * receipt does not have.
 */
export function parseDecimal(value: string): Decimal {
  if (!PARSEABLE_DECIMAL.test(value)) {
    throw new DecimalParseError(value);
  }

  const negative = value.startsWith("-");
  const unsigned = value.replace(/^[+-]/, "");
  const [whole, fraction = ""] = unsigned.split(".");
  const digits = BigInt(`${whole}${fraction}`);

  return { digits: negative ? -digits : digits, scale: fraction.length };
}

/** The additive identity, at scale 0, so a sum of no values renders as "0". */
export const ZERO: Decimal = { digits: 0n, scale: 0 };

function tenTo(power: number): bigint {
  return 10n ** BigInt(power);
}

/** Restates a decimal at a wider scale, with no digit dropped. */
function atScale(value: Decimal, scale: number): bigint {
  return value.digits * tenTo(scale - value.scale);
}

/** The wider of two scales, which is the scale both operands lift to. */
function commonScale(left: Decimal, right: Decimal): number {
  return Math.max(left.scale, right.scale);
}

/** Adds two decimals at the wider of their two scales. */
export function add(left: Decimal, right: Decimal): Decimal {
  const scale = commonScale(left, right);
  return { digits: atScale(left, scale) + atScale(right, scale), scale };
}

/** Subtracts the right decimal from the left at the wider of their two scales. */
export function subtract(left: Decimal, right: Decimal): Decimal {
  const scale = commonScale(left, right);
  return { digits: atScale(left, scale) - atScale(right, scale), scale };
}

/**
 * Compares two decimals once their scales align: negative when the left is
 * smaller, zero when they are equal, positive when the left is larger. "47.6"
 * compares equal to "47.60".
 */
export function compare(left: Decimal, right: Decimal): number {
  const scale = commonScale(left, right);
  const difference = atScale(left, scale) - atScale(right, scale);

  if (difference < 0n) {
    return -1;
  }
  if (difference > 0n) {
    return 1;
  }
  return 0;
}

/** True when the two decimals hold the same value, whatever scale each was written at. */
export function equals(left: Decimal, right: Decimal): boolean {
  return compare(left, right) === 0;
}

/** Drops the sign, so a difference reads as a size rather than a direction. */
export function absolute(value: Decimal): Decimal {
  return value.digits < 0n ? { digits: -value.digits, scale: value.scale } : value;
}

/** True when the decimal is less than zero. */
export function isNegative(value: Decimal): boolean {
  return value.digits < 0n;
}

/** Adds a list of decimals left to right. An empty list sums to `ZERO`. */
export function sum(values: Decimal[]): Decimal {
  return values.reduce(add, ZERO);
}

/**
 * Writes a decimal back out at its own scale, so a difference between two-place
 * amounts renders as "0.50" rather than "0.5".
 */
export function render(value: Decimal): string {
  const negative = value.digits < 0n;
  const digits = (negative ? -value.digits : value.digits).toString();

  if (value.scale === 0) {
    return `${negative ? "-" : ""}${digits}`;
  }

  const padded = digits.padStart(value.scale + 1, "0");
  const whole = padded.slice(0, padded.length - value.scale);
  const fraction = padded.slice(padded.length - value.scale);

  return `${negative ? "-" : ""}${whole}.${fraction}`;
}
