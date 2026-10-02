import { describe, expect, it } from "vitest";
import { arithmeticWarnings, lineItemTotal } from "./arithmetic";
import {
  addLineItem,
  addressKey,
  applyEdit,
  blankLineItem,
  committedValue,
  editableAddresses,
  isEdited,
  recordEdited,
  remapEditedOnRemove,
  removeLineItem,
  validatorFor,
  type FieldAddress,
} from "./field-edit";
import {
  receiptSchema,
  type Receipt,
  type ReceiptLineItem,
  type ReceiptTax,
} from "./receipt-schema";

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

function tax(overrides: Partial<ReceiptTax> = {}): ReceiptTax {
  return {
    label: "VAT 20%",
    labelConfidence: 0.9,
    labelSourceText: "VAT 20%",
    amount: "3.60",
    amountConfidence: 0.62,
    amountSourceText: "3.60",
    ...overrides,
  };
}

/** Two items summing to the 10.00 subtotal, which the 13.60 total agrees with. */
function receipt(overrides: Partial<Receipt> = {}): Receipt {
  const base: Receipt = {
    isReceipt: true,
    reason: null,
    merchant: "Pier Cafe",
    merchantConfidence: 0.95,
    merchantSourceText: "PIER CAFE",
    merchantAddress: "12 Harbour Road",
    merchantAddressConfidence: 0.88,
    merchantAddressSourceText: "12 HARBOUR RD",
    date: "2026-09-18",
    dateConfidence: 0.92,
    dateSourceText: "18/09/2026",
    time: "18:45",
    timeConfidence: 0.9,
    timeSourceText: "18:45",
    currency: "GBP",
    currencyConfidence: 0.9,
    currencySourceText: "£",
    subtotal: "10.00",
    subtotalConfidence: 0.93,
    subtotalSourceText: "SUBTOTAL 10.00",
    taxes: [tax()],
    tip: null,
    tipConfidence: null,
    tipSourceText: null,
    total: "13.60",
    totalConfidence: 0.96,
    totalSourceText: "T0TAL 13.60",
    paymentMethod: "Visa",
    paymentMethodConfidence: 0.89,
    paymentMethodSourceText: "VISA",
    cardLast4: "4417",
    cardLast4Confidence: 0.86,
    cardLast4SourceText: "XXXX 4417",
    lineItems: [
      lineItem({ amount: "4.00", unitPrice: "4.00" }),
      lineItem({ description: "Coffee beans", amount: "6.00", unitPrice: "6.00" }),
    ],
  };

  return { ...base, ...overrides };
}

function accepted(result: ReturnType<typeof applyEdit>): Receipt {
  if (!result.accepted) {
    throw new Error(`the app refused the edit: ${result.rejection.message}`);
  }
  return result.receipt;
}

function refused(result: ReturnType<typeof applyEdit>) {
  if (result.accepted) {
    throw new Error("the app accepted an edit the test expected it to refuse");
  }
  return result.rejection;
}

describe("addressKey", () => {
  it("names a flat field by its property name", () => {
    expect(addressKey({ kind: "flat", field: "total" })).toBe("total");
  });

  it("names a tax cell and an item cell by the path the receipt already uses", () => {
    expect(addressKey({ kind: "tax", index: 1, cell: "amount" })).toBe("taxes.1.amount");
    expect(addressKey({ kind: "item", index: 3, cell: "amount" })).toBe("lineItems.3.amount");
  });
});

describe("editableAddresses", () => {
  it("covers the ten flat fields plus two cells per tax and four per line item", () => {
    const addresses = editableAddresses(
      receipt({ taxes: [tax(), tax({ label: "City tax" })], lineItems: [lineItem()] }),
    );

    expect(addresses.filter((address) => address.kind === "flat")).toHaveLength(10);
    expect(addresses.filter((address) => address.kind === "tax")).toHaveLength(4);
    expect(addresses.filter((address) => address.kind === "item")).toHaveLength(4);
    expect(addresses).toHaveLength(18);
  });

  it("offers no edit on isReceipt, on a reason, on a confidence or on a source text", () => {
    const keys = editableAddresses(receipt()).map(addressKey);

    expect(keys).not.toContain("isReceipt");
    expect(keys).not.toContain("reason");
    expect(keys.some((key) => key.endsWith("Confidence"))).toBe(false);
    expect(keys.some((key) => key.endsWith("SourceText"))).toBe(false);
    expect(keys).not.toContain("lineItemsTotal");
  });

  it("gives a receipt with no taxes and no items its flat fields alone", () => {
    expect(editableAddresses(receipt({ taxes: null, lineItems: null }))).toHaveLength(10);
  });
});

describe("validatorFor", () => {
  it("resolves every editable address on a receipt to a validator", () => {
    for (const address of editableAddresses(receipt())) {
      const validator = validatorFor(address);
      expect(validator, addressKey(address)).toBeDefined();
      expect(validator.safeParse(null).success, addressKey(address)).toBe(true);
    }
  });

  it("reads the money rules off the shared schema rather than a copy", () => {
    const amount = validatorFor({ kind: "item", index: 0, cell: "amount" });

    expect(amount.safeParse("4.99").success).toBe(true);
    expect(amount.safeParse("4.9999").success).toBe(false);
    expect(amount.safeParse("4,99").success).toBe(false);
    expect(amount.safeParse("4.99")).toEqual(receiptSchema.shape.total.safeParse("4.99"));
  });
});

describe("committedValue", () => {
  it("commits an emptied field as absent rather than as an empty string", () => {
    expect(committedValue("")).toBeNull();
    expect(committedValue("   ")).toBeNull();
  });

  it("keeps the digits the visitor typed", () => {
    expect(committedValue("42.00")).toBe("42.00");
    expect(committedValue(" 42.5 ")).toBe("42.5");
  });
});

describe("applyEdit mutates nothing it was given", () => {
  it("leaves the input receipt exactly as it was", () => {
    const before = receipt();
    const snapshot = JSON.stringify(before);

    accepted(applyEdit(before, { kind: "flat", field: "merchant" }, "Pier Kitchen"));
    accepted(applyEdit(before, { kind: "item", index: 0, cell: "amount" }, "4.50"));
    accepted(applyEdit(before, { kind: "tax", index: 0, cell: "amount" }, "3.00"));
    refused(applyEdit(before, { kind: "flat", field: "date" }, "02/10/2026"));

    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("an accepted edit clears the confidence and keeps the source text", () => {
  it("drops the model's figure on a field read at 0.62 and keeps its source string", () => {
    const original = receipt();
    const next = accepted(applyEdit(original, { kind: "tax", index: 0, cell: "amount" }, "3.00"));

    expect(original.taxes?.[0].amountConfidence).toBe(0.62);
    expect(next.taxes?.[0].amount).toBe("3.00");
    expect(next.taxes?.[0].amountConfidence).toBeNull();
    expect(next.taxes?.[0].amountSourceText).toBe("3.60");
  });

  it("drops a high confidence too rather than keeping it against a value the model never saw", () => {
    const next = accepted(applyEdit(receipt(), { kind: "flat", field: "total" }, "13.50"));

    expect(next.total).toBe("13.50");
    expect(next.totalConfidence).toBeNull();
    expect(next.totalSourceText).toBe("T0TAL 13.60");
  });

  it("leaves every other field and every other entry alone", () => {
    const next = accepted(applyEdit(receipt(), { kind: "item", index: 1, cell: "amount" }, "6.50"));

    expect(next.lineItems?.[0]).toEqual(receipt().lineItems?.[0]);
    expect(next.lineItems?.[1].amount).toBe("6.50");
    expect(next.lineItems?.[1].description).toBe("Coffee beans");
    expect(next.subtotal).toBe("10.00");
  });
});

describe("an emptied field commits as absent", () => {
  it("reads a cleared tip as absent", () => {
    const next = accepted(applyEdit(receipt({ tip: "2.00" }), { kind: "flat", field: "tip" }, ""));

    expect(next.tip).toBeNull();
    expect(receiptSchema.safeParse(next).success).toBe(true);
  });

  it("makes both checks that need a subtotal skip once it is cleared", () => {
    const before = receipt({ subtotal: "9.00" });
    expect(arithmeticWarnings(before)).toHaveLength(2);

    const next = accepted(applyEdit(before, { kind: "flat", field: "subtotal" }, ""));

    expect(next.subtotal).toBeNull();
    expect(arithmeticWarnings(next)).toEqual([]);
  });
});

describe("a money edit keeps the digits the visitor typed", () => {
  it("keeps a trailing zero and does not pad a narrower scale", () => {
    expect(accepted(applyEdit(receipt(), { kind: "flat", field: "total" }, "42.00")).total).toBe(
      "42.00",
    );
    expect(accepted(applyEdit(receipt(), { kind: "flat", field: "total" }, "42.5")).total).toBe(
      "42.5",
    );
  });
});

describe("a refused edit", () => {
  const cases: Array<[string, FieldAddress, string]> = [
    ["a malformed date", { kind: "flat", field: "date" }, "02/10/2026"],
    ["a money value written with a comma", { kind: "flat", field: "total" }, "42,00"],
    ["a money value with four decimal places", { kind: "flat", field: "total" }, "42.0000"],
    ["a currency the schema does not admit", { kind: "flat", field: "currency" }, "pounds"],
    ["a time outside the 24-hour clock", { kind: "flat", field: "time" }, "7pm"],
    ["a card line of three digits", { kind: "flat", field: "cardLast4" }, "441"],
    ["an item amount carrying a symbol", { kind: "item", index: 0, cell: "amount" }, "£4.50"],
    ["a quantity with four decimal places", { kind: "item", index: 0, cell: "quantity" }, "0.7345"],
  ];

  for (const [name, address, text] of cases) {
    it(`refuses ${name} and leaves the receipt as it was`, () => {
      const before = receipt();
      const rejection = refused(applyEdit(before, address, text));

      expect(rejection.key).toBe(addressKey(address));
      expect(rejection.text).toBe(text);
      expect(rejection.message.length).toBeGreaterThan(0);
      expect(rejection.message).not.toContain("Invalid");
      expect(JSON.stringify(before)).toBe(JSON.stringify(receipt()));
    });
  }

  it("names what the field takes rather than quoting the schema", () => {
    expect(refused(applyEdit(receipt(), { kind: "flat", field: "date" }, "02/10/2026")).message).toBe(
      "This field takes an ISO calendar date, such as 2026-10-02.",
    );
    expect(refused(applyEdit(receipt(), { kind: "flat", field: "total" }, "42,00")).message).toContain(
      "decimal amount",
    );
    expect(
      refused(applyEdit(receipt(), { kind: "flat", field: "currency" }, "pounds")).message,
    ).toContain("ISO 4217");
  });

  it("changes no warning, because it changed no value", () => {
    const before = receipt({ subtotal: "9.00" });
    const warnings = arithmeticWarnings(before);
    const result = applyEdit(before, { kind: "flat", field: "total" }, "42,00");

    expect(result.accepted).toBe(false);
    expect(arithmeticWarnings(before)).toEqual(warnings);
  });
});

describe("every address kind accepts a value the schema admits", () => {
  const cases: Array<[FieldAddress, string, (next: Receipt) => string | null]> = [
    [{ kind: "flat", field: "merchant" }, "Pier Kitchen", (next) => next.merchant],
    [{ kind: "flat", field: "merchantAddress" }, "9 Quay St", (next) => next.merchantAddress],
    [{ kind: "flat", field: "date" }, "2026-10-02", (next) => next.date],
    [{ kind: "flat", field: "time" }, "09:05", (next) => next.time],
    [{ kind: "flat", field: "currency" }, "USD", (next) => next.currency],
    [{ kind: "flat", field: "cardLast4" }, "1234", (next) => next.cardLast4],
    [{ kind: "flat", field: "subtotal" }, "11.00", (next) => next.subtotal],
    [{ kind: "flat", field: "tip" }, "1.50", (next) => next.tip],
    [{ kind: "flat", field: "total" }, "15.10", (next) => next.total],
    [{ kind: "flat", field: "paymentMethod" }, "Cash", (next) => next.paymentMethod],
    [{ kind: "tax", index: 0, cell: "label" }, "VAT 5%", (next) => next.taxes?.[0].label ?? null],
    [{ kind: "tax", index: 0, cell: "amount" }, "0.50", (next) => next.taxes?.[0].amount ?? null],
    [
      { kind: "item", index: 1, cell: "description" },
      "Decaf beans",
      (next) => next.lineItems?.[1].description ?? null,
    ],
    [
      { kind: "item", index: 1, cell: "quantity" },
      "0.734",
      (next) => next.lineItems?.[1].quantity ?? null,
    ],
    [
      { kind: "item", index: 1, cell: "unitPrice" },
      "2.54",
      (next) => next.lineItems?.[1].unitPrice ?? null,
    ],
    [
      { kind: "item", index: 1, cell: "amount" },
      "1.86",
      (next) => next.lineItems?.[1].amount ?? null,
    ],
  ];

  for (const [address, text, read] of cases) {
    it(`writes ${addressKey(address)}`, () => {
      const next = accepted(applyEdit(receipt(), address, text));
      expect(read(next)).toBe(text);
      expect(receiptSchema.safeParse(next).success).toBe(true);
    });
  }
});

describe("the edited list", () => {
  it("records one address and nothing else", () => {
    const edited = recordEdited([], { kind: "flat", field: "total" });

    expect(edited).toEqual(["total"]);
    expect(isEdited(edited, { kind: "flat", field: "total" })).toBe(true);
    expect(isEdited(edited, { kind: "flat", field: "subtotal" })).toBe(false);
  });

  it("keeps a field recorded when the visitor types the original value back", () => {
    const once = recordEdited([], { kind: "flat", field: "total" });
    expect(recordEdited(once, { kind: "flat", field: "total" })).toEqual(["total"]);
  });
});

describe("addLineItem", () => {
  it("adds an entry with every value and every confidence absent", () => {
    const { receipt: next } = addLineItem(receipt(), []);
    const added = next.lineItems?.[2];

    expect(next.lineItems).toHaveLength(3);
    expect(added).toEqual(blankLineItem());
    expect(added?.description).toBeNull();
    expect(added?.amountConfidence).toBeNull();
    expect(receiptSchema.safeParse(next).success).toBe(true);
  });

  it("gives a receipt that itemized nothing a one-item list", () => {
    expect(addLineItem(receipt({ lineItems: [] }), []).receipt.lineItems).toHaveLength(1);
    expect(addLineItem(receipt({ lineItems: null }), []).receipt.lineItems).toHaveLength(1);
  });

  it("records no edit against the item it added", () => {
    expect(addLineItem(receipt(), ["total"]).edited).toEqual(["total"]);
  });
});

describe("removeLineItem", () => {
  it("drops the entry and leaves the rest in order", () => {
    const { receipt: next } = removeLineItem(receipt(), 0, []);

    expect(next.lineItems).toHaveLength(1);
    expect(next.lineItems?.[0].description).toBe("Coffee beans");
  });

  it("leaves an empty list rather than a null when the last item goes", () => {
    const one = receipt({ lineItems: [lineItem()] });
    const { receipt: next } = removeLineItem(one, 0, []);

    expect(next.lineItems).toEqual([]);
    expect(lineItemTotal(next).status).toBe("none");
    expect(arithmeticWarnings(next).some((warning) => warning.check === "line-items-sum")).toBe(
      false,
    );
  });

  it("ignores an index the list does not hold", () => {
    expect(removeLineItem(receipt(), 7, []).receipt.lineItems).toHaveLength(2);
  });
});

describe("remapEditedOnRemove", () => {
  it("leaves an address below the removed index alone", () => {
    expect(remapEditedOnRemove(["lineItems.0.amount"], 2)).toEqual(["lineItems.0.amount"]);
  });

  it("drops the addresses on the removed item", () => {
    expect(remapEditedOnRemove(["lineItems.2.amount", "lineItems.2.description"], 2)).toEqual([]);
  });

  it("follows an address above the removed index down one place", () => {
    expect(remapEditedOnRemove(["lineItems.3.amount"], 2)).toEqual(["lineItems.2.amount"]);
  });

  it("handles two recorded edits either side of one removal", () => {
    expect(remapEditedOnRemove(["lineItems.0.amount", "lineItems.3.quantity"], 1)).toEqual([
      "lineItems.0.amount",
      "lineItems.2.quantity",
    ]);
  });

  it("leaves a flat field and a tax cell untouched", () => {
    expect(remapEditedOnRemove(["total", "taxes.1.amount", "lineItems.1.amount"], 0)).toEqual([
      "total",
      "taxes.1.amount",
      "lineItems.0.amount",
    ]);
  });

  it("remaps through removeLineItem itself", () => {
    const { edited } = removeLineItem(receipt(), 0, ["lineItems.1.amount", "subtotal"]);
    expect(edited).toEqual(["lineItems.0.amount", "subtotal"]);
  });
});

describe("add and remove against the arithmetic checks", () => {
  /** The items sum to 9.50 against a printed subtotal of 10.00. */
  function short(): Receipt {
    return receipt({
      lineItems: [
        lineItem({ amount: "4.00", unitPrice: "4.00" }),
        lineItem({ description: "Coffee beans", amount: "5.50", unitPrice: "5.50" }),
      ],
    });
  }

  it("skips the sum check while an added item carries no amount", () => {
    expect(arithmeticWarnings(short())[0].difference).toBe("0.50");

    const { receipt: added } = addLineItem(short(), []);

    expect(lineItemTotal(added).status).toBe("incomplete");
    expect(arithmeticWarnings(added).some((warning) => warning.check === "line-items-sum")).toBe(
      false,
    );
  });

  it("passes the sum check once the added item carries the missing 0.50", () => {
    const { receipt: added } = addLineItem(short(), []);
    const filled = accepted(
      applyEdit(added, { kind: "item", index: 2, cell: "amount" }, "0.50"),
    );

    expect(lineItemTotal(filled)).toEqual({ status: "computed", value: "10.00" });
    expect(arithmeticWarnings(filled)).toEqual([]);
  });

  it("passes the sum check once a duplicated line is removed", () => {
    const duplicated = receipt({
      lineItems: [
        lineItem({ amount: "4.00", unitPrice: "4.00" }),
        lineItem({ description: "Coffee beans", amount: "6.00", unitPrice: "6.00" }),
        lineItem({ description: "Coffee beans", amount: "6.00", unitPrice: "6.00" }),
      ],
    });

    expect(arithmeticWarnings(duplicated)[0].difference).toBe("6.00");

    const { receipt: next } = removeLineItem(duplicated, 2, []);

    expect(arithmeticWarnings(next)).toEqual([]);
  });

  it("narrows a named difference from 0.50 to 0.10 when the visitor corrects an amount", () => {
    const corrected = accepted(
      applyEdit(short(), { kind: "item", index: 1, cell: "amount" }, "5.90"),
    );

    expect(arithmeticWarnings(corrected)[0].difference).toBe("0.10");
  });
});
