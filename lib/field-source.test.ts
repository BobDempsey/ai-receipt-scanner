import { describe, expect, it } from "vitest";
import { editableAddresses } from "./field-edit";
import { sourceTextFor } from "./field-source";
import type { Receipt, ReceiptLineItem } from "./receipt-schema";

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
        amountSourceText: "VAT 3.60",
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
    lineItems: [lineItem()],
  };

  return { ...base, ...overrides };
}

describe("sourceTextFor", () => {
  it("reads a flat field's sibling", () => {
    expect(sourceTextFor(receipt(), { kind: "flat", field: "total" })).toBe("TOTAL 42.00");
  });

  it("reads a tax label", () => {
    expect(sourceTextFor(receipt(), { kind: "tax", index: 0, cell: "label" })).toBe("VAT 20%");
  });

  it("reads a tax amount", () => {
    expect(sourceTextFor(receipt(), { kind: "tax", index: 0, cell: "amount" })).toBe("VAT 3.60");
  });

  it("reads a line item cell", () => {
    expect(sourceTextFor(receipt(), { kind: "item", index: 0, cell: "description" })).toBe(
      "OAT MILK 1L",
    );
  });

  it("answers null for a field the receipt printed no value for", () => {
    expect(sourceTextFor(receipt(), { kind: "flat", field: "time" })).toBeNull();
  });

  it("answers null for a tax entry the list no longer holds", () => {
    expect(sourceTextFor(receipt(), { kind: "tax", index: 4, cell: "amount" })).toBeNull();
  });

  it("answers null for a line item the list no longer holds", () => {
    expect(sourceTextFor(receipt(), { kind: "item", index: 9, cell: "amount" })).toBeNull();
  });

  it("answers null when the receipt carries no taxes and no items at all", () => {
    const bare = receipt({ taxes: null, lineItems: null });

    expect(sourceTextFor(bare, { kind: "tax", index: 0, cell: "label" })).toBeNull();
    expect(sourceTextFor(bare, { kind: "item", index: 0, cell: "amount" })).toBeNull();
  });

  it("resolves every address the panel can edit", () => {
    const held = receipt();

    for (const address of editableAddresses(held)) {
      expect(() => sourceTextFor(held, address)).not.toThrow();
    }
  });
});
