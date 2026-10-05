# Design

## Context

See proposal.md for motivation. What exists today: `components/ReceiptWorkspace.tsx` holds the file, the object URL behind the image preview, the receipt, the warnings, the edited list and the standing refusals, and `components/FieldPanel.tsx` renders every value as a Mantine `TextInput` addressed by the `FieldAddress` union in `lib/field-edit.ts`. The Zod schema already carries a `<field>SourceText` sibling beside every value and every confidence, filled by the model on the one call the route makes. Nothing measures the image, and the document pane is a plain `img` over the object URL.

Three constraints shape the approach. The OCR pass runs in the visitor's browser, because nothing is stored server-side and the file reaches no disk. There is still no DOM test environment (`vitest.config.mts` sets `environment: "node"`), so anything that has to be unit-tested belongs in a pure module under `lib/`. And the app may show no wrong region, which makes the threshold a correctness question rather than a tuning one.

## Goals / Non-Goals

**Goals:**

- Word boxes measured in the browser, off the main thread, with the fields usable before the pass finishes.
- A matcher that is pure, unit-testable in a Node environment, and holds the threshold in one place.
- An overlay that needs no resize listener and no second OCR pass when the pane changes size.
- A visible answer for every field, including the two kinds of absent region.

**Non-Goals:**

- PDFs and the pdf.js text layer. Slice 5 accepts a PDF at all; this slice reads the JPEG the workspace already accepts.
- Confirming the threshold. Slice 9's fixtures are the evidence; this slice picks a value and names where it lives.
- Multi-page documents, rotation correction and deskewing.
- Any highlight in the export. The regions stay in the component tree.

## Decisions

**The OCR pass starts with the model call, not before it.** The visitor presses extract once and both passes run from that press, so the slower of the two sets the wait rather than their sum. The alternative, measuring on file choice, spends a visitor's battery on a file they may never submit, and measuring after the fields land makes the highlight feel like a second request the visitor is waiting on. The workspace holds the OCR phase as its own state (`idle`, `measuring`, `ready`, `failed`) beside the extraction phase it already holds, rather than widening the existing `Phase` union, because the two progress independently and a single union would need a state per pair.

**tesseract.js assets are self-hosted, and only the language data is committed.** `createWorker` defaults to fetching its worker script, its wasm core and `eng.traineddata` from a public CDN, which makes a portfolio demo depend at runtime on a host nobody here controls. The worker script and the wasm core are copied out of `node_modules` into `public/tesseract/` by a `prebuild` and `predev` script, so no binary from a package enters git and the copy cannot drift from the installed version. `eng.traineddata.gz` from the `tessdata_fast` set, about 1.5 MB, is committed under the same directory: a build-time download would put a network call in the deploy path, and the fast set is the variant tuned for speed over the last fraction of accuracy, which is the right trade for word boxes whose text the app only has to match approximately.

**The image is downscaled to a 2000-pixel long edge for the OCR pass.** A phone photograph of a receipt runs 3000 pixels or more on its long edge, and tesseract's cost climbs with the pixel count, so an unscaled pass can take most of a minute. The pass uses `createImageBitmap` into an `OffscreenCanvas`, which keeps the resampling off the main thread, and the app multiplies every box back into the image's natural pixels by the scale factor it used. Regions are therefore always expressed in natural pixels regardless of what the pass measured, which is what the spec requires. Slice 7 owns downscaling for the upload itself, against Vercel's 4.5 MB body cap; this one is a separate scale chosen for OCR speed and does not change the bytes the model sees.

**Candidate regions come from tesseract's own line structure.** The recognize call asks for the block structure, and the matcher scores runs of adjacent words within one line rather than clustering boxes by vertical position itself. A receipt prints a label and its amount on one line with wide space between them, which is exactly the case a y-midpoint cluster gets wrong by pulling in the line above. Where the output carries no line structure, the matcher falls back to grouping words whose vertical midpoints sit within half a median word height, so a missing structure degrades to a worse grouping rather than to no highlights.

**The measure is a normalized Levenshtein ratio, scored as `1 - distance / max(len)`.** Both sides are case folded with whitespace and every punctuation mark except the decimal point removed. Levenshtein handles the failure that matters here, which is a character the OCR pass read wrong or dropped ("T0TAL" for "TOTAL", "l" for "1"), and it needs no tuning beyond the one threshold. A token-set measure such as Jaccard was rejected because it scores a transposed digit the same as a correct one, and "42.00" against "24.00" has to score lower than an exact match rather than the same. The decimal point survives normalization because "4200" and "42.00" are different amounts and the measure may not treat them as one. Candidate runs are capped at the `sourceText` token count plus two, so a long line does not generate a quadratic number of windows.

**The threshold is 0.72, in `lib/highlight-match.ts` as a named export.** At four characters it admits one wrong character and refuses two; at the eleven of "TOTAL 42.00" it admits three. The number is a judgment rather than a measurement, and the spec says so: slice 9 reruns it against the 40 fixtures and changes one line. Holding it beside the measure rather than in a config file keeps the two together, since neither means anything without the other.

**The region map is derived from the receipt and the boxes, never stored.** A `useMemo` over `(receipt, wordBoxes)` builds a map from `addressKey(address)` to a region, matching every field in one pass. Storing the map in state would make it a third thing to follow through a line-item removal, beside the edited list and the standing refusals that `remapAddressOnRemove` already follows. Deriving it means an add or a remove rebuilds it from the receipt that now exists, with no index remapping to get wrong. The cost is a few thousand Levenshtein calls on short strings per rebuild, which is well inside a frame.

**The overlay is positioned in percentages.** The marked region renders as an absolutely positioned element inside a wrapper around the `img`, with `left`, `top`, `width` and `height` written as percentages of the natural pixel size. The browser then rescales the mark with the image for free, so the app needs no `ResizeObserver`, no layout measurement and no second pass when the pane narrows. The mark is a translucent fill with a solid border in the accent colour, so the printed characters stay readable under it, and it carries `aria-hidden` because the panel already says in words what the mark shows.

**Selection is focus, and the panel reports it upward.** Every editable cell is already a `TextInput`, so `onFocus` is both the click path and the keyboard path with one handler, which is what makes the spec's two scenarios one piece of code. The workspace holds the selected `FieldAddress`, and the computed item total row has no address, so reaching it selects nothing and marks nothing. A cell's existing commit, refusal and draft behaviour is untouched: selection writes a different piece of state and never touches the receipt.

**`lib/field-source.ts` reads a `sourceText` by address.** The panel needs the text to tell the two absent cases apart, and the matcher needs it to score. One module maps a `FieldAddress` to its `<field>SourceText` sibling, the same shape `lib/field-edit.ts` already uses for values, so a new field is added in both places or in neither.

**What the panel says under the selected field.** Three answers, from the `sourceText` and the region together: a region exists and the pane marks it, so the panel says nothing; the `sourceText` is null, so the panel says the receipt printed no value to find; the `sourceText` is a string with no region above the threshold, so the panel says the app could not find that text on the image. The third is the honest-failure case the whole approach exists to produce, and it reads as an answer only because it is worded differently from the second.

## Risks / Trade-offs

- **The OCR pass reads faded thermal paper badly, so real receipts match less often than generated ones.** → The failure is an absent mark with a sentence explaining it, which is the designed behaviour rather than a defect. Slice 9's fixtures measure how often it happens, and the README's documented failure cases get an entry.
- **tesseract.js pulls wasm into a Next 16 client bundle, which can break the build or the worker boot.** → It is loaded through a dynamic `import()` inside the client-only pass, never at module scope, and its assets are served as static files from `public/` rather than resolved by the bundler. The first task after installing it is a build that proves this.
- **0.72 is a guess until slice 9.** → It is one named export, the spec records it as provisional, and both of its boundary cases are unit-tested so a later change shows up as a test diff rather than as a silent behaviour change.
- **The downscale could cost a match on small print.** → 2000 pixels on the long edge leaves a receipt's body text well above the 10-pixel cap height tesseract needs. If the fixtures show otherwise, the scale is one constant beside the threshold.
- **A 1.5 MB binary enters git.** → It is one file, added once, and it buys a demo that does not break when a CDN does. The worker and the core stay out of git entirely.
- **The keyboard and overlay paths are still unit-tested nowhere**, because the suite runs in a Node environment. → Same answer slice 3 gave: every rule lives in a pure module under `lib/`, the component stays a thin shell, and the browser-driven production check covers the paths. Adding jsdom stays the open improvement.
