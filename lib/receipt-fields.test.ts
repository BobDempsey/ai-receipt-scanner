import { describe, expect, it } from "vitest";
import { fieldRows, isAbsent, needsReview } from "./receipt-fields";
import { receiptToJson } from "./receipt-json";
import { receiptSchema, type Receipt } from "./receipt-schema";

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

describe("receiptToJson", () => {
  it("keeps every monetary value a string with its decimal places", () => {
    const file = receiptToJson(receipt());
    expect(file).toContain('"total": "42.00"');
    expect(file).toContain('"amount": "3.60"');
    expect(JSON.parse(file).total).toBe("42.00");
  });

  it("carries the confidence and source text siblings plus isReceipt and reason", () => {
    const parsed = JSON.parse(receiptToJson(receipt()));
    expect(parsed.totalConfidence).toBe(0.96);
    expect(parsed.totalSourceText).toBe("TOTAL 42.00");
    expect(parsed.taxes[0].amountConfidence).toBe(0.62);
    expect(parsed).toHaveProperty("isReceipt", true);
    expect(parsed).toHaveProperty("reason", null);
  });

  it("round-trips through the schema the server validated with", () => {
    const parsed = JSON.parse(receiptToJson(receipt()));
    expect(receiptSchema.safeParse(parsed).success).toBe(true);
  });
});
