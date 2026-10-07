# Accuracy report

Measured on 2026-10-07 against `gpt-6.1-sol`, the model `lib/model.ts` pins, over the 40 fixtures in `fixtures/`.

The fixtures are generated and then damaged in code rather than photographed. `scripts/make-fixtures.mjs` draws each receipt and writes its label in the same run from the same values, so no label was transcribed by hand, and `scripts/fixture-degrade.mjs` applies the fading, blur, rotation, perspective, cropping, noise and JPEG compression each label names. Synthetic fading is not thermal paper, so these figures are optimistic about the worst real case, and the set carries no handwriting and no language but English.

`scripts/measure-accuracy.mjs` produced every number below. It calls `extractReceipt` in `lib/extract-receipt.ts` directly, the same function the route calls, so the model, the prompt and the server-side Zod validation are the ones the deployed app runs. One part of that path is deliberately skipped: the per-address rate limiter, because a forty-call run would spend the hourly allowance the deployed app shares and the counter has nothing to do with how the model reads a receipt. Nothing else was stubbed, no answer was cached and no bad reading was retried.

## The three figures

| Figure | Value | Matched | Compared |
| --- | --- | --- | --- |
| Field accuracy, every field | 98.7% | 1662 | 1684 |
| `total` | 100.0% | 40 | 40 |
| `date` | 85.0% | 34 | 40 |

0 of 40 fixtures came back refused or failed, and every field of a refused fixture counts wrong rather than leaving the denominator.

## What this run shows

The app read 1,662 of the 1,684 compared fields correctly, which is 98.7%. It read every `total` on all forty fixtures and 34 of the forty dates. Twenty-two fields were wrong, and the rest of this section names every one of them.

**The first run of this harness measured 76.6%, and the difference is the labels rather than the model.** That run went out over the same forty images against a generator that asked twice whether a line prints a quantity: the renderer decided one way, `buildLabel` decided the other, and on 374 item cells the two disagreed. A card slip prints no quantity column and a till roll prints no quantity line for a line of one unit, so neither paper shows a quantity or a unit price on those lines, and the label asserted both anyway. 240 cells on the slips carried a value with a null `sourceText`, and 134 cells on the till rolls carried a `sourceText` naming characters the paper never printed. The extraction prompt tells the model to leave an unprinted field null, the model did that on all 374, and `lib/accuracy.ts` counted all 374 wrong. The fix is one predicate, `printsQuantityLine` in `scripts/receipt-svg.mjs`, which both the drawing and the labelling now read, so a layout that prints the pair gets a label holding both and a layout that prints neither gets a label holding null for both. The comparison in `lib/accuracy.ts` did not change, because the comparison was right and the label was the thing that lied.

The arithmetic agrees across the two runs, which is a check a reader can run on the numbers already published. Excluding the 374 defective cells from the first run's own figures left 1,287 of 1,306, or 98.5%. This run measures 1,662 of 1,684, or 98.7%. Nothing about the model moved between them.

The compared count went from 1,680 to 1,684 because the model invented a tax line on two fixtures. `lib/accuracy.ts` counts the longer of the two sides, so an entry only the model holds contributes both its cells as misses.

Where the twenty-two misses are, by cause:

| Cause | Misses | Fixtures |
| --- | --- | --- |
| A printed date read in the other convention | 6 | `f05`, `f14`, `f15`, `f24`, `f25`, `f35` |
| A payment method read in title case | 5 | `f03`, `f10`, `f13`, `f30`, `f33` |
| A tax line the receipt does not print | 4 | `f23`, `f33` |
| A line item description or amount misread | 4 | `f27`, `f39`, `f40` |
| A merchant address read short or with a wrong digit | 3 | `f19`, `f29`, `f37` |

**`date` is the field the app reads worst, at 34 of 40, and all six misses are the same mistake.** Each of the six prints a date whose day is 12 or under, so 02/11/2026 is a genuinely ambiguous string, and the model answered with the other reading: four on the month-first till rolls and two on the day-first slips. Nothing on these fixtures tells a reader which convention the paper uses, and the app sends no locale with the image, so this is the app's real limit rather than a damaged-image failure. The ISO-dated invoices read 8 of 8.

**The five `paymentMethod` misses are a comparison rule rather than a misreading.** The paper prints `CASH` and the model answered `Cash`. `COLLAPSED_CASE_FIELDS` in `lib/accuracy.ts` folds case for the merchant name and an item description alone, so every other field is compared exactly. This report leaves that choice in place rather than widening the exception to flatter the figure, and a reader who thinks the capitals do not matter can add 5 to the matched count and read 99.0%.

**The four tax misses are the model printing a line the receipt does not.** `f23` and `f33` are both Quayside Cafe, whose footer reads `VAT INCLUDED IN PRICES` and whose body prints no tax line at all. The model answered a `taxes` entry labelled `VAT` with a null amount. Both cells of that entry count wrong, which is the rule that keeps an invented line from being free.

The four line item misses are single characters: `POSTCARD SET OF 8` read as `POSTCARD SET OF 6` on a faded, blurred, JPEG-compressed slip, `TOLL BRIDGE` read as `TOLL/BRIDGE`, `MOUSE MAT` read as `MOUSE PAD`, and one amount of `3.00` read as `3.30` on the fixture carrying five damages at once.

The damage barely separates the fixtures now. Every degradation row sits between 98.2% and 98.8% against 99.0% for the four clean renders, and the one fixture carrying five damages is the lowest row in the set at 96.6%. By layout the slips read 97.7%, the invoices 99.1% and the till rolls 99.4%, and the slips sit lowest because the two Quayside Cafe fixtures and three of the five title-cased payment methods are theirs.

To check this run, regenerate the set with `node scripts/make-fixtures.mjs` and compare the files: the generator is seeded off `FIXTURE_SEED`, and two runs produce byte-identical images and labels. `npx vitest run lib/fixtures.test.ts` then asserts that every label value the set holds has a source text, that no label quotes characters its own rows never printed, and that a quantity and a unit price appear in a label exactly where `printsQuantityLine` puts the pair on the paper. Those three tests are what the first run lacked.

## Per field

Every flat field is its own row. `taxes` rolls up the label and the amount of every tax line, and `lineItems` rolls up the four cells of every item, counted per cell so a long receipt carries the weight its length deserves.

| Field | Accuracy | Matched | Compared |
| --- | --- | --- | --- |
| `date` | 85.0% | 34 | 40 |
| `paymentMethod` | 87.5% | 35 | 40 |
| `merchantAddress` | 92.5% | 37 | 40 |
| `taxes` | 95.2% | 80 | 84 |
| `lineItems` | 99.7% | 1196 | 1200 |
| `merchant` | 100.0% | 40 | 40 |
| `time` | 100.0% | 40 | 40 |
| `currency` | 100.0% | 40 | 40 |
| `subtotal` | 100.0% | 40 | 40 |
| `tip` | 100.0% | 40 | 40 |
| `total` | 100.0% | 40 | 40 |
| `cardLast4` | 100.0% | 40 | 40 |

## Where the damage shows

The same fields, grouped two ways. A degradation row counts every fixture carrying that damage, and a fixture carrying four of them appears in four rows, so the rows overlap and none of them isolates one cause. The layout rows do not overlap.

| Layout | Fields right | Compared | Fixtures |
| --- | --- | --- | --- |
| slip | 97.7% | 660 | 16 |
| invoice | 99.1% | 344 | 8 |
| thermal | 99.4% | 680 | 16 |

| Degradation | Fields right | Compared | Fixtures |
| --- | --- | --- | --- |
| blur | 98.2% | 508 | 11 |
| rotate | 98.3% | 538 | 11 |
| fade | 98.4% | 574 | 12 |
| noise | 98.6% | 730 | 15 |
| crop | 98.8% | 566 | 11 |
| perspective | 98.8% | 510 | 10 |
| jpeg | 98.8% | 782 | 16 |
| none (clean render) | 99.0% | 96 | 4 |

| Damages on the fixture | Fields right | Compared | Fixtures |
| --- | --- | --- | --- |
| 0 | 99.0% | 96 | 4 |
| 1 | 98.9% | 180 | 7 |
| 2 | 98.7% | 614 | 15 |
| 3 | 98.7% | 554 | 10 |
| 4 | 99.2% | 122 | 2 |
| 5 | 96.6% | 58 | 1 |
| 6 | 98.3% | 60 | 1 |

## Every fixture

One row per fixture, naming its degradations and every field it read wrong. A field not named in the misses column matched the label exactly, under the rules `lib/accuracy.ts` states: the decimal string and the ISO date compared exactly, a null matching only a null, and the merchant name and an item description compared case-insensitively with whitespace collapsed.

| Fixture | Layout | Degradations | Fields right | Misses |
| --- | --- | --- | --- | --- |
| `f01` | thermal | clean | 24/24 | none |
| `f02` | thermal | clean | 26/26 | none |
| `f03` | slip | clean | 21/22 | paymentMethod: label `CONTACTLESS CARD`, read `Contactless card` |
| `f04` | slip | clean | 24/24 | none |
| `f05` | thermal | jpeg | 23/24 | date: label `2026-02-11`, read `2026-11-02` |
| `f06` | thermal | noise | 24/24 | none |
| `f07` | slip | fade | 24/24 | none |
| `f08` | invoice | blur | 26/26 | none |
| `f09` | slip | rotate | 22/22 | none |
| `f10` | invoice | perspective | 23/24 | paymentMethod: label `ACCOUNT TRANSFER`, read `Account transfer` |
| `f11` | thermal | crop | 36/36 | none |
| `f12` | thermal | fade, blur | 38/38 | none |
| `f13` | slip | fade, jpeg | 33/34 | paymentMethod: label `CASH`, read `Cash` |
| `f14` | slip | blur, noise | 35/36 | date: label `2026-05-03`, read `2026-03-05` |
| `f15` | thermal | rotate, jpeg | 35/36 | date: label `2026-05-12`, read `2026-12-05` |
| `f16` | thermal | rotate, noise | 36/36 | none |
| `f17` | slip | perspective, blur | 36/36 | none |
| `f18` | invoice | crop, jpeg | 38/38 | none |
| `f19` | slip | crop, noise | 33/34 | merchantAddress: label `Dispatch 70 Ferryman Road, OR 97000`, read `70 Ferryman Road, OR 97000` |
| `f20` | invoice | fade, noise | 36/36 | none |
| `f21` | thermal | blur, jpeg | 48/48 | none |
| `f22` | thermal | perspective, jpeg | 50/50 | none |
| `f23` | slip | rotate, crop | 46/48 | taxes.0.label: label null, read `VAT`<br>taxes.0.amount: label null, read null |
| `f24` | slip | fade, perspective | 47/48 | date: label `2026-08-01`, read `2026-01-08` |
| `f25` | thermal | crop, blur | 47/48 | date: label `2026-08-10`, read `2026-10-08` |
| `f26` | thermal | noise, jpeg | 48/48 | none |
| `f27` | slip | fade, blur, jpeg | 47/48 | lineItems.4.description: label `POSTCARD SET OF 8`, read `POSTCARD SET OF 6` |
| `f28` | invoice | rotate, perspective, jpeg | 50/50 | none |
| `f29` | slip | fade, noise, jpeg | 45/46 | merchantAddress: label `Dispatch 70 Ferryman Road, OR 97000`, read `70 Ferryman Road, OR 97000` |
| `f30` | invoice | blur, rotate, noise | 47/48 | paymentMethod: label `MASTERCARD`, read `Mastercard` |
| `f31` | thermal | crop, perspective, jpeg | 60/60 | none |
| `f32` | thermal | fade, crop, noise | 62/62 | none |
| `f33` | slip | blur, perspective, noise | 57/60 | paymentMethod: label `VISA DEBIT`, read `Visa Debit`<br>taxes.0.label: label null, read `VAT`<br>taxes.0.amount: label null, read null |
| `f34` | slip | rotate, noise, jpeg | 60/60 | none |
| `f35` | thermal | fade, rotate, crop | 59/60 | date: label `2026-11-08`, read `2026-08-11` |
| `f36` | thermal | perspective, noise, crop | 60/60 | none |
| `f37` | slip | fade, blur, rotate, jpeg | 59/60 | merchantAddress: label `Keizersgracht 118, 1015 Amsterdam`, read `Keizersgracht 119, 1015 Amsterdam` |
| `f38` | invoice | perspective, crop, noise, jpeg | 62/62 | none |
| `f39` | slip | fade, rotate, crop, noise, jpeg | 56/58 | lineItems.3.amount: label `3.00`, read `3.30`<br>lineItems.5.description: label `TOLL BRIDGE`, read `TOLL/BRIDGE` |
| `f40` | invoice | fade, blur, rotate, perspective, noise, jpeg | 59/60 | lineItems.9.description: label `MOUSE MAT`, read `MOUSE PAD` |

## The match threshold

`MATCH_THRESHOLD` in `lib/highlight-match.ts` is the similarity a candidate run of words has to reach before the app marks it as a field's region. The evidence below is the real OCR pass: this harness boots the same tesseract.js at the same `LSTM_ONLY` setting against the same committed `public/tesseract/eng.traineddata.gz` the browser fetches, and reads its output through `readTextLines` in `lib/word-boxes.ts`. Every fixture's long edge sits inside `OCR_LONG_EDGE`, so the browser would hand tesseract the same file untouched. The one difference from a visitor's pass is the runtime: Node rather than a web worker.

Each sample is one field whose `sourceText` the label and the model both carry. Where the field's printed characters match the measured words at 0.9 or better, the region those words cover is the ground truth, and a highlight is right when it covers at least 0.5 of that region, so a mark that takes in the printed label beside the value counts as right and a mark that misses the value counts as wrong. Below 0.5 the pass read nothing resembling the printed text, so no region on the image is that text and any highlight admitted there is wrong. Between the two the harness says nothing, and those samples are listed apart. Where a receipt prints the same characters twice, the check cannot tell the two apart, and the matcher documents preferring the earlier.

1251 samples: 1246 with a quote from the model to score, 5 where the model quoted nothing, 66 in the unclear band of the truth score.

| Threshold | Right, shown | Wrong, shown | Right, withheld | Wrong, withheld | Unclear, shown |
| --- | --- | --- | --- | --- | --- |
| 0.5 | 1125 | 48 | 0 | 7 | 66 |
| 0.6 | 1125 | 40 | 0 | 15 | 39 |
| 0.65 | 1125 | 39 | 0 | 16 | 37 |
| 0.7 | 1125 | 38 | 0 | 17 | 34 |
| 0.72 **(shipped)** | 1125 | 37 | 0 | 18 | 34 |
| 0.75 | 1125 | 37 | 0 | 18 | 33 |
| 0.8 | 1124 | 29 | 1 | 26 | 27 |
| 0.85 | 1124 | 29 | 1 | 26 | 5 |
| 0.9 | 1124 | 26 | 1 | 29 | 0 |
| 0.95 | 1078 | 25 | 47 | 30 | 0 |
| 1 | 1075 | 25 | 50 | 30 | 0 |

**`MATCH_THRESHOLD` stays at 0.72.** At that value the matcher showed 1,125 correct highlights and withheld none at all, which is the strongest thing the curve says: no correct mark is lost to the threshold. It admitted 37 wrong marks and refused 18. Raising it to 0.75 moves nothing but one sample out of the unclear band. Raising it to 0.8 refuses eight more wrong marks and starts withholding a correct one. Raising it to 0.95 withholds 47 correct marks and refuses no further wrong ones, which is where the measure stops working. Lowering it to 0.5 admits eleven more wrong marks and gains not one correct mark.

The 0.8 row is the one a reader should press on, because it is the trade this run makes available and did not take: eight fewer wrong marks for one correct mark withheld. All eight of those eight are one field quoting the same wrong thing, `currency` against an address line, and refusing them still leaves 29 wrong marks standing, 25 of those at a perfect score. A threshold cannot fix a model that quotes the wrong characters, so the line stays where no correct mark is lost and the fix belongs in the prompt. A later run whose 0.8 row loses no correct mark is reason to move it.

**29 of the 37 wrong marks are one `currency` failure, and it is the model's quoting rather than the matcher's scoring.** Asked for the characters it read the currency from, the model often answers with the symbol and a whole address line, a dollar sign followed by a newline and `Fairhaven Bay, OR 97000`, or with the invoice column heading `AMOUNT EUR`. The matcher then does exactly its job and finds those words on the image, so the mark lands on the address or on the heading, and 25 of the 29 score an exact 1. No threshold short of refusing correct marks can refuse a perfect score. The first run of this harness found 28 wrong `currency` marks of the same shape on labels that were defective elsewhere, so this is the second run to show it and it is not an artefact of the labels. What would fix it is the prompt asking for the shortest run of characters a value was read from, or the app declining to highlight `currency` at all, because a one-character symbol repeated down a column of amounts is not a region a visitor gains anything from seeing marked. Neither is in this change.

The remaining eight are two `total` marks that took in the printed `TOTAL` label beside the amount, which costs a visitor nothing, and six item `quantity` marks where the model quoted the whole printed line, `4 @ $16.90`, rather than the `4`.

Every wrong highlight the shipped threshold admitted. 25 of the 37 scored an exact 1, which means the matcher found the model's quoted characters on the image and marked them: the mark is wrong because the model quoted the wrong characters, and no threshold can refuse a perfect score.

| Fixture | Field | Score | Model quoted | Words marked | Label printed |
| --- | --- | --- | --- | --- | --- |
| `f03` | `currency` | 1.000 | `£; 11 Netherwharf Lane, Portmere PM1 4RG` | `11 Netherwharf Lane, Portmere PM1 4RG` | `£` |
| `f04` | `currency` | 1.000 | `$; Junction 7, Carterhill Road, OR 97000` | `Junction 7, Carterhill Road, OR 97000` | `$` |
| `f06` | `total` | 1.000 | `TOTAL $23.90` | `TOTAL $23.90` | `$23.90` |
| `f08` | `currency` | 1.000 | `AMOUNT EUR` | `AMOUNT EUR` | `€` |
| `f09` | `currency` | 1.000 | `$; OR 97000` | `OR 97000` | `$` |
| `f10` | `currency` | 1.000 | `AMOUNT GBP` | `AMOUNT GBP` | `£` |
| `f13` | `total` | 1.000 | `TOTAL £18.60` | `TOTAL £18.60` | `£18.60` |
| `f14` | `currency` | 1.000 | `$; OR 97000` | `OR 97000` | `$` |
| `f18` | `currency` | 1.000 | `AMOUNT EUR` | `AMOUNT EUR` | `€` |
| `f20` | `currency` | 1.000 | `AMOUNT GBP` | `AMOUNT GBP` | `£` |
| `f22` | `currency` | 1.000 | `$\nFairhaven Bay, OR 97000` | `Fairhaven Bay, OR 97000` | `$` |
| `f25` | `lineItems.6.quantity` | 1.000 | `2 @ £9.40` | `2 @ £9.40` | `2` |
| `f25` | `lineItems.7.quantity` | 1.000 | `4 @ £2.15` | `4 @ £2.15` | `4` |
| `f25` | `lineItems.8.quantity` | 1.000 | `2 @ £3.60` | `2 @ £3.60` | `2` |
| `f30` | `currency` | 1.000 | `AMOUNT GBP` | `AMOUNT GBP` | `£` |
| `f31` | `currency` | 1.000 | `$\nFairhaven Bay, OR 97000` | `Fairhaven Bay, OR 97000` | `$` |
| `f31` | `lineItems.9.quantity` | 1.000 | `3 @ $2.60` | `3 @ $2.60` | `3` |
| `f34` | `currency` | 1.000 | `$; Junction 7, Carterhill Road, OR 97000` | `Junction 7, Carterhill Road, OR 97000` | `$` |
| `f36` | `currency` | 1.000 | `$\nFairhaven Bay, OR 97000` | `Fairhaven Bay, OR 97000` | `$` |
| `f36` | `lineItems.7.quantity` | 1.000 | `4 @ $16.90` | `4 @ $16.90` | `4` |
| `f36` | `lineItems.8.quantity` | 1.000 | `4 @ $9.80` | `4 @ $9.80` | `4` |
| `f37` | `currency` | 1.000 | `€; 1015 Amsterdam` | `1015 Amsterdam` | `€` |
| `f38` | `currency` | 1.000 | `AMOUNT EUR` | `AMOUNT EUR` | `€` |
| `f39` | `currency` | 1.000 | `$; OR 97000` | `OR 97000` | `$` |
| `f40` | `currency` | 1.000 | `AMOUNT GBP` | `AMOUNT GBP` | `£` |
| `f13` | `currency` | 0.906 | `£; 11 Netherwharf Lane, Portmere PM1 4RG` | `il Netherwharf Lane, Portmere PM1l 4RG` | `£` |
| `f28` | `currency` | 0.889 | `AMOUNT EUR` | `MOUNT EUR` | `€` |
| `f15` | `currency` | 0.857 | `£\nPortmere PM2 8TD` | `Portmere PM2 aTp` | `£` |
| `f19` | `currency` | 0.853 | `$45.20\nDispatch 70 Ferryman Road, OR 97000` | `Dispatch 70 Ferryman Road, OR 97000` | `$` |
| `f02` | `currency` | 0.792 | `Fairhaven Bay, OR 97000\n$37.63` | `Fairhaven Bay, OR 97000` | `$` |
| `f06` | `currency` | 0.792 | `Fairhaven Bay, OR 97000\n$23.90` | `Fairhaven Bay, OR 97000` | `$` |
| `f11` | `currency` | 0.792 | `Fairhaven Bay, OR 97000\n$30.79` | `Fairhaven Bay, OR 97000` | `$` |
| `f12` | `currency` | 0.792 | `Fairhaven Bay, OR 97000\n$93.37` | `Fairhaven Bay, OR 97000` | `$` |
| `f16` | `currency` | 0.792 | `Fairhaven Bay, OR 97000\n$76.68` | `Fairhaven Bay, OR 97000` | `$` |
| `f21` | `currency` | 0.792 | `Fairhaven Bay, OR 97000\n$58.68` | `Fairhaven Bay, OR 97000` | `$` |
| `f35` | `currency` | 0.786 | `£\nPortmere PM2 8TD` | `Portmere PM2` | `£` |
| `f26` | `currency` | 0.760 | `Fairhaven Bay, OR 97000\n$209.40` | `Fairhaven Bay, OR 97000` | `$` |

## The review line

`REVIEW_THRESHOLD` in `lib/receipt-fields.ts` is 0.8: a field whose confidence falls under it is flagged for the visitor to check. The question is whether a confidence under that line predicts a wrong value at all, so every field is counted by which side of the line its confidence fell and whether its value matched the label.

| | Value wrong | Value right |
| --- | --- | --- |
| Confidence below 0.8 | 0 | 0 |
| Confidence 0.8 or above | 20 | 1233 |

1253 fields carried a confidence and 431 carried none. The lowest confidence the model reported anywhere in the run was 0.9, and the lowest it reported on a field it read wrong was 0.93.

| Confidence band | Fields | Of those, wrong |
| --- | --- | --- |
| 0.9 to 1.0 | 1253 | 20 |

**`REVIEW_THRESHOLD` stays at 0.8, and the evidence is that it never fires.** Not one of the 1,684 compared fields came back under it. 1,253 fields carried a confidence, 431 carried none, and the lowest confidence the model reported anywhere was 0.9 on a field it read right. Every one of the 20 wrong fields that carried a confidence reported 0.93 or above. In this run a confidence under 0.8 predicts nothing, because `gpt-6.1-sol` never goes there, which matches the deployed app, where it has reported nothing under 0.96 since slice 2.

Moving the line is not something this run can justify. Every field carrying a confidence sits in the single band from 0.9 to 1.0, so there is no lower band to draw a line through, and a line raised into that band would flag correct readings at a rate this run did not record. The line stays at 0.8, the counts above are what a later run gets compared against, and the honest statement for the About page is that the model's own confidence did not predict a wrong value on this set.

## What the run cost

40 model calls at $2.00 per million input tokens, the price `lib/model.ts` records from OpenAI's published list on 2026-10-01. The call the route makes reports no token usage back, so the spend reads as arithmetic over that price: $0.08 at 1,000 input tokens a call, $0.40 at 5,000 input tokens a call, $0.80 at 10,000 input tokens a call. The billed figure for the run is on OpenAI's usage page for the run date. No fixture was retried.

