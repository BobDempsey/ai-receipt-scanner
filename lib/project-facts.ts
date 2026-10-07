import { ACCEPTED_IMAGE_TYPES, MAX_FILE_BYTES } from "./extract-receipt";
import { MATCH_THRESHOLD } from "./highlight-match";
import { EXTRACTION_MODEL } from "./model";
import { IP_HOURLY_LIMIT } from "./rate-limit";
import { ITEM_COLUMNS } from "./receipt-csv";
import { REVIEW_THRESHOLD } from "./receipt-fields";
import { receiptSchema } from "./receipt-schema";
import { SESSION_EXTRACTION_CAP } from "./session-count";

/**
 * The figures this site states and the failure cases it admits to.
 *
 * Three places quote the same numbers: the landing page's stat tiles, the About
 * page and the README. The README cannot import TypeScript, so this module is
 * the source and the README is transcribed from it by hand. Everything below is
 * therefore written to be read by a person copying it across, which is why each
 * figure carries the constant it came from in its own comment rather than only
 * in a test.
 *
 * Every figure is derived, never typed twice. Raising
 * `SESSION_EXTRACTION_CAP` from 40 changes the tile, the About page and the
 * unit test together, and the one thing left to do by hand is the README line.
 *
 * The three accuracy figures have no constant to read, because a measurement is
 * not a setting. They read their run date, their model and their report out of
 * `ACCURACY_RUN` instead, so a rerun edits that one object and every figure, its
 * date and its provenance move with it. A figure stating a percentage without
 * that stamp fails the unit test rather than reaching a tile.
 *
 * This module imports `lib/extract-receipt.ts`, which pulls in the OpenAI SDK,
 * so nothing that reads it may be a client component. The three components that
 * render it (`StepCards`, `StatTiles`, `ActionBand`) and the About page are all
 * server components for that reason, and the SDK stays out of the browser
 * bundle. A client component that needs one of these figures should take it as
 * a prop from a server parent.
 */

/** The two keys that carry the model's answer about the upload rather than a field. */
const ANSWER_KEYS = ["isReceipt", "reason"];

/**
 * The receipt-level fields, read off the validating schema.
 *
 * The schema holds a `Confidence` and a `SourceText` sibling beside most values,
 * because strict Structured Outputs forbids an object keyed by field paths, so
 * counting its keys raw would claim three times the fields a visitor sees. The
 * two siblings and the two answer keys come off, and what is left is the list
 * the field panel prints: `merchant` through `lineItems`, with `taxes` and
 * `lineItems` each counting once however many entries they hold.
 */
export const RECEIPT_FIELD_NAMES: readonly string[] = Object.keys(
  receiptSchema.shape,
).filter(
  (key) =>
    !ANSWER_KEYS.includes(key) &&
    !key.endsWith("Confidence") &&
    !key.endsWith("SourceText"),
);

/** How many fields the app reads off a receipt. Twelve, from the schema above. */
export const RECEIPT_FIELD_COUNT = RECEIPT_FIELD_NAMES.length;

/**
 * How many values every line item carries.
 *
 * Read off `ITEM_COLUMNS` in `lib/receipt-csv.ts`, the one list that already
 * names them: description, quantity, unit price and amount. The CSV writer and
 * this figure cannot drift, because a fifth item value would have to appear in
 * that export before it could appear here.
 */
export const LINE_ITEM_VALUE_COUNT = ITEM_COLUMNS.length;

/** What a visitor calls each media type, so a tile never prints `image/webp`. */
const FORMAT_LABELS: Record<string, string> = {
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "application/pdf": "PDF",
};

/**
 * The media types the file picker takes.
 *
 * The route takes three and the picker takes four, which the limits spec states
 * as two separate checks: `ACCEPTED_IMAGE_TYPES` holds the three image types,
 * and a PDF is rasterized in the browser before anything is posted, so the route
 * never sees one. The site quotes the picker's four, because that is the list a
 * visitor chooses from.
 */
export const PICKER_MEDIA_TYPES: readonly string[] = [
  ...ACCEPTED_IMAGE_TYPES,
  "application/pdf",
];

/** The four picker formats as a visitor reads them: JPEG, PNG, WebP, PDF. */
export const PICKER_FORMAT_LABELS: readonly string[] = PICKER_MEDIA_TYPES.map(
  (type) => FORMAT_LABELS[type] ?? type,
);

/**
 * The four formats as one readable phrase: "JPEG, PNG, WebP and PDF".
 *
 * Prose needs the conjunction that a comma-joined list does not carry, and two
 * places print the phrase, so the join happens once here rather than in each.
 */
export const PICKER_FORMAT_SENTENCE = [
  PICKER_FORMAT_LABELS.slice(0, -1).join(", "),
  PICKER_FORMAT_LABELS[PICKER_FORMAT_LABELS.length - 1],
].join(" and ");

/** The file size cap in whole megabytes, from `MAX_FILE_BYTES`. */
export const MAX_FILE_MEGABYTES = MAX_FILE_BYTES / (1024 * 1024);

/**
 * The one run every published accuracy figure comes from.
 *
 * The run date and the model are written here once and read by all three
 * figures, so a rerun edits one object rather than three strings, and the model
 * is `EXTRACTION_MODEL` itself rather than its name typed again. A figure that
 * quotes a model the app no longer calls is the thing the accuracy spec forbids,
 * and this is what makes that impossible to do by accident.
 *
 * `fixtureCount` is the size of the set `scripts/measure-accuracy.mjs` ran over.
 * It is a literal rather than a count of `fixtures/`, because this module is
 * bundled for a page and cannot read the filesystem; `lib/fixtures.test.ts`
 * is what holds the set to that number.
 */
export const ACCURACY_RUN = {
  /** The date `fixtures/REPORT.md` records for the run, ISO, no timezone. */
  runDate: "2026-10-07",
  /** The model the run measured, which is the one the route calls. */
  model: EXTRACTION_MODEL,
  /** How many labelled fixtures the run covered. */
  fixtureCount: 40,
  /** Where the run is written down, for a reader who wants the per-fixture rows. */
  report: "fixtures/REPORT.md",
} as const;

/**
 * The caveat that travels with every accuracy figure.
 *
 * The accuracy spec requires each place stating a figure to say the damage is
 * applied in code rather than photographed, so the sentence lives here and the
 * tiles, the About page and the README all print this one. Saying it once per
 * place is the difference between a measured claim and a marketing number.
 */
export const ACCURACY_CAVEAT = `The ${ACCURACY_RUN.fixtureCount} fixtures are drawn and then damaged in code rather than photographed, so synthetic fading is not thermal paper and the set carries no handwriting and no language but English.`;

export type SiteFigure = {
  /** A stable key, which is how the landing page picks the tiles it shows. */
  id: string;
  /** The value a tile prints large and the README prints in a table cell. */
  figure: string;
  /** What the figure counts, in two or three words. */
  label: string;
  /** One line under the figure, saying what it means for a visitor. */
  detail: string;
  /** Where the figure comes from, for whoever changes it next. */
  source: string;
  /**
   * The run behind a measured figure, absent on a figure read off a constant.
   *
   * Only a figure carrying this may state a percentage or call itself accuracy.
   * `lib/project-facts.test.ts` enforces that both ways, which is what stops an
   * unmeasured number reaching a tile.
   */
  measured?: {
    /** The run date, ISO. */
    runDate: string;
    /** The model id the figure was measured against. */
    model: string;
    /** The report the figure can be traced to. */
    report: string;
  };
};

/** The run stamp every measured figure carries, built once from `ACCURACY_RUN`. */
const MEASURED = {
  runDate: ACCURACY_RUN.runDate,
  model: ACCURACY_RUN.model,
  report: ACCURACY_RUN.report,
} as const;

/** The ids of the three figures the accuracy spec requires every place to state. */
export const ACCURACY_FIGURE_IDS = [
  "field-accuracy",
  "total-accuracy",
  "date-accuracy",
] as const;

/**
 * Every figure this site states, in the order the About page lists them.
 *
 * The three measured figures lead, because they are the ones a reader came for
 * and the ones that need their run named beside them. Each carries `measured`,
 * so the figure, the date, the model and the report move together.
 */
export const SITE_FIGURES: readonly SiteFigure[] = [
  {
    id: "field-accuracy",
    figure: "98.7%",
    label: "of fields read correctly",
    detail: `1,662 of 1,684 compared fields matched their label across the ${ACCURACY_RUN.fixtureCount} fixtures, measured on ${ACCURACY_RUN.runDate} against ${ACCURACY_RUN.model}. ${ACCURACY_CAVEAT} Twenty-two fields came back wrong and ${ACCURACY_RUN.report} names every one of them.`,
    source: `The run in ${ACCURACY_RUN.report}, from scripts/measure-accuracy.mjs over lib/accuracy.ts`,
    measured: MEASURED,
  },
  {
    id: "total-accuracy",
    figure: "100.0%",
    label: "of totals read correctly",
    detail: `The app read the printed total on all ${ACCURACY_RUN.fixtureCount} fixtures, 40 of 40. It is broken out beside the date because those are the two values a person checks first.`,
    source: `The \`total\` row of ${ACCURACY_RUN.report}, compared by lib/accuracy.ts`,
    measured: MEASURED,
  },
  {
    id: "date-accuracy",
    figure: "85.0%",
    label: "of dates read correctly",
    detail: `34 of 40, the weakest field in the set. All six misses are one mistake: a printed date whose day is 12 or under read in the other day-month convention, so 05/06 can come back as either the fifth of June or the sixth of May. Nothing on the paper says which convention it used, and the app sends no locale with the image. The eight invoices printing an ISO date read 8 of 8, so check a slash-separated date before you trust it.`,
    source: `The \`date\` row of ${ACCURACY_RUN.report}, compared by lib/accuracy.ts`,
    measured: MEASURED,
  },
  {
    id: "fields",
    figure: String(RECEIPT_FIELD_COUNT),
    label: "fields per receipt",
    detail:
      "The merchant and its address, the date and the time, the currency, the subtotal, the taxes, the tip, the total, the payment method, the card's last four digits and the line items. Each value arrives with the model's confidence in it and the characters it was read from.",
    source: "The keys of `receiptSchema` in lib/receipt-schema.ts",
  },
  {
    id: "line-item-values",
    figure: String(LINE_ITEM_VALUE_COUNT),
    label: "values on every line item",
    detail:
      "A receipt's items come back as a list the app can sum, and each entry holds its description, quantity, unit price and amount. A weighed item keeps a quantity of 0.734, because a quantity is a decimal string like an amount.",
    source: "`ITEM_COLUMNS` in lib/receipt-csv.ts",
  },
  {
    id: "formats",
    figure: String(PICKER_FORMAT_LABELS.length),
    label: "file formats",
    detail: `${PICKER_FORMAT_SENTENCE}, up to ${MAX_FILE_MEGABYTES} MB. A PDF is rasterized in the browser and the first page is what the model reads.`,
    source: "`ACCEPTED_IMAGE_TYPES` and `MAX_FILE_BYTES` in lib/extract-receipt.ts",
  },
  {
    id: "session-cap",
    figure: String(SESSION_EXTRACTION_CAP),
    label: "scans a session",
    detail:
      "The allowance a browser tab holds. It rests on a value the browser asserts, so it is a courtesy rather than a control, and the app says so where a refused visitor reads it.",
    source: "`SESSION_EXTRACTION_CAP` in lib/session-count.ts",
  },
  {
    id: "ip-limit",
    figure: String(IP_HOURLY_LIMIT),
    label: "scans an hour per address",
    detail:
      "The control behind the courtesy, counted in Redis before the model is called. A refusal names the wall-clock hour the allowance returns, because the window is fixed rather than rolling.",
    source: "`IP_HOURLY_LIMIT` in lib/rate-limit.ts",
  },
  {
    id: "match-threshold",
    figure: MATCH_THRESHOLD.toFixed(2),
    label: "match score a highlight needs",
    detail:
      "The app does not ask the model where a value sits on the page. It reads word boxes off the document and scores them against the characters the model says it read, and nothing below this score draws a mark.",
    source: "`MATCH_THRESHOLD` in lib/highlight-match.ts",
  },
  {
    id: "review-threshold",
    figure: REVIEW_THRESHOLD.toFixed(1),
    label: "confidence that asks for a check",
    detail:
      "A field the model is less sure of than this is flagged for review. The deployed app has not yet produced one, which the failure cases below say plainly.",
    source: "`REVIEW_THRESHOLD` in lib/receipt-fields.ts",
  },
  {
    id: "model-calls",
    figure: "1",
    label: "model call per receipt",
    detail: `One request to ${EXTRACTION_MODEL} with Structured Outputs in strict mode, whose schema is the field set. There is no JSON to parse out of prose and no retry loop around a malformed answer.`,
    source: "`EXTRACTION_MODEL` in lib/model.ts",
  },
];

/**
 * The ids the landing page prints as stat tiles, in the order they sit in the grid.
 *
 * Six, as two rows of three: the measured figures first, then what the app reads
 * and what it accepts. The accuracy spec requires the tiles to state the same
 * three measured figures the About page and the README state, so all three lead
 * here. The line item value count and the two thresholds came out of the row to
 * keep both rows full; they still sit in the About page's table and in the
 * README, which is where a reader goes for the whole list.
 */
export const STAT_TILE_IDS = [
  ...ACCURACY_FIGURE_IDS,
  "fields",
  "formats",
  "session-cap",
] as const;

/** One figure by id. Throws rather than rendering a blank tile, so a typo fails the build. */
export function figureById(id: string): SiteFigure {
  const found = SITE_FIGURES.find((figure) => figure.id === id);
  if (!found) {
    throw new Error(`No site figure named ${id}`);
  }
  return found;
}

/** The four tiles the landing page prints, derived from the one list above. */
export const STAT_TILES: readonly SiteFigure[] = STAT_TILE_IDS.map(figureById);

export type FailureCase = {
  id: string;
  /** What goes wrong, named rather than hedged. */
  title: string;
  /** Why it goes wrong, and what the app does about it. */
  detail: string;
};

/**
 * Where this app reads a receipt badly.
 *
 * The portfolio baseline asks the About page to name real cases instead of
 * hedging, so each entry below says what breaks and which part of the pipeline
 * breaks it. Nothing here is a disclaimer: a reader should be able to pick any
 * line, reproduce it against the deployed app, and find the app behaving the way
 * this list says.
 */
export const FAILURE_CASES: readonly FailureCase[] = [
  {
    id: "ambiguous-dates",
    title: "A date whose day could be its month",
    detail: `This is the measured weakest field: the date read 34 of ${ACCURACY_RUN.fixtureCount} on the fixture run, and all six misses are the same mistake. Each prints a day of 12 or under, so 05/06 is genuinely either the fifth of June or the sixth of May, and the model answered with the other reading. Nothing on the paper says which convention it used, the app sends no locale with the image, and it will not guess one on your behalf. The eight fixtures printing an ISO date read 8 of 8, so a slash-separated date is the one to check before you export.`,
  },
  {
    id: "faded-thermal",
    title: "Faded thermal paper",
    detail:
      "A till receipt that has spent a month in a hot car prints grey on grey. The model guesses at the digits, and the OCR pass that draws the highlight finds no words at all, so a wrong figure can arrive with no mark beside it to check it against. The fixture run does not measure this case: its fading is drawn in code and the faded fixtures scored 98.4%, close to the clean renders, so real thermal paper is worse than any figure on this site.",
  },
  {
    id: "handwriting",
    title: "Handwriting",
    detail:
      "A total written in by hand, or a tip scrawled on a card slip, reads badly. Printed type is what the model and the OCR pass both handle well, and the word boxes OCR returns for cursive rarely match the value the model read.",
  },
  {
    id: "angled-photographs",
    title: "Angled or crumpled photographs",
    detail:
      "A receipt shot from the side skews every printed line. The fields often still arrive; the highlight often does not, because the matcher scores runs of words inside one OCR text line and a curved line breaks into several.",
  },
  {
    id: "first-page-only",
    title: "A PDF past its first page",
    detail:
      "The app rasterizes page one and stops there. A two-page invoice loses everything on page two, and the document pane says which page of how many it read rather than hiding the gap.",
  },
  {
    id: "other-languages",
    title: "Receipts not printed in English",
    detail:
      "The prompt is written in English. Amounts and dates usually survive, and the currency code often does, but a merchant name in another script can come back as an English guess at it. The fixture set says nothing either way, because every fixture in it prints English.",
  },
  {
    id: "arithmetic-ambiguity",
    title: "A receipt whose own arithmetic is wrong",
    detail:
      "The checks compare figures printed on the page, so a receipt that rounds its own tax line raises the same warning a misread digit raises. The app names the difference and leaves the judgment to the reader, because it cannot tell those two apart and will not rewrite a number to close the gap.",
  },
  {
    id: "unexercised-review-flag",
    title: "The review flag is barely exercised",
    detail: `${EXTRACTION_MODEL} has not yet reported a confidence under ${REVIEW_THRESHOLD} on anything uploaded to the deployed app, and the fixture run confirms it: not one of the 1,684 compared fields came back under the line, the lowest confidence reported anywhere was 0.9, and every field the model read wrong reported 0.93 or above. On this set the model's own confidence predicts nothing about whether a value is right, so the flag is a mechanism waiting for a model that uses it rather than a signal to lean on.`,
  },
  {
    id: "missing-highlight",
    title: "A missing highlight is not a missing field",
    detail: `When no run of words scores above ${MATCH_THRESHOLD} against what the model says it read, the app marks nothing rather than marking the wrong region. A correct field can therefore sit on the page with no mark, and the pane says which of the two reasons applies.`,
  },
  {
    id: "mark-on-the-wrong-words",
    title: "A mark can land on the wrong words",
    detail: `The threshold refuses a poor match. It has no way to refuse a confident mistake. Over 1,251 measured samples the shipped ${MATCH_THRESHOLD} lost no correct mark and admitted 37 wrong ones, and 29 of those 37 are the currency: asked which characters it read the symbol from, the model often answers with the symbol and a whole address line, so the matcher finds exactly those words and marks the address. 25 of the wrong marks scored a perfect 1, which no threshold can refuse. The fix belongs in the prompt, and it is not in this change.`,
  },
];
