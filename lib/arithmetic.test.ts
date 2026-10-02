import { describe, expect, it } from "vitest";
import { arithmeticWarnings, lineItemTotal, warningsForField } from "./arithmetic";
import type { Receipt, ReceiptLineItem, ReceiptTax } from "./receipt-schema";

/** One purchased line. Only the amount matters to a check, so the rest is filler. */
function item(amount: string | null, overrides: Partial<ReceiptLineItem> = {}): ReceiptLineItem {
  return {
    description: "An item",
    descriptionConfidence: 0.9,
    descriptionSourceText: "AN ITEM",
    quantity: "1",
    quantityConfidence: 0.9,
    quantitySourceText: "1",
    unitPrice: amount,
    unitPriceConfidence: 0.9,
    unitPriceSourceText: amount,
    amount,
    amountConfidence: 0.9,
    amountSourceText: amount,
    ...overrides,
  };
}

function tax(label: string, amount: string | null): ReceiptTax {
  return {
    label,
    labelConfidence: 0.9,
    labelSourceText: label,
    amount,
    amountConfidence: 0.9,
    amountSourceText: amount,
  };
}

/** A receipt carrying only what the checks read. Everything else is null. */
function receipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    isReceipt: true,
    reason: null,
    merchant: "Harbour Street Grocers",
    merchantConfidence: 0.9,
    merchantSourceText: "HARBOUR STREET GROCERS",
    merchantAddress: null,
    merchantAddressConfidence: null,
    merchantAddressSourceText: null,
    date: null,
    dateConfidence: null,
    dateSourceText: null,
    time: null,
    timeConfidence: null,
    timeSourceText: null,
    currency: "USD",
    currencyConfidence: 0.9,
    currencySourceText: "$",
    subtotal: null,
    subtotalConfidence: null,
    subtotalSourceText: null,
    taxes: null,
    tip: null,
    tipConfidence: null,
    tipSourceText: null,
    total: null,
    totalConfidence: null,
    totalSourceText: null,
    paymentMethod: null,
    paymentMethodConfidence: null,
    paymentMethodSourceText: null,
    cardLast4: null,
    cardLast4Confidence: null,
    cardLast4SourceText: null,
    lineItems: null,
    ...overrides,
  };
}

describe("lineItemTotal", () => {
  it("sums the amounts of a six-item receipt", () => {
    const sum = lineItemTotal(
      receipt({
        lineItems: [
          item("4.99"),
          item("12.50"),
          item("3.25"),
          item("1.86"),
          item("19.00"),
          item("6.00"),
        ],
      }),
    );
    expect(sum).toEqual({ status: "computed", value: "47.60" });
  });

  it("reports no items for an empty array and for a null", () => {
    expect(lineItemTotal(receipt({ lineItems: [] }))).toEqual({ status: "none" });
    expect(lineItemTotal(receipt({ lineItems: null }))).toEqual({ status: "none" });
  });

  it("reports an incomplete sum when one amount is null", () => {
    const sum = lineItemTotal(receipt({ lineItems: [item("4.99"), item(null), item("6.00")] }));
    expect(sum).toEqual({ status: "incomplete" });
  });

  it("sums at the widest scale the receipt used", () => {
    const sum = lineItemTotal(receipt({ lineItems: [item("1.005"), item("2.00")] }));
    expect(sum).toEqual({ status: "computed", value: "3.005" });
  });
});

describe("the line item check", () => {
  it("passes when the items sum to the printed subtotal", () => {
    const warnings = arithmeticWarnings(
      receipt({
        subtotal: "47.60",
        lineItems: [
          item("4.99"),
          item("12.50"),
          item("3.25"),
          item("1.86"),
          item("19.00"),
          item("6.00"),
        ],
      }),
    );
    expect(warnings).toEqual([]);
  });

  it("passes on the sums a float gets wrong", () => {
    const warnings = arithmeticWarnings(
      receipt({ subtotal: "0.60", lineItems: [item("0.10"), item("0.20"), item("0.30")] }),
    );
    expect(warnings).toEqual([]);
  });

  it("passes when the two amounts are written at different scales", () => {
    const warnings = arithmeticWarnings(
      receipt({ subtotal: "47.60", lineItems: [item("47.6")] }),
    );
    expect(warnings).toEqual([]);
  });

  it("names the check, both fields and the difference on a mismatch", () => {
    const warnings = arithmeticWarnings(
      receipt({ subtotal: "47.60", lineItems: [item("40.00"), item("8.10")] }),
    );

    expect(warnings).toHaveLength(1);
    expect(warnings[0].check).toBe("line-items-sum");
    expect(warnings[0].fields).toEqual(["lineItemsTotal", "subtotal"]);
    expect(warnings[0].computed).toBe("48.10");
    expect(warnings[0].printed).toBe("47.60");
    expect(warnings[0].difference).toBe("0.50");
    expect(warnings[0].message).toBe(
      "The line items sum to 48.10, which is 0.50 more than the printed subtotal of 47.60.",
    );
  });

  it("names the direction when the items fall short", () => {
    const [warning] = arithmeticWarnings(
      receipt({ subtotal: "48.10", lineItems: [item("47.60")] }),
    );
    expect(warning.difference).toBe("0.50");
    expect(warning.message).toContain("0.50 less than");
  });

  it("warns on a third decimal place against two places", () => {
    const [warning] = arithmeticWarnings(
      receipt({ subtotal: "1.00", lineItems: [item("1.005")] }),
    );
    expect(warning.difference).toBe("0.005");
  });
});

describe("the total check", () => {
  it("passes on a restaurant receipt with a tip and two tax lines", () => {
    const warnings = arithmeticWarnings(
      receipt({
        subtotal: "44.00",
        taxes: [tax("State tax", "2.10"), tax("City tax", "0.95")],
        tip: "8.00",
        total: "55.05",
      }),
    );
    expect(warnings).toEqual([]);
  });

  it("treats a null tip and an absent taxes array as contributing nothing", () => {
    const warnings = arithmeticWarnings(
      receipt({ subtotal: "42.00", taxes: null, tip: null, total: "42.00" }),
    );
    expect(warnings).toEqual([]);
  });

  it("passes when the subtotal plus taxes equals the total and no tip is printed", () => {
    const warnings = arithmeticWarnings(
      receipt({ subtotal: "38.40", taxes: [tax("VAT 20%", "3.60")], tip: null, total: "42.00" }),
    );
    expect(warnings).toEqual([]);
  });

  it("names the check, both fields and the difference on a mismatch", () => {
    const warnings = arithmeticWarnings(
      receipt({ subtotal: "47.00", taxes: [tax("Tax", "3.20")], tip: "5.00", total: "55.00" }),
    );

    expect(warnings).toHaveLength(1);
    expect(warnings[0].check).toBe("total-sum");
    expect(warnings[0].fields).toEqual(["subtotal", "total"]);
    expect(warnings[0].computed).toBe("55.20");
    expect(warnings[0].printed).toBe("55.00");
    expect(warnings[0].difference).toBe("0.20");
    expect(warnings[0].message).toBe(
      "The subtotal, taxes and tip add up to 55.20, which is 0.20 more than the printed total of 55.00.",
    );
  });

  it("warns on a receipt that rounded its own tax line rather than tolerating the cent", () => {
    const [warning] = arithmeticWarnings(
      receipt({ subtotal: "50.01", taxes: [tax("Tax", "4.00")], tip: "1.00", total: "55.00" }),
    );
    expect(warning.check).toBe("total-sum");
    expect(warning.difference).toBe("0.01");
    expect(warning.message).toContain("0.01 more than");
  });

  it("still runs on a card slip that itemizes nothing", () => {
    const warnings = arithmeticWarnings(
      receipt({ subtotal: "40.00", taxes: null, tip: "5.00", total: "45.00", lineItems: [] }),
    );
    expect(warnings).toEqual([]);
  });

  it("warns on a card slip whose total does not add up, with nothing said about the items", () => {
    const warnings = arithmeticWarnings(
      receipt({ subtotal: "40.00", tip: "5.00", total: "44.00", lineItems: [] }),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0].check).toBe("total-sum");
  });
});

describe("a missing value skips a check rather than warning", () => {
  it("skips the sum check when the subtotal is null and still shows the item total", () => {
    const base = receipt({ lineItems: [item("4.99"), item("12.50"), item("3.25")] });
    expect(arithmeticWarnings(base)).toEqual([]);
    expect(lineItemTotal(base)).toEqual({ status: "computed", value: "20.74" });
  });

  it("skips the total check when the total is null", () => {
    expect(arithmeticWarnings(receipt({ subtotal: "42.00", total: null }))).toEqual([]);
  });

  it("skips the total check when the subtotal is null", () => {
    expect(arithmeticWarnings(receipt({ subtotal: null, total: "42.00" }))).toEqual([]);
  });

  it("skips the sum check when one item amount is null", () => {
    const warnings = arithmeticWarnings(
      receipt({ subtotal: "47.60", lineItems: [item("4.99"), item(null)] }),
    );
    expect(warnings).toEqual([]);
  });

  it("does not treat an empty lineItems as a flag of its own", () => {
    expect(arithmeticWarnings(receipt({ subtotal: "42.00", lineItems: [] }))).toEqual([]);
    expect(arithmeticWarnings(receipt({ subtotal: "42.00", lineItems: null }))).toEqual([]);
  });
});

describe("both checks together", () => {
  it("reports nothing on a receipt that balances twice over", () => {
    const warnings = arithmeticWarnings(
      receipt({
        subtotal: "38.40",
        taxes: [tax("VAT 20%", "3.60")],
        total: "42.00",
        lineItems: [item("20.00"), item("18.40")],
      }),
    );
    expect(warnings).toEqual([]);
  });

  it("reports both failures when neither sum lands", () => {
    const warnings = arithmeticWarnings(
      receipt({
        subtotal: "47.60",
        taxes: [tax("Tax", "3.00")],
        total: "50.00",
        lineItems: [item("48.10")],
      }),
    );
    expect(warnings.map((warning) => warning.check)).toEqual(["line-items-sum", "total-sum"]);
    expect(warnings[0].difference).toBe("0.50");
    expect(warnings[1].difference).toBe("0.60");
  });
});

describe("warningsForField", () => {
  it("gives a subtotal mismatch to both the item total row and the subtotal row", () => {
    const warnings = arithmeticWarnings(
      receipt({ subtotal: "47.60", lineItems: [item("48.10")] }),
    );
    expect(warningsForField(warnings, "lineItemsTotal")).toHaveLength(1);
    expect(warningsForField(warnings, "subtotal")).toHaveLength(1);
    expect(warningsForField(warnings, "total")).toHaveLength(0);
  });

  it("gives a total mismatch to both the subtotal row and the total row", () => {
    const warnings = arithmeticWarnings(receipt({ subtotal: "40.00", total: "45.00" }));
    expect(warningsForField(warnings, "subtotal")).toHaveLength(1);
    expect(warningsForField(warnings, "total")).toHaveLength(1);
    expect(warningsForField(warnings, "lineItemsTotal")).toHaveLength(0);
  });
});

describe("the checker leaves the receipt alone", () => {
  it("mutates no field and returns warnings only", () => {
    const warned = receipt({
      subtotal: "47.60",
      taxes: [tax("Tax", "3.00")],
      tip: "2.00",
      total: "50.00",
      lineItems: [item("48.10")],
    });
    const before = structuredClone(warned);

    const warnings = arithmeticWarnings(warned);

    expect(warnings.length).toBeGreaterThan(0);
    expect(warned).toEqual(before);
    expect(warned.subtotal).toBe("47.60");
    expect(warned.total).toBe("50.00");
    expect(warned.lineItems?.[0].amount).toBe("48.10");
  });

  it("reads nothing outside the object it was given and makes no request", () => {
    // A thrown fetch proves the checker never reaches for the network. There is
    // no module-level state to reset, because every function takes its receipt as
    // an argument and returns a fresh array.
    const original = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("the checker must not make a request");
    }) as typeof fetch;

    try {
      expect(() =>
        arithmeticWarnings(receipt({ subtotal: "47.60", lineItems: [item("48.10")] })),
      ).not.toThrow();
    } finally {
      globalThis.fetch = original;
    }
  });
});
