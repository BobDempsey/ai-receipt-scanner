import { describe, expect, it } from "vitest";
import { receiptSchema, type Receipt } from "./receipt-schema";

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
