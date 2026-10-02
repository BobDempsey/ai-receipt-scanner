import { describe, expect, it } from "vitest";
import {
  absolute,
  add,
  compare,
  DecimalParseError,
  equals,
  isNegative,
  parseDecimal,
  render,
  subtract,
  sum,
  ZERO,
} from "./decimal";

/** Parses a string and renders the result, which is how the checks use the module. */
function total(values: string[]): string {
  return render(sum(values.map(parseDecimal)));
}

describe("parseDecimal", () => {
  it("reads the digits and the scale off a two-place amount", () => {
    expect(parseDecimal("47.60")).toEqual({ digits: 4760n, scale: 2 });
  });

  it("reads a whole number at scale 0", () => {
    expect(parseDecimal("2")).toEqual({ digits: 2n, scale: 0 });
  });

  it("reads a third decimal place without dropping it", () => {
    expect(parseDecimal("1.005")).toEqual({ digits: 1005n, scale: 3 });
  });

  it("reads a negative amount", () => {
    expect(parseDecimal("-0.50")).toEqual({ digits: -50n, scale: 2 });
  });

  it.each(["", " ", "42.", ".5", "1,200.00", "4e2", "abc", "0x10", "1.2.3", "01.5"])(
    "rejects %o rather than coercing it",
    (value) => {
      expect(() => parseDecimal(value)).toThrow(DecimalParseError);
    },
  );
});

describe("add and sum", () => {
  it("adds the sums a float gets wrong", () => {
    expect(total(["0.10", "0.20", "0.30"])).toBe("0.60");
    expect(total(["0.07", "0.01"])).toBe("0.08");
  });

  it("sums a six-item grocery receipt to its printed subtotal", () => {
    expect(total(["4.99", "12.50", "3.25", "1.86", "19.00", "6.00"])).toBe("47.60");
  });

  it("sums an empty list to zero at scale 0", () => {
    expect(sum([])).toEqual(ZERO);
    expect(render(sum([]))).toBe("0");
  });

  it("lifts the narrower operand to the wider scale", () => {
    expect(render(add(parseDecimal("1.005"), parseDecimal("2.00")))).toBe("3.005");
  });
});

describe("subtract", () => {
  it("renders a two-place difference with both decimal places", () => {
    expect(render(subtract(parseDecimal("48.10"), parseDecimal("47.60")))).toBe("0.50");
  });

  it("carries the direction in the sign", () => {
    const difference = subtract(parseDecimal("47.60"), parseDecimal("48.10"));
    expect(isNegative(difference)).toBe(true);
    expect(render(difference)).toBe("-0.50");
    expect(render(absolute(difference))).toBe("0.50");
  });

  it("renders a zero difference at the common scale", () => {
    expect(render(subtract(parseDecimal("55.00"), parseDecimal("55.00")))).toBe("0.00");
  });

  it("names the cent a receipt rounded off", () => {
    expect(render(subtract(parseDecimal("55.01"), parseDecimal("55.00")))).toBe("0.01");
  });

  it("subtracts across differing scales without dropping a digit", () => {
    expect(render(subtract(parseDecimal("1.005"), parseDecimal("1.00")))).toBe("0.005");
  });
});

describe("compare and equals", () => {
  it("treats the same value written at two scales as equal", () => {
    expect(compare(parseDecimal("47.6"), parseDecimal("47.60"))).toBe(0);
    expect(equals(parseDecimal("47.6"), parseDecimal("47.60"))).toBe(true);
  });

  it("orders two amounts", () => {
    expect(compare(parseDecimal("47.60"), parseDecimal("48.10"))).toBe(-1);
    expect(compare(parseDecimal("48.10"), parseDecimal("47.60"))).toBe(1);
  });

  it("does not tolerate a cent", () => {
    expect(equals(parseDecimal("55.01"), parseDecimal("55.00"))).toBe(false);
  });

  it("compares a third decimal place against two places", () => {
    expect(equals(parseDecimal("1.005"), parseDecimal("1.00"))).toBe(false);
    expect(equals(parseDecimal("1.000"), parseDecimal("1.00"))).toBe(true);
  });
});

describe("render", () => {
  it("keeps the trailing zeros the scale carries", () => {
    expect(render({ digits: 4200n, scale: 2 })).toBe("42.00");
  });

  it("pads a value smaller than one", () => {
    expect(render({ digits: 5n, scale: 3 })).toBe("0.005");
    expect(render({ digits: 0n, scale: 2 })).toBe("0.00");
  });
});

describe("the module stays off floats", () => {
  it("never converts a value to Number", () => {
    // The first two lines are what a Number path does with these values: 0.1 plus
    // 0.2 plus 0.3 lands on 0.6000000000000001 and 1.1 plus 2.2 on
    // 3.3000000000000003. The module renders both sums exactly, which it could not
    // do with a Number anywhere between the string and the result.
    expect(0.1 + 0.2 + 0.3).not.toBe(0.6);
    expect(1.1 + 2.2).not.toBe(3.3);
    expect(total(["0.10", "0.20", "0.30"])).toBe("0.60");
    expect(total(["1.10", "2.20"])).toBe("3.30");
    expect(total(["0.07", "0.01"])).toBe("0.08");
  });
});
