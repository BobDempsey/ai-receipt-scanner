# Proposal

## Why

The slice 9 fixture run measured 37 marks landing on the wrong words, and 29 of them are one field: `currency`. Asked for the characters it read the currency from, the model answers with the symbol and a whole address line, `$\nFairhaven Bay, OR 97000`, or with an invoice column heading, `AMOUNT EUR`. The matcher then does exactly what it is built to do, finds those words on the image, and marks the address or the heading. 25 of the 29 score a perfect 1.000, so no threshold short of one that refuses correct marks can refuse them, and `fixtures/REPORT.md` says so in its own words.

The value is not the problem. `currency` reads correctly on 40 of 40 fixtures. Only the region is wrong, and a one-character symbol repeated down a column of amounts is not a region a visitor gains anything from seeing marked.

## What Changes

- The app no longer marks a region for `currency`. The field stays readable, editable and exportable, and its value, its confidence and its `sourceText` are untouched in the schema, the panel and both exports.
- Selecting `currency` says the app does not mark this field, in a sentence of its own. It does not reuse the failed-match sentence, which would claim the pass looked for the text and missed it, nor the never-printed sentence, which would claim the receipt printed nothing.
- The rule lives in one place beside the matcher, so the region map and the panel's copy cannot disagree about which fields the app marks.
- No prompt change and no model rerun. The published accuracy figures measure what the model reads, not what the app marks, so they do not move and `lib/project-facts.ts` is not touched.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `highlighting`: a new requirement naming the fields the app declines to mark and what it says instead, and the existing "No match means no highlight" requirement gains the third absent case so the two worded-apart sentences become three.

## Impact

- `lib/highlight-match.ts`: the markable-field rule and its use in `buildRegionMap`.
- `components/ReceiptWorkspace.tsx`: a third entry in `NO_REGION_COPY` and the `selectionNote` branch that chooses it.
- Tests in `lib/highlight-match.test.ts` for the rule and the map.
- Nothing in `lib/receipt-schema.ts`, `lib/extract-receipt.ts`, the prompt, the exports or `lib/project-facts.ts`. `fixtures/REPORT.md` keeps its figures: it records what the run measured, and this change does not rerun it.
