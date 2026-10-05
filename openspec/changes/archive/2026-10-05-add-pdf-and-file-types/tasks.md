# Tasks

Slice 5 of the nine-slice plan: PDF uploads and the remaining file types. The slice is finished when a visitor on the deployed app uploads a PNG, a WebP, a PDF with a text layer and a scanned PDF, and each one reads into the same fields with the highlighting working on all four.

## 1. The refusal code and the accepted types on the server

- [x] 1.1 Rename the error code `not_jpeg` to `unsupported_type` across `lib/receipt-schema.ts`, `lib/extract-receipt.ts` and `components/ReceiptWorkspace.tsx`, and verify `npm run typecheck` passes with no remaining use of the old name found by grep.
- [x] 1.2 Replace `ACCEPTED_MIME_TYPE` with a readonly `ACCEPTED_IMAGE_TYPES` set of `image/jpeg`, `image/png` and `image/webp`, check membership rather than equality, and build the data URL from the file's own type. Verify unit tests cover each accepted type passing, a PDF refused with `unsupported_type` at 415, a file with an empty type refused, and the data URL carrying the right prefix for a PNG.
- [x] 1.3 Update the route's message for `unsupported_type` to name the four types a visitor can pick rather than the three the route takes, and verify a unit test asserts the message names PDF.

## 2. pdfjs-dist and its worker

- [x] 2.1 Add `pdfjs-dist` to the dependencies and verify `npm install` succeeds and `npm run typecheck` still passes.
- [x] 2.2 Extend the asset copy so `predev` and `prebuild` put the pdf.js worker under `public/pdfjs/` beside the tesseract assets, reusing the existing script's mkdir-and-copy rather than duplicating it, and verify the worker lands there and `.gitignore` excludes it while leaving the committed language data alone.
- [x] 2.3 Run `npm run build` and verify it completes with pdfjs-dist in the tree, since a worker and an ESM build in a Next 16 client bundle is the risk this group exists to settle.

## 3. The first page as an image

- [x] 3.1 Add `lib/pdf-page.ts` with the rasterize: a dynamic `import("pdfjs-dist")` inside the call, the worker pointed at the self-hosted path, the first page rendered at twice its CSS size capped at the shared 2000-pixel long edge, and a PNG blob out. Verify by unit-testing the pure scale computation for a small page, a large page and one already at the cap.
- [x] 3.2 Return the page count alongside the bitmap, and verify a unit test covers the shape the module returns.
- [x] 3.3 Refuse a PDF the library cannot open, one with no readable page, and one that is password-protected, each as a named failure rather than a thrown error reaching the caller. Verify unit tests cover all three against a stand-in library.

## 4. Word boxes from the text layer

- [x] 4.1 Add the text-layer reader to `lib/pdf-page.ts`: `getTextContent()` converted through the same viewport the rasterize used, so every rectangle lands in the rasterized page's pixels. Verify a unit test over a hand-written text-content shape returns rectangles in the expected pixels.
- [x] 4.2 Return the same `Measurement` shape `createOcrPass` returns, so the workspace and the matcher cannot tell the two sources apart, and verify `npm run typecheck` passes with the workspace accepting either.
- [x] 4.3 Group the text items into lines the way the matcher expects, reusing `groupWordsIntoLines` from `lib/word-boxes.ts` rather than writing a second grouping, and verify a unit test shows a label and a far-right amount staying one line.
- [x] 4.4 Fall back to the OCR pass when the text layer yields no usable text at all, and verify a unit test covers an empty text layer choosing the fallback and a thin one with six words not choosing it.

## 5. The workspace, the preview and the notices

- [x] 5.1 Widen the picker's `accept` to the four types and verify in the dev server that the file dialog offers all four and that a PNG extracts end to end.
- [x] 5.2 Add the rasterize step on submit for a PDF, before both the extraction request and the measuring pass, holding the bitmap once and feeding the preview, the post and the pass from it. Verify in the dev server that a PDF extracts and that nothing rasterizes twice.
- [x] 5.3 Preview the rasterized page in the document pane, and say before submission that the first page appears once the extraction starts. Verify both in the dev server.
- [x] 5.4 Report the rasterizing as its own step, and report a PDF the app could not read a page from as a failure with the try-again control. Verify both in the dev server, the second with a deliberately corrupt file.
- [x] 5.5 Say the app read the first page of N for a multi-page PDF, and say nothing for a single-page PDF or an image. Verify all three in the dev server.
- [x] 5.6 Verify in the dev server that a marked region lands on the right words of a rasterized page, for a PDF with a text layer and for a scanned PDF without one, and that the download still carries exactly `receipt`, `warnings` and `edited`.

## 6. The specs and the record

- [x] 6.1 Update `ai-receipt-scanner-spec.md` where it disagrees with what this slice settled, including the four types split across the two checks, the rasterize scale, the renamed refusal code and the scanned-PDF answer, and verify the product spec and the four delta specs now say the same thing.
- [x] 6.2 Record the slice 5 decisions in `handoff.md`: the browser-side rasterize and the route's images-only contract, the renamed code, the rasterize scale and format, the text-layer preference and its thin-layer rule, and the self-hosted pdf.js worker. Verify the outstanding-work inventory and `tasks.md` at the repo root both reflect the slice as done once group 7 passes.
- [x] 6.3 Run `npm run lint`, `npm run typecheck` and `npm test`, and verify all three pass with the new unit tests counted.

## 7. End to end in the running app

- [x] 7.1 Deploy to production and verify on https://ai-receipt-scanner.bobdempsey83.com that a PNG and a WebP both extract into the same fields a JPEG does, that a PDF with a text layer extracts and highlights from its text layer, that a scanned PDF with no text layer extracts and highlights through the OCR fallback, that a four-page PDF says it read the first page of four, that a corrupt PDF is refused with the try-again control, that a PDF posted straight to the route is refused with `unsupported_type`, and that the JSON download still carries the three keys and nothing more.
