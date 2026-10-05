import { describe, expect, it } from "vitest";
import {
  carriesValues,
  csvColumns,
  csvRowsFor,
  quoteCell,
  receiptsToCsv,
  widestTaxCount,
} from "./receipt-csv";
import type { Receipt, ReceiptLineItem, ReceiptTax } from "./receipt-schema";

/** One purchased line. The four values are what a row carries, so the rest is filler. */
function item(overrides: Partial<ReceiptLineItem> = {}): ReceiptLineItem {
  return {
    description: "An item",
    descriptionConfidence: 0.9,
    descriptionSourceText: "AN ITEM",
    quantity: "1",
    quantityConfidence: 0.9,
    quantitySourceText: "1",
    unitPrice: "4.99",
    unitPriceConfidence: 0.9,
    unitPriceSourceText: "4.99",
    amount: "4.99",
    amountConfidence: 0.9,
    amountSourceText: "4.99",
    ...overrides,
  };
}

function tax(label: string | null, amount: string | null): ReceiptTax {
  return {
    label,
    labelConfidence: 0.9,
    labelSourceText: label,
    amount,
    amountConfidence: 0.9,
    amountSourceText: amount,
  };
}

/** A receipt whose every column is filled, so a test can empty just the one it names. */
function receipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    isReceipt: true,
    reason: null,
    merchant: "Harbour Street Grocers",
    merchantConfidence: 0.9,
    merchantSourceText: "HARBOUR STREET GROCERS",
    merchantAddress: "14 Harbour Street",
    merchantAddressConfidence: 0.9,
    merchantAddressSourceText: "14 HARBOUR STREET",
    date: "2026-10-05",
    dateConfidence: 0.9,
    dateSourceText: "2026-10-05",
    time: "14:32",
    timeConfidence: 0.9,
    timeSourceText: "14:32",
    currency: "USD",
    currencyConfidence: 0.9,
    currencySourceText: "$",
    subtotal: "39.40",
    subtotalConfidence: 0.9,
    subtotalSourceText: "39.40",
    taxes: [tax("Sales tax", "2.26")],
    tip: "0.00",
    tipConfidence: 0.9,
    tipSourceText: "0.00",
    total: "41.66",
    totalConfidence: 0.9,
    totalSourceText: "41.66",
    paymentMethod: "Visa",
    paymentMethodConfidence: 0.9,
    paymentMethodSourceText: "VISA",
    cardLast4: "4242",
    cardLast4Confidence: 0.9,
    cardLast4SourceText: "4242",
    lineItems: [item()],
    ...overrides,
  };
}

/** The header, which every column test reads. */
function header(csv: string): string {
  return csv.split("\r\n")[0];
}

/** The data rows, with the trailing terminator's empty tail dropped. */
function dataRows(csv: string): string[] {
  return csv.split("\r\n").slice(1, -1);
}

const ONE_TAX_HEADER =
  "merchant,merchant_address,date,time,currency,subtotal,tip,total,payment_method,card_last4," +
  "tax_1_label,tax_1_amount,item_description,item_quantity,item_unit_price,item_amount";

describe("the column spec", () => {
  it("names and orders the columns of a one-tax receipt exactly", () => {
    expect(header(receiptsToCsv([receipt()]))).toBe(ONE_TAX_HEADER);
  });

  it("puts the receipt fields first, then the tax pairs, then the item columns", () => {
    const names = csvColumns([receipt({ taxes: [tax("GST", "1.00"), tax("PST", "2.00")] })]).map(
      (column) => column.name,
    );

    expect(names.slice(0, 10)).toEqual([
      "merchant",
      "merchant_address",
      "date",
      "time",
      "currency",
      "subtotal",
      "tip",
      "total",
      "payment_method",
      "card_last4",
    ]);
    expect(names.slice(10, 14)).toEqual([
      "tax_1_label",
      "tax_1_amount",
      "tax_2_label",
      "tax_2_amount",
    ]);
    expect(names.slice(14)).toEqual([
      "item_description",
      "item_quantity",
      "item_unit_price",
      "item_amount",
    ]);
  });

  it("gives two exports of the same receipts the same header", () => {
    const receipts = [receipt(), receipt({ taxes: [tax("GST", "1.00"), tax("PST", "2.00")] })];
    expect(header(receiptsToCsv(receipts))).toBe(header(receiptsToCsv(receipts)));
  });

  it("carries no confidence and no source text column", () => {
    const names = header(receiptsToCsv([receipt()]));
    expect(names).not.toMatch(/confidence/i);
    expect(names).not.toMatch(/sourcetext/i);
    expect(names).not.toMatch(/source_text/i);
  });

  it("carries no isReceipt and no reason column", () => {
    const names = csvColumns([receipt()]).map((column) => column.name);
    expect(names).not.toContain("is_receipt");
    expect(names).not.toContain("reason");
  });
});

describe("quoteCell", () => {
  it("leaves a plain decimal bare, both places intact", () => {
    expect(quoteCell("42.00")).toBe("42.00");
  });

  it("quotes a value holding a comma", () => {
    expect(quoteCell("Harbour Street Grocers, Ltd")).toBe('"Harbour Street Grocers, Ltd"');
  });

  it("quotes a value holding a double quote and doubles the inner quote", () => {
    expect(quoteCell('12" tortillas')).toBe('"12"" tortillas"');
  });

  it("quotes a value holding a newline", () => {
    expect(quoteCell("14 Harbour Street\nPortside")).toBe('"14 Harbour Street\nPortside"');
    expect(quoteCell("14 Harbour Street\r\nPortside")).toBe('"14 Harbour Street\r\nPortside"');
  });

  it("writes an empty cell for a null", () => {
    expect(quoteCell(null)).toBe("");
  });

  it("adds no currency symbol, no separator and no leading apostrophe", () => {
    expect(quoteCell("1200.50")).toBe("1200.50");
    expect(quoteCell("2026-10-05")).toBe("2026-10-05");
  });
});

describe("the rows", () => {
  it("gives a six-item receipt six data rows", () => {
    const items = ["4.99", "12.50", "3.25", "1.86", "19.00", "6.00"].map((amount) =>
      item({ amount, unitPrice: amount, description: `Item ${amount}` }),
    );
    const rows = dataRows(receiptsToCsv([receipt({ lineItems: items })]));

    expect(rows).toHaveLength(6);
    expect(rows[0].endsWith("Item 4.99,1,4.99,4.99")).toBe(true);
    expect(rows[5].endsWith("Item 6.00,1,6.00,6.00")).toBe(true);
  });

  it("repeats the receipt fields on every row", () => {
    const rows = dataRows(receiptsToCsv([receipt({ lineItems: [item(), item()] })]));
    const receiptPart = (row: string) => row.split(",").slice(0, 12).join(",");

    expect(receiptPart(rows[0])).toBe(receiptPart(rows[1]));
    expect(rows[0].startsWith("Harbour Street Grocers,")).toBe(true);
  });

  it("gives a receipt that itemized nothing one row with empty item cells", () => {
    for (const lineItems of [null, []]) {
      const rows = dataRows(receiptsToCsv([receipt({ lineItems })]));
      expect(rows).toHaveLength(1);
      expect(rows[0].endsWith(",,,,")).toBe(true);
    }
  });

  it("writes an empty cell for a null tip rather than a zero", () => {
    const cells = dataRows(receiptsToCsv([receipt({ tip: null })]))[0].split(",");
    expect(cells[6]).toBe("");
  });

  it("quotes a merchant holding a comma inside the row", () => {
    const csv = receiptsToCsv([receipt({ merchant: "Harbour Street Grocers, Ltd" })]);
    expect(dataRows(csv)[0].startsWith('"Harbour Street Grocers, Ltd",')).toBe(true);
  });

  it("quotes an item description holding a double quote inside the row", () => {
    const csv = receiptsToCsv([receipt({ lineItems: [item({ description: '12" tortillas' })] })]);
    expect(dataRows(csv)[0]).toContain('"12"" tortillas"');
  });

  it("builds one row object per item and one for a receipt with none", () => {
    expect(csvRowsFor(receipt({ lineItems: [item(), item(), item()] }))).toHaveLength(3);
    expect(csvRowsFor(receipt({ lineItems: [] }))).toEqual([
      { receipt: receipt({ lineItems: [] }), item: null },
    ]);
  });

  it("ends every row CRLF, the last one included", () => {
    const csv = receiptsToCsv([receipt()]);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.split("\r\n")).toHaveLength(3);
  });
});

describe("the tax columns", () => {
  it("sizes them to the widest receipt in the export", () => {
    const wide = receipt({ taxes: [tax("GST", "1.00"), tax("PST", "2.00")] });
    const none = receipt({ merchant: "Portside Cafe", taxes: null });
    const csv = receiptsToCsv([wide, none]);

    expect(header(csv)).toContain("tax_1_label,tax_1_amount,tax_2_label,tax_2_amount");

    const rows = dataRows(csv);
    expect(rows[0].split(",").slice(10, 14)).toEqual(["GST", "1.00", "PST", "2.00"]);
    expect(rows[1].split(",").slice(10, 14)).toEqual(["", "", "", ""]);
  });

  it("counts the widest receipt, treating a null tax array as none", () => {
    expect(widestTaxCount([receipt({ taxes: null }), receipt({ taxes: [] })])).toBe(0);
    expect(widestTaxCount([receipt({ taxes: [tax("GST", "1.00")] }), receipt()])).toBe(1);
  });

  it("writes no tax pair when no receipt in the export carries one", () => {
    expect(header(receiptsToCsv([receipt({ taxes: null })]))).not.toContain("tax_");
  });

  it("gives one receipt the same content a list of one gives", () => {
    const one = receipt();
    expect(receiptsToCsv([one])).toBe(receiptsToCsv([one]));
    expect(dataRows(receiptsToCsv([one, one]))).toHaveLength(2);
  });
});

describe("a receipt the model refused", () => {
  it("reports that it carries no values", () => {
    expect(carriesValues(receipt())).toBe(true);
    expect(carriesValues(receipt({ isReceipt: false, reason: "A slide, not a receipt" }))).toBe(
      false,
    );
  });

  it("contributes no row, and the refusal reason reaches no cell", () => {
    const refused = receipt({ isReceipt: false, reason: "A slide, not a receipt" });
    const csv = receiptsToCsv([receipt(), refused]);

    expect(dataRows(csv)).toHaveLength(1);
    expect(csv).not.toContain("A slide, not a receipt");
  });

  it("still writes the header when every receipt was refused", () => {
    const csv = receiptsToCsv([receipt({ isReceipt: false, reason: "Not a receipt" })]);
    expect(header(csv)).toBe(
      "merchant,merchant_address,date,time,currency,subtotal,tip,total,payment_method,card_last4," +
        "item_description,item_quantity,item_unit_price,item_amount",
    );
    expect(dataRows(csv)).toHaveLength(0);
  });

  it("writes a header alone for an empty export", () => {
    expect(dataRows(receiptsToCsv([]))).toHaveLength(0);
  });
});
