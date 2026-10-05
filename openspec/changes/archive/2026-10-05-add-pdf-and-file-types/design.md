# Design

## Context

See proposal.md for motivation. What exists today: `lib/extract-receipt.ts` holds `ACCEPTED_MIME_TYPE = "image/jpeg"`, checks `file.type` against that one string, and builds the data URL with that same constant hard-coded. The refusal code `not_jpeg` is in `EXTRACTION_ERROR_CODES` in `lib/receipt-schema.ts` and keyed in `FAILURE_COPY` in the workspace. `components/ReceiptWorkspace.tsx` sets `accept="image/jpeg"` on the Mantine `FileInput` and previews the chosen file through an object URL on a plain `img`.

Slice 4 left two pieces this slice reuses without changing. `createOcrPass().measure(file)` takes anything `createImageBitmap` accepts, so a rasterized page reaches it as a blob with no new code. And every region is already expressed in the measured image's natural pixels, with the overlay written in percentages of that size, so a rasterized page needs no new coordinate basis as long as the pane shows the same bitmap that was measured.

The constraint that shapes most of this: nothing may run a document parser on the server, and the route's body goes through Vercel's 4.5 MB ceiling, which slice 7 owns.

## Goals / Non-Goals

**Goals:**

- All four types readable end to end, with one refusal path and one refusal code.
- A PDF that reaches the model, the preview and the word boxes as one bitmap, so the mark from slice 4 lands correctly with no special case.
- The scanned-PDF open point settled, and the text-layer path taken when there is one.
- A visitor who uploads a multi-page PDF told that page one is what the app read.

**Non-Goals:**

- Pages beyond the first. The limits spec caps it at one and nothing here widens that.
- Encrypted or password-protected PDFs. They refuse as unreadable and the visitor reads why.
- Batch upload. Five files per batch is slice 6.
- The real file-size cap and the upload downscale. Slice 7 owns both, and the rasterize scale chosen here is deliberately separate.
- Rotating or deskewing a scanned page.

## Decisions

**The browser rasterizes, and the route's contract is images.** pdf.js is a browser library; running it on the Node runtime means a canvas polyfill and a wasm build on a serverless function, for a conversion the page can do with the DOM it already has. Rasterizing client-side also makes three later things fall out for free: the preview is the bitmap the model read, the word boxes share one pixel basis with that preview, and the route keeps a single code path over image bytes. The cost is that `/api/extract` no longer accepts a PDF, which the proposal records as breaking. Nothing outside this app calls it, and the limits spec now states the picker's four types and the route's three separately rather than pretending they are the same check.

**`ACCEPTED_MIME_TYPE` becomes `ACCEPTED_IMAGE_TYPES`, a readonly set, and the data URL carries the file's own type.** The current code uses one constant for both the check and the data URL prefix, which is why a second type cannot be added without touching both. The route checks membership and then builds `data:${file.type};base64,...`. A browser that reports an empty `file.type` fails the membership check, which is the right answer: the route refuses what it cannot name rather than guessing from an extension.

**`not_jpeg` becomes `unsupported_type`.** A code naming one format is wrong the moment three more arrive, and the alternative, keeping `not_jpeg` for a PNG refusal, would put a lie in the response body. The rename touches the error code union, the route's message table, the workspace's `FAILURE_COPY` and the route tests. It is one commit's work and the only consumer is this app.

**pdf.js arrives as `pdfjs-dist`, with its worker self-hosted under `public/pdfjs/`.** The same argument the tesseract assets settled: a portfolio demo should not depend at runtime on a CDN nobody here controls. `scripts/copy-tesseract-assets.mjs` grows into a copy step for both, or gains a sibling, rather than a second script duplicating the mkdir-and-copy logic. The worker is gitignored and copied on `predev` and `prebuild`, exactly as the tesseract worker is. pdf.js's own font and cmap data stay out of scope: a receipt's text layer needs neither for extraction of positions, and if a sample proves otherwise, those directories are copied the same way.

**The rasterize scale is 2 times the page's CSS size, capped at a 2000-pixel long edge.** A PDF page at scale 1 is 72 dots per inch, which is too coarse for the model to read small print reliably and too coarse for OCR on a scanned page. Doubling it gives roughly 144 dots per inch, and the same 2000-pixel cap `OCR_LONG_EDGE` already names keeps a large page from producing a bitmap that blows the request body. The two constants sit together in `lib/pdf-page.ts` with a comment saying why the cap is shared. The output is PNG rather than JPEG, because a scanned receipt's thin strokes are what both the model and tesseract have to read and JPEG's ringing is worst exactly there. The trade is a larger body, which is why the cap matters and why slice 7's downscale work has to account for the PDF path too.

**The text layer is preferred, and a thin one is still an answer.** `page.getTextContent()` gives text items with a transform and a width, which convert to a rectangle in the rasterized page's pixels by the same viewport the rasterize used, so one `viewport.scale` serves both. The app runs the OCR pass only when the text layer yields no usable text at all. The alternative, a word-count threshold below which it OCRs anyway, was rejected: a receipt whose text layer holds six words has six real words with exact coordinates, and the matcher's job is already to return nothing rather than something wrong for the fields those six do not cover.

**Where the PDF step sits in the flow.** The rasterize runs on submit, before both the extraction request and the OCR pass, because both need the bitmap. That makes the PDF path one step longer than the image path, which is why the workspace reports the rasterizing as a step of its own rather than folding it into the extraction's working state. The workspace holds the rasterized bitmap and feeds the preview, the post and the measuring pass from it, so nothing rasterizes twice.

**The word box source is a decision the page makes, and the matcher never learns about it.** `lib/pdf-page.ts` returns the same `Measurement` shape `createOcrPass` returns. The workspace picks the source, the region map is built from whatever arrived, and `lib/highlight-match.ts` changes by not one line. Anything that made the matcher branch on the source would put format knowledge in the one module that has no business holding it.

**The first-page notice names the count.** "The app read the first page of four" tells a visitor more than "the app read the first page", and the page count is already in hand from the loaded document. A single-page PDF says nothing, because there is nothing it left out, and an image says nothing either.

## Risks / Trade-offs

- **pdfjs-dist's worker and ESM build are awkward in a Next bundle**, and this is the same class of risk tesseract.js carried in slice 4. → The dynamic `import()` pattern slice 4 settled applies unchanged, the worker is a static file rather than a bundler-resolved module, and the first task after installing it is a build that proves it.
- **A rasterized page at 144 dots per inch may be too coarse for small print, or too large for the request body.** → Both the scale and the cap are named constants in one module with the reasoning beside them, and slice 9's fixtures are where a wrong choice shows up as an accuracy number rather than as a guess.
- **The `not_jpeg` rename touches the error vocabulary.** → It is a union type, so TypeScript finds every use, and the route tests assert the code directly. A missed site is a compile error rather than a silent behavior change.
- **A password-protected or corrupt PDF throws from pdf.js in a place the current failure copy has no words for.** → The workspace gains the one sentence the receipt-workspace delta requires, saying it could not read a page from that file, and offers the try-again control the failure state already has.
- **The text-layer path is exact where the OCR path is approximate**, so highlighting quality now varies by upload type in a way the accuracy numbers have to describe rather than average. → Slice 9 reports the PDF fixtures separately, the way it already breaks out `total` and `date`.
- **PNG and WebP are accepted without a fixture proving the model reads them as well as JPEG.** → Slice 9's 40 fixtures are where that gets measured; this slice opens the path rather than claiming parity.
