import { describe, expect, it } from "vitest";
import {
  modelReceiptSchema,
  receiptSchema,
  type Receipt,
  type ReceiptLineItem,
} from "./receipt-schema";

/** One purchased line, with every sibling filled in. */
function lineItem(overrides: Partial<ReceiptLineItem> = {}): ReceiptLineItem {
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

/** A receipt with every field printed, used as the base each test varies from. */
function fullReceipt(): Receipt {
  return {
    isReceipt: true,
    reason: null,

    merchant: "Harbour Street Grocers",
    merchantConfidence: 0.97,
    merchantSourceText: "HARBOUR STREET GROCERS",

    merchantAddress: "14 Harbour Street, Bristol",
    merchantAddressConfidence: 0.88,
    merchantAddressSourceText: "14 HARBOUR ST BRISTOL",

    date: "2026-09-18",
    dateConfidence: 0.95,
    dateSourceText: "18/09/2026",

    time: "17:42",
    timeConfidence: 0.91,
    timeSourceText: "17:42",

    currency: "GBP",
    currencyConfidence: 0.93,
    currencySourceText: "£",

    subtotal: "38.40",
    subtotalConfidence: 0.94,
    subtotalSourceText: "SUBTOTAL 38.40",

    taxes: [
      {
        label: "VAT 20%",
        labelConfidence: 0.9,
        labelSourceText: "VAT 20%",
        amount: "3.60",
        amountConfidence: 0.92,
        amountSourceText: "3.60",
      },
    ],

    tip: "0.00",
    tipConfidence: 0.8,
    tipSourceText: "TIP 0.00",

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
}

describe("receiptSchema", () => {
  it("accepts a receipt with every field printed", () => {
    const parsed = receiptSchema.parse(fullReceipt());
    expect(parsed.merchant).toBe("Harbour Street Grocers");
    expect(parsed.taxes).toHaveLength(1);
  });

  it("accepts a receipt whose every nullable field is absent", () => {
    const sparse: Receipt = {
      ...fullReceipt(),
      merchant: null,
      merchantConfidence: null,
      merchantSourceText: null,
      merchantAddress: null,
      merchantAddressConfidence: null,
      merchantAddressSourceText: null,
      date: null,
      dateConfidence: null,
      dateSourceText: null,
      time: null,
      timeConfidence: null,
      timeSourceText: null,
      currency: null,
      currencyConfidence: null,
      currencySourceText: null,
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
    };

    expect(receiptSchema.parse(sparse).total).toBeNull();
  });

  it("accepts two tax lines, each with its own confidence and source text", () => {
    const twoTaxes: Receipt = {
      ...fullReceipt(),
      taxes: [
        {
          label: "State tax",
          labelConfidence: 0.9,
          labelSourceText: "STATE TAX",
          amount: "2.10",
          amountConfidence: 0.91,
          amountSourceText: "2.10",
        },
        {
          label: "City tax",
          labelConfidence: 0.84,
          labelSourceText: "CITY TAX",
          amount: "0.95",
          amountConfidence: 0.87,
          amountSourceText: "0.95",
        },
      ],
    };

    const parsed = receiptSchema.parse(twoTaxes);
    expect(parsed.taxes?.map((tax) => tax.amount)).toEqual(["2.10", "0.95"]);
  });

  it("keeps the trailing zeros of a decimal string", () => {
    expect(receiptSchema.parse(fullReceipt()).total).toBe("42.00");
  });

  it("rejects a JSON number where a decimal string belongs", () => {
    const asNumber = { ...fullReceipt(), total: 42 as unknown as string };
    expect(receiptSchema.safeParse(asNumber).success).toBe(false);
  });

  it("rejects a money value that is not a decimal string", () => {
    const withSymbol = { ...fullReceipt(), total: "$42.00" };
    expect(receiptSchema.safeParse(withSymbol).success).toBe(false);
  });

  it("rejects a confidence above 1", () => {
    const tooSure = { ...fullReceipt(), totalConfidence: 1.4 };
    expect(receiptSchema.safeParse(tooSure).success).toBe(false);
  });

  it("rejects a confidence below 0", () => {
    const negative = { ...fullReceipt(), totalConfidence: -0.2 };
    expect(receiptSchema.safeParse(negative).success).toBe(false);
  });

  it("rejects a date carrying a timezone", () => {
    const zoned = { ...fullReceipt(), date: "2026-09-18T17:42:00Z" };
    expect(receiptSchema.safeParse(zoned).success).toBe(false);
  });

  it("rejects a currency that is not an ISO 4217 code", () => {
    const symbol = { ...fullReceipt(), currency: "£" };
    expect(receiptSchema.safeParse(symbol).success).toBe(false);
  });

  it("rejects a missing key rather than treating it as absent", () => {
    const withoutTotal: Record<string, unknown> = { ...fullReceipt() };
    delete withoutTotal.total;
    expect(receiptSchema.safeParse(withoutTotal).success).toBe(false);
  });
});

describe("receiptSchema line items", () => {
  it("accepts a grocery receipt carrying six items in printed order", () => {
    const parsed = receiptSchema.parse(fullReceipt());
    expect(parsed.lineItems).toHaveLength(6);
    expect(parsed.lineItems?.map((item) => item.description)).toEqual([
      "Oat milk",
      "Coffee beans",
      "Sourdough",
      "Bananas",
      "Cheddar",
      "Olive oil",
    ]);
  });

  it("keeps a weighed quantity as the decimal string the receipt printed", () => {
    const parsed = receiptSchema.parse(fullReceipt());
    expect(parsed.lineItems?.[3].quantity).toBe("0.734");
  });

  it("keeps a count as a string rather than a number", () => {
    const parsed = receiptSchema.parse(fullReceipt());
    expect(parsed.lineItems?.[4].quantity).toBe("2");
  });

  it("rejects a quantity sent as a JSON number", () => {
    const items = sixItems();
    items[4] = lineItem({ quantity: 2 as unknown as string });
    expect(receiptSchema.safeParse({ ...fullReceipt(), lineItems: items }).success).toBe(false);
  });

  it("rejects a quantity that is not a decimal string", () => {
    const items = [lineItem({ quantity: "2 x" })];
    expect(receiptSchema.safeParse({ ...fullReceipt(), lineItems: items }).success).toBe(false);
  });

  it("accepts an item whose quantity the receipt did not print", () => {
    const items = [lineItem({ quantity: null, quantityConfidence: null, quantitySourceText: null })];
    const parsed = receiptSchema.parse({ ...fullReceipt(), lineItems: items });
    expect(parsed.lineItems?.[0].quantity).toBeNull();
  });

  it("accepts an item whose amount the model could not read", () => {
    const items = [lineItem({ amount: null, amountConfidence: null, amountSourceText: null })];
    const parsed = receiptSchema.parse({ ...fullReceipt(), lineItems: items });
    expect(parsed.lineItems?.[0].amount).toBeNull();
  });

  it("accepts an empty lineItems array", () => {
    const parsed = receiptSchema.parse({ ...fullReceipt(), lineItems: [] });
    expect(parsed.lineItems).toEqual([]);
  });

  it("accepts a null lineItems", () => {
    const parsed = receiptSchema.parse({ ...fullReceipt(), lineItems: null });
    expect(parsed.lineItems).toBeNull();
  });

  it("rejects an item confidence outside 0 to 1", () => {
    const tooSure = [lineItem({ amountConfidence: 1.2 })];
    expect(receiptSchema.safeParse({ ...fullReceipt(), lineItems: tooSure }).success).toBe(false);

    const negative = [lineItem({ amountConfidence: -0.1 })];
    expect(receiptSchema.safeParse({ ...fullReceipt(), lineItems: negative }).success).toBe(false);
  });

  it("rejects an item missing one of its keys", () => {
    const item: Record<string, unknown> = { ...lineItem() };
    delete item.unitPrice;
    expect(receiptSchema.safeParse({ ...fullReceipt(), lineItems: [item] }).success).toBe(false);
  });
});

describe("modelReceiptSchema line items", () => {
  it("takes a quantity as a plain string, with the pattern left to the validating schema", () => {
    const items = [lineItem({ quantity: "2 x" })];
    expect(modelReceiptSchema.safeParse({ ...fullReceipt(), lineItems: items }).success).toBe(true);
  });

  it("still refuses a quantity sent as a number", () => {
    const items = [lineItem({ quantity: 2 as unknown as string })];
    expect(modelReceiptSchema.safeParse({ ...fullReceipt(), lineItems: items }).success).toBe(
      false,
    );
  });
});
