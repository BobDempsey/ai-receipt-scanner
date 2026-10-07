/**
 * Measures how well the app reads the forty labelled fixtures, and writes the
 * report every published accuracy figure has to be traceable to.
 *
 * Run it with `node scripts/measure-accuracy.mjs`. It makes one model call per
 * fixture against Bob's key, so it is a script a person runs on purpose and
 * nothing in the suite, the build or CI calls it. It says what the run costs
 * before it starts and refuses to run with no `OPENAI_API_KEY`.
 *
 * What it calls, and the one thing it does not:
 *
 * The extraction goes through `extractReceipt` in `lib/extract-receipt.ts`, the
 * same function `app/api/extract/route.ts` calls, with no `callModel` of its own.
 * So the pinned model, the prompt and the server-side Zod validation are the ones
 * a visitor gets, and a figure measured here describes the deployed app rather
 * than a stand-in. The rate limiter is the single deliberate omission: the harness
 * hands in a stub that always allows, because spending the hour's twenty-call
 * allowance on a forty-call measurement would refuse real visitors on the
 * deployed app for an hour, and the counter has nothing to do with how the model
 * reads a receipt. `fixtures/REPORT.md` states that omission.
 *
 * Every comparison rule lives in `lib/accuracy.ts` and every matching rule in
 * `lib/highlight-match.ts`. This script decides nothing about whether a value is
 * right; it reads the fixtures, makes the calls, runs the OCR pass and renders
 * what those two modules answered.
 *
 * The word boxes are the real OCR pass, not a proxy. `lib/word-boxes.ts` measures
 * in a browser, so this script boots the same tesseract.js at the same
 * `LSTM_ONLY` setting against the same committed `public/tesseract/eng.traineddata.gz`
 * and reads its output through that module's own exported `readTextLines`. Every
 * fixture sits inside `OCR_LONG_EDGE`, so the browser pass would hand tesseract
 * the file untouched exactly as this does, and the harness refuses a fixture
 * larger than that rather than quietly skipping the downscale the browser applies.
 *
 * Three sections of the report are judgments rather than measurements, so the
 * script writes an HTML comment marker where each belongs and the person who ran
 * the harness writes the finding in: what the run shows, what it says about the
 * match threshold, and what it says about the review line. A rerun reproduces the
 * markers, which is the reminder that a new run needs the findings read again.
 *
 * Flags: `--fixtures <dir>`, `--out <file>`, `--limit <n>` to measure the first n
 * fixtures, and `--dry-run` to exercise the OCR pass, the comparison and the
 * report arithmetic with no model call, which scores the label against itself and
 * therefore measures nothing. A dry run prints to stdout and writes no report.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import {
  REGION_CONTAINMENT_BAR,
  TRUTH_ABSENT,
  TRUTH_TRUSTED,
  confidenceFindings,
  costBrackets,
  judgeRegion,
  parseInputPricePerMillion,
  parsePriceReadDate,
  percent,
  thresholdCurve,
} from "./accuracy-evidence.mjs";

const FIXTURE_DIR = "fixtures";
const REPORT_PATH = "fixtures/REPORT.md";
const LANG_PATH = "public/tesseract";

/** The thresholds the report draws the match curve over, around the current 0.72. */
const CURVE_THRESHOLDS = [0.5, 0.6, 0.65, 0.7, 0.72, 0.75, 0.8, 0.85, 0.9, 0.95, 1];

/**
 * How many times a fixture is tried again, and on what.
 *
 * A call that failed before the model answered is a network or an API failure, not
 * a reading, and the route reports it as `model_call_failed`. Trying that fixture
 * again measures the model rather than the weather, and the report names every
 * retry it made. Nothing else is retried: a refusal, a malformed answer and a
 * wrong value are all the model's reading, and a harness that asked twice for a
 * better answer would publish a figure no visitor gets.
 */
const RETRY_LIMIT = 2;
const RETRYABLE_CODE = "model_call_failed";

/* ------------------------------------------------------------------ *
 * Loading the app's own modules
 * ------------------------------------------------------------------ */

/**
 * Loads the TypeScript the app ships, through Vite's SSR loader.
 *
 * The libraries import each other without file extensions, which Node's own type
 * stripping will not resolve, and bundling a copy would risk measuring a build of
 * the extraction rather than the extraction. Vite is already a dependency through
 * Vitest, so the harness borrows its resolver and loads the real modules.
 */
async function loadApp() {
  const server = await createServer({
    configFile: false,
    appType: "custom",
    logLevel: "warn",
    server: { middlewareMode: true },
  });

  const load = (path) => server.ssrLoadModule(path);

  const [extract, accuracy, match, boxes, model, fields, source, edit] = await Promise.all([
    load("/lib/extract-receipt.ts"),
    load("/lib/accuracy.ts"),
    load("/lib/highlight-match.ts"),
    load("/lib/word-boxes.ts"),
    load("/lib/model.ts"),
    load("/lib/receipt-fields.ts"),
    load("/lib/field-source.ts"),
    load("/lib/field-edit.ts"),
  ]);

  return { server, extract, accuracy, match, boxes, model, fields, source, edit };
}

/* ------------------------------------------------------------------ *
 * The fixtures
 * ------------------------------------------------------------------ */

/** Every fixture in the directory, in file order, each with its label beside it. */
function readFixtures(directory) {
  return readdirSync(directory)
    .filter((name) => name.endsWith(".jpg"))
    .sort()
    .map((name) => {
      const labelPath = join(directory, `${basename(name, ".jpg")}.label.json`);
      const label = JSON.parse(readFileSync(labelPath, "utf8"));

      return {
        id: label.fixture,
        name,
        path: join(directory, name),
        layout: label.layout,
        degradations: label.degradations,
        expected: label.receipt,
      };
    });
}

/* ------------------------------------------------------------------ *
 * The extraction
 * ------------------------------------------------------------------ */

/** The limiter stand-in: the one part of the route's path this harness skips. */
const allowEveryCall = async () => ({ status: "allowed", remaining: 0, resetAt: 0 });

/** One fixture as the multipart request the route reads, built the way the page posts it. */
function fixtureRequest(fixture) {
  const body = new FormData();
  body.set("file", new File([readFileSync(fixture.path)], fixture.name, { type: "image/jpeg" }));

  return new Request("https://fixtures.invalid/api/extract", { method: "POST", body });
}

/**
 * Runs one fixture through the real extraction, retrying only a call that never
 * reached the model's reading.
 */
async function extractFixture(extractReceipt, fixture) {
  const retries = [];

  for (let attempt = 0; ; attempt += 1) {
    const outcome = await extractReceipt(fixtureRequest(fixture), undefined, allowEveryCall);

    if (outcome.status === 200) {
      return { receipt: outcome.body, error: null, retries };
    }

    const code = outcome.body?.error?.code ?? "unknown";

    if (code === RETRYABLE_CODE && attempt < RETRY_LIMIT) {
      retries.push(code);
      continue;
    }

    return { receipt: null, error: code, retries };
  }
}

/* ------------------------------------------------------------------ *
 * The word boxes
 * ------------------------------------------------------------------ */

/**
 * Boots one tesseract worker for the whole run, pointed at the committed language
 * data rather than at a CDN.
 */
async function startOcr() {
  const loaded = await import("tesseract.js");
  const { createWorker, OEM } = loaded.default ?? loaded;

  return createWorker("eng", OEM.LSTM_ONLY, {
    langPath: LANG_PATH,
    gzip: true,
    cacheMethod: "none",
  });
}

/**
 * The text lines of one fixture, in the image's own pixels.
 *
 * `readTextLines` is the app's own reader, so the grouping the matcher scores is
 * the grouping the browser hands it. The browser also downscales an image whose
 * long edge passes `OCR_LONG_EDGE`; every fixture sits well inside it, and a
 * fixture that did not would be refused above rather than measured on a different
 * basis from the one a visitor gets.
 */
async function measureFixture(worker, readTextLines, fixture) {
  const { data } = await worker.recognize(fixture.path, {}, { blocks: true, text: false });
  return readTextLines(data);
}

/** Refuses a run whose fixtures the browser pass would have downscaled. */
async function checkFixtureSizes(fixtures, longEdge) {
  const sharp = (await import("sharp")).default;

  for (const fixture of fixtures) {
    const { width, height } = await sharp(fixture.path).metadata();

    if (Math.max(width, height) > longEdge) {
      throw new Error(
        `${fixture.name} is ${width}x${height}, past the ${longEdge}-pixel edge the browser pass` +
          " downscales at. Teach this harness the same downscale before measuring it.",
      );
    }
  }
}

/* ------------------------------------------------------------------ *
 * The highlight evidence
 * ------------------------------------------------------------------ */

/**
 * The best-scoring region for one text, with no threshold applied.
 *
 * `bestMatch` in `lib/highlight-match.ts` stops at `MATCH_THRESHOLD`, which is the
 * value under judgment here, so the threshold cannot also be the filter the
 * evidence is gathered through. This reuses that module's own `candidateRuns`,
 * `similarity` and `tokenCount` and drops the one comparison, keeping its tie
 * break: the earliest candidate of equal score wins.
 */
function bestScoringRegion(match, text, lines) {
  if (text === null || match.normalizeForMatch(text) === "") {
    return null;
  }

  let best = null;

  for (const candidate of match.candidateRuns(lines, match.tokenCount(text) + match.CANDIDATE_SLACK)) {
    const score = match.similarity(text, candidate.text);

    if (best === null || score > best.score) {
      best = { region: candidate.region, score, text: candidate.text };
    }
  }

  return best;
}

/**
 * One sample per field whose `sourceText` both sides carry.
 *
 * The ground truth is the label's own printed characters run against the measured
 * words, which says where the field sits on the image with no reference to
 * anything the model returned. The sample's score is what the matcher reached for
 * the `sourceText` the model quoted, and its verdict is whether that region is the
 * truth region. A threshold is applied nowhere here, so the curve can be drawn at
 * any value afterwards.
 */
function highlightSamples({ match, source, edit }, fixture, receipt, lines) {
  const samples = [];

  for (const address of edit.editableAddresses(fixture.expected)) {
    const printed = source.sourceTextFor(fixture.expected, address);

    if (printed === null) {
      continue;
    }

    const quoted = receipt === null ? null : source.sourceTextFor(receipt, address);
    const truth = bestScoringRegion(match, printed, lines);
    const found = quoted === null ? null : bestScoringRegion(match, quoted, lines);

    samples.push({
      fixtureId: fixture.id,
      field: edit.addressKey(address),
      printed,
      quoted,
      truthScore: truth === null ? 0 : truth.score,
      score: found === null ? 0 : found.score,
      matchedText: found === null ? null : found.text,
      truthRegion: truth?.region ?? null,
      matchedRegion: found?.region ?? null,
      /* A field the model quoted nothing for offers the matcher nothing to score,
       * so it is counted apart from a quote that scored badly. */
      verdict:
        found === null
          ? "unquoted"
          : judgeRegion(truth === null ? 0 : truth.score, truth?.region ?? null, found.region),
    });
  }

  return samples;
}

/* ------------------------------------------------------------------ *
 * The report
 * ------------------------------------------------------------------ */

/** A fixture's degradations as the report prints them. */
function degradationList(degradations) {
  return degradations.length === 0 ? "clean" : degradations.join(", ");
}

/** Every field a fixture read wrong, named with what the label held and what came back. */
function missLines(comparison) {
  return comparison.fields
    .filter((field) => !field.matched)
    .map((field) => `${field.field}: label ${show(field.expected)}, read ${show(field.actual)}`);
}

/**
 * One value as a table cell.
 *
 * A model quote can carry a real newline, and a newline inside a cell ends the
 * row, so it is printed as the two characters a reader can see.
 */
function show(value) {
  if (value === null) {
    return "null";
  }

  return `\`${value.replaceAll("\n", "\\n")}\``;
}

/** Matched over compared, for the fixtures a key function groups together. */
function tallyBy(comparisons, byId, keysOf) {
  const tallies = new Map();

  for (const comparison of comparisons) {
    for (const key of keysOf(byId.get(comparison.fixtureId))) {
      const tally = tallies.get(key) ?? { matched: 0, compared: 0, fixtures: 0 };
      tally.fixtures += 1;
      tally.matched += comparison.fields.filter((field) => field.matched).length;
      tally.compared += comparison.fields.length;
      tallies.set(key, tally);
    }
  }

  return [...tallies.entries()].sort((a, b) => a[1].matched / a[1].compared - b[1].matched / b[1].compared);
}

function renderReport(run) {
  const { figures, comparisons, fixtures, curve, confidence, model, cost } = run;

  const byId = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const lines = [];

  lines.push("# Accuracy report");
  lines.push("");
  lines.push(
    `Measured on ${run.runDate} against \`${model.id}\`, the model \`lib/model.ts\` pins, over the` +
      ` ${figures.fixtureCount} fixtures in \`fixtures/\`.`,
  );
  lines.push("");
  lines.push(
    "The fixtures are generated and then damaged in code rather than photographed." +
      " `scripts/make-fixtures.mjs` draws each receipt and writes its label in the same run from the" +
      " same values, so no label was transcribed by hand, and `scripts/fixture-degrade.mjs` applies the" +
      " fading, blur, rotation, perspective, cropping, noise and JPEG compression each label names." +
      " Synthetic fading is not thermal paper, so these figures are optimistic about the worst real" +
      " case, and the set carries no handwriting and no language but English.",
  );
  lines.push("");
  lines.push(
    "`scripts/measure-accuracy.mjs` produced every number below. It calls `extractReceipt` in" +
      " `lib/extract-receipt.ts` directly, the same function the route calls, so the model, the prompt" +
      " and the server-side Zod validation are the ones the deployed app runs. One part of that path is" +
      " deliberately skipped: the per-address rate limiter, because a forty-call run would spend the" +
      " hourly allowance the deployed app shares and the counter has nothing to do with how the model" +
      " reads a receipt. Nothing else was stubbed, no answer was cached and no bad reading was retried.",
  );
  lines.push("");
  lines.push("## The three figures");
  lines.push("");
  lines.push("| Figure | Value | Matched | Compared |");
  lines.push("| --- | --- | --- | --- |");
  lines.push(
    `| Field accuracy, every field | ${percent(figures.fieldAccuracy)} |` +
      ` ${figures.matchedFields} | ${figures.comparedFields} |`,
  );
  lines.push(`| \`total\` | ${percent(figures.totalAccuracy)} | ${run.groups.total.matched} | ${run.groups.total.compared} |`);
  lines.push(`| \`date\` | ${percent(figures.dateAccuracy)} | ${run.groups.date.matched} | ${run.groups.date.compared} |`);
  lines.push("");
  lines.push(
    `${figures.refusedCount} of ${figures.fixtureCount} fixtures came back refused or failed, and every` +
      " field of a refused fixture counts wrong rather than leaving the denominator.",
  );
  lines.push("");
  lines.push("## What this run shows");
  lines.push("");
  lines.push(run.runFinding);
  lines.push("");
  lines.push("## Per field");
  lines.push("");
  lines.push(
    "Every flat field is its own row. `taxes` rolls up the label and the amount of every tax line," +
      " and `lineItems` rolls up the four cells of every item, counted per cell so a long receipt" +
      " carries the weight its length deserves.",
  );
  lines.push("");
  lines.push("| Field | Accuracy | Matched | Compared |");
  lines.push("| --- | --- | --- | --- |");

  for (const [field, tally] of run.groupRows) {
    lines.push(`| \`${field}\` | ${percent(tally.matched / tally.compared)} | ${tally.matched} | ${tally.compared} |`);
  }

  lines.push("");
  lines.push("## Where the damage shows");
  lines.push("");
  lines.push(
    "The same fields, grouped two ways. A degradation row counts every fixture carrying that damage," +
      " and a fixture carrying four of them appears in four rows, so the rows overlap and none of them" +
      " isolates one cause. The layout rows do not overlap.",
  );
  lines.push("");
  lines.push("| Layout | Fields right | Compared | Fixtures |");
  lines.push("| --- | --- | --- | --- |");

  for (const [layout, tally] of tallyBy(comparisons, byId, (fixture) => [fixture.layout])) {
    lines.push(`| ${layout} | ${percent(tally.matched / tally.compared)} | ${tally.compared} | ${tally.fixtures} |`);
  }

  lines.push("");
  lines.push("| Degradation | Fields right | Compared | Fixtures |");
  lines.push("| --- | --- | --- | --- |");

  const damageKeys = (fixture) =>
    fixture.degradations.length === 0 ? ["none (clean render)"] : fixture.degradations;

  for (const [damage, tally] of tallyBy(comparisons, byId, damageKeys)) {
    lines.push(`| ${damage} | ${percent(tally.matched / tally.compared)} | ${tally.compared} | ${tally.fixtures} |`);
  }

  lines.push("");
  lines.push("| Damages on the fixture | Fields right | Compared | Fixtures |");
  lines.push("| --- | --- | --- | --- |");

  for (const [count, tally] of tallyBy(comparisons, byId, (fixture) => [fixture.degradations.length]).sort(
    (a, b) => a[0] - b[0],
  )) {
    lines.push(`| ${count} | ${percent(tally.matched / tally.compared)} | ${tally.compared} | ${tally.fixtures} |`);
  }

  lines.push("");
  lines.push("## Every fixture");
  lines.push("");
  lines.push(
    "One row per fixture, naming its degradations and every field it read wrong. A field not named in" +
      " the misses column matched the label exactly, under the rules `lib/accuracy.ts` states: the" +
      " decimal string and the ISO date compared exactly, a null matching only a null, and the merchant" +
      " name and an item description compared case-insensitively with whitespace collapsed.",
  );
  lines.push("");
  lines.push("| Fixture | Layout | Degradations | Fields right | Misses |");
  lines.push("| --- | --- | --- | --- | --- |");

  for (const comparison of comparisons) {
    const fixture = byId.get(comparison.fixtureId);
    const matched = comparison.fields.filter((field) => field.matched).length;
    const misses = missLines(comparison);
    const note = comparison.refused ? " **refused or failed**" : "";

    lines.push(
      `| \`${comparison.fixtureId}\` | ${fixture.layout} | ${degradationList(fixture.degradations)} |` +
        ` ${matched}/${comparison.fields.length}${note} | ${misses.length === 0 ? "none" : misses.join("<br>")} |`,
    );
  }

  lines.push("");
  lines.push("## The match threshold");
  lines.push("");
  lines.push(
    "`MATCH_THRESHOLD` in `lib/highlight-match.ts` is the similarity a candidate run of words has to" +
      " reach before the app marks it as a field's region. The evidence below is the real OCR pass:" +
      " this harness boots the same tesseract.js at the same `LSTM_ONLY` setting against the same" +
      " committed `public/tesseract/eng.traineddata.gz` the browser fetches, and reads its output" +
      " through `readTextLines` in `lib/word-boxes.ts`. Every fixture's long edge sits inside" +
      " `OCR_LONG_EDGE`, so the browser would hand tesseract the same file untouched. The one" +
      " difference from a visitor's pass is the runtime: Node rather than a web worker.",
  );
  lines.push("");
  lines.push(
    `Each sample is one field whose \`sourceText\` the label and the model both carry. Where the` +
      " field's printed characters match the measured words at " +
      `${TRUTH_TRUSTED} or better, the region those words cover is the ground truth, and a highlight is` +
      ` right when it covers at least ${REGION_CONTAINMENT_BAR} of that region, so a mark that takes in the` +
      " printed label beside the value counts as right and a mark that misses the value counts as wrong." +
      ` Below ${TRUTH_ABSENT} the pass read nothing resembling the printed text, so no region on the` +
      " image is that text and any highlight admitted there is wrong. Between the two the harness says" +
      " nothing, and those samples are listed apart. Where a receipt prints the same characters twice," +
      " the check cannot tell the two apart, and the matcher documents preferring the earlier.",
  );
  lines.push("");
  lines.push(
    `${run.sampleCounts.total} samples: ${run.sampleCounts.scored} with a quote from the model to score,` +
      ` ${run.sampleCounts.unquoted} where the model quoted nothing, ${run.sampleCounts.unclear} in the` +
      " unclear band of the truth score.",
  );
  lines.push("");
  lines.push("| Threshold | Right, shown | Wrong, shown | Right, withheld | Wrong, withheld | Unclear, shown |");
  lines.push("| --- | --- | --- | --- | --- | --- |");

  for (const row of curve) {
    const mark = row.threshold === run.matchThreshold ? " **(shipped)**" : "";
    lines.push(
      `| ${row.threshold}${mark} | ${row.admittedRight} | ${row.admittedWrong} |` +
        ` ${row.refusedRight} | ${row.refusedWrong} | ${row.admittedUnclear} |`,
    );
  }

  lines.push("");
  lines.push(run.matchFinding);
  lines.push("");

  if (run.wrongAtShipped.length > 0) {
    const exact = run.wrongAtShipped.filter((sample) => sample.score === 1).length;
    lines.push(
      `Every wrong highlight the shipped threshold admitted. ${exact} of the ${run.wrongAtShipped.length}` +
        " scored an exact 1, which means the matcher found the model's quoted characters on the image and" +
        " marked them: the mark is wrong because the model quoted the wrong characters, and no threshold" +
        " can refuse a perfect score.",
    );
    lines.push("");
    lines.push("| Fixture | Field | Score | Model quoted | Words marked | Label printed |");
    lines.push("| --- | --- | --- | --- | --- | --- |");

    for (const sample of run.wrongAtShipped) {
      lines.push(
        `| \`${sample.fixtureId}\` | \`${sample.field}\` | ${sample.score.toFixed(3)} |` +
          ` ${show(sample.quoted)} | ${show(sample.matchedText)} | ${show(sample.printed)} |`,
      );
    }

    lines.push("");
  }

  lines.push("## The review line");
  lines.push("");
  lines.push(
    `\`REVIEW_THRESHOLD\` in \`lib/receipt-fields.ts\` is ${run.reviewThreshold}: a field whose` +
      " confidence falls under it is flagged for the visitor to check. The question is whether a" +
      " confidence under that line predicts a wrong value at all, so every field is counted by which" +
      " side of the line its confidence fell and whether its value matched the label.",
  );
  lines.push("");
  lines.push("| | Value wrong | Value right |");
  lines.push("| --- | --- | --- |");
  lines.push(`| Confidence below ${run.reviewThreshold} | ${confidence.belowWrong} | ${confidence.belowRight} |`);
  lines.push(
    `| Confidence ${run.reviewThreshold} or above | ${confidence.atOrAboveWrong} | ${confidence.atOrAboveRight} |`,
  );
  lines.push("");
  lines.push(
    `${confidence.withConfidence} fields carried a confidence and ${confidence.withoutConfidence} carried` +
      ` none. The lowest confidence the model reported anywhere in the run was` +
      ` ${confidence.lowest === null ? "none at all" : confidence.lowest}, and the lowest it reported on a` +
      ` field it read wrong was ${confidence.lowestWrong === null ? "none, because no wrong field carried one" : confidence.lowestWrong}.`,
  );
  lines.push("");
  lines.push("| Confidence band | Fields | Of those, wrong |");
  lines.push("| --- | --- | --- |");

  for (const bucket of confidence.buckets) {
    if (bucket.count > 0) {
      lines.push(`| ${bucket.from.toFixed(1)} to ${bucket.to.toFixed(1)} | ${bucket.count} | ${bucket.wrong} |`);
    }
  }

  lines.push("");
  lines.push(run.reviewFinding);
  lines.push("");
  lines.push("## What the run cost");
  lines.push("");
  lines.push(cost);
  lines.push("");

  return `${lines.join("\n")}\n`;
}

/* ------------------------------------------------------------------ *
 * The run
 * ------------------------------------------------------------------ */

function readFlag(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

/** What the operator reads before any money is spent. */
function announce(calls, model, price, readDate) {
  const brackets = costBrackets(calls, price)
    .map((bracket) => `${bracket.inputTokens.toLocaleString("en-US")} tokens a call is $${bracket.dollars.toFixed(2)}`)
    .join(", ");

  console.log(
    `This run makes ${calls} model ${calls === 1 ? "call" : "calls"}, one per fixture, against ${model}.`,
  );
  console.log(
    `lib/model.ts records $${price.toFixed(2)} per million input tokens for it, read off OpenAI's` +
      ` published model list on ${readDate}.`,
  );
  console.log(
    `Each call sends the extraction prompt and one receipt image at detail high. The call the route` +
      ` makes reports no token usage back, so the cost reads as arithmetic over the price rather than` +
      ` as a prediction: ${brackets}.`,
  );
  console.log("The measured spend is on OpenAI's usage page for today's date.");
  console.log("The rate limiter is stubbed out, so this run spends none of the hourly allowance.");
  console.log("");
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const directory = readFlag("--fixtures", FIXTURE_DIR);
  const outPath = readFlag("--out", REPORT_PATH);
  const limit = Number(readFlag("--limit", "0")) || 0;

  if (!dryRun && !process.env.OPENAI_API_KEY) {
    console.error(
      "OPENAI_API_KEY is not set, so this harness cannot run the real extraction and refuses to" +
        " measure anything. Set it, or pass --dry-run to exercise everything but the model call.",
    );
    process.exitCode = 1;
    return;
  }

  const app = await loadApp();
  const { extract, accuracy, match, boxes, model, fields, source, edit } = app;

  const modelSource = readFileSync("lib/model.ts", "utf8");
  const price = parseInputPricePerMillion(modelSource);
  const readDate = parsePriceReadDate(modelSource);

  if (price === null || readDate === null) {
    await app.server.close();
    throw new Error(
      "lib/model.ts no longer states the input price and the date it was read, so this harness cannot" +
        " say what a run costs without inventing a number. Put the price back, or read it off" +
        " OpenAI's model list and record it there first.",
    );
  }

  let fixtures = readFixtures(directory);
  if (limit > 0) {
    fixtures = fixtures.slice(0, limit);
  }

  await checkFixtureSizes(fixtures, boxes.OCR_LONG_EDGE);

  if (dryRun) {
    console.log(
      `Dry run over ${fixtures.length} fixtures. No model call is made, the label stands in for the` +
        " answer, and nothing is written. The figures below measure nothing.",
    );
    console.log("");
  } else {
    announce(fixtures.length, model.EXTRACTION_MODEL, price, readDate);
  }

  const worker = await startOcr();
  const comparisons = [];
  const samples = [];
  const retried = [];
  const failures = [];

  try {
    for (const fixture of fixtures) {
      const lines = await measureFixture(worker, boxes.readTextLines, fixture);

      const { receipt, error, retries } = dryRun
        ? { receipt: fixture.expected, error: null, retries: [] }
        : await extractFixture(extract.extractReceipt, fixture);

      if (retries.length > 0) {
        retried.push({ id: fixture.id, attempts: retries.length });
      }
      if (error !== null) {
        failures.push({ id: fixture.id, error });
      }

      const comparison = accuracy.compareReceipt(fixture.id, fixture.expected, receipt);
      comparisons.push(comparison);
      samples.push(...highlightSamples({ match, source, edit }, fixture, receipt, lines));

      const right = comparison.fields.filter((field) => field.matched).length;
      console.log(
        `${fixture.id} ${fixture.name}: ${right}/${comparison.fields.length} fields` +
          `${error === null ? "" : ` (${error})`}${comparison.refused ? " (refused)" : ""}`,
      );
    }
  } finally {
    await worker.terminate();
    await app.server.close();
  }

  const figures = accuracy.accuracyFigures(comparisons);
  const allFields = comparisons.flatMap((comparison) => comparison.fields);

  const groups = new Map();
  for (const field of allFields) {
    const tally = groups.get(field.group) ?? { matched: 0, compared: 0 };
    tally.compared += 1;
    if (field.matched) {
      tally.matched += 1;
    }
    groups.set(field.group, tally);
  }

  const scored = samples.filter((sample) => sample.verdict !== "unquoted");
  const curve = thresholdCurve(scored, CURVE_THRESHOLDS);
  const shipped = curve.find((row) => row.threshold === match.MATCH_THRESHOLD);
  const confidence = confidenceFindings(allFields, fields.REVIEW_THRESHOLD);

  const run = {
    runDate: new Date().toISOString().slice(0, 10),
    model: { id: model.EXTRACTION_MODEL },
    figures,
    comparisons,
    fixtures,
    samples,
    curve,
    confidence,
    groups: {
      total: groups.get("total") ?? { matched: 0, compared: 0 },
      date: groups.get("date") ?? { matched: 0, compared: 0 },
    },
    groupRows: [...groups.entries()].sort((a, b) => a[1].matched / a[1].compared - b[1].matched / b[1].compared),
    matchThreshold: match.MATCH_THRESHOLD,
    reviewThreshold: fields.REVIEW_THRESHOLD,
    sampleCounts: {
      total: samples.length,
      scored: scored.length,
      unquoted: samples.filter((sample) => sample.verdict === "unquoted").length,
      unclear: samples.filter((sample) => sample.verdict === "unclear").length,
    },
    wrongAtShipped: scored
      .filter((sample) => sample.verdict === "wrong" && sample.score >= match.MATCH_THRESHOLD)
      .sort((a, b) => b.score - a.score),
    /* The two findings are judgments, so the person who ran the harness writes them
     * into the report under these markers rather than the script asserting one. */
    runFinding: "<!-- finding: what this run shows -->",
    matchFinding: "<!-- finding: the match threshold -->",
    reviewFinding: "<!-- finding: the review line -->",
    cost: [
      `${fixtures.length} model calls at $${price.toFixed(2)} per million input tokens, the price`,
      `\`lib/model.ts\` records from OpenAI's published list on ${readDate}.`,
      "The call the route makes reports no token usage back, so the spend reads as arithmetic over that",
      `price: ${costBrackets(fixtures.length, price)
        .map((bracket) => `$${bracket.dollars.toFixed(2)} at ${bracket.inputTokens.toLocaleString("en-US")} input tokens a call`)
        .join(", ")}.`,
      "The billed figure for the run is on OpenAI's usage page for the run date.",
      retried.length === 0
        ? "No fixture was retried."
        : `Retried for a call that failed before the model answered: ${retried
            .map((entry) => `\`${entry.id}\` (${entry.attempts})`)
            .join(", ")}. No bad reading was retried.`,
    ].join(" "),
  };

  console.log("");
  console.log(`field accuracy ${percent(figures.fieldAccuracy)} (${figures.matchedFields}/${figures.comparedFields})`);
  console.log(`total ${percent(figures.totalAccuracy)}  date ${percent(figures.dateAccuracy)}`);
  console.log(
    `highlights at ${match.MATCH_THRESHOLD}: ${shipped.admittedRight} right shown, ${shipped.admittedWrong}` +
      ` wrong shown, ${shipped.refusedRight} right withheld, ${shipped.refusedWrong} wrong withheld`,
  );
  console.log(
    `confidence: lowest ${confidence.lowest}, below ${fields.REVIEW_THRESHOLD}:` +
      ` ${confidence.belowWrong} wrong and ${confidence.belowRight} right`,
  );
  if (failures.length > 0) {
    console.log(`failures: ${failures.map((entry) => `${entry.id} ${entry.error}`).join(", ")}`);
  }

  if (dryRun) {
    console.log("");
    console.log("Dry run, so no report was written.");
    return;
  }

  writeFileSync(outPath, renderReport(run), "utf8");
  console.log(`wrote ${outPath}`);

  /* The raw run goes beside the report only when someone asks for it, so a run
   * leaves one file in the repository and the rest wherever they pointed it. */
  if (process.env.ACCURACY_RUN_DIR) {
    const rawPath = join(process.env.ACCURACY_RUN_DIR, "accuracy-run.json");
    writeFileSync(rawPath, JSON.stringify(run, null, 1), "utf8");
    console.log(`wrote ${rawPath}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
