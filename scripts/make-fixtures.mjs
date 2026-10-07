/**
 * Regenerates the forty labelled accuracy fixtures under `fixtures/`.
 *
 * Each run writes a receipt image and its label from one set of values, which is
 * the whole reason this generator exists. A label somebody transcribed off an
 * image carries typos that read as model failures, so the figure measured against
 * it describes the typist as much as the model. Here the plan in
 * `scripts/fixture-plan.mjs` decides what the receipt says, the renderer in
 * `scripts/receipt-svg.mjs` draws exactly that, the steps in
 * `scripts/fixture-degrade.mjs` damage the pixels, and the label is written from
 * the same plan. No degradation touches the label.
 *
 * Run it with `node scripts/make-fixtures.mjs`. It writes 80 files and prints the
 * total size, and running it twice produces byte-identical output. Nothing in the
 * build calls it, because the fixtures are committed.
 *
 * Every merchant, address and card number is invented, and the footer of every
 * fixture says so on the paper itself.
 */

import { mkdirSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderSvg, itemRows, printsQuantityLine } from "./receipt-svg.mjs";
import { mulberry32, planFixtures, printDate, FIXTURE_SEED } from "./fixture-plan.mjs";
import { applyDegradations, encodeJpeg, rasterize } from "./fixture-degrade.mjs";

const OUT = "fixtures";

/* ------------------------------------------------------------------ *
 * The paper
 * ------------------------------------------------------------------ */

/**
 * Builds the rows one fixture prints, in the shape its layout prints them.
 *
 * The three layouts differ in more than their width: a till roll puts the date and
 * the time at the two ends of a line, a card slip drops the quantity column
 * entirely, and an invoice heads its items with a column title and spells its date
 * in the ISO form. Each returns the printed strings alongside the rows, because the
 * label records the characters a value was read from and those characters are
 * decided here.
 */
export function receiptRows(plan) {
  const { merchant, layout, items, taxes } = plan;
  const money = (value) => `${merchant.symbol}${value}`;
  const datePrinted = printDate(plan.date, layout.datePrinted);
  const cardPrinted = plan.cardLast4 === null ? null : `************${plan.cardLast4}`;
  const rows = [];

  rows.push({ center: merchant.name, weight: "bold" });
  for (const line of merchant.address.slice(0, layout.addressLines)) rows.push({ center: line });

  if (layout.tableHeader) {
    rows.push({ gap: 0.8 });
    rows.push({ split: [`INVOICE ${plan.reference}`, datePrinted] });
    rows.push({ left: "BILL TO QUILLMORE DESIGN WORKS" });
    rows.push({ left: "TERMS   NET 30" });
    if (plan.time !== null) rows.push({ left: `RECEIVED ${plan.time}` });
    rows.push({ gap: 0.6 });
    rows.push({ rule: true });
    rows.push({ split: ["DESCRIPTION", `AMOUNT ${merchant.currency}`] });
    rows.push({ rule: true });
  } else {
    rows.push({ center: merchant.phone });
    rows.push({ gap: 0.6 });
    rows.push({ rule: true });
    rows.push(
      plan.time === null ? { left: datePrinted } : { split: [datePrinted, plan.time] },
    );
    rows.push({ left: `TILL ${String(plan.index % 8).padStart(2, "0")}   REF ${plan.reference}` });
    rows.push({ rule: true });
  }

  rows.push({ gap: 0.4 });
  const alwaysQuantity = layout.quantityColumn === "always";
  rows.push(...itemRows(items, { alwaysQuantity, money }));
  rows.push({ gap: 0.4 });
  rows.push({ rule: true });
  rows.push({ split: ["SUBTOTAL", money(plan.subtotal)] });
  for (const tax of taxes) rows.push({ split: [tax.label, money(tax.amount)] });
  if (plan.tip !== null) rows.push({ split: ["TIP", money(plan.tip)] });
  rows.push({ split: [layout.totalWord, money(plan.total)], weight: "bold" });
  rows.push({ rule: true });
  rows.push({ gap: 0.4 });

  if (layout.tableHeader) {
    rows.push({ left: `PAID BY ${plan.payment}` });
  } else {
    rows.push({ split: [plan.payment, money(plan.total)] });
  }
  if (cardPrinted !== null) rows.push({ left: `CARD ${cardPrinted}` });

  rows.push({ gap: 0.6 });
  rows.push({ rule: true });
  for (const line of merchant.footer) rows.push({ center: line });

  return { rows, money, datePrinted, cardPrinted, alwaysQuantity };
}

/* ------------------------------------------------------------------ *
 * The label
 * ------------------------------------------------------------------ */

/**
 * Writes the label for a fixture in the shape `receiptSchema` validates.
 *
 * Two of the three siblings every field carries make sense for a label and one does
 * not. `sourceText` holds the characters the receipt actually printed, which is what
 * the harness needs to score the highlight match against the fixture's own word
 * boxes, so it is filled in from the same strings the renderer drew. `confidence` is
 * the model's own report about its reading and a label has no reading to be
 * confident about, so every confidence is null: a label claiming 1.0 would be
 * asserting something nobody measured. A cell the receipt printed nothing for carries
 * a null value and a null source text, which is what makes "the receipt printed no
 * tip" different from "the tip was zero".
 */
export function buildLabel(plan, printed) {
  const { money, datePrinted, cardPrinted, alwaysQuantity } = printed;
  const receipt = {
    isReceipt: true,
    reason: null,

    merchant: plan.merchant.name,
    merchantConfidence: null,
    merchantSourceText: plan.merchant.name,

    merchantAddress: plan.merchant.address.slice(0, plan.layout.addressLines).join(", "),
    merchantAddressConfidence: null,
    merchantAddressSourceText: plan.merchant.address
      .slice(0, plan.layout.addressLines)
      .join(", "),

    date: plan.date,
    dateConfidence: null,
    dateSourceText: datePrinted,

    time: plan.time,
    timeConfidence: null,
    timeSourceText: plan.time,

    currency: plan.merchant.currency,
    currencyConfidence: null,
    currencySourceText: plan.merchant.symbol,

    subtotal: plan.subtotal,
    subtotalConfidence: null,
    subtotalSourceText: money(plan.subtotal),

    taxes: plan.taxes.map((tax) => ({
      label: tax.label,
      labelConfidence: null,
      labelSourceText: tax.label,
      amount: tax.amount,
      amountConfidence: null,
      amountSourceText: money(tax.amount),
    })),

    tip: plan.tip,
    tipConfidence: null,
    tipSourceText: plan.tip === null ? null : money(plan.tip),

    total: plan.total,
    totalConfidence: null,
    totalSourceText: money(plan.total),

    paymentMethod: plan.payment,
    paymentMethodConfidence: null,
    paymentMethodSourceText: plan.payment,

    cardLast4: plan.cardLast4,
    cardLast4Confidence: null,
    cardLast4SourceText: cardPrinted,

    lineItems: plan.items.map((item) => {
      /*
       * A line prints its quantity and its unit price together or not at all, and
       * `printsQuantityLine` in the renderer is the one place that decides which.
       * Where it prints neither, the label holds null for both the value and the
       * source text: a card slip shows no quantity column, a till roll shows no
       * quantity line for a single unit, and a label asserting "1" there would be
       * claiming a character the paper never carried. The amount is printed on
       * every line, so the receipt's arithmetic still closes on what it prints.
       */
      const printsQuantity = printsQuantityLine(item, { alwaysQuantity });
      return {
        description: item.description,
        descriptionConfidence: null,
        descriptionSourceText: item.description,
        quantity: printsQuantity ? item.quantity : null,
        quantityConfidence: null,
        quantitySourceText: printsQuantity ? item.quantity : null,
        unitPrice: printsQuantity ? item.unitPrice : null,
        unitPriceConfidence: null,
        unitPriceSourceText: printsQuantity ? money(item.unitPrice) : null,
        amount: item.amount,
        amountConfidence: null,
        amountSourceText: money(item.amount),
      };
    }),
  };

  return {
    fixture: plan.id,
    image: `${plan.id}-${plan.slug}.jpg`,
    layout: plan.layoutName,
    degradations: plan.degradations,
    receipt,
  };
}

/* ------------------------------------------------------------------ *
 * Writing the forty
 * ------------------------------------------------------------------ */

/**
 * Draws every fixture, damages it and writes the pair.
 *
 * It runs only when a person runs this file. `lib/fixtures.test.ts` imports the
 * two builders above to check that a degradation changes an image and leaves a
 * label alone, and a test that rewrote eighty committed files on its way past
 * would be a test with a side effect nobody asked for.
 */
export async function writeFixtures() {
  mkdirSync(OUT, { recursive: true });

  for (const plan of planFixtures()) {
    const printed = receiptRows(plan);
    const svg = renderSvg({
      width: plan.layout.width,
      margin: plan.layout.margin,
      size: plan.layout.size,
      lineHeight: plan.layout.lineHeight,
      background: plan.layout.background,
      ink: plan.layout.ink,
      rows: printed.rows,
    });

    // The degradation stream is seeded apart from the plan's, so adding a step to
    // a fixture's row in the matrix cannot shift the quantities its items carry.
    const random = mulberry32(FIXTURE_SEED + 101 + plan.index * 31337);
    const damaged = await applyDegradations(await rasterize(svg), plan.degradations, {
      paper: plan.layout.paper,
      random,
    });

    const label = buildLabel(plan, printed);
    writeFileSync(`${OUT}/${label.image}`, await encodeJpeg(damaged));
    writeFileSync(`${OUT}/${plan.id}-${plan.slug}.label.json`, `${JSON.stringify(label, null, 2)}
`);
    console.log(
      `${label.image}  ${plan.layoutName}  ${plan.items.length} items  ${plan.merchant.currency}  ${
        plan.degradations.length === 0 ? "clean" : plan.degradations.join("+")
      }`,
    );
  }

  const files = readdirSync(OUT);
  const bytes = files.reduce((total, name) => total + statSync(`${OUT}/${name}`).size, 0);
  console.log(`${files.length} files in ${OUT}/  ${(bytes / 1024 / 1024).toFixed(2)} MiB total`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await writeFixtures();
