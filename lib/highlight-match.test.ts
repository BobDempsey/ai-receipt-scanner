import { describe, expect, it } from "vitest";
import { addressKey } from "./field-edit";
import {
  MATCH_THRESHOLD,
  bestMatch,
  buildRegionMap,
  candidateRuns,
  levenshteinDistance,
  normalizeForMatch,
  regionFor,
  similarity,
  tokenCount,
} from "./highlight-match";
import type { Receipt, ReceiptLineItem } from "./receipt-schema";
import type { TextLine, WordBox } from "./word-boxes";

/** One measured word. Every box is 60 by 20 unless a case needs otherwise. */
function word(text: string, left: number, top: number, width = 60, height = 20): WordBox {
  return { text, rect: { left, top, width, height } };
}

function line(...words: WordBox[]): TextLine {
  return { words };
}

/** A receipt whose subtotal line and total line both print 42.00. */
function duplicateAmountLines(): TextLine[] {
  return [
    line(word("SUBTOTAL", 10, 170), word("42.00", 420, 170)),
    line(word("TOTAL", 10, 300), word("42.00", 420, 300)),
  ];
}

describe("normalizeForMatch", () => {
  it("folds case and drops the spacing the receipt printed", () => {
    expect(normalizeForMatch("TOTAL 42.00")).toBe("total42.00");
    expect(normalizeForMatch("  total   42.00 ")).toBe("total42.00");
  });

  it("drops the punctuation a receipt hangs off a label", () => {
    expect(normalizeForMatch("TOTAL:")).toBe("total");
    expect(normalizeForMatch("(VAT 20%)")).toBe("vat20");
  });

  it("keeps the decimal point, so an amount and its digits do not read alike", () => {
    expect(normalizeForMatch("42.00")).toBe("42.00");
    expect(normalizeForMatch("4200")).toBe("4200");
    expect(normalizeForMatch("42.00")).not.toBe(normalizeForMatch("4200"));
  });

  it("answers nothing for a source text that is punctuation alone", () => {
    expect(normalizeForMatch("£")).toBe("");
  });
});

describe("levenshteinDistance", () => {
  it("counts one edit per wrong character", () => {
    expect(levenshteinDistance("total", "t0tal")).toBe(1);
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
  });

  it("counts the whole string against an empty one", () => {
    expect(levenshteinDistance("", "total")).toBe(5);
    expect(levenshteinDistance("total", "")).toBe(5);
    expect(levenshteinDistance("", "")).toBe(0);
  });
});

describe("similarity", () => {
  it("scores an exact match at 1 through the spacing and the punctuation", () => {
    expect(similarity("TOTAL 42.00", "TOTAL: 42.00")).toBe(1);
    expect(similarity("42.00", "42.00")).toBe(1);
  });

  it("scores one misread character as a single edit against the length", () => {
    expect(similarity("TOTAL", "T0TAL")).toBeCloseTo(0.8, 10);
  });

  it("scores a transposition below an exact match", () => {
    expect(similarity("42.00", "24.00")).toBeLessThan(similarity("42.00", "42.00"));
  });

  it("scores a four-character token with one character wrong at 0.75", () => {
    expect(similarity("4417", "4A17")).toBeCloseTo(0.75, 10);
  });

  it("scores the digits without a decimal point below the amount that carries one", () => {
    expect(similarity("42.00", "4200")).toBeLessThan(1);
  });

  it("divides by nothing when either side normalizes to nothing", () => {
    expect(similarity("", "")).toBe(1);
    expect(similarity("TOTAL", "")).toBe(0);
    expect(similarity("", "TOTAL")).toBe(0);
    expect(Number.isNaN(similarity("", "42.00"))).toBe(false);
  });
});

describe("tokenCount", () => {
  it("counts the whitespace-separated tokens a source text holds", () => {
    expect(tokenCount("TOTAL 42.00")).toBe(2);
    expect(tokenCount("  XXXX   4417 ")).toBe(2);
    expect(tokenCount("")).toBe(0);
  });
});

describe("candidateRuns", () => {
  it("generates no run that spans two lines", () => {
    const lines = [
      line(word("SUBTOTAL", 10, 170), word("38.40", 420, 170)),
      line(word("TOTAL", 10, 300), word("42.00", 420, 300)),
    ];
    const firstLine = lines[0].words.map((held) => held.text);

    for (const candidate of candidateRuns(lines, 4)) {
      const words = candidate.text.split(" ");
      const fromFirst = words.filter((held) => firstLine.includes(held));
      expect(fromFirst.length === 0 || fromFirst.length === words.length).toBe(true);
    }
  });

  it("keeps every run inside the height of one printed line", () => {
    for (const candidate of candidateRuns(duplicateAmountLines(), 4)) {
      expect(candidate.region.height).toBe(20);
    }
  });

  it("covers both boxes of a two-word run", () => {
    const runs = candidateRuns([line(word("TOTAL", 10, 300), word("42.00", 420, 300))], 3);
    const both = runs.find((candidate) => candidate.text === "TOTAL 42.00");

    expect(both?.region).toEqual({ left: 10, top: 300, width: 470, height: 20 });
  });

  it("caps the window at the word count it was given", () => {
    const lines = [line(word("A", 0, 0), word("B", 70, 0), word("C", 140, 0))];

    expect(candidateRuns(lines, 1).map((candidate) => candidate.text)).toEqual(["A", "B", "C"]);
    expect(candidateRuns(lines, 2).map((candidate) => candidate.text)).toEqual([
      "A",
      "A B",
      "B",
      "B C",
      "C",
    ]);
  });
});

describe("bestMatch", () => {
  it("names 0.72 as the threshold, which slice 9's fixtures confirm or replace", () => {
    expect(MATCH_THRESHOLD).toBe(0.72);
  });

  it("covers both boxes when the source text spans two words", () => {
    const match = bestMatch("TOTAL 42.00", [
      line(word("TOTAL", 10, 300), word("42.00", 420, 300)),
    ]);

    expect(match?.score).toBe(1);
    expect(match?.region).toEqual({ left: 10, top: 300, width: 470, height: 20 });
  });

  it("clears the threshold through one misread character", () => {
    const match = bestMatch("TOTAL", [line(word("T0TAL", 10, 300))]);

    expect(match?.region).toEqual({ left: 10, top: 300, width: 60, height: 20 });
  });

  it("clears the threshold on the 0.75 four-character case", () => {
    const match = bestMatch("4417", [line(word("4A17", 10, 300))]);

    expect(match?.score).toBeCloseTo(0.75, 10);
    expect(match?.region.left).toBe(10);
  });

  it("marks nothing when the best candidate scores 0.5", () => {
    expect(similarity("4417", "4499")).toBeCloseTo(0.5, 10);
    expect(bestMatch("4417", [line(word("4499", 10, 300))])).toBeNull();
  });

  it("takes the earlier region when the same amount is printed twice", () => {
    const match = bestMatch("42.00", duplicateAmountLines());

    expect(match?.score).toBe(1);
    expect(match?.region).toEqual({ left: 420, top: 170, width: 60, height: 20 });
  });

  it("matches nothing for a field the receipt printed no value for", () => {
    expect(bestMatch(null, duplicateAmountLines())).toBeNull();
  });

  it("matches nothing for a source text that normalizes to nothing", () => {
    expect(bestMatch("£", duplicateAmountLines())).toBeNull();
  });

  it("matches nothing when the pass measured no words at all", () => {
    expect(bestMatch("TOTAL 42.00", [])).toBeNull();
  });
});

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

/** The three lines the pass read off that receipt, with the date line misread. */
function measuredLines(): TextLine[] {
  return [
    line(word("PIER", 10, 40), word("CAFE", 90, 40)),
    line(word("SUBTOTAL", 10, 170), word("38.40", 420, 170)),
    line(word("TOTAL", 10, 300), word("42.00", 420, 300)),
  ];
}

describe("buildRegionMap", () => {
  it("returns a region for the fields the pass read and none for the fields it did not", () => {
    const regions = buildRegionMap(receipt(), measuredLines());

    expect([...regions.keys()].sort()).toEqual(["merchant", "subtotal", "total"]);
  });

  it("keys each region by the address string the export already uses", () => {
    const regions = buildRegionMap(receipt(), measuredLines());

    expect(regions.get(addressKey({ kind: "flat", field: "total" }))).toEqual({
      left: 10,
      top: 300,
      width: 470,
      height: 20,
    });
  });

  it("covers the merchant line's two boxes", () => {
    const regions = buildRegionMap(receipt(), measuredLines());

    expect(regions.get("merchant")).toEqual({ left: 10, top: 40, width: 140, height: 20 });
  });

  it("matches nothing at all when the pass measured no words", () => {
    expect(buildRegionMap(receipt(), []).size).toBe(0);
  });

  it("writes nothing back into the receipt or the lines it was given", () => {
    const held = receipt();
    const lines = measuredLines();
    const before = JSON.stringify({ held, lines });

    buildRegionMap(held, lines);

    expect(JSON.stringify({ held, lines })).toBe(before);
  });

  it("builds the same map twice from the same arguments, holding no cache of its own", () => {
    const held = receipt();

    expect([...buildRegionMap(held, measuredLines())]).toEqual([
      ...buildRegionMap(held, measuredLines()),
    ]);
  });

  it("follows a line item through a removal, because the map is rebuilt rather than remapped", () => {
    const two = receipt({
      lineItems: [
        lineItem({ amountSourceText: "9.99" }),
        lineItem({ amountSourceText: "42.00" }),
      ],
    });
    const first = buildRegionMap(two, measuredLines());

    expect(first.has("lineItems.1.amount")).toBe(true);
    expect(first.has("lineItems.0.amount")).toBe(false);

    const removed = receipt({ lineItems: [lineItem({ amountSourceText: "42.00" })] });
    const second = buildRegionMap(removed, measuredLines());

    expect(second.has("lineItems.0.amount")).toBe(true);
    expect(second.has("lineItems.1.amount")).toBe(false);
  });
});

describe("regionFor", () => {
  it("reads the region of one address", () => {
    const regions = buildRegionMap(receipt(), measuredLines());

    expect(regionFor(regions, { kind: "flat", field: "total" })).toEqual({
      left: 10,
      top: 300,
      width: 470,
      height: 20,
    });
  });

  it("answers null for an address the matcher found nothing for", () => {
    const regions = buildRegionMap(receipt(), measuredLines());

    expect(regionFor(regions, { kind: "flat", field: "date" })).toBeNull();
    expect(regionFor(regions, { kind: "flat", field: "time" })).toBeNull();
  });
});
