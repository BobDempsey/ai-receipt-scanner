import { describe, expect, it } from "vitest";
import type { ArithmeticWarning } from "./arithmetic";
import {
  RECEIPT_CSV_FILENAME,
  RECEIPT_JSON_FILENAME,
  SESSION_CSV_FILENAME,
  SESSION_JSON_FILENAME,
  receiptToJson,
  receiptsToJson,
  type ReceiptExport,
} from "./receipt-json";
import type { Receipt, ReceiptLineItem, ReceiptTax } from "./receipt-schema";

/** One purchased line. Only the amounts matter here, so the rest is filler. */
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

/** A receipt carrying what the envelope prints. Everything else is null. */
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
    date: "2026-10-02",
    dateConfidence: 0.9,
    dateSourceText: "02 OCT 2026",
    time: null,
    timeConfidence: null,
    timeSourceText: null,
    currency: "USD",
    currencyConfidence: 0.9,
    currencySourceText: "$",
    subtotal: "39.40",
    subtotalConfidence: 0.9,
    subtotalSourceText: "39.40",
    taxes: null,
    tip: null,
    tipConfidence: null,
    tipSourceText: null,
    total: "41.66",
    totalConfidence: 0.9,
    totalSourceText: "41.66",
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

function warning(difference: string): ArithmeticWarning {
  return {
    check: "line-items-sum",
    fields: ["lineItemsTotal", "subtotal"],
    computed: "38.40",
    printed: "39.40",
    difference,
    message: `The line items add up to 38.40, and the receipt prints 39.40, a difference of ${difference}.`,
  };
}

describe("receiptToJson", () => {
  it("carries exactly receipt, warnings and edited", () => {
    const parsed = JSON.parse(receiptToJson(receipt(), []));
    expect(Object.keys(parsed)).toEqual(["receipt", "warnings", "edited"]);
  });

  it("carries warnings and edited as empty lists rather than omitting them", () => {
    const parsed = JSON.parse(receiptToJson(receipt(), []));
    expect(parsed.warnings).toEqual([]);
    expect(parsed.edited).toEqual([]);
  });

  it("names each field the visitor typed into, in the receipt's own property paths", () => {
    const parsed = JSON.parse(receiptToJson(receipt(), [], ["total", "lineItems.3.amount"]));
    expect(parsed.edited).toEqual(["total", "lineItems.3.amount"]);
  });

  it("copies the edited list, so a later edit does not reach a written file", () => {
    const edited = ["total"];
    const json = receiptToJson(receipt(), [], edited);
    edited.push("subtotal");
    expect(JSON.parse(json).edited).toEqual(["total"]);
  });

  it("keeps every monetary value the decimal string the app holds", () => {
    const parsed = JSON.parse(
      receiptToJson(
        receipt({
          subtotal: "42.5",
          total: "0.10",
          taxes: [tax("GST", "2.100")],
          lineItems: [item("4.99"), item(null)],
        }),
        [warning("1.00")],
      ),
    );
    expect(parsed.receipt.subtotal).toBe("42.5");
    expect(parsed.receipt.total).toBe("0.10");
    expect(parsed.receipt.taxes[0].amount).toBe("2.100");
    expect(parsed.receipt.lineItems[0].amount).toBe("4.99");
    expect(parsed.receipt.lineItems[1].amount).toBeNull();
    expect(parsed.warnings[0].difference).toBe("1.00");
  });

  it("ends the file with one newline", () => {
    expect(receiptToJson(receipt(), []).endsWith("}\n")).toBe(true);
  });
});

describe("receiptsToJson", () => {
  function envelope(merchant: string, overrides: Partial<ReceiptExport> = {}): ReceiptExport {
    return {
      receipt: receipt({ merchant }),
      warnings: [],
      edited: [],
      ...overrides,
    };
  }

  it("carries three receipts in the order it was given them", () => {
    const parsed = JSON.parse(
      receiptsToJson([envelope("One"), envelope("Two"), envelope("Three")]),
    );
    expect(Object.keys(parsed)).toEqual(["receipts"]);
    expect(parsed.receipts.map((entry: ReceiptExport) => entry.receipt.merchant)).toEqual([
      "One",
      "Two",
      "Three",
    ]);
  });

  it("gives each receipt its own receipt, warnings and edited", () => {
    const parsed = JSON.parse(
      receiptsToJson([
        envelope("One", { warnings: [warning("1.00")], edited: ["total"] }),
        envelope("Two"),
      ]),
    );
    expect(Object.keys(parsed.receipts[0])).toEqual(["receipt", "warnings", "edited"]);
    expect(parsed.receipts[0].warnings[0].difference).toBe("1.00");
    expect(parsed.receipts[0].edited).toEqual(["total"]);
    expect(parsed.receipts[1].warnings).toEqual([]);
    expect(parsed.receipts[1].edited).toEqual([]);
  });

  it("gives a one-receipt session the same shape as a three-receipt one", () => {
    const parsed = JSON.parse(receiptsToJson([envelope("One")]));
    expect(Object.keys(parsed)).toEqual(["receipts"]);
    expect(parsed.receipts).toHaveLength(1);
    expect(Object.keys(parsed.receipts[0])).toEqual(["receipt", "warnings", "edited"]);
  });

  it("wraps the one receipt in the same envelope the single export writes", () => {
    const single = envelope("One", { warnings: [warning("1.00")], edited: ["total"] });
    const batch = JSON.parse(receiptsToJson([single]));
    expect(batch.receipts[0]).toEqual(
      JSON.parse(receiptToJson(single.receipt, single.warnings, single.edited)),
    );
  });

  it("carries receipts as an empty list for a session holding nothing", () => {
    const parsed = JSON.parse(receiptsToJson([]));
    expect(parsed).toEqual({ receipts: [] });
  });

  it("keeps every monetary value the decimal string the app holds", () => {
    const parsed = JSON.parse(
      receiptsToJson([
        envelope("One", {
          receipt: receipt({ total: "42.5", lineItems: [item("4.990")] }),
        }),
      ]),
    );
    expect(parsed.receipts[0].receipt.total).toBe("42.5");
    expect(parsed.receipts[0].receipt.lineItems[0].amount).toBe("4.990");
  });

  it("copies the list it was given, so a later push does not reach a written file", () => {
    const exports = [envelope("One")];
    const json = receiptsToJson(exports);
    exports.push(envelope("Two"));
    expect(JSON.parse(json).receipts).toHaveLength(1);
  });

  it("ends the file with one newline", () => {
    expect(receiptsToJson([envelope("One")]).endsWith("}\n")).toBe(true);
  });
});

describe("the download filenames", () => {
  it("keeps the single JSON name a production-verified download already uses", () => {
    expect(RECEIPT_JSON_FILENAME).toBe("receipt.json");
  });

  it("names the four files apart from one another", () => {
    const names = [
      RECEIPT_JSON_FILENAME,
      RECEIPT_CSV_FILENAME,
      SESSION_JSON_FILENAME,
      SESSION_CSV_FILENAME,
    ];
    expect(new Set(names).size).toBe(4);
    expect(names).toEqual([
      "receipt.json",
      "receipt.csv",
      "session-receipts.json",
      "session-receipts.csv",
    ]);
  });
});
