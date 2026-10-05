# Tasks

Slice 4 of the nine-slice plan: OCR word boxes and click-to-highlight. The slice is finished when a visitor on the deployed app clicks a field and sees the printed words it was read from marked on the photograph, and reads a sentence instead when there is nothing to mark.

## 1. The dependency and its assets

- [x] 1.1 Add `tesseract.js` to the dependencies and verify `npm install` succeeds and `npm run typecheck` still passes.
- [x] 1.2 Add a `prebuild` and `predev` script that copies the tesseract worker script and the wasm core out of `node_modules` into `public/tesseract/`, and verify both land there from a clean `node_modules` without any file being deleted to make room.
- [x] 1.3 Commit `eng.traineddata.gz` from the `tessdata_fast` set under `public/tesseract/`, and verify `.gitignore` does not exclude it and that the copied worker and core are excluded.
- [x] 1.4 Run `npm run build` and verify it completes with tesseract.js in the tree, since a wasm dependency in a Next 16 client bundle is the risk this group exists to settle.

## 2. The word box type and the browser pass

- [x] 2.1 Add `lib/word-boxes.ts` with the word box type (text plus a rectangle in the image's natural pixels, grouped by text line) and verify `npm run typecheck` passes.
- [x] 2.2 Implement the downscale-and-measure pass in that module: `createImageBitmap` into an `OffscreenCanvas` at a 2000-pixel long edge, a dynamic `import("tesseract.js")` inside the call rather than at module scope, the worker pointed at the self-hosted assets, and every box multiplied back into natural pixels by the scale factor used. Verify by unit-testing the pure scale-back and line-grouping helpers in the Node environment, since the pass itself needs a browser.
- [x] 2.3 Implement the fallback that groups words by vertical midpoint when the recognize output carries no line structure, and verify a unit test covers a label and an amount on one line staying one line rather than merging with the line above.
- [x] 2.4 Make the pass terminate its worker when the visitor picks another file or leaves the page, and verify no second worker survives a file change in the browser's task manager during the group 7 check.

## 3. The similarity measure and the matcher

- [x] 3.1 Add `lib/highlight-match.ts` with the normalizer (case fold, strip whitespace and punctuation other than the decimal point) and verify unit tests cover the spacing case, the punctuation case and the decimal point surviving.
- [x] 3.2 Implement the normalized Levenshtein ratio in the same module and verify unit tests cover an exact match at 1, a one-character misread, a transposition scoring below an exact match, and the empty string on either side.
- [x] 3.3 Implement candidate runs: adjacent words within one line, capped at the `sourceText` token count plus two, and verify a unit test shows no candidate spans two lines.
- [x] 3.4 Implement the best-match selection with the `MATCH_THRESHOLD` of 0.72 as a named export, taking the earlier candidate on a tie, and verify unit tests cover the 0.75 four-character case clearing, a 0.5 best candidate matching nothing, and the duplicate "42.00" tie going to the earlier region.
- [x] 3.5 Add `lib/field-source.ts` mapping a `FieldAddress` to its `<field>SourceText` sibling, and verify unit tests cover a flat field, a tax label, a tax amount, an item cell and a null `sourceText`.
- [x] 3.6 Implement the region map: every field address matched in one pass over the receipt and the boxes, keyed by `addressKey`, and verify a unit test over a hand-written receipt and a hand-written box set returns a region for the fields that should match and none for the fields that should not.

## 4. The document pane overlay

- [x] 4.1 Wrap the preview `img` in a positioned container in `components/ReceiptWorkspace.tsx` and render the selected field's region as an absolutely positioned mark in percentages of the natural pixel size, `aria-hidden`, translucent with a solid accent border. Verify in the dev server that the mark sits on the right words and stays there as the window narrows, with no resize listener in the code.
- [x] 4.2 Bring a region below the visible part of a scrolled document pane into view when it is selected, and verify it in the dev server on a tall receipt.
- [x] 4.3 Mark nothing when no field is selected, when the selected field has no region, and when the selected row is the computed item total. Verify each in the dev server.

## 5. Selection, the phases and the panel's sentence

- [x] 5.1 Hold the selected `FieldAddress` and the OCR phase (`idle`, `measuring`, `ready`, `failed`) in the workspace beside the receipt, and verify `npm run typecheck` passes and the existing 195 tests still pass.
- [x] 5.2 Start the OCR pass from the same press that sends the extraction, and verify in the dev server that the fields arrive and accept a correction while the measuring message is still up.
- [x] 5.3 Report the selection from `components/FieldPanel.tsx` on cell focus, so a click and a keyboard tab are one path, and verify in the dev server that tabbing through the panel moves the mark and that committing an edit leaves the selection as it was.
- [x] 5.4 Print the panel's sentence under the selected field for the two absent cases, worded differently: no `sourceText` means the receipt printed no value to find, and a `sourceText` with no region means the app could not find that text on the image. Verify both in the dev server.
- [x] 5.5 Say in the workspace that the image is still being measured, and say that it could not be measured when the pass fails, leaving extraction, editing, the arithmetic and the download working in both cases. Verify by running the dev server with the traineddata request blocked.
- [x] 5.6 Verify the download is untouched: take a JSON download with a field selected and a region marked, and confirm the file carries `receipt`, `warnings` and `edited` and nothing else.

## 6. The specs and the record

- [x] 6.1 Update `ai-receipt-scanner-spec.md` where it disagrees with what this slice settled, including the threshold, the similarity measure and the image-only scope, and verify the product spec and the delta specs now say the same thing.
- [x] 6.2 Record the slice 4 decisions in `handoff.md`: the threshold as provisional, the self-hosted assets, the downscale, the derived region map, and the two absent-region sentences. Verify the outstanding-work inventory and `tasks.md` at the repo root both reflect the slice as done once group 7 passes.
- [x] 6.3 Run `npm run lint`, `npm run typecheck` and `npm test`, and verify all three pass with the new unit tests counted.

## 7. End to end in the running app

- [x] 7.1 Deploy to production and verify on https://ai-receipt-scanner.bobdempsey83.com that a photographed JPEG receipt measures, that clicking `total` marks the printed total on the image, that clicking `merchant` marks the merchant line, that a field the receipt did not print says so, that a field whose text the pass could not find says the other sentence, that tabbing through the panel moves the mark, that correcting a value leaves its mark where it was, and that the JSON download still carries the three keys and nothing more.
