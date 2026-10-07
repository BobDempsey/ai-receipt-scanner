import { describe, expect, it } from "vitest";
import {
  COLLAPSED_CASE_FIELDS,
  accuracyFigures,
  compareReceipt,
  type FieldComparison,
  type FixtureComparison,
} from "./accuracy";
import type { Receipt, ReceiptLineItem, ReceiptTax } from "./receipt-schema";

/** One purchased line, with every cell filled so a test only has to say what differs. */
function item(overrides: Partial<ReceiptLineItem> = {}): ReceiptLineItem {
  return {
    description: "An item",
    descriptionConfidence: 0.9,
    descriptionSourceText: "AN ITEM",
    quantity: "1",
    quantityConfidence: 0.9,
    quantitySourceText: "1",
    unitPrice: "4.00",
    unitPriceConfidence: 0.9,
    unitPriceSourceText: "4.00",
    amount: "4.00",
    amountConfidence: 0.9,
    amountSourceText: "4.00",
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

/** A receipt carrying a value in every flat field, so each test changes one thing. */
function receipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    isReceipt: true,
    reason: null,
    merchant: "Harbour Street Grocers",
    merchantConfidence: 0.98,
    merchantSourceText: "HARBOUR STREET GROCERS",
    merchantAddress: "14 Harbour Street",
    merchantAddressConfidence: 0.9,
    merchantAddressSourceText: "14 HARBOUR STREET",
    date: "2026-10-05",
    dateConfidence: 0.97,
    dateSourceText: "05/10/2026",
    time: "14:32",
    timeConfidence: 0.9,
    timeSourceText: "14:32",
    currency: "USD",
    currencyConfidence: 0.9,
    currencySourceText: "$",
    subtotal: "38.40",
    subtotalConfidence: 0.95,
    subtotalSourceText: "38.40",
    taxes: null,
    tip: null,
    tipConfidence: null,
    tipSourceText: null,
    total: "42.00",
    totalConfidence: 0.99,
    totalSourceText: "TOTAL 42.00",
    paymentMethod: "Visa",
    paymentMethodConfidence: 0.9,
    paymentMethodSourceText: "VISA",
    cardLast4: "4242",
    cardLast4Confidence: 0.9,
    cardLast4SourceText: "4242",
    lineItems: null,
    ...overrides,
  };
}

/** The one comparison a test is asserting on, found by the name the report prints. */
function field(comparison: FixtureComparison, name: string): FieldComparison {
  const found = comparison.fields.find((entry) => entry.field === name);
  if (!found) {
    throw new Error(`no comparison for ${name}`);
  }
  return found;
}

function matchedNames(comparison: FixtureComparison): string[] {
  return comparison.fields.filter((entry) => entry.matched).map((entry) => entry.field);
}

describe("compareReceipt", () => {
  it("counts every flat field of an exact answer as matched", () => {
    const comparison = compareReceipt("f01", receipt(), receipt());

    expect(comparison.fixtureId).toBe("f01");
    expect(comparison.refused).toBe(false);
    expect(comparison.fields).toHaveLength(10);
    expect(comparison.fields.every((entry) => entry.matched)).toBe(true);
  });

  it("reads the model's confidence onto each field it compared", () => {
    const comparison = compareReceipt("f01", receipt(), receipt({ totalConfidence: 0.42 }));

    expect(field(comparison, "total").confidence).toBe(0.42);
    expect(field(comparison, "tip").confidence).toBeNull();
  });

  it("names a field the way the export names it", () => {
    const comparison = compareReceipt(
      "f01",
      receipt({ taxes: [tax("Sales tax", "3.60")], lineItems: [item(), item()] }),
      receipt({ taxes: [tax("Sales tax", "3.60")], lineItems: [item(), item()] }),
    );

    const names = comparison.fields.map((entry) => entry.field);
    expect(names).toContain("total");
    expect(names).toContain("taxes.0.amount");
    expect(names).toContain("lineItems.1.unitPrice");
  });
});

describe("money and dates compare as strings", () => {
  it("counts 42.0 against a label of 42.00 as a miss", () => {
    const comparison = compareReceipt("f01", receipt(), receipt({ total: "42.0" }));

    expect(field(comparison, "total").matched).toBe(false);
    expect(field(comparison, "total").expected).toBe("42.00");
    expect(field(comparison, "total").actual).toBe("42.0");
  });

  it("counts a date written any other way as a miss", () => {
    const comparison = compareReceipt("f01", receipt(), receipt({ date: "2026-10-5" }));

    expect(field(comparison, "date").matched).toBe(false);
  });

  it("counts an invented zero against a label of null as a miss", () => {
    const comparison = compareReceipt("f01", receipt({ tip: null }), receipt({ tip: "0.00" }));

    expect(field(comparison, "tip").matched).toBe(false);
    expect(field(comparison, "tip").expected).toBeNull();
    expect(field(comparison, "tip").actual).toBe("0.00");
  });

  it("counts a value the model left null as a miss", () => {
    const comparison = compareReceipt("f01", receipt(), receipt({ total: null }));

    expect(field(comparison, "total").matched).toBe(false);
  });

  it("matches a null against a null, because the receipt printed neither", () => {
    const comparison = compareReceipt("f01", receipt({ tip: null }), receipt({ tip: null }));

    expect(field(comparison, "tip").matched).toBe(true);
  });
});

describe("the two case-insensitive fields", () => {
  it("matches a merchant across case and collapsed whitespace", () => {
    const comparison = compareReceipt(
      "f01",
      receipt({ merchant: "Harbour Street Grocers" }),
      receipt({ merchant: "  HARBOUR   STREET\tGROCERS " }),
    );

    expect(field(comparison, "merchant").matched).toBe(true);
  });

  it("matches a line item description across case and collapsed whitespace", () => {
    const comparison = compareReceipt(
      "f01",
      receipt({ lineItems: [item({ description: "Oat Milk 1L" })] }),
      receipt({ lineItems: [item({ description: "oat  milk 1l" })] }),
    );

    expect(field(comparison, "lineItems.0.description").matched).toBe(true);
  });

  it("names only those two fields", () => {
    expect(COLLAPSED_CASE_FIELDS).toEqual(["merchant", "description"]);
  });

  it("refuses the same leniency to the other text fields", () => {
    const loose = {
      merchantAddress: "14 HARBOUR  STREET",
      paymentMethod: "VISA",
      currency: "usd",
    };
    const comparison = compareReceipt("f01", receipt(), receipt(loose));

    expect(field(comparison, "merchantAddress").matched).toBe(false);
    expect(field(comparison, "paymentMethod").matched).toBe(false);
    expect(field(comparison, "currency").matched).toBe(false);
  });

  it("refuses the same leniency to a tax label", () => {
    const comparison = compareReceipt(
      "f01",
      receipt({ taxes: [tax("Sales tax", "3.60")] }),
      receipt({ taxes: [tax("SALES TAX", "3.60")] }),
    );

    expect(field(comparison, "taxes.0.label").matched).toBe(false);
    expect(field(comparison, "taxes.0.amount").matched).toBe(true);
  });
});

describe("lineItems scores per item cell", () => {
  /** Eleven items, each distinct enough that a wrong cell is traceable. */
  function elevenItems(): ReceiptLineItem[] {
    return Array.from({ length: 11 }, (_, index) =>
      item({
        description: `Item ${index}`,
        descriptionSourceText: `ITEM ${index}`,
        amount: `${index + 1}.00`,
        amountSourceText: `${index + 1}.00`,
      }),
    );
  }

  it("scores an eleven-item receipt with one wrong amount at neither zero nor one", () => {
    const expected = receipt({ lineItems: elevenItems() });
    const wrong = elevenItems();
    wrong[4] = { ...wrong[4], amount: "9.99" };

    const comparison = compareReceipt("f01", expected, receipt({ lineItems: wrong }));
    const figures = accuracyFigures([comparison]);

    // Eleven items of four cells each, with one cell wrong.
    expect(figures.perField.lineItems).toBeCloseTo(43 / 44, 10);
    expect(figures.perField.lineItems).toBeGreaterThan(0);
    expect(figures.perField.lineItems).toBeLessThan(1);
    expect(field(comparison, "lineItems.4.amount").matched).toBe(false);
    expect(field(comparison, "lineItems.4.description").matched).toBe(true);
  });

  it("gives every item cell the lineItems group", () => {
    const comparison = compareReceipt(
      "f01",
      receipt({ lineItems: [item()] }),
      receipt({ lineItems: [item()] }),
    );
    const cells = comparison.fields.filter((entry) => entry.field.startsWith("lineItems."));

    expect(cells).toHaveLength(4);
    expect(cells.every((entry) => entry.group === "lineItems")).toBe(true);
  });
});

describe("an item only one side holds", () => {
  it("counts every cell of a missing item as a miss", () => {
    const comparison = compareReceipt(
      "f01",
      receipt({ lineItems: [item(), item({ description: "Second", quantity: null })] }),
      receipt({ lineItems: [item()] }),
    );

    expect(comparison.fields.filter((entry) => entry.field.startsWith("lineItems."))).toHaveLength(
      8,
    );
    expect(field(comparison, "lineItems.1.description").matched).toBe(false);
    expect(field(comparison, "lineItems.1.description").actual).toBeNull();
    // The label's own null may not earn a match off an item the model never read.
    expect(field(comparison, "lineItems.1.quantity").expected).toBeNull();
    expect(field(comparison, "lineItems.1.quantity").matched).toBe(false);
  });

  it("counts every cell of an invented item as a miss", () => {
    const comparison = compareReceipt(
      "f01",
      receipt({ lineItems: [item()] }),
      receipt({ lineItems: [item(), item({ description: "Never printed" })] }),
    );

    expect(field(comparison, "lineItems.1.description").matched).toBe(false);
    expect(field(comparison, "lineItems.1.description").expected).toBeNull();
    expect(field(comparison, "lineItems.1.description").actual).toBe("Never printed");
    expect(matchedNames(comparison)).not.toContain("lineItems.1.amount");
  });

  it("counts a tax line only one side holds the same way", () => {
    const comparison = compareReceipt(
      "f01",
      receipt({ taxes: [tax("Sales tax", "3.60"), tax("City tax", "0.90")] }),
      receipt({ taxes: [tax("Sales tax", "3.60")] }),
    );

    expect(field(comparison, "taxes.1.amount").matched).toBe(false);
    expect(field(comparison, "taxes.1.amount").expected).toBe("0.90");
    expect(field(comparison, "taxes.1.amount").actual).toBeNull();
  });
});

describe("a refused fixture", () => {
  it("counts every field wrong when the answer is null", () => {
    const comparison = compareReceipt("f01", receipt({ lineItems: [item()] }), null);

    expect(comparison.refused).toBe(true);
    expect(comparison.fields).toHaveLength(14);
    expect(matchedNames(comparison)).toEqual([]);
  });

  it("counts every field wrong when the model answers isReceipt false", () => {
    const comparison = compareReceipt(
      "f01",
      receipt(),
      receipt({ isReceipt: false, reason: "This is a slide, not a receipt." }),
    );

    expect(comparison.refused).toBe(true);
    expect(matchedNames(comparison)).toEqual([]);
  });

  it("does not let a label's null fields match on a refusal", () => {
    const comparison = compareReceipt("f01", receipt({ tip: null }), null);

    expect(field(comparison, "tip").expected).toBeNull();
    expect(field(comparison, "tip").actual).toBeNull();
    expect(field(comparison, "tip").matched).toBe(false);
  });

  it("keeps the refusal in the denominator", () => {
    const figures = accuracyFigures([
      compareReceipt("f01", receipt(), receipt()),
      compareReceipt("f02", receipt(), null),
    ]);

    // Twenty fields compared, of which the ten of the refused fixture missed.
    expect(figures.comparedFields).toBe(20);
    expect(figures.matchedFields).toBe(10);
    expect(figures.fieldAccuracy).toBe(0.5);
    expect(figures.refusedCount).toBe(1);
  });
});

describe("accuracyFigures", () => {
  /** A field result written by hand, so the arithmetic below is checkable on paper. */
  function result(field: string, group: string, matched: boolean): FieldComparison {
    return { field, group, expected: "x", actual: matched ? "x" : "y", matched, confidence: null };
  }

  const comparisons: FixtureComparison[] = [
    {
      fixtureId: "f01",
      refused: false,
      fields: [
        result("total", "total", true),
        result("date", "date", true),
        result("merchant", "merchant", true),
        result("lineItems.0.amount", "lineItems", true),
        result("lineItems.1.amount", "lineItems", false),
      ],
    },
    {
      fixtureId: "f02",
      refused: false,
      fields: [
        result("total", "total", false),
        result("date", "date", true),
        result("merchant", "merchant", false),
        result("lineItems.0.amount", "lineItems", true),
        result("lineItems.1.amount", "lineItems", true),
      ],
    },
    {
      fixtureId: "f03",
      refused: true,
      fields: [
        result("total", "total", false),
        result("date", "date", false),
        result("merchant", "merchant", false),
      ],
    },
  ];

  it("counts the fields and the fixtures", () => {
    const figures = accuracyFigures(comparisons);

    expect(figures.fixtureCount).toBe(3);
    expect(figures.refusedCount).toBe(1);
    expect(figures.comparedFields).toBe(13);
    expect(figures.matchedFields).toBe(7);
  });

  it("divides matched fields by compared fields", () => {
    // Seven of thirteen: four in f01, three in f02, none in f03.
    expect(accuracyFigures(comparisons).fieldAccuracy).toBeCloseTo(7 / 13, 10);
  });

  it("breaks out total and date on their own", () => {
    const figures = accuracyFigures(comparisons);

    // One of three totals right, two of three dates right.
    expect(figures.totalAccuracy).toBeCloseTo(1 / 3, 10);
    expect(figures.dateAccuracy).toBeCloseTo(2 / 3, 10);
  });

  it("reports one ratio per group", () => {
    const figures = accuracyFigures(comparisons);

    expect(Object.keys(figures.perField).sort()).toEqual([
      "date",
      "lineItems",
      "merchant",
      "total",
    ]);
    // Three of four item cells right across the two fixtures that carried items.
    expect(figures.perField.lineItems).toBeCloseTo(3 / 4, 10);
    expect(figures.perField.merchant).toBeCloseTo(1 / 3, 10);
    expect(figures.perField.total).toBe(figures.totalAccuracy);
  });

  it("reads an unmeasured group as 0 rather than as a perfect score", () => {
    const figures = accuracyFigures([]);

    expect(figures.comparedFields).toBe(0);
    expect(figures.fieldAccuracy).toBe(0);
    expect(figures.totalAccuracy).toBe(0);
    expect(figures.dateAccuracy).toBe(0);
    expect(figures.perField).toEqual({});
    expect(figures.fixtureCount).toBe(0);
  });

  it("reads a group no comparison carried as 0", () => {
    const figures = accuracyFigures([
      { fixtureId: "f01", refused: false, fields: [result("merchant", "merchant", true)] },
    ]);

    expect(figures.fieldAccuracy).toBe(1);
    expect(figures.totalAccuracy).toBe(0);
    expect(figures.dateAccuracy).toBe(0);
    expect(figures.perField).toEqual({ merchant: 1 });
  });
});
