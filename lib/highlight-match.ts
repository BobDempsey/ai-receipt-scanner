import { editableAddresses, addressKey, type FieldAddress } from "./field-edit";
import { sourceTextFor } from "./field-source";
import type { Receipt } from "./receipt-schema";
import type { Rect, TextLine, WordBox } from "./word-boxes";

/**
 * How a field's `sourceText` finds the printed words it was read from.
 *
 * The model returns no coordinates and the app asks it for none, because numbers
 * invented to look precise are worse than an absent mark. What the app has
 * instead is the text the model quotes and the words the OCR pass measured, so
 * this module scores one against the other and takes the best candidate above a
 * threshold.
 *
 * Every function here is pure. The workspace builds the region map inside a
 * `useMemo` over the receipt and the boxes, so nothing below caches a result,
 * mutates an argument or reads anything but its own arguments. A line item
 * removal then rebuilds the map from the receipt that now exists, with no index
 * remapping to get wrong.
 */

/**
 * The similarity at which the app treats a candidate as the field's region.
 *
 * The value is provisional. At four characters it admits one wrong character and
 * refuses two; at the eleven of "TOTAL 42.00" it admits three. That is a
 * judgment rather than a measurement, and slice 9's 40 labelled fixtures are the
 * only evidence that can settle it: running the matcher over them is what
 * confirms 0.72 or replaces it, and the replacement is this one line. The
 * threshold sits beside the measure rather than in a config file because neither
 * means anything without the other.
 */
export const MATCH_THRESHOLD = 0.72;

/** How many words past the `sourceText`'s own token count a candidate run may hold. */
export const CANDIDATE_SLACK = 2;

/** A matched region, in the pixel coordinates of the image the pass measured. */
export type HighlightRegion = Rect;

/** One run of adjacent words the matcher scores, and the region it covers. */
export type MatchCandidate = {
  /** The words of the run joined by single spaces, before normalization. */
  readonly text: string;
  readonly region: HighlightRegion;
};

/** The region a field matched, with the score that won it. */
export type FieldMatch = {
  readonly region: HighlightRegion;
  readonly score: number;
};

/**
 * Both sides of the comparison, reduced to the characters that carry meaning.
 *
 * Case goes, whitespace goes, and so does every punctuation mark but the decimal
 * point, so "TOTAL 42.00" and the two boxes "TOTAL:" and "42.00" reduce to the
 * same text and the comparison stops depending on how the receipt spaced or
 * punctuated the value.
 *
 * The decimal point survives because "4200" and "42.00" are different amounts
 * and the measure may not read them as one. A period the receipt printed for
 * some other reason therefore survives too, which costs a fraction of a point on
 * a candidate that carries one and is the trade worth taking: a thousands
 * separator misread as a decimal point is the failure that matters here.
 */
export function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}.]/gu, "");
}

/**
 * Levenshtein distance over two rows rather than a full matrix.
 *
 * A receipt line is short and the matcher runs a few thousand of these per
 * rebuild, so the two-row form keeps the allocation proportional to the shorter
 * string instead of to the product of the two.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (a.length === 0) {
    return b.length;
  }
  if (b.length === 0) {
    return a.length;
  }

  let previous = Array.from({ length: b.length + 1 }, (_, column) => column);
  let current = new Array<number>(b.length + 1);

  for (let row = 1; row <= a.length; row += 1) {
    current[0] = row;

    for (let column = 1; column <= b.length; column += 1) {
      const substitution = previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1);
      current[column] = Math.min(current[column - 1] + 1, previous[column] + 1, substitution);
    }

    const finished = previous;
    previous = current;
    current = finished;
  }

  return previous[b.length];
}

/**
 * The normalized edit-distance ratio of two texts, from 0 to 1.
 *
 * Both sides are normalized first, then scored as `1 - distance / max(len)`, so
 * an exact match is 1 and a four-character token with one character wrong is
 * 0.75. Levenshtein answers the failure that actually happens, which is a
 * character the pass read wrong or dropped ("T0TAL" for "TOTAL", "l" for "1"),
 * and it needs no tuning beyond the one threshold. A token-set measure was
 * rejected for scoring "24.00" against "42.00" the same as an exact match, and a
 * transposed digit has to score lower than the digits in the right order.
 *
 * Two texts that both normalize to nothing score 1, because they are the same
 * text. Nothing reaches the threshold on that account: `bestMatch` refuses an
 * empty `sourceText` before it scores anything, so the zero-length case cannot
 * divide by zero here or match a region there.
 */
export function similarity(a: string, b: string): number {
  const left = normalizeForMatch(a);
  const right = normalizeForMatch(b);
  const longest = Math.max(left.length, right.length);

  if (longest === 0) {
    return 1;
  }

  return 1 - levenshteinDistance(left, right) / longest;
}

/** How many whitespace-separated tokens a `sourceText` holds. */
export function tokenCount(sourceText: string): number {
  const trimmed = sourceText.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/** The rectangle covering every word of a run. */
function coveringRect(words: readonly WordBox[]): Rect {
  const left = Math.min(...words.map((word) => word.rect.left));
  const top = Math.min(...words.map((word) => word.rect.top));
  const right = Math.max(...words.map((word) => word.rect.left + word.rect.width));
  const bottom = Math.max(...words.map((word) => word.rect.top + word.rect.height));

  return { left, top, width: right - left, height: bottom - top };
}

/**
 * Every run of adjacent words the matcher will score.
 *
 * A run never crosses a line boundary. The words nearest a value often sit on
 * two printed lines, and a candidate spanning both would mark a region covering
 * text the field was not read from, so each line generates its own runs and the
 * matcher compares them separately.
 *
 * The window is capped at the `sourceText`'s token count plus two, so a long
 * line does not generate a quadratic number of windows. Two words of slack
 * covers the pass splitting one printed token into two boxes and a label the
 * model quoted with its amount.
 *
 * Runs come back in reading order, line by line and then left to right within a
 * line, which is what lets the tie break in `bestMatch` be a strict comparison.
 */
export function candidateRuns(
  lines: readonly TextLine[],
  maxWords: number,
): MatchCandidate[] {
  const candidates: MatchCandidate[] = [];

  if (maxWords < 1) {
    return candidates;
  }

  for (const line of lines) {
    const words = line.words;

    for (let start = 0; start < words.length; start += 1) {
      const longest = Math.min(maxWords, words.length - start);

      for (let length = 1; length <= longest; length += 1) {
        const run = words.slice(start, start + length);
        candidates.push({
          text: run.map((word) => word.text).join(" "),
          region: coveringRect(run),
        });
      }
    }
  }

  return candidates;
}

/**
 * The region one `sourceText` matched, or null.
 *
 * Null is an answer the app shows rather than a failure it hides. A candidate
 * below the threshold is a wrong region instead of a partial one, so nothing
 * falls back to the closest run, and the panel says in words that it could not
 * find the text on the image.
 *
 * Where two candidates score alike the earlier one on the page wins, because a
 * receipt that prints "42.00" on both the subtotal line and the total line gives
 * the matcher no way to tell them apart and marking both would claim two fields
 * were read from the same words. The comparison is strict, and `candidateRuns`
 * emits in reading order, so the first of equal scores is the one that survives.
 */
export function bestMatch(
  sourceText: string | null,
  lines: readonly TextLine[],
): FieldMatch | null {
  if (sourceText === null || normalizeForMatch(sourceText) === "") {
    return null;
  }

  let best: FieldMatch | null = null;

  for (const candidate of candidateRuns(lines, tokenCount(sourceText) + CANDIDATE_SLACK)) {
    const score = similarity(sourceText, candidate.text);

    if (score < MATCH_THRESHOLD) {
      continue;
    }

    if (best === null || score > best.score) {
      best = { region: candidate.region, score };
    }
  }

  return best;
}

/** The regions the app holds, keyed by the string form of a field address. */
export type RegionMap = ReadonlyMap<string, HighlightRegion>;

/**
 * Every field of one receipt matched against one box set, in a single pass.
 *
 * The map is derived rather than stored. Holding it in state would make it a
 * third thing to follow through a line item removal, beside the edited list and
 * the standing refusals that `remapAddressOnRemove` already follows; deriving it
 * from the receipt that now exists leaves no index to remap. The workspace calls
 * this inside a `useMemo`, so the function keeps no cache of its own, writes
 * nothing back into the receipt or the lines, and depends on nothing but its two
 * arguments.
 *
 * A field with no match contributes no entry, so an absent region reads the same
 * whether the receipt printed no value or the pass could not find the text. The
 * panel tells those two apart from the `sourceText` itself.
 */
export function buildRegionMap(receipt: Receipt, lines: readonly TextLine[]): RegionMap {
  const regions = new Map<string, HighlightRegion>();

  for (const address of editableAddresses(receipt)) {
    const match = bestMatch(sourceTextFor(receipt, address), lines);

    if (match !== null) {
      regions.set(addressKey(address), match.region);
    }
  }

  return regions;
}

/** The region at one address, which is what the overlay reads for the selected field. */
export function regionFor(regions: RegionMap, address: FieldAddress): HighlightRegion | null {
  return regions.get(addressKey(address)) ?? null;
}
