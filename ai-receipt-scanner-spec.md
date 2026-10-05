# AI Receipt Scanner spec

The next project linked from bobdempsey83.com/portfolio. It reads a photo or PDF of a receipt and returns typed fields a person can check, correct and export. There is no chat box anywhere in it, which is the point: the three AI projects already on the portfolio are all things you type at, and this one is a workflow with a model inside it.

Read `docs/portfolio-project-spec.md` in the bobdempsey83.com repo first. That file is the baseline for every portfolio project (themes, fixed nav, footer, About page, UI style, no-signup demo, README, CI, rate limits, and the card and resume entry added when it ships). This spec fills in what is specific to this app, and where the two disagree, this one wins.

## 1. Name and badges

The project is **AI Receipt Scanner**. The portfolio card carries the `ai` badges `AI Vision` and `AI Extraction`, and a third badge comes from the tech list, where `OpenAI API` renders `OpenAI LLM`.

This one runs on OpenAI too, so all four AI projects share a provider. What separates this card from the three above it is the shape of the app, a workflow with no chat box, rather than the vendor behind it.

## 2. What a visitor does

They land on the page and see the drop zone in the hero, with three sample receipts sitting under it. They can try the app without finding a file of their own, and without scrolling.

They drop in a photo or a PDF. The image stays on the left at full height and the extracted form fills in on the right as the model reads it. A PDF's first page becomes an image in the browser before anything is sent, and that image is what the left pane shows, so the visitor checks a value against the same bitmap the model read. When the PDF runs to more than one page the app names the count beside it, such as the first page of four, rather than leaving the visitor to wonder what happened to page two. Every field shows a confidence state, and reaching a field, by a click or by keyboard focus, marks the region of the image the value came from. One field is marked at a time, so nothing on the image claims two fields were read from the same words.

Fields the app is not sure about are flagged. The visitor fixes them inline, and the app rechecks the arithmetic on every edit.

When the form is right they export: download JSON, download CSV, or copy either to the clipboard. A session table below holds every receipt they have scanned, so they can do several and export the batch as one file.

If the upload is not a receipt, the app says so and shows nothing else.

## 3. The fields

One flat object per receipt, plus a line-item array:

| Field | Type | Notes |
| --- | --- | --- |
| `merchant` | string | Trading name as printed, not the legal entity. |
| `merchantAddress` | string or null | Single line, whatever is printed. |
| `date` | ISO date | Local to the receipt, no timezone guessing. |
| `time` | 24h string or null | Only when printed. |
| `currency` | ISO 4217 | Inferred from the symbol and locale, never defaulted to USD silently. |
| `subtotal` | decimal | |
| `taxes` | array | Each with `label` and `amount`, because a receipt can carry more than one. |
| `tip` | decimal or null | |
| `total` | decimal | |
| `paymentMethod` | string or null | `visa`, `cash`, `amex`, and so on. |
| `cardLast4` | string or null | |
| `lineItems` | array | Each with `description`, `quantity`, `unitPrice`, `amount`. `quantity` is a decimal string as well, so a weighed item keeps its `0.734`. |

Money is a decimal string, never a float, and it is parsed with Zod on the way out of the model.

## 4. How the extraction works

**One model call per receipt.** The image goes to `gpt-6.1-sol` with Structured Outputs on the Responses API, `text: { format: { type: "json_schema", strict: true, schema } }`, whose schema is the field set above. Strict mode forces the shape, so there is no JSON parsing out of prose and no retry loop around a malformed response. Zod validates the parsed object a second time on the server, because a schema the model satisfies can still be wrong about types. A PDF never reaches that call as a PDF: the page rasterizes its first page and posts the bitmap, so the route takes `image/jpeg`, `image/png` and `image/webp`, and no document parser runs on the server.

**Per-field confidence comes from the model.** Every field in the response schema carries a sibling `confidence` between 0 and 1 and a `sourceText` holding the characters the model read the value from. Anything under 0.8 is flagged for review in the UI.

**Field highlighting is matched, not generated.** The model does not return coordinates, and asking it to would produce numbers that look precise and are not. Instead the app gets word boxes from the document itself, then fuzzy-matches each field's `sourceText` against those words to find the region. A PDF's first page gives boxes from its pdf.js text layer when it has one, and a text layer of a few words is still an answer, so there is no word count below which the app reaches for OCR instead. A first page with no extractable text at all is rasterized and run through the same tesseract.js pass an image takes, which is how a scanned invoice gets the highlights a photograph gets. An image goes through tesseract.js in a web worker on the client, so the OCR pass costs nothing on the server and the file never has to be stored to be measured. The pass starts from the same press that sends the extraction, so the two run beside each other, and the fields stay readable, editable and exportable whether or not the boxes have landed. For a PDF, boxes from either source are expressed in the pixels of the rasterized page, so one basis serves both and the mark lands on the bitmap the pane is showing.

The candidates the matcher scores are the runs of adjacent word boxes within one text line, capped at the `sourceText` token count plus two, so no candidate spans two lines. It scores each candidate as a normalized Levenshtein ratio, `1 - distance / max(len)`, over text case folded with whitespace and every punctuation mark except the decimal point stripped, because "4200" and "42.00" are different amounts. A candidate counts as a match at 0.72 or above, held as `MATCH_THRESHOLD` in `lib/highlight-match.ts`. That number is a judgment rather than a measurement: the 40 labelled fixtures of section 8 are the only evidence that can confirm it or replace it.

For the OCR pass alone the browser downscales the image to a 2000-pixel long edge and multiplies every box back by the scale it used, so a region is always expressed in the image's natural pixels. That scale is separate from the downscaling the upload itself needs against Vercel's 4.5 MB request body cap, and it does not change the bytes the model sees. A PDF page is rasterized at twice its CSS size, capped at that same 2000-pixel long edge, and written out as PNG rather than JPEG, because a scanned receipt's thin strokes are what the model and the OCR pass both read and JPEG's ringing is worst exactly there. tesseract.js serves its worker script, its six wasm core variants and its English language data from `public/tesseract/` rather than from a CDN, so an outage elsewhere cannot break the demo, and that worker keeps the language data out of the browser's storage, because the session table of section 5 is the only thing this app writes there. pdf.js serves its own worker from `public/pdfjs/` on the same argument, and one shared copy step puts both vendors' files there out of `node_modules` before every dev run and every build.

When no candidate clears the threshold, the field shows no highlight rather than a wrong one, and the panel says which of the two absent cases it is: a null `sourceText` means the receipt printed no value to find, and a `sourceText` with no region means the app could not find that text on the image. The highlight is display only. No region, no selection and no word box reaches the receipt object, the arithmetic checks or the download.

**Arithmetic is checked in code, not by the model.** Line items sum to the subtotal, and subtotal plus taxes plus tip equals the total. A mismatch is surfaced as a warning on the two fields involved, with the difference named. The app never quietly rewrites a number to make the math close.

**Not a receipt is a first-class answer.** The response schema has an `isReceipt` boolean and a `reason` string. When it comes back false, the app shows the reason and stops, which is this project's version of the rule that the AI feature admits when something is past its data.

## 5. What is stored

Nothing. Uploads are held in memory for the length of the request and never written to disk or to object storage. Extracted results live in the browser, in IndexedDB keyed to the tab's session, so a reload keeps the table and no visitor's scan can reach another visitor.

The only server-side state is rate-limit counters. There is no database to seed, which is also why nothing one visitor does changes what the next one sees.

Say all of this on the page, next to the drop zone. A stranger uploading a real receipt deserves to know before they do it, not in the About page afterwards.

## 6. Caps and limits

| Limit | Value |
| --- | --- |
| File size | 8 MB |
| File types | `image/jpeg`, `image/png`, `image/webp`, `application/pdf` |
| PDF pages read | 1 (the first) |
| Files per batch | 5 |
| Extractions per IP | 20 an hour, at the edge |
| Extractions per session | 40, in the app |

Reject an oversized or wrong-typed file in the browser before it is uploaded, and again on the server, because the browser check is a convenience and not a control. The four types are what the page offers a visitor; the server route accepts the three image types, because the page rasterizes a PDF's first page before it posts. Both checks name the four a visitor can pick, so a refusal never reads as the app rejecting a type the page offered, and both answer with one code, `unsupported_type`, whose message reads "The app reads JPEG, PNG and WebP images and PDF receipts."

A PDF of more than one page carries a notice beside the document naming the count, such as the first page of four. A single-page PDF says nothing about pages, because it left nothing out, and neither does an image.

## 7. The samples

Three fictional receipts ship with the app: a thermal grocery receipt with many line items, a restaurant receipt with a tip and two tax lines, and a scanned PDF invoice. Each is labelled fictional on the page.

Pick them so they exercise the hard parts rather than the easy one. One of the three should have a line-item sum that does not match its printed subtotal, so a visitor sees the arithmetic warning without having to hunt for a bad receipt.

## 8. Accuracy, measured

Hand-label 40 receipts and keep them in the repo as fixtures with their expected output. Report field-level accuracy, and report `total` and `date` separately, because those two are what anyone would actually use.

Put the numbers on the About page and in the README, and keep them equal in both. When the prompt or the model changes, rerun the set and change both numbers together.

Document the failure cases in the README rather than hiding them: faded thermal paper, handwritten totals, receipts photographed at an angle, and any language the labelled set does not cover. A reader learns more from the four things it gets wrong than from the figure it gets right.

## 9. Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16, React 19, TypeScript |
| UI | Mantine, with its PostCSS preset |
| Model | OpenAI API, `gpt-6.1-sol`, Structured Outputs in strict mode on the Responses API |
| Validation | Zod, shared between the client and the server route |
| OCR for boxes | tesseract.js in a web worker, its worker, wasm core and language data self-hosted under `public/tesseract/`; `pdfjs-dist` 6.4.299 for a PDF's first page, its text layer and its rasterizing, with its worker self-hosted under `public/pdfjs/` |
| Session state | IndexedDB |
| Host | Vercel, with Web Analytics in production builds only |
| Tests | Vitest for the schema, the arithmetic checks and the matcher; Playwright for the upload-to-export path |

Next and React, chosen over the Nuxt this spec originally called for. The Vue argument was that the resume is retargeted at Vue and Nuxt; React won anyway, on the grounds that it is the stack the work gets done in.

## 10. Card and tech tags

The portfolio card shows only the first five `tech` entries, so order them `OpenAI API`, `Next.js`, `TypeScript`, `Mantine`, `tesseract.js`, with `Zod` and `Vercel` behind the cut.

The card description leads with the AI feature and says what the app does for the person using it, the way the three cards above it do.

## 11. Demo URL

`https://ai-receipt-scanner.bobdempsey83.com`, with the GitHub repo at `BobDempsey/ai-receipt-scanner`.

## 12. The blog post

This project has a post in it, and it is the highlighting: the model will not give you coordinates you can trust, so the app earns them from OCR word boxes and a fuzzy match against the text the model says it read. That is a real trade-off with a real failure mode (no match, no highlight), which is the kind of thing the portfolio spec asks a post to be about.
