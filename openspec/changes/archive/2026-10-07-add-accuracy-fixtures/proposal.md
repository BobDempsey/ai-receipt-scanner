# Proposal

## Why

Every page of this site states figures the code enforces and not one figure about how well the app reads a receipt, because nothing has ever measured it. The product spec has promised 40 labelled fixtures with field-level accuracy since the start, the About page says the measurement is the next piece of work, and three places are waiting to carry the same numbers. Until they exist, the project claims a capability it has never tested, and the 0.72 match threshold and the 0.8 review line are both judgments nobody has checked against evidence. This is slice 9, the last of the nine.

## What Changes

- Forty labelled receipt fixtures, generated the way the three samples were, so the expected values are exact by construction and nobody hand-labels anything.
- Each fixture is then damaged on purpose: fading, blur, rotation, perspective, crop, noise and heavy JPEG compression, in named degradations rather than a random smear, so a failure can be traced to the thing that caused it. A clean set would produce a near-perfect figure that says almost nothing about a phone photograph.
- A harness that runs every fixture through the real extraction path and compares the answer to the label field by field, with money compared as decimal strings rather than as numbers.
- Three published figures: field accuracy across all fields, and `total` and `date` broken out, because those two are what a person checks first. The per-field breakdown is written to a report the repo keeps, so the headline figures have something behind them.
- The figures land in the landing page's stat tiles, the About page and the README in this one change, which is the rule the handoff already records about the three agreeing.
- The 0.72 match threshold and the 0.8 review line are checked against the fixtures and either confirmed or changed, which is what slices 4 and 7 said this slice would settle.
- The run costs real money and real time, so it is a script a person invokes, never part of `npm test` and never part of the build.

## Capabilities

### New Capabilities

- `accuracy`: what the project measures, how it measures it, and what it is allowed to claim. It owns the fixture set, the comparison rules, the figures and the rule that the three places agree. This is a durable behaviour of the project rather than a one-off task, because every model swap and every prompt change has to rerun it.

### Modified Capabilities

None. The rule that the stat tiles, the About page and the README state the same figures belongs to `accuracy`, which owns what the project may claim, rather than being duplicated into `site-chrome`. The `extraction` spec already requires that a model swap reruns the accuracy figures in the same change; this slice is what finally gives that requirement something to rerun.

## Impact

- New `fixtures/` holding the 40 generated receipts and their labels, with the generator under `scripts/`.
- New `scripts/measure-accuracy.mjs`, the harness, writing a report the repo keeps.
- New `lib/accuracy.ts` for the pure comparison: what counts as a match per field type, how an absent value compares, and how the figures are computed.
- `lib/project-facts.ts` gains the three figures, so the tiles, the About page and the README read one source.
- `components/StatTiles.tsx`, `app/about/page.tsx` and `README.md` carry them.
- Possibly `lib/highlight-match.ts` and `lib/receipt-fields.ts`, if the fixtures move the two thresholds.
- No change to the route, the arithmetic, the editing, the export or the caps.
