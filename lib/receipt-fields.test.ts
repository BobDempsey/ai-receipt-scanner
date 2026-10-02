import { describe, expect, it } from "vitest";
import { arithmeticWarnings } from "./arithmetic";
import {
  addLineItem,
  addressKey,
  applyEdit,
  recordEdited,
} from "./field-edit";
import {
  fieldRows,
  isAbsent,
  isVisitorTyped,
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

function accepted(result: ReturnType<typeof applyEdit>): Receipt {
  if (!result.accepted) {
    throw new Error(`the app refused the edit: ${result.rejection.message}`);
  }
  return result.receipt;
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

describe("the rows carry the address a control writes to", () => {
  it("gives every editable flat row its address", () => {
    const rows = fieldRows(receipt());

    expect(addressKey(row(rows, "Merchant").address!)).toBe("merchant");
    expect(addressKey(row(rows, "Date").address!)).toBe("date");
    expect(addressKey(row(rows, "Subtotal").address!)).toBe("subtotal");
    expect(addressKey(row(rows, "Total").address!)).toBe("total");
    expect(addressKey(row(rows, "Card last 4").address!)).toBe("cardLast4");
  });

  it("gives a tax row the amount address and a second control for the label", () => {
    const taxes = row(fieldRows(receipt()), "Tax: VAT 20%");

    expect(addressKey(taxes.address!)).toBe("taxes.0.amount");
    expect(addressKey(taxes.labelCell!.address!)).toBe("taxes.0.label");
    expect(taxes.labelCell!.value).toBe("VAT 20%");
  });

  it("gives the computed item total no address at all", () => {
    const items = row(fieldRows(receipt()), "Line item total");

    expect(items.address).toBeUndefined();
    expect(items.computed).toBe(true);
  });

  it("gives each of an item's four cells its own address", () => {
    const rows = lineItemRows(receipt());

    expect(rows[3].index).toBe(3);
    expect(addressKey(rows[3].description.address!)).toBe("lineItems.3.description");
    expect(addressKey(rows[3].quantity.address!)).toBe("lineItems.3.quantity");
    expect(addressKey(rows[3].unitPrice.address!)).toBe("lineItems.3.unitPrice");
    expect(addressKey(rows[3].amount.address!)).toBe("lineItems.3.amount");
  });
});

describe("the rows tell a typed value from a read one", () => {
  it("marks a row named by the edited list and leaves the rest alone", () => {
    const rows = fieldRows(receipt(), ["total"]);

    expect(isVisitorTyped(row(rows, "Total"))).toBe(true);
    expect(isVisitorTyped(row(rows, "Subtotal"))).toBe(false);
  });

  it("marks the row off the edited list rather than off a null confidence", () => {
    const rows = fieldRows(receipt({ totalConfidence: null }), []);

    expect(isVisitorTyped(row(rows, "Total"))).toBe(false);
    expect(needsReview(row(rows, "Total"))).toBe(false);
  });

  it("drops the review flag once the visitor has corrected the flagged field", () => {
    const corrected = receipt({
      taxes: [
        {
          label: "VAT 20%",
          labelConfidence: 0.9,
          labelSourceText: "VAT 20%",
          amount: "3.60",
          amountConfidence: null,
          amountSourceText: "3.60",
        },
      ],
    });
    const taxRow = row(fieldRows(corrected, ["taxes.0.amount"]), "Tax: VAT 20%");

    expect(needsReview(taxRow)).toBe(false);
    expect(isVisitorTyped(taxRow)).toBe(true);
    expect(taxRow.confidence).toBeNull();
  });

  it("marks one item cell without marking the other three", () => {
    const rows = lineItemRows(receipt(), ["lineItems.2.amount"]);

    expect(isVisitorTyped(rows[2].amount)).toBe(true);
    expect(isVisitorTyped(rows[2].quantity)).toBe(false);
    expect(isVisitorTyped(rows[1].amount)).toBe(false);
  });

  it("marks nothing when the visitor has edited nothing", () => {
    expect(fieldRows(receipt()).some(isVisitorTyped)).toBe(false);
  });
});

describe("receiptToJson", () => {
  it("writes the receipt, the warnings and the edited fields as three keys", () => {
    const parsed = JSON.parse(receiptToJson(receipt(), []));
    expect(Object.keys(parsed)).toEqual(["receipt", "warnings", "edited"]);
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

describe("the envelope names the fields the visitor edited", () => {
  it("names both corrected fields and no other", () => {
    const corrected = accepted(
      applyEdit(
        accepted(applyEdit(receipt(), { kind: "flat", field: "date" }, "2026-09-19")),
        { kind: "item", index: 2, cell: "amount" },
        "3.30",
      ),
    );
    const edited = recordEdited(
      recordEdited([], { kind: "flat", field: "date" }),
      { kind: "item", index: 2, cell: "amount" },
    );
    const parsed = JSON.parse(receiptToJson(corrected, arithmeticWarnings(corrected), edited));

    expect(parsed.edited).toEqual(["date", "lineItems.2.amount"]);
    expect(parsed.receipt.date).toBe("2026-09-19");
    expect(parsed.receipt.lineItems[2].amount).toBe("3.30");
  });

  it("writes the edited key as an empty list rather than omitting it", () => {
    const file = receiptToJson(receipt(), []);

    expect(file).toContain('"edited": []');
    expect(JSON.parse(file).edited).toEqual([]);
  });

  it("carries a corrected total with a null confidence and the original source text", () => {
    const corrected = accepted(applyEdit(receipt(), { kind: "flat", field: "total" }, "42.50"));
    const edited = recordEdited([], { kind: "flat", field: "total" });
    const parsed = JSON.parse(receiptToJson(corrected, arithmeticWarnings(corrected), edited));

    expect(parsed.receipt.total).toBe("42.50");
    expect(parsed.receipt.totalConfidence).toBeNull();
    expect(parsed.receipt.totalSourceText).toBe("TOTAL 42.00");
    expect(parsed.edited).toEqual(["total"]);
    expect(receiptSchema.safeParse(parsed.receipt).success).toBe(true);
  });

  it("carries an added line item with the values the visitor typed", () => {
    const change = addLineItem(receipt(), []);
    const described = accepted(
      applyEdit(change.receipt, { kind: "item", index: 6, cell: "description" }, "Rye loaf"),
    );
    const filled = accepted(
      applyEdit(described, { kind: "item", index: 6, cell: "amount" }, "2.40"),
    );
    const edited = recordEdited(
      recordEdited(change.edited, { kind: "item", index: 6, cell: "description" }),
      { kind: "item", index: 6, cell: "amount" },
    );
    const parsed = JSON.parse(receiptToJson(filled, arithmeticWarnings(filled), edited));

    expect(parsed.receipt.lineItems).toHaveLength(7);
    expect(parsed.receipt.lineItems[6].description).toBe("Rye loaf");
    expect(parsed.receipt.lineItems[6].amount).toBe("2.40");
    expect(parsed.receipt.lineItems[6].amountConfidence).toBeNull();
    expect(parsed.receipt.lineItems[6].amountSourceText).toBeNull();
    expect(parsed.edited).toEqual(["lineItems.6.description", "lineItems.6.amount"]);
  });

  it("drops a warning the correction cleared", () => {
    const short = receipt({ subtotal: "38.90" });
    expect(arithmeticWarnings(short)).toHaveLength(2);

    const corrected = accepted(applyEdit(short, { kind: "flat", field: "subtotal" }, "38.40"));
    const parsed = JSON.parse(
      receiptToJson(corrected, arithmeticWarnings(corrected), ["subtotal"]),
    );

    expect(parsed.warnings).toEqual([]);
    expect(parsed.receipt.subtotal).toBe("38.40");
  });

  it("names the difference the correction left behind", () => {
    const items = sixItems();
    items[0] = lineItem({ amount: "4.49" });
    const short = receipt({ lineItems: items });
    expect(arithmeticWarnings(short)[0].difference).toBe("0.50");

    const narrowed = accepted(
      applyEdit(short, { kind: "item", index: 0, cell: "amount" }, "4.89"),
    );
    const parsed = JSON.parse(
      receiptToJson(narrowed, arithmeticWarnings(narrowed), ["lineItems.0.amount"]),
    );

    expect(parsed.warnings).toHaveLength(1);
    expect(parsed.warnings[0].difference).toBe("0.10");
    expect(parsed.edited).toEqual(["lineItems.0.amount"]);
  });

  it("skips the sum check while an added item carries no amount", () => {
    const change = addLineItem(receipt(), []);
    const parsed = JSON.parse(
      receiptToJson(change.receipt, arithmeticWarnings(change.receipt), change.edited),
    );

    expect(parsed.receipt.lineItems).toHaveLength(7);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.edited).toEqual([]);
  });
});
