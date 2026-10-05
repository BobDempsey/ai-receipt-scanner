# Proposal

## Why

The app reads JPEG and refuses everything else, which is the walking skeleton's cap rather than the product's. A visitor who scans a receipt gets a PDF, a visitor on Windows gets a PNG, and a visitor on a recent phone gets WebP, so three of the four types the spec promises are unreachable today. This is slice 5 of the nine-slice plan, and slice 7's three sample receipts include a scanned PDF invoice, which cannot ship until a PDF can be read at all.

## What Changes

- The picker and the route accept the remaining types. `image/png` and `image/webp` join `image/jpeg` end to end.
- A PDF becomes an image in the browser. The page rasterizes the first page with pdf.js and posts that bitmap, so the route's contract stays images only and no PDF parser runs on the server. **BREAKING** for the route's own vocabulary: it no longer accepts `application/pdf`, which nothing outside this app calls.
- **BREAKING** the error code `not_jpeg` is renamed `unsupported_type`, because a code naming one format is wrong the moment three more arrive. The code appears in the route's JSON and in the browser's copy; nobody has scripted against it, the same reasoning slice 2 used when the download envelope changed shape.
- Only the first page of a PDF is read, and the workspace says so rather than leaving a visitor to wonder what happened to pages two and three.
- The document pane previews the rasterized page for a PDF, so the mark from slice 4 lands on the same bitmap the model read and the word boxes were measured on.
- Word boxes for a PDF with a text layer come from pdf.js rather than from an OCR pass, which is both faster and exact.
- This slice settles the highlighting spec's scanned-PDF open point: a first page with no extractable text is rasterized and sent through the tesseract pass slice 4 already built. The alternative the spec recorded, showing no highlight at all, would ship one of slice 7's three samples with highlighting that silently never works.
- The arithmetic, the editing, the region matching and the download envelope are untouched. Every type arrives at the same validated field set.

## Capabilities

### New Capabilities

None. All four capabilities this touches already exist.

### Modified Capabilities

- `extraction`: the route accepts the three image types rather than JPEG alone, the error code for a refused type is renamed, and what the model reads for a PDF is the rasterized first page.
- `limits`: the four accepted types split across two checks, the picker's four and the route's three, and the first-page rule gains the behavior that tells the visitor.
- `highlighting`: the scanned-PDF open point is settled by rasterizing and running the OCR pass, and a PDF's regions are expressed in the rasterized page's pixels.
- `receipt-workspace`: the picker offers four types, the document pane previews a rasterized PDF page, and the workspace reports both the rasterizing step and the first-page rule.

## Impact

- New `lib/pdf-page.ts` for the first-page rasterize and the text-layer word boxes, both browser-side, with `pdfjs-dist` joining the dependencies and its worker self-hosted under `public/` the way the tesseract assets already are.
- `lib/extract-receipt.ts`: `ACCEPTED_MIME_TYPE` becomes a set, the data URL carries the file's own type, and `not_jpeg` becomes `unsupported_type`.
- `lib/receipt-schema.ts`: the error code list.
- `components/ReceiptWorkspace.tsx`: the picker's `accept`, the rasterize step before the post, the preview source, the failure copy, and the first-page notice.
- `lib/word-boxes.ts` gains nothing new. The tesseract pass already takes a blob, so a rasterized page reaches it unchanged.
- No change to the Zod field set, the arithmetic, the edit module, the matcher or the download envelope.
