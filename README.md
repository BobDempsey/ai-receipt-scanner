# AI Receipt Scanner

**Live demo: [ai-receipt-scanner.bobdempsey83.com](https://ai-receipt-scanner.bobdempsey83.com)**, open to anyone with no account and no key of their own. Three sample receipts sit under the file picker, so there is something to scan the moment the page loads.

[![The app after reading a grocery till receipt: the left pane shows the photographed receipt with a teal rectangle drawn over the printed total, and the right pane lists the extracted fields with the model's confidence beside each one and a warning that the line items fall 0.90 short of the printed subtotal.](public/screenshots/extraction.png)](public/screenshots/extraction.png)

Hand it a photograph or a PDF of a receipt and it returns twelve typed fields, the line items among them, each value carrying the model's confidence and the characters it was read from. Click a field and the app draws a rectangle over the place on the image it came from. The arithmetic is checked in code, so a receipt whose items do not reach its printed subtotal says so instead of quietly balancing. Everything is editable where it sits, and the data leaves as JSON or CSV.

There is no chat box. You give it a receipt, it gives you data, and it shows its working at every step so you can tell a reading from a guess.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 16 on the App Router, React 19, TypeScript | The route that calls the model and the page that renders the result live in one tree, and the API key stays on the server side of it. |
| Interface | Mantine with its PostCSS preset | `Table`, `TextInput` and `FileInput` cover most of this app's surface, so a panel of thirty editable cells is Mantine components rather than hand-built controls. Mantine brings its own styling, so Tailwind is out rather than layered on top. |
| Model | The OpenAI API, a vision model, Structured Outputs in strict mode | Strict mode makes the field set the schema the answer has to satisfy, which removes the parse step and the retry loop a free-text answer would need. |
| Validation | Zod, the same schema on the server and in the browser | A model can satisfy a JSON schema and still hand back a date in the wrong order or a total as a float, so the parsed object is validated again before anything renders it. |
| Word boxes | pdf.js for a PDF's text layer, tesseract.js in a web worker otherwise | Both run in the browser, so the app never has to store a file to measure it, and the pixels the highlight is drawn against are the pixels the model read. |
| Money | Decimal strings compared over scaled integers, written in this repo | `lib/decimal.ts` lifts two decimal strings to a common scale as `BigInt` and compares exactly. A float would make the arithmetic check report differences the receipt never printed, and integer cents would round away the third decimal place a quantity can carry. |
| Session | IndexedDB keyed to the browser tab | The session table survives a reload and dies with the tab, which needs no database and puts no receipt on a server. |
| Rate limiting | A fixed hourly window per address, counted in Upstash Redis | A fixed window lets a refusal name the wall-clock hour the allowance returns. The counter is checked before the model call, because the limit exists for the API bill. |
| Host | Vercel, production deploying from `main` | The extraction is one serverless function beside the static pages. Vercel's 4.5 MB request body cap is also why the browser downscales a large photograph before it posts. |
| Tests | Vitest over the schema, the decimal arithmetic, the matcher and the exports | Every rule an edit follows lives in a pure module, so the rules are unit-tested even though no test environment renders a component yet. |

## Setup from a clean clone

Node 24.19 is what the project is developed and built on. Nothing else has to be installed first.

```bash
git clone https://github.com/BobDempsey/ai-receipt-scanner.git
cd ai-receipt-scanner
npm install
cp .env.example .env.local
npm run dev
```

Then open http://localhost:3000.

`.env.local` wants two things, and only the first is required:

- `OPENAI_API_KEY`. Without it the extraction route answers with the code `model_call_failed` and the page says the model could not be reached. Everything else loads.
- `KV_REST_API_URL` and `KV_REST_API_TOKEN`, the Upstash Redis credentials behind the per-IP limit. These are the names the Vercel Upstash integration writes, which is why the limiter constructs its client explicitly instead of calling `Redis.fromEnv()`. With neither set the limiter counts nothing, logs once that it is unconfigured, and allows the extraction, so a local run needs no Redis at all. Set one of the pair without the other and you get the same unconfigured path.

`predev` and `prebuild` run `scripts/copy-tesseract-assets.mjs` and `scripts/copy-pdfjs-assets.mjs`, which copy the tesseract.js worker and all six wasm cores plus the pdf.js worker out of `node_modules` into `public/tesseract/` and `public/pdfjs/`. Those eight files are about 26 MB and gitignored, so a fresh clone has an empty `public/pdfjs/` and only `eng.traineddata.gz` under `public/tesseract/` until one of those scripts has run. Both libraries would otherwise fetch their worker from a public CDN at runtime. Running `npm run build` or `npm run dev` is enough; there is no separate step to remember.

`npm run build` succeeds with no environment file at all, because the key is read on the server at call time rather than at build time. The other three commands are `npm run lint`, `npm run typecheck` and `npm test`.

The three sample receipts under `public/samples/` are committed. `node scripts/make-sample-receipts.mjs` rebuilds them from SVG through the `sharp` that arrives as a Next dependency, which is worth running only if you want to change what they print.

## How the extraction works

**Your browser prepares the file.** A PDF is rasterized at twice its page size and only the first page is kept, and a photograph over the 3,300,000-byte body budget is re-encoded as JPEG and halved until it fits. The image shown in the document pane is the image the model reads, which is what lets a rectangle drawn over it be trusted.

**One model call per receipt.** The image goes to the model as a base64 data URL through the Responses API, with `zodTextFormat` turning the shared Zod schema into the strict JSON schema the answer has to satisfy, so the field set and the output contract are the same object. Nothing hunts for JSON inside prose and nothing retries behind the visitor's back. A file that is not a receipt is a first-class answer: the response carries `isReceipt: false` with the reason the model gave, and the app shows the reason and stops.

**Zod validates the answer on the server.** Strict Structured Outputs guarantees the shape, not the content, so `lib/receipt-schema.ts` checks the parsed object again before it is sent to the browser. A failure answers with the code `validation_failed` and a fixed message carrying no field paths and no fragment of the model's answer; the server logs the failing paths alone.

**The highlighting is matched, never generated.** The app never asks the model where a value sits on the page, because a model answers that question with numbers that look precise and are wrong. The browser reads word boxes off the document instead, from a PDF's text layer or from tesseract.js when the page has none, and scores runs of adjacent words against the characters each field was read from using a normalized Levenshtein ratio. A score below 0.72 draws nothing. A correct field can therefore sit on the page with no rectangle beside it, and the pane says which of the two reasons applies: the receipt printed no value there, or the app could not find that text on the image.

**The arithmetic is checked in code.** The line items have to sum to the printed subtotal, and the subtotal plus the taxes plus the tip has to equal the total. Both comparisons are exact decimal equality at a common scale, with no cent of tolerance. A mismatch raises a warning naming the difference on both fields it involves, and the app never rewrites a number to close a gap.

**Corrections rerun both checks.** Every value is editable where it sits. Blur or Enter commits an edit, Escape puts back what the field held, and the field's own validator read off the schema refuses a date written the wrong way round. A committed edit clears that field's confidence, keeps the characters the model read the original from so the highlight still works, and marks the cell as something the visitor typed.

**Nothing is stored.** The upload lives in memory for the length of one request. The extracted receipts live in the visitor's own browser, keyed to the tab. The only state on a server is a counter of how many scans an address has spent this hour, which holds no receipt and no image.

## The figures this README states

Each one is read out of a constant the app enforces. `lib/project-facts.ts` is the source, the About page renders it directly, and the table below is transcribed from it by hand because a README cannot import TypeScript. Change one and all three move together.

| Figure | What it counts | Where it comes from |
| --- | --- | --- |
| 12 | fields per receipt | the keys of `receiptSchema` in `lib/receipt-schema.ts` |
| 4 | values on every line item | `ITEM_COLUMNS` in `lib/receipt-csv.ts` |
| 4 | file formats: JPEG, PNG, WebP and PDF, up to 8 MB | `ACCEPTED_IMAGE_TYPES` and `MAX_FILE_BYTES` in `lib/extract-receipt.ts` |
| 40 | scans a session, as a courtesy resting on a value the browser asserts | `SESSION_EXTRACTION_CAP` in `lib/session-count.ts` |
| 20 | scans an hour per address, as the control behind that courtesy | `IP_HOURLY_LIMIT` in `lib/rate-limit.ts` |
| 0.72 | match score a highlight needs | `MATCH_THRESHOLD` in `lib/highlight-match.ts` |
| 0.8 | confidence that flags a field for review | `REVIEW_THRESHOLD` in `lib/receipt-fields.ts` |
| 1 | model call per receipt | `EXTRACTION_MODEL` in `lib/model.ts` |

No accuracy percentage appears here yet. Measuring the extraction against labelled receipts is the next piece of work, and it lands that number in this README, the About page and the landing page's stat tiles in one change rather than in one of them.

## Where it reads badly

Every case below is one you can reproduce against the live demo. They are listed because a demo that only shows its good path tells you nothing you can check.

**Faded thermal paper.** A till receipt that has spent a month in a hot car prints grey on grey. The model guesses at the digits, and the OCR pass that draws the highlight finds no words at all, so a wrong figure can arrive with no mark beside it to check it against.

**Handwriting.** A total written in by hand, or a tip scrawled on a card slip, reads badly. Printed type is what the model and the OCR pass both handle well, and the word boxes OCR returns for cursive rarely match the value the model read.

**Angled or crumpled photographs.** A receipt shot from the side skews every printed line. The fields often still arrive; the highlight often does not, because the matcher scores runs of words inside one OCR text line and a curved line breaks into several.

**A PDF past its first page.** The app rasterizes page one and stops there. A two-page invoice loses everything on page two, and the document pane says which page of how many it read rather than hiding the gap.

**Receipts not printed in English.** The prompt is written in English. Amounts and dates usually survive, and the currency code often does, but a merchant name in another script can come back as an English guess at it.

**A receipt whose own arithmetic is wrong.** The checks compare figures printed on the page, so a receipt that rounds its own tax line raises the same warning a misread digit raises. The app names the difference and leaves the judgment to the reader, because it cannot tell those two apart and will not rewrite a number to close the gap.

**The review flag is barely exercised.** `gpt-6.1-sol`, the model this app is pinned to, has not yet reported a confidence under 0.8 on anything uploaded to the deployed app, including a deliberately degraded image. The flag rests on unit tests until labelled fixtures measure whether the model ever reports a useful middle confidence.

**A missing highlight is not a missing field.** When no run of words scores above 0.72 against what the model says it read, the app marks nothing rather than marking the wrong region. A correct field can sit on the page with no mark, and the pane says which of the two reasons applies.

## The session table and the exports

[![The field panel scrolled to the line items table, showing eleven grocery items with their descriptions, quantities, unit prices and amounts in editable cells. Items the receipt priced only as a total read absent rather than zero. Below the table sit a control that adds a row and the download and copy controls for JSON and CSV.](public/screenshots/line-items-and-export.png)](public/screenshots/line-items-and-export.png)

The JSON download is an envelope of three keys: `receipt` holding the validated object, `warnings` holding the derived arithmetic warnings, and `edited` naming each field the visitor typed into by the property path the receipt already uses, such as `total` or `lineItems.3.amount`. All three are always present and the last two are empty when nothing applies. The batch JSON is `{ "receipts": [...] }` with each entry that same envelope verbatim.

The CSV carries one row per line item, with the receipt's own fields repeated on every row, which is what lets a spreadsheet group or pivot on any of them. Taxes flatten to numbered `tax_n_label` and `tax_n_amount` pairs sized to the widest receipt in the file, item columns carry an `item_` prefix, and a null field is an empty cell rather than a zero. No CSV carries a confidence or a source text; the JSON export carries both.

## Project layout

| Path | What lives there |
| --- | --- |
| `app/api/extract/route.ts` | the one route that calls the model, over `lib/extract-receipt.ts` |
| `app/page.tsx` | the landing page, whose hero is the app itself |
| `app/about/page.tsx` | the pipeline, the stack and the failure cases, rendered from `lib/project-facts.ts` |
| `components/ReceiptWorkspace.tsx` | the two-pane workspace holding the receipt, the edits and the phases |
| `lib/receipt-schema.ts` | the Zod schema the model answers against and the server validates with |
| `lib/decimal.ts`, `lib/arithmetic.ts` | the decimal comparison and the two checks built on it |
| `lib/word-boxes.ts`, `lib/pdf-page.ts`, `lib/highlight-match.ts` | the word boxes and the fuzzy match behind the highlight |
| `lib/project-facts.ts` | the figures and the failure cases this README is transcribed from |
| `openspec/` | the capability specs and the archived change folder for each slice |
| `scripts/` | the vendor asset copies, the sample generator and the screenshot capture |

## Licence and the samples

The three sample receipts are invented. The merchants, the addresses and the card digits belong to no real business and no real card, and each image says so in its own footer as well as on the page beside it.

© Bob Dempsey. The fourth AI project on [bobdempsey83.com](https://bobdempsey83.com).
