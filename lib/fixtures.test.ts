import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it, beforeAll } from "vitest";

import { receiptSchema } from "./receipt-schema";
import {
  DEGRADATION_MATRIX,
  FIXTURE_COUNT,
  MERCHANTS,
  planFixture,
  planFixtures,
} from "../scripts/fixture-plan.mjs";
import {
  DEGRADATION_STEPS,
  STEPS,
  applyDegradations,
  rasterize,
} from "../scripts/fixture-degrade.mjs";
import { buildLabel, receiptRows } from "../scripts/make-fixtures.mjs";
import { printsQuantityLine, quantityLineText, renderSvg } from "../scripts/receipt-svg.mjs";
import {
  EDITABLE_FLAT_FIELDS,
  EDITABLE_ITEM_CELLS,
  EDITABLE_TAX_CELLS,
} from "./field-edit";

/**
 * What this file checks, and what it deliberately does not.
 *
 * It reads the eighty committed files under `fixtures/` and the modules that
 * wrote them. It never calls `writeFixtures`, because a test that rewrote eighty
 * committed binaries on its way past would be a test with a side effect nobody
 * asked for, and regenerating the set takes about ten seconds against a suite
 * that runs in two. The one place it rasterizes anything is the degradation
 * check, which draws a single short receipt.
 */

const DIRECTORY = "fixtures";

const images = readdirSync(DIRECTORY)
  .filter((name) => name.endsWith(".jpg"))
  .sort();
const labelFiles = readdirSync(DIRECTORY)
  .filter((name) => name.endsWith(".label.json"))
  .sort();
const labels = labelFiles.map((name) => JSON.parse(readFileSync(`${DIRECTORY}/${name}`, "utf8")));

describe("the fixture set on disk", () => {
  it("holds forty receipts", () => {
    expect(images).toHaveLength(FIXTURE_COUNT);
    expect(labels).toHaveLength(FIXTURE_COUNT);
  });

  it("pairs every image with a label and every label with an image", () => {
    expect(labels.map((label) => label.image).sort()).toEqual(images);
    expect(labelFiles).toEqual(images.map((name) => name.replace(/\.jpg$/, ".label.json")));
  });

  it("writes every label in the shape the app validates", () => {
    for (const label of labels) {
      const parsed = receiptSchema.safeParse(label.receipt);
      expect(parsed.success, `${label.fixture}: ${parsed.error?.message ?? ""}`).toBe(true);
    }
  });

  it("holds a label whose values came from the plan rather than from the pixels", () => {
    for (const [index, label] of labels.entries()) {
      const plan = planFixture(index);
      expect(label.fixture).toBe(plan.id);
      expect(label.receipt.total).toBe(plan.total);
      expect(label.receipt.subtotal).toBe(plan.subtotal);
      expect(label.receipt.tip).toBe(plan.tip);
      expect(label.receipt.date).toBe(plan.date);
      expect(label.receipt.lineItems).toHaveLength(plan.items.length);
    }
  });

  it("stays small enough to live in git", () => {
    const bytes = readdirSync(DIRECTORY).reduce(
      (total, name) => total + statSync(`${DIRECTORY}/${name}`).size,
      0,
    );
    expect(bytes).toBeLessThan(4 * 1024 * 1024);
  });
});

/**
 * The characters one fixture's paper carries, read off the rows the renderer was
 * handed rather than off a second description of the layout.
 *
 * A `gap` draws nothing and a `rule` draws dashes no label ever quotes, so both
 * drop out. Everything else contributes the text of its own row, which is what
 * makes the haystack below the paper itself.
 */
function printedRowText(rows: Row[]): string[] {
  return rows.flatMap((row) => {
    if (row.gap !== undefined || row.rule) {
      return [];
    }
    if (row.center !== undefined) {
      return [row.center];
    }
    if (row.split !== undefined) {
      return [`${row.split[0]} ${row.split[1]}`];
    }
    return [row.left ?? ""];
  });
}

type Row = {
  gap?: number;
  rule?: boolean;
  center?: string;
  left?: string;
  split?: [string, string];
};

type LabelItem = Record<string, string | null>;

/**
 * Where a label value's characters may be found.
 *
 * A value is quoted from one printed row, so the row-by-row text is the haystack.
 * The one value composed from more than one row is a merchant address the layout
 * spells over two lines, which the label joins with ", ", so the rows joined that
 * way are a second haystack. Nothing else in a label crosses a row boundary.
 */
function paperHaystacks(rows: Row[]): string[] {
  const text = printedRowText(rows);
  return [text.join("\n"), text.join(", ")];
}

/**
 * Every fixture, with the plan it came from, the rows the renderer drew and the
 * label the committed file holds.
 */
const fixtures = labels.map((label, index) => {
  const plan = planFixture(index);
  const printed = receiptRows(plan);
  return { label, plan, printed, haystacks: paperHaystacks(printed.rows) };
});

describe("a label records only what its layout prints", () => {
  /**
   * This is the check the first measured run needed and did not have. The
   * generator asserted a quantity of "1" and a unit price on 374 cells of paper
   * that printed neither, the model correctly answered null on all 374, the
   * harness counted all 374 wrong, and the published field accuracy came out
   * twenty points low. The three tests below read the rows the renderer drew
   * rather than a second description of each layout, so a label and the paper
   * cannot drift apart again without one of them failing.
   */
  it("gives every value it holds a source text", () => {
    for (const { label, plan } of fixtures) {
      const receipt = label.receipt;
      for (const field of EDITABLE_FLAT_FIELDS) {
        if (receipt[field] !== null) {
          expect(
            receipt[`${field}SourceText`],
            `${plan.id} ${field} holds a value with no source text`,
          ).not.toBeNull();
        }
      }
      for (const [index, tax] of (receipt.taxes as LabelItem[]).entries()) {
        for (const cell of EDITABLE_TAX_CELLS) {
          if (tax[cell] !== null) {
            expect(tax[`${cell}SourceText`], `${plan.id} taxes.${index}.${cell}`).not.toBeNull();
          }
        }
      }
      for (const [index, item] of (receipt.lineItems as LabelItem[]).entries()) {
        for (const cell of EDITABLE_ITEM_CELLS) {
          if (item[cell] !== null) {
            expect(
              item[`${cell}SourceText`],
              `${plan.id} lineItems.${index}.${cell}`,
            ).not.toBeNull();
          }
        }
      }
    }
  });

  it("quotes nothing the paper does not carry", () => {
    for (const { label, plan, haystacks } of fixtures) {
      const receipt = label.receipt;
      const quotes: [string, string][] = [];

      for (const field of EDITABLE_FLAT_FIELDS) {
        const quote = receipt[`${field}SourceText`];
        if (quote !== null) quotes.push([field, quote]);
      }
      for (const [index, tax] of (receipt.taxes as LabelItem[]).entries()) {
        for (const cell of EDITABLE_TAX_CELLS) {
          const quote = tax[`${cell}SourceText`];
          if (quote !== null) quotes.push([`taxes.${index}.${cell}`, quote]);
        }
      }
      for (const [index, item] of (receipt.lineItems as LabelItem[]).entries()) {
        for (const cell of EDITABLE_ITEM_CELLS) {
          const quote = item[`${cell}SourceText`];
          if (quote !== null) quotes.push([`lineItems.${index}.${cell}`, quote]);
        }
      }

      expect(quotes.length, `${plan.id} quoted nothing at all`).toBeGreaterThan(0);

      for (const [name, quote] of quotes) {
        const found = haystacks.some((paper) => paper.includes(quote));
        expect(found, `${plan.id} ${name} quotes ${quote}, which its paper never printed`).toBe(
          true,
        );
      }
    }
  });

  it("holds a quantity and a unit price exactly where the layout prints the pair", () => {
    let printedPairs = 0;
    let unprintedPairs = 0;

    for (const { label, plan, printed, haystacks } of fixtures) {
      const items = label.receipt.lineItems as LabelItem[];
      expect(items).toHaveLength(plan.items.length);

      for (const [index, item] of items.entries()) {
        const planned = plan.items[index];
        const prints = printsQuantityLine(planned, { alwaysQuantity: printed.alwaysQuantity });
        const line = quantityLineText(planned, printed.money);
        const onPaper = haystacks[0].includes(line);
        expect(onPaper, `${plan.id} lineItems.${index}: the renderer and its own rule disagree`).toBe(
          prints,
        );

        if (prints) {
          printedPairs += 1;
          expect(item.quantity).toBe(planned.quantity);
          expect(item.unitPrice).toBe(planned.unitPrice);
        } else {
          unprintedPairs += 1;
          // The paper shows this line's description and its amount and nothing
          // else, so the label holds no quantity and no unit price to be read.
          expect(item.quantity, `${plan.id} lineItems.${index}.quantity`).toBeNull();
          expect(item.unitPrice, `${plan.id} lineItems.${index}.unitPrice`).toBeNull();
        }
        // The amount is printed on every line, which is what keeps the receipt's
        // arithmetic closing on the figures it shows.
        expect(item.amount).toBe(planned.amount);
      }
    }

    // Both sides of the rule are exercised by the committed set rather than by one
    // layout, so neither branch above can rot unnoticed.
    expect(printedPairs).toBeGreaterThan(0);
    expect(unprintedPairs).toBeGreaterThan(0);
  });

  it("matches what the generator writes today, file for file", () => {
    for (const { label, plan, printed } of fixtures) {
      expect(label, `${plan.id} on disk is not what the generator writes`).toEqual(
        buildLabel(plan, printed),
      );
    }
  });
});

describe("the variety across the forty", () => {
  const plans = planFixtures();

  it("carries at least three distinct item counts", () => {
    const counts = new Set(plans.map((plan) => plan.items.length));
    expect(counts.size).toBeGreaterThanOrEqual(3);
  });

  it("carries both tipped and untipped receipts", () => {
    expect(plans.some((plan) => plan.tip !== null)).toBe(true);
    expect(plans.some((plan) => plan.tip === null)).toBe(true);
  });

  it("carries at least two currencies", () => {
    const currencies = new Set(plans.map((plan) => plan.merchant.currency));
    expect(currencies.size).toBeGreaterThanOrEqual(2);
  });

  it("carries every merchant, more than one layout and more than one payment method", () => {
    expect(new Set(plans.map((plan) => plan.slug)).size).toBe(MERCHANTS.length);
    expect(new Set(plans.map((plan) => plan.layoutName)).size).toBeGreaterThan(1);
    expect(new Set(plans.map((plan) => plan.payment)).size).toBeGreaterThan(1);
  });

  it("exercises no tax line, one and two", () => {
    const widths = new Set(plans.map((plan) => plan.taxes.length));
    expect([...widths].sort()).toEqual([0, 1, 2]);
  });

  it("prints a receipt whose arithmetic closes", () => {
    for (const plan of plans) {
      const cents = (value: string) => Math.round(Number(value) * 100);
      const items = plan.items.reduce(
        (sum: number, item: { amount: string }) => sum + cents(item.amount),
        0,
      );
      const taxes = plan.taxes.reduce(
        (sum: number, tax: { amount: string }) => sum + cents(tax.amount),
        0,
      );
      expect(items).toBe(cents(plan.subtotal));
      expect(items + taxes + (plan.tip === null ? 0 : cents(plan.tip))).toBe(cents(plan.total));
    }
  });
});

describe("the degradation matrix", () => {
  it("is the one the module declares", () => {
    expect(DEGRADATION_MATRIX).toHaveLength(FIXTURE_COUNT);
    for (const [index, label] of labels.entries()) {
      expect(label.degradations).toEqual(DEGRADATION_MATRIX[index]);
    }
  });

  it("names only steps that exist, and uses every one of them", () => {
    const named = new Set(DEGRADATION_MATRIX.flat());
    for (const name of named) expect(DEGRADATION_STEPS).toContain(name);
    for (const step of DEGRADATION_STEPS) expect(named.has(step)).toBe(true);
    expect(Object.keys(STEPS).sort()).toEqual([...DEGRADATION_STEPS].sort());
  });

  it("leaves roughly a quarter of the set clean or near clean", () => {
    const nearClean = DEGRADATION_MATRIX.filter((names: string[]) => names.length <= 1).length;
    expect(nearClean).toBeGreaterThanOrEqual(9);
    expect(nearClean).toBeLessThanOrEqual(13);
    expect(DEGRADATION_MATRIX.filter((names: string[]) => names.length === 0).length).toBeGreaterThan(
      0,
    );
  });

  it("gives every fixture its own degradations in its own label file", () => {
    for (const label of labels) expect(Array.isArray(label.degradations)).toBe(true);
  });
});

describe("each degradation step", () => {
  const plan = planFixture(0);
  const printed = receiptRows(plan);
  const label = buildLabel(plan, printed);
  let clean: { data: Buffer; width: number; height: number };

  beforeAll(async () => {
    clean = await rasterize(
      renderSvg({
        width: plan.layout.width,
        margin: plan.layout.margin,
        size: plan.layout.size,
        lineHeight: plan.layout.lineHeight,
        background: plan.layout.background,
        ink: plan.layout.ink,
        rows: printed.rows,
      }),
    );
  });

  for (const name of DEGRADATION_STEPS) {
    it(`${name} changes the image and leaves the label alone`, async () => {
      const damaged = await applyDegradations(clean, [name], {
        paper: plan.layout.paper,
        random: () => 0.37,
      });
      const changed =
        damaged.width !== clean.width ||
        damaged.height !== clean.height ||
        !damaged.data.equals(clean.data);
      expect(changed, `${name} left the image untouched`).toBe(true);
      // The label is built from the plan, so no pixel the step touched can reach
      // it. Rebuilding it after the damage is what proves that rather than
      // asserting it.
      expect(buildLabel(plan, receiptRows(plan))).toEqual(label);
    });
  }

  it("keeps one greyscale channel through any combination", async () => {
    const damaged = await applyDegradations(clean, [...DEGRADATION_STEPS], {
      paper: plan.layout.paper,
      random: () => 0.37,
    });
    expect(damaged.data.length).toBe(damaged.width * damaged.height);
  });
});

describe("the seeded plan", () => {
  it("answers the same way twice", () => {
    expect(planFixture(7)).toEqual(planFixture(7));
    expect(planFixtures()).toEqual(planFixtures());
  });

  it("leaves no unseeded chance in the generator", () => {
    for (const file of [
      "scripts/fixture-plan.mjs",
      "scripts/fixture-degrade.mjs",
      "scripts/make-fixtures.mjs",
    ]) {
      expect(readFileSync(file, "utf8")).not.toContain("Math.random(");
    }
  });
});
