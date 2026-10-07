import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACCEPTED_IMAGE_TYPES, MAX_FILE_BYTES } from "./extract-receipt";
import { MATCH_THRESHOLD } from "./highlight-match";
import { EXTRACTION_MODEL } from "./model";
import { IP_HOURLY_LIMIT } from "./rate-limit";
import { ITEM_COLUMNS } from "./receipt-csv";
import { REVIEW_THRESHOLD } from "./receipt-fields";
import {
  ACCURACY_CAVEAT,
  ACCURACY_FIGURE_IDS,
  ACCURACY_RUN,
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

  it("states no percentage and claims no accuracy without a measured run behind it", () => {
    for (const figure of SITE_FIGURES) {
      if (figure.measured) {
        continue;
      }
      expect(figure.figure).not.toContain("%");
      expect(figure.label).not.toContain("accur");
      expect(figure.detail).not.toContain("%");
    }
  });
});

/**
 * The replacement for the old blanket ban on a percent sign.
 *
 * That ban existed so nobody could slip an unmeasured number onto the site
 * before anything had measured it. Now that a run exists, the same property is
 * kept the other way round: a figure may state a percentage only if it carries
 * the run date, the model and the report it came from, and the stamp has to be
 * the run this repository actually holds rather than a date somebody typed.
 */
describe("the measured figures", () => {
  it("are the three the accuracy spec requires every place to state", () => {
    expect([...ACCURACY_FIGURE_IDS]).toEqual(["field-accuracy", "total-accuracy", "date-accuracy"]);
    for (const id of ACCURACY_FIGURE_IDS) {
      expect(figureById(id).figure).toMatch(/^\d{1,3}\.\d%$/);
    }
    expect(figureById("field-accuracy").figure).toBe("98.7%");
    expect(figureById("total-accuracy").figure).toBe("100.0%");
    expect(figureById("date-accuracy").figure).toBe("85.0%");
  });

  it("each carries the run date, the model and the report it was measured from", () => {
    for (const id of ACCURACY_FIGURE_IDS) {
      const figure = figureById(id);
      expect(figure.measured).toBeDefined();
      expect(figure.measured?.runDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(figure.measured?.runDate).toBe(ACCURACY_RUN.runDate);
      expect(figure.measured?.model).toBe(EXTRACTION_MODEL);
      expect(figure.measured?.report).toBe("fixtures/REPORT.md");
      expect(figure.source).toContain("fixtures/REPORT.md");
    }
  });

  it("refuses an undated or unsourced figure, wherever it states a percentage", () => {
    for (const figure of SITE_FIGURES) {
      const claimsAccuracy =
        figure.figure.includes("%") ||
        figure.label.toLowerCase().includes("accur") ||
        figure.label.toLowerCase().includes("read correctly");
      expect(claimsAccuracy).toBe(figure.measured !== undefined);
      if (!figure.measured) {
        continue;
      }
      expect(figure.measured.runDate).not.toBe("");
      expect(figure.measured.model).not.toBe("");
      expect(figure.measured.report).not.toBe("");
    }
  });

  it("names the run date, the model and the caveat where a visitor reads the headline figure", () => {
    const headline = figureById("field-accuracy");
    expect(headline.detail).toContain(ACCURACY_RUN.runDate);
    expect(headline.detail).toContain(EXTRACTION_MODEL);
    expect(headline.detail).toContain(ACCURACY_CAVEAT);
    expect(headline.detail).toContain(ACCURACY_RUN.report);
  });

  it("says the set was damaged in code rather than photographed", () => {
    expect(ACCURACY_CAVEAT).toContain("damaged in code");
    expect(ACCURACY_CAVEAT).toContain("rather than photographed");
    expect(ACCURACY_CAVEAT).toContain(String(ACCURACY_RUN.fixtureCount));
  });

  it("measures the model the app calls, so no figure outlives its model", () => {
    expect(ACCURACY_RUN.model).toBe(EXTRACTION_MODEL);
    expect(ACCURACY_RUN.fixtureCount).toBeGreaterThanOrEqual(40);
  });
});

/**
 * The accuracy spec requires the stat tiles, the About page and the README to
 * state the same figures. The first two import this module, which these cases
 * assert by reading their source. The README cannot import TypeScript, so it is
 * checked as text: every measured figure, the caveat and the run date have to
 * appear in it verbatim, which is the strongest thing a test can say about a
 * hand-transcribed file.
 */
describe("the three places that state the figures", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("has the stat tiles and the About page reading this module", () => {
    for (const path of ["components/StatTiles.tsx", "app/about/page.tsx"]) {
      expect(read(path)).toContain('from "@/lib/project-facts"');
    }
  });

  it("has the stat tiles print the three measured figures through the shared list", () => {
    const tiles = read("components/StatTiles.tsx");
    expect(tiles).toContain("STAT_TILES");
    expect(tiles).toContain("ACCURACY_RUN");
    for (const id of ACCURACY_FIGURE_IDS) {
      expect(STAT_TILE_IDS).toContain(id);
    }
  });

  it("has the About page render the figures and the caveat from the module", () => {
    const about = read("app/about/page.tsx");
    expect(about).toContain("SITE_FIGURES");
    expect(about).toContain("ACCURACY_CAVEAT");
    expect(about).toContain("ACCURACY_RUN");
    expect(about).toContain("FAILURE_CASES");
  });

  it("has the README transcribe the same figures, the same run and the same caveat", () => {
    const readme = read("README.md");
    for (const id of ACCURACY_FIGURE_IDS) {
      const figure = figureById(id);
      expect(readme).toContain(figure.figure);
      expect(readme).toContain(figure.label);
    }
    expect(readme).toContain(ACCURACY_RUN.runDate);
    expect(readme).toContain(ACCURACY_RUN.report);
    expect(readme).toContain(ACCURACY_CAVEAT);
    expect(readme).toContain(EXTRACTION_MODEL);
  });

  it("leaves no place claiming the accuracy figures are still unmeasured", () => {
    for (const path of [
      "components/StatTiles.tsx",
      "app/about/page.tsx",
      "README.md",
      "lib/project-facts.ts",
    ]) {
      expect(read(path)).not.toContain("No accuracy percentage");
    }
  });
});

describe("the stat tiles", () => {
  it("are the six figures the landing page shows, taken from the one list", () => {
    expect(STAT_TILES).toHaveLength(6);
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
