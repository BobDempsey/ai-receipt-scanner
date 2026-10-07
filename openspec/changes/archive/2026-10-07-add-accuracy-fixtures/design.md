# Design

## Context

See proposal.md for motivation. What exists today: `scripts/make-sample-receipts.mjs` renders a receipt from SVG through `sharp` and writes a JPEG, which is the generator this slice extends. `lib/extract-receipt.ts` takes a `Request`, checks the caps and the rate limit, calls the model once with `zodTextFormat` over the shared Zod schema, and validates the answer. `lib/project-facts.ts` already holds every published figure, derived from the constant behind it, and a test asserts no figure carries a percent sign and no label contains "accur", which this slice is the one change allowed to relax.

Two thresholds are waiting on this set: `MATCH_THRESHOLD` at 0.72, which slice 4 recorded as a judgment, and `REVIEW_THRESHOLD` at 0.8, which has never fired in production because the model has returned nothing under 0.96.

## Goals / Non-Goals

**Goals:**

- Forty fixtures whose labels cannot be wrong, because the same run produced both.
- A number that describes a photograph rather than a clean render.
- A report that makes every published figure checkable by someone who does not trust it.
- Evidence under the two thresholds, so neither stays an opinion.
- A measurement that costs money only when a person asks for it.

**Non-Goals:**

- Real photographs of real receipts. Synthetic damage is the trade this slice accepts, and it says so where the figures are published.
- Tuning the prompt to raise the number. If the prompt changes, the figures are rerun; this slice measures what ships rather than chasing a figure.
- Measuring latency or cost. Interesting, and not what the spec promised.
- A per-field figure on the landing page. The breakdown lives in the report and the About page; the tiles carry three.
- Running the harness in CI. Every run spends real money.

## Decisions

**The fixtures are generated, then damaged, and the damage is named per fixture.** Generating them makes the label exact by construction, which removes the one thing that makes a hand-labelled set untrustworthy: a transcription error reads as a model failure. Damaging them is what stops the number being a lie by omission, because a clean render measures the schema and the parsing rather than the reading. Each fixture records its degradations in its label file, so the report can say that `total` failed on nine fixtures and that seven of them carried heavy blur, which is a finding rather than a number.

**The degradations are a fixed matrix, not random.** Each fixture carries a named combination drawn from fading, blur, rotation, perspective, crop, noise and JPEG quality, with a seeded generator so a rerun produces the same images. A random smear would make two runs incomparable and would make a regression look like noise. The matrix is written so that roughly a quarter of the set is clean or near clean, which is what a scanned PDF or a careful photograph looks like, and the rest degrades from there.

**The harness calls `extractReceipt` directly rather than going over HTTP.** It is the same function the route calls, so the model, the prompt and the validation are the real ones, and skipping the HTTP hop keeps the rate limiter out of the way of a 40-call run. The rate limiter is the one part of the path deliberately not exercised, because measuring the model's reading does not need the counter and spending the hour's allowance on it would block the deployed app. That is the only deviation, and the report states it.

**A refused fixture counts every field wrong.** If the model answers that a fixture is not a receipt, the honest reading is that the app failed that receipt completely. Excluding it would quietly raise the figure by dropping the hardest cases, which is the specific way accuracy numbers usually lie.

**Comparison is string equality on the app's own values, with no normalization.** The app's contract is the decimal string and the ISO date, so "42.0" against "42.00" is a miss, and a null against a zero is a miss in the direction that matters most: inventing a value the receipt did not print is worse than leaving it absent. Two narrow exceptions are allowed and named in the module: a merchant name is compared case-insensitively after collapsing whitespace, because the app never promised to preserve the receipt's capitalisation, and a description is compared the same way. Everything else is exact.

**`lineItems` is scored per item cell, not per array.** A receipt with eleven items and one wrong amount should not score zero on `lineItems`, and it should not score one either. The report counts item cells as their own denominator and the headline field figure counts `lineItems` as the fraction of its cells that matched, so a long receipt carries the weight its length deserves.

**Three published figures, and the breakdown in the report.** Field accuracy across all fields, `total` and `date` on their own. Those two are broken out because they are what a person checks first and what an expense claim turns on. The per-field table goes to the About page if it is short enough to read; otherwise it stays in the report, which the README links.

**The report is committed, and it names the model and the date.** A figure whose run is not in the repository is a claim nobody can check, which the spec forbids. The report carries the model id, the run date, every fixture's per-field result and the two threshold findings. It is written as Markdown so it reads on GitHub.

**The harness is a script, never a test.** `npm test` must stay free, fast and offline, and a build must make no model call. The script lives beside the other `scripts/` entries, takes the fixture directory as an argument, and says what it will cost before it starts.

**The thresholds are measured as a by-product of the same run.** For every field with a `sourceText`, the harness records the best match score against the fixture's own word boxes and whether the matched region was the right one, which gives the match threshold a curve rather than an opinion. For the review line, it records each field's confidence beside whether the value was right, which answers whether a low confidence predicts a wrong value at all. Both findings go in the report, and either threshold changes in this slice if the evidence says so.

## Risks / Trade-offs

- **Synthetic damage is not thermal paper**, so the figure is optimistic about the worst real case. → Said plainly wherever the figure appears, and the About page's failure cases already name faded thermal paper as a case the app reads badly.
- **Forty model calls cost real money every run.** → The harness is manual, says what it will cost, and the report means a rerun is only needed when the model, the prompt or the schema changes.
- **A generated receipt may be easier to read than a real one in ways the damage does not capture**, such as font choice and layout variety. → The generator varies the merchant, the item count, the tax lines, the payment method and the layout across the forty, and the report lists what varies so a reader can judge the set rather than trust it.
- **The figures may be worse than hoped, and they go on the site anyway.** → That is the point. A portfolio project that publishes an unflattering measured number is worth more than one that publishes nothing, and the About page is already written to admit limits.
- **Moving `MATCH_THRESHOLD` changes highlighting behaviour that slices 4 and 5 verified in production.** → If the evidence moves it, the production check for this slice reverifies the highlighting on the samples, and the handoff records the old value and the reason.
