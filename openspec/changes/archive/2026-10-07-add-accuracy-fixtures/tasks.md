# Tasks

Slice 9 of the nine-slice plan: the 40 labelled fixtures and the accuracy numbers. The slice is finished when the deployed site states three measured figures that a reader can trace to a committed report, and both thresholds have evidence under them.

## 1. The fixture generator

- [x] 1.1 Extend the sample generator into `scripts/make-fixtures.mjs`, writing 40 receipts and 40 label files under `fixtures/`, each label produced in the same run from the same values the image was drawn from. Verify a unit test asserts every image has a label and every label parses against the receipt schema.
- [x] 1.2 Vary the forty across merchant, item count, tax lines, tip, payment method, currency and layout, so the set measures more than one receipt rendered forty times. Verify a unit test asserts the set carries at least three distinct item counts, both tipped and untipped receipts, and at least two currencies.
- [x] 1.3 Seed every random choice, and verify that running the generator twice produces byte-identical images and labels.

## 2. The damage

- [x] 2.1 Add the degradations as named, composable steps: fading, blur, rotation, perspective, crop, noise and JPEG quality. Verify a unit test covers each step changing the image and none of them changing the label.
- [x] 2.2 Assign a fixed matrix of degradations across the forty, with roughly a quarter clean or near clean, and record each fixture's degradations in its label file. Verify a unit test asserts every fixture names its degradations and that the matrix is the one the module declares.
- [x] 2.3 Look at a sample of the damaged fixtures and confirm they are still receipts a person could read. A fixture nobody could read measures nothing. Report which ones you judged borderline and keep them, because a borderline receipt is the interesting case.

## 3. The comparison

- [x] 3.1 Add `lib/accuracy.ts` comparing one extracted receipt to one label: exact string equality on money and dates, null matching only null, and case-insensitive whitespace-collapsed comparison for merchant and description alone. Verify unit tests cover "42.00" against "42.0" as a miss, null against "0.00" as a miss, a value against null as a miss, and the two case-insensitive fields.
- [x] 3.2 Score `lineItems` per item cell rather than per array, so a long receipt carries the weight its length deserves. Verify a unit test covers an eleven-item receipt with one wrong amount scoring neither zero nor one.
- [x] 3.3 Count every field wrong when the model answers that a fixture is not a receipt, rather than excluding it. Verify a unit test covers it.
- [x] 3.4 Compute the three published figures and the per-field breakdown from a set of comparisons, as a pure function. Verify unit tests cover a hand-written set of results producing the figures by hand-checkable arithmetic.

## 4. The harness

- [x] 4.1 Add `scripts/measure-accuracy.mjs` calling `extractReceipt` directly, so the model, the prompt and the server-side validation are the real ones, with the rate limiter the one deliberate omission. Verify it says what the run will cost before it starts and refuses to run without `OPENAI_API_KEY`.
- [x] 4.2 Record, per field with a `sourceText`, the best match score against that fixture's own word boxes and whether the matched region was the right one, so the match threshold gets a curve rather than an opinion.
- [x] 4.3 Record each field's confidence beside whether its value was right, so the review line can be judged on whether a low confidence predicts a wrong value.
- [x] 4.4 Verify `npm test` makes no model call and `npm run build` makes no model call, by running both with `OPENAI_API_KEY` unset and confirming they pass.

## 5. The run and the report

- [x] 5.1 Run the harness against all 40 fixtures and write `fixtures/REPORT.md`: the model id, the run date, the three figures, the per-field breakdown, every fixture's per-field result with its degradations, and the two threshold findings. Report the figures you got.
- [x] 5.2 Read the report and say plainly what it shows, including what the app reads worst. If a figure is disappointing, it still ships, and the wording around it says what the set was.
- [x] 5.3 Judge `MATCH_THRESHOLD` against 4.2's curve: how many correct highlights 0.72 admitted and how many wrong ones it refused. Confirm it or change it, and say which on what evidence. If it changes, note that slices 4 and 5 verified highlighting in production at the old value.
- [x] 5.4 Judge `REVIEW_THRESHOLD` against 4.3's data: whether a confidence below 0.8 predicts a wrong value at all. Confirm it or change it, and say which on what evidence.

## 6. The figures on the site

- [x] 6.1 Add the three figures to `lib/project-facts.ts`, each carrying the report's run date and the model it was measured against, and relax the test that forbids a percent sign so it instead asserts the three figures exist and carry a run date. Verify the test still refuses an undated or unsourced figure.
- [x] 6.2 Put them in the stat tiles, the About page and the README in this change, saying in each place that the set is generated and damaged in code rather than photographed. Verify a unit test asserts the three places read the same module.
- [x] 6.3 Retake the screenshots if the tiles changed shape, using `scripts/capture-screenshots.mjs`, and verify they show the current page.

## 7. The specs and the record

- [x] 7.1 Update `ai-receipt-scanner-spec.md` where it disagrees with what this slice settled, including the figures, the fixture set and either threshold if it moved, and verify the product spec and the delta spec now say the same thing.
- [x] 7.2 Record the slice 9 decisions in `handoff.md`: the fixtures being generated and damaged rather than photographed, the comparison rules, a refused fixture counting every field wrong, the harness staying manual, the figures themselves, and what the two threshold findings were. Verify the outstanding-work inventory and `tasks.md` at the repo root both reflect the slice as done once group 8 passes.
- [x] 7.3 Run `npm run lint`, `npm run typecheck`, `npm run build` and `npm test`, and verify all four pass.

## 8. End to end in the running app

- [x] 8.1 Deploy to production and verify on https://ai-receipt-scanner.bobdempsey83.com that the stat tiles, the About page and the README state the same three figures, that each names the model and the run date, that the About page says the set is generated and damaged in code, that the report is reachable in the repository, and that an extraction still runs end to end from a sample with the highlighting working at whatever threshold this slice settled on.
