# Proposal

## Why

A visitor reading the field panel has no way to check a value against the printed receipt except by eye, scanning a photograph for the characters the model claims it read. The app already holds the `sourceText` the model read every field from, so it can show the visitor where on the image that text sits. This is slice 4 of the nine-slice plan, and it comes before the samples and the accuracy fixtures because the matching is the part most likely to need rework.

## What Changes

- The browser measures word boxes on the chosen image with tesseract.js running in a web worker, so the OCR pass stays off the server and the file is still never stored in order to be measured.
- A new fuzzy matcher scores each field's `sourceText` against runs of adjacent word boxes and returns the best region above a matching threshold, or nothing at all.
- Selecting a field in the panel, by click or by keyboard focus, marks the matched region on the document pane. A field with no match above the threshold shows no region, and the panel says so rather than leaving the visitor waiting.
- The document pane gains an overlay that scales the matched region from the OCR pass's pixel coordinates to the rendered size of the image, so the mark stays on the right words as the pane resizes.
- The workspace reports the OCR pass as its own state, because the pass runs beside the model call and finishes on its own schedule. The fields arrive and stay usable whether or not the boxes have landed.
- This slice settles the highlighting spec's threshold and similarity-measure open point, provisionally: the measure is a normalized Levenshtein ratio over case-folded text with whitespace and punctuation stripped, and the threshold is a named constant in one module. Slice 9 tunes the number against the 40 labelled fixtures, which is the only evidence that can confirm it.
- Images only. The scanned-PDF open point and the pdf.js text layer stay with slice 5, which is the slice that accepts a PDF at all.
- The highlight is display only. It reaches no download, no edit and no arithmetic check, because a region is a fact about this browser tab rather than about the receipt.

## Capabilities

### New Capabilities

None. The `highlighting` capability already exists and this slice is its first implementation.

### Modified Capabilities

- `highlighting`: settles the matching threshold and the string-similarity measure the spec left open, names the candidate regions the matcher scores, and states that the OCR pass runs beside the extraction rather than before it.
- `receipt-workspace`: the document pane marks the region of the selected field, the panel reports a field whose `sourceText` matched nothing, and the workspace states the OCR pass as a step of its own.

## Impact

- New `lib/word-boxes.ts` for the word box type and the browser-side OCR pass, `lib/highlight-match.ts` for the similarity measure, the candidate runs and the threshold, and `lib/field-source.ts` to read each field's `sourceText` by the same address `lib/field-edit.ts` already uses.
- `components/ReceiptWorkspace.tsx` holds the word boxes, the OCR phase and the selected field beside the receipt it already holds, and draws the overlay in the document pane.
- `components/FieldPanel.tsx` reports which field is selected and which fields matched nothing.
- `tesseract.js` joins the dependencies, with its wasm core and English traineddata self-hosted under `public/` so a CDN outage cannot break the demo.
- `lib/receipt-fields.ts` carries each row's `sourceText` so the panel and the matcher read the same value.
- No change to `app/api/extract/route.ts`, the Zod schema, the arithmetic or the download envelope.
