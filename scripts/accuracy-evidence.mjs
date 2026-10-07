/**
 * The pure arithmetic behind the accuracy harness.
 *
 * `scripts/measure-accuracy.mjs` reads the fixtures, calls the model, runs the
 * OCR pass and writes the report. Everything here is a function over values, so
 * it can be read and checked without a key, a worker or a file on disk, and so a
 * reader who distrusts a figure in `fixtures/REPORT.md` can follow the arithmetic
 * that produced it.
 *
 * Nothing here compares a receipt to a label. `lib/accuracy.ts` owns every
 * comparison rule and the harness calls it; this module holds the two things that
 * module has no business knowing about: what a run costs, and how a highlight is
 * judged against the words the OCR pass measured.
 */

/* ------------------------------------------------------------------ *
 * What the run costs
 * ------------------------------------------------------------------ */

/**
 * The input price the repo records for a model, in dollars per million tokens.
 *
 * The price is parsed out of `lib/model.ts` rather than written here, because that
 * module records where the figure came from and when it was read, and a number
 * typed into a script is a number nobody can check. A module that no longer states
 * a price returns null, and the harness then refuses to print a cost it invented.
 */
export function parseInputPricePerMillion(source) {
  const match = /\$([\d.]+) per million input tokens/.exec(source);
  return match ? Number(match[1]) : null;
}

/** The date `lib/model.ts` records as the day the price and the features were read. */
export function parsePriceReadDate(source) {
  const match = /read off OpenAI's published model list on (\d{4}-\d{2}-\d{2})/.exec(source);
  return match ? match[1] : null;
}

/**
 * What a run of `calls` costs at a given input price, bracketed by token count.
 *
 * The harness cannot know how many tokens an image costs before a call returns,
 * and the route's own model call hands back no usage, so a single predicted figure
 * would be a guess dressed as a measurement. A bracket states the arithmetic and
 * lets the reader place the run inside it: calls times tokens times price over a
 * million.
 */
export function costBrackets(calls, pricePerMillion, tokenCounts = [1000, 5000, 10000]) {
  return tokenCounts.map((inputTokens) => ({
    inputTokens,
    dollars: (calls * inputTokens * pricePerMillion) / 1_000_000,
  }));
}

/* ------------------------------------------------------------------ *
 * Whether a highlight landed on the right words
 * ------------------------------------------------------------------ */

/** How much of a rectangle sits inside another, as a fraction of the first one's area. */
export function rectContainment(inner, outer) {
  if (!inner || !outer) {
    return 0;
  }

  const area = inner.width * inner.height;

  if (area <= 0) {
    return 0;
  }

  const left = Math.max(inner.left, outer.left);
  const top = Math.max(inner.top, outer.top);
  const right = Math.min(inner.left + inner.width, outer.left + outer.width);
  const bottom = Math.min(inner.top + inner.height, outer.top + outer.height);

  if (right <= left || bottom <= top) {
    return 0;
  }

  return ((right - left) * (bottom - top)) / area;
}

/**
 * How much of the field's own printed words the mark has to cover before the
 * highlight counts as the right region.
 *
 * The measure is containment rather than overlap, because the model often quotes
 * the printed label beside the value ("SUBTOTAL $66.95" where the label records
 * "$66.95"), and the words it quoted are the words the app marks. A visitor reads
 * a mark over the whole subtotal line as correct, so the question is whether the
 * value is under the mark at all, not whether the mark is the same size as the
 * value. Scoring that as a miss would report dozens of wrong highlights for a
 * behaviour nobody would call wrong, and no threshold could change it, because
 * those candidates score an exact 1.
 *
 * Containment cannot be gamed by a mark that covers everything: `candidateRuns`
 * caps a run at the `sourceText`'s token count plus two and never crosses a
 * printed line, so the widest mark on offer is a few words of one line.
 */
export const REGION_CONTAINMENT_BAR = 0.5;

/**
 * How well the label's own printed text has to match the measured words before
 * the harness trusts the region it found as ground truth.
 *
 * The label states exactly what the paper printed, so running that string against
 * the word boxes says where on the image the field sits, with no reference to
 * anything the model returned. At 0.9 or better the words are that text, and the
 * region they cover is the answer a highlight has to land on. Below 0.5 the pass
 * read nothing resembling it, so no region on the image is that text and any
 * highlight admitted there marks something else. Between the two the harness
 * cannot say, and those fields are counted apart rather than guessed at.
 */
export const TRUTH_TRUSTED = 0.9;
export const TRUTH_ABSENT = 0.5;

/**
 * The verdict on one field's highlight, before any threshold is applied.
 *
 * `right` and `wrong` are the two the threshold is judged on. `unclear` is the
 * middle band of the truth score, kept out of the tally and counted in the report,
 * because a field whose printed text the OCR pass half read cannot say whether a
 * region was correct.
 */
export function judgeRegion(truthScore, truthRegion, matchedRegion) {
  if (truthScore >= TRUTH_TRUSTED) {
    return rectContainment(truthRegion, matchedRegion) >= REGION_CONTAINMENT_BAR ? "right" : "wrong";
  }
  if (truthScore < TRUTH_ABSENT) {
    /* Nothing on the image reads as this field's printed text, so whatever the
     * matcher found is some other words. */
    return "wrong";
  }
  return "unclear";
}

/**
 * What each candidate threshold would admit and refuse, over the measured sample.
 *
 * One sample per field carrying a `sourceText` on both sides: the best score the
 * matcher reached with no threshold applied, and the verdict on the region that
 * score belongs to. A threshold admits every sample scoring at or above it, so the
 * four counts are what the threshold buys and what it costs: correct highlights
 * shown, wrong highlights shown, correct highlights withheld, wrong highlights
 * withheld.
 */
export function thresholdCurve(samples, thresholds) {
  return thresholds.map((threshold) => {
    const counts = {
      threshold,
      admittedRight: 0,
      admittedWrong: 0,
      refusedRight: 0,
      refusedWrong: 0,
      admittedUnclear: 0,
      refusedUnclear: 0,
    };

    for (const sample of samples) {
      const admitted = sample.score >= threshold;

      if (sample.verdict === "unclear") {
        counts[admitted ? "admittedUnclear" : "refusedUnclear"] += 1;
        continue;
      }

      if (sample.verdict === "right") {
        counts[admitted ? "admittedRight" : "refusedRight"] += 1;
      } else {
        counts[admitted ? "admittedWrong" : "refusedWrong"] += 1;
      }
    }

    return counts;
  });
}

/* ------------------------------------------------------------------ *
 * Whether a low confidence predicts a wrong value
 * ------------------------------------------------------------------ */

/**
 * What the run says about the review line.
 *
 * The question the report has to answer is whether a confidence under the line
 * predicts a wrong value at all, so the counts are the four corners of that: the
 * fields under the line that were wrong and right, and the fields at or above it
 * that were wrong and right. A line that never fires shows as a zero in the first
 * two, with `lowest` naming the nearest the model ever came to it.
 */
export function confidenceFindings(fields, reviewThreshold) {
  const scored = fields.filter((field) => typeof field.confidence === "number");

  const findings = {
    withConfidence: scored.length,
    withoutConfidence: fields.length - scored.length,
    belowWrong: 0,
    belowRight: 0,
    atOrAboveWrong: 0,
    atOrAboveRight: 0,
    lowest: null,
    lowestWrong: null,
    buckets: [],
  };

  for (const field of scored) {
    const below = field.confidence < reviewThreshold;
    const key = below
      ? field.matched
        ? "belowRight"
        : "belowWrong"
      : field.matched
        ? "atOrAboveRight"
        : "atOrAboveWrong";
    findings[key] += 1;

    if (findings.lowest === null || field.confidence < findings.lowest) {
      findings.lowest = field.confidence;
    }
    if (!field.matched && (findings.lowestWrong === null || field.confidence < findings.lowestWrong)) {
      findings.lowestWrong = field.confidence;
    }
  }

  /* Ten bands of a tenth each, so a reader can see where the model's confidences
   * actually sit rather than reading a mean that hides the shape. */
  for (let step = 0; step < 10; step += 1) {
    const from = step / 10;
    const to = (step + 1) / 10;
    const inBand = scored.filter(
      (field) => field.confidence >= from && (to === 1 ? field.confidence <= 1 : field.confidence < to),
    );

    findings.buckets.push({
      from,
      to,
      count: inBand.length,
      wrong: inBand.filter((field) => !field.matched).length,
    });
  }

  return findings;
}

/** A ratio as a percentage with one decimal place, the way the report prints every figure. */
export function percent(ratio) {
  return `${(ratio * 100).toFixed(1)}%`;
}
