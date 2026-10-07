import { describe, expect, it } from "vitest";
import { ACCEPTED_IMAGE_TYPES, MAX_FILE_BYTES } from "./extract-receipt";
import { MATCH_THRESHOLD } from "./highlight-match";
import { EXTRACTION_MODEL } from "./model";
import { IP_HOURLY_LIMIT } from "./rate-limit";
import { ITEM_COLUMNS } from "./receipt-csv";
import { REVIEW_THRESHOLD } from "./receipt-fields";
import {
  FAILURE_CASES,
  LINE_ITEM_VALUE_COUNT,
  MAX_FILE_MEGABYTES,
  PICKER_FORMAT_LABELS,
  PICKER_MEDIA_TYPES,
  RECEIPT_FIELD_COUNT,
  RECEIPT_FIELD_NAMES,
  SITE_FIGURES,
  STAT_TILES,
  STAT_TILE_IDS,
  figureById,
} from "./project-facts";
import { SESSION_EXTRACTION_CAP } from "./session-count";

/**
 * The site states these figures in three places: the stat tiles, the About page
 * and the README. The first two read this module, so these cases are what stops
 * a figure here drifting from the constant the app actually enforces.
 */

describe("the receipt field count", () => {
  it("names the twelve fields the panel prints and no confidence siblings", () => {
    expect(RECEIPT_FIELD_NAMES).toEqual([
      "merchant",
      "merchantAddress",
      "date",
      "time",
      "currency",
      "subtotal",
      "taxes",
      "tip",
      "total",
      "paymentMethod",
      "cardLast4",
      "lineItems",
    ]);
    expect(RECEIPT_FIELD_COUNT).toBe(12);
  });

  it("leaves out the two keys carrying the model's answer about the upload", () => {
    expect(RECEIPT_FIELD_NAMES).not.toContain("isReceipt");
    expect(RECEIPT_FIELD_NAMES).not.toContain("reason");
  });
});

describe("the line item value count", () => {
  it("matches the item columns the CSV writer holds", () => {
    expect(LINE_ITEM_VALUE_COUNT).toBe(ITEM_COLUMNS.length);
    expect(LINE_ITEM_VALUE_COUNT).toBe(4);
  });
});

describe("the picker formats", () => {
  it("carries the route's image types plus the PDF the browser rasterizes", () => {
    expect(PICKER_MEDIA_TYPES).toEqual([...ACCEPTED_IMAGE_TYPES, "application/pdf"]);
  });

  it("labels each type the way a visitor reads it", () => {
    expect(PICKER_FORMAT_LABELS).toEqual(["JPEG", "PNG", "WebP", "PDF"]);
  });

  it("states the file cap in whole megabytes from the byte constant", () => {
    expect(MAX_FILE_MEGABYTES).toBe(MAX_FILE_BYTES / (1024 * 1024));
    expect(MAX_FILE_MEGABYTES).toBe(8);
  });
});

describe("every stated figure", () => {
  it("derives from the constant the app enforces", () => {
    expect(figureById("fields").figure).toBe(String(RECEIPT_FIELD_COUNT));
    expect(figureById("line-item-values").figure).toBe(String(ITEM_COLUMNS.length));
    expect(figureById("formats").figure).toBe(String(ACCEPTED_IMAGE_TYPES.length + 1));
    expect(figureById("session-cap").figure).toBe(String(SESSION_EXTRACTION_CAP));
    expect(figureById("ip-limit").figure).toBe(String(IP_HOURLY_LIMIT));
    expect(figureById("match-threshold").figure).toBe(MATCH_THRESHOLD.toFixed(2));
    expect(figureById("review-threshold").figure).toBe(REVIEW_THRESHOLD.toFixed(1));
    expect(figureById("model-calls").figure).toBe("1");
  });

  it("names the accepted formats and the file cap in the formats detail", () => {
    const formats = figureById("formats");
    for (const label of PICKER_FORMAT_LABELS) {
      expect(formats.detail).toContain(label);
    }
    expect(formats.detail).toContain(`${MAX_FILE_MEGABYTES} MB`);
  });

  it("names the pinned model where it claims one call per receipt", () => {
    expect(figureById("model-calls").detail).toContain(EXTRACTION_MODEL);
  });

  it("carries a unique id, a label, a detail and a source", () => {
    const ids = SITE_FIGURES.map((figure) => figure.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const figure of SITE_FIGURES) {
      expect(figure.figure).not.toBe("");
      expect(figure.label).not.toBe("");
      expect(figure.detail.length).toBeGreaterThan(20);
      expect(figure.source).toContain("lib/");
    }
  });

  it("states no accuracy percentage, which the next slice measures", () => {
    for (const figure of SITE_FIGURES) {
      expect(figure.figure).not.toContain("%");
      expect(figure.label).not.toContain("accur");
    }
  });
});

describe("the stat tiles", () => {
  it("are the four figures the landing page shows, taken from the one list", () => {
    expect(STAT_TILES).toHaveLength(4);
    expect(STAT_TILES.map((tile) => tile.id)).toEqual([...STAT_TILE_IDS]);
    for (const tile of STAT_TILES) {
      expect(SITE_FIGURES).toContain(tile);
    }
  });

  it("refuses an id no figure answers to, rather than rendering a blank tile", () => {
    expect(() => figureById("accuracy")).toThrow(/No site figure named accuracy/);
  });
});

describe("the failure cases", () => {
  it("is not empty", () => {
    expect(FAILURE_CASES.length).toBeGreaterThan(0);
  });

  it("names faded thermal paper, handwriting and angled photographs", () => {
    const titles = FAILURE_CASES.map((failure) => failure.title.toLowerCase()).join(" | ");
    expect(titles).toContain("faded thermal paper");
    expect(titles).toContain("handwriting");
    expect(titles).toContain("angled");
  });

  it("gives each case a unique id and a detail saying what breaks", () => {
    const ids = FAILURE_CASES.map((failure) => failure.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const failure of FAILURE_CASES) {
      expect(failure.title).not.toBe("");
      expect(failure.detail.length).toBeGreaterThan(40);
    }
  });

  it("quotes the thresholds it names from the constants behind them", () => {
    const review = FAILURE_CASES.find((failure) => failure.id === "unexercised-review-flag");
    expect(review?.detail).toContain(String(REVIEW_THRESHOLD));
    expect(review?.detail).toContain(EXTRACTION_MODEL);

    const highlight = FAILURE_CASES.find((failure) => failure.id === "missing-highlight");
    expect(highlight?.detail).toContain(String(MATCH_THRESHOLD));
  });
});
