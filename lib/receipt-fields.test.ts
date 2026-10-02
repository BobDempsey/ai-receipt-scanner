import { describe, expect, it } from "vitest";
import { arithmeticWarnings } from "./arithmetic";
import {
  fieldRows,
  isAbsent,
  itemNeedsReview,
  lineItemRows,
  needsReview,
  readNoLineItems,
} from "./receipt-fields";
import { receiptToJson } from "./receipt-json";
import {
  receiptSchema,
  type Receipt,
  type ReceiptLineItem,
} from "./receipt-schema";

/** One purchased line, with every sibling filled in. */
export function lineItem(overrides: Partial<ReceiptLineItem> = {}): ReceiptLineItem {
  return {
    description: "Oat milk",
    descriptionConfidence: 0.94,
    descriptionSourceText: "OAT MILK 1L",
    quantity: "1",
    quantityConfidence: 0.9,
    quantitySourceText: "1",
    unitPrice: "4.99",
    unitPriceConfidence: 0.91,
    unitPriceSourceText: "4.99",
    amount: "4.99",
    amountConfidence: 0.93,
    amountSourceText: "4.99",
    ...overrides,
  };
}

/** Six purchased lines summing to the 38.40 the base receipt prints as its subtotal. */
function sixItems(): ReceiptLineItem[] {
  return [
    lineItem(),
    lineItem({ description: "Coffee beans", unitPrice: "12.50", amount: "12.50" }),
    lineItem({ description: "Sourdough", unitPrice: "3.25", amount: "3.25" }),
    lineItem({
      description: "Bananas",
      quantity: "0.734",
      unitPrice: "2.54",
      amount: "1.86",
    }),
    lineItem({ description: "Cheddar", quantity: "2", unitPrice: "4.90", amount: "9.80" }),
    lineItem({ description: "Olive oil", unitPrice: "6.00", amount: "6.00" }),
  ];
}

function receipt(overrides: Partial<Receipt> = {}): Receipt {
  const base: Receipt = {
    isReceipt: true,
    reason: null,
    merchant: "Pier Cafe",
    merchantConfidence: 0.95,
    merchantSourceText: "PIER CAFE",
    merchantAddress: null,
    merchantAddressConfidence: null,
    merchantAddressSourceText: null,
    date: "2026-09-18",
    dateConfidence: 0.92,
    dateSourceText: "18/09/2026",
    time: null,
    timeConfidence: null,
    timeSourceText: null,
    currency: "GBP",
    currencyConfidence: 0.9,
    currencySourceText: "£",
    subtotal: "38.40",
    subtotalConfidence: 0.93,
    subtotalSourceText: "SUBTOTAL 38.40",
    taxes: [
      {
        label: "VAT 20%",
        labelConfidence: 0.9,
        labelSourceText: "VAT 20%",
        amount: "3.60",
        amountConfidence: 0.62,
        amountSourceText: "3.60",
      },
    ],
    tip: null,
    tipConfidence: null,
    tipSourceText: null,
    total: "42.00",
    totalConfidence: 0.96,
    totalSourceText: "TOTAL 42.00",
    paymentMethod: "Visa",
    paymentMethodConfidence: 0.89,
    paymentMethodSourceText: "VISA",
    cardLast4: "4417",
    cardLast4Confidence: 0.86,
    cardLast4SourceText: "XXXX 4417",
    lineItems: sixItems(),
  };

  return { ...base, ...overrides };
}

function row(rows: ReturnType<typeof fieldRows>, label: string) {
  const found = rows.find((candidate) => candidate.label === label);
  if (!found) {
    throw new Error(`no row labelled ${label}`);
  }
  return found;
}

describe("fieldRows", () => {
  it("shows a tip the receipt did not print as absent rather than as zero", () => {
    const rows = fieldRows(receipt());
    expect(row(rows, "Tip").value).toBeNull();
    expect(isAbsent(row(rows, "Tip"))).toBe(true);
  });

  it("hands the panel each monetary value unchanged", () => {
    const rows = fieldRows(receipt());
    expect(row(rows, "Total").value).toBe("42.00");
    expect(row(rows, "Subtotal").value).toBe("38.40");
  });

  it("gives each tax line its own row and its own confidence", () => {
    const rows = fieldRows(
      receipt({
        taxes: [
          {
            label: "State tax",
            labelConfidence: 0.9,
            labelSourceText: "STATE TAX",
            amount: "2.10",
            amountConfidence: 0.95,
            amountSourceText: "2.10",
          },
          {
            label: "City tax",
            labelConfidence: 0.8,
            labelSourceText: "CITY TAX",
            amount: "0.95",
            amountConfidence: 0.71,
            amountSourceText: "0.95",
          },
        ],
      }),
    );

    expect(row(rows, "Tax: State tax").value).toBe("2.10");
    expect(needsReview(row(rows, "Tax: City tax"))).toBe(true);
  });

  it("flags a confidence below the review threshold and leaves a confident one alone", () => {
    const rows = fieldRows(receipt());
    expect(needsReview(row(rows, "Tax: VAT 20%"))).toBe(true);
    expect(needsReview(row(rows, "Total"))).toBe(false);
  });

  it("flags nothing when the model gave no confidence", () => {
    const rows = fieldRows(receipt({ totalConfidence: null }));
    expect(needsReview(row(rows, "Total"))).toBe(false);
  });
});

describe("fieldRows carries the identifiers a warning names", () => {
  it("names subtotal and total so a warning attaches to a row rather than to a label", () => {
    const rows = fieldRows(receipt());
    expect(row(rows, "Subtotal").field).toBe("subtotal");
    expect(row(rows, "Total").field).toBe("total");
  });

  it("shows the computed item total beside subtotal, with no confidence", () => {
    const rows = fieldRows(receipt());
    const items = row(rows, "Line item total");

    expect(items.value).toBe("38.40");
    expect(items.computed).toBe(true);
    expect(items.confidence).toBeNull();
    expect(items.field).toBe("lineItemsTotal");
    expect(rows.indexOf(items)).toBe(rows.indexOf(row(rows, "Subtotal")) + 1);
  });

  it("shows no item total row at all when the app read no line items", () => {
    expect(fieldRows(receipt({ lineItems: [] })).some((candidate) => candidate.computed)).toBe(
      false,
    );
    expect(readNoLineItems(receipt({ lineItems: [] }))).toBe(true);
    expect(readNoLineItems(receipt({ lineItems: null }))).toBe(true);
    expect(readNoLineItems(receipt())).toBe(false);
  });

  it("shows the item total as absent when one item amount is missing", () => {
    const items = sixItems();
    items[2] = lineItem({ amount: null, amountConfidence: null, amountSourceText: null });
    const total = row(fieldRows(receipt({ lineItems: items })), "Line item total");

    expect(total.value).toBeNull();
    expect(total.note).toContain("did not sum");
  });

  it("prints the item total as the decimal string the app holds", () => {
    const rows = fieldRows(
      receipt({ subtotal: "42.00", lineItems: [lineItem({ amount: "42.00" })] }),
    );
    expect(row(rows, "Line item total").value).toBe("42.00");
  });
});

describe("lineItemRows", () => {
  it("gives one row per item in the printed order", () => {
    const rows = lineItemRows(receipt());
    expect(rows).toHaveLength(6);
    expect(rows.map((candidate) => candidate.position)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rows.map((candidate) => candidate.description.value)).toEqual([
      "Oat milk",
      "Coffee beans",
      "Sourdough",
      "Bananas",
      "Cheddar",
      "Olive oil",
    ]);
  });

  it("hands each item value over unchanged", () => {
    const rows = lineItemRows(receipt());
    expect(rows[3].quantity.value).toBe("0.734");
    expect(rows[4].quantity.value).toBe("2");
    expect(rows[1].unitPrice.value).toBe("12.50");
    expect(rows[5].amount.value).toBe("6.00");
  });

  it("gives no rows when the app read no items", () => {
    expect(lineItemRows(receipt({ lineItems: [] }))).toEqual([]);
    expect(lineItemRows(receipt({ lineItems: null }))).toEqual([]);
  });

  it("flags an item row when one of its four confidences falls below the threshold", () => {
    const items = [lineItem({ amountConfidence: 0.61 }), lineItem()];
    const rows = lineItemRows(receipt({ lineItems: items }));

    expect(itemNeedsReview(rows[0])).toBe(true);
    expect(itemNeedsReview(rows[1])).toBe(false);
  });

  it("shows a quantity the receipt did not print as absent", () => {
    const items = [
      lineItem({ quantity: null, quantityConfidence: null, quantitySourceText: null }),
    ];
    const rows = lineItemRows(receipt({ lineItems: items }));

    expect(rows[0].quantity.value).toBeNull();
    expect(isAbsent(rows[0].quantity)).toBe(true);
  });
});

describe("a warning reaches both rows it names", () => {
  it("marks the item total row and the subtotal row on a subtotal mismatch", () => {
    const mismatched = receipt({
      subtotal: "47.60",
      total: "51.20",
      lineItems: [lineItem({ amount: "48.10" })],
    });
    const warnings = arithmeticWarnings(mismatched);
    const rows = fieldRows(mismatched);
    const marked = rows.filter((candidate) => {
      const field = candidate.field;
      return field !== undefined && warnings.some((warning) => warning.fields.includes(field));
    });

    expect(marked.map((candidate) => candidate.field)).toEqual(["subtotal", "lineItemsTotal"]);
    expect(row(rows, "Subtotal").value).toBe("47.60");
    expect(row(rows, "Line item total").value).toBe("48.10");
    expect(warnings[0].message).toContain("0.50 more than");
  });

  it("marks the subtotal row and the total row on a total mismatch", () => {
    const mismatched = receipt({ subtotal: "38.40", total: "42.20", lineItems: [] });
    const warnings = arithmeticWarnings(mismatched);

    expect(warnings).toHaveLength(1);
    expect(warnings[0].fields).toEqual(["subtotal", "total"]);
    expect(warnings[0].difference).toBe("0.20");
  });

  it("marks nothing when both checks pass", () => {
    expect(arithmeticWarnings(receipt())).toEqual([]);
  });
});

describe("receiptToJson", () => {
  it("writes the receipt and the warnings as two keys of one envelope", () => {
    const parsed = JSON.parse(receiptToJson(receipt(), []));
    expect(Object.keys(parsed)).toEqual(["receipt", "warnings"]);
    expect(parsed.receipt.merchant).toBe("Pier Cafe");
  });

  it("keeps every monetary value a string with its decimal places", () => {
    const file = receiptToJson(receipt(), []);
    expect(file).toContain('"total": "42.00"');
    expect(file).toContain('"amount": "3.60"');
    expect(JSON.parse(file).receipt.total).toBe("42.00");
  });

  it("carries the confidence and source text siblings plus isReceipt and reason", () => {
    const parsed = JSON.parse(receiptToJson(receipt(), [])).receipt;
    expect(parsed.totalConfidence).toBe(0.96);
    expect(parsed.totalSourceText).toBe("TOTAL 42.00");
    expect(parsed.taxes[0].amountConfidence).toBe(0.62);
    expect(parsed).toHaveProperty("isReceipt", true);
    expect(parsed).toHaveProperty("reason", null);
  });

  it("round-trips the receipt through the schema the server validated with", () => {
    const parsed = JSON.parse(receiptToJson(receipt(), []));
    expect(receiptSchema.safeParse(parsed.receipt).success).toBe(true);
  });

  it("writes warnings as an empty array rather than omitting the key", () => {
    const balanced = receipt();
    const file = receiptToJson(balanced, arithmeticWarnings(balanced));

    expect(file).toContain('"warnings": []');
    expect(JSON.parse(file).warnings).toEqual([]);
  });

  it("carries every line item with its confidence and source text siblings", () => {
    const parsed = JSON.parse(receiptToJson(receipt(), [])).receipt;

    expect(parsed.lineItems).toHaveLength(6);
    expect(parsed.lineItems[3].quantity).toBe("0.734");
    expect(parsed.lineItems[3].quantityConfidence).toBe(0.9);
    expect(parsed.lineItems[3].amountSourceText).toBe("4.99");
    expect(parsed.lineItems[5].amount).toBe("6.00");
  });

  it("carries a warning with its difference as a decimal string, beside unaltered values", () => {
    const mismatched = receipt({
      subtotal: "47.60",
      total: "51.20",
      lineItems: [lineItem({ amount: "48.10" })],
    });
    const file = receiptToJson(mismatched, arithmeticWarnings(mismatched));
    const parsed = JSON.parse(file);

    expect(parsed.warnings).toHaveLength(1);
    expect(parsed.warnings[0].check).toBe("line-items-sum");
    expect(parsed.warnings[0].fields).toEqual(["lineItemsTotal", "subtotal"]);
    expect(parsed.warnings[0].difference).toBe("0.50");
    expect(typeof parsed.warnings[0].difference).toBe("string");
    expect(file).toContain('"difference": "0.50"');

    expect(parsed.receipt.subtotal).toBe("47.60");
    expect(parsed.receipt.lineItems[0].amount).toBe("48.10");
    expect(receiptSchema.safeParse(parsed.receipt).success).toBe(true);
  });
});
