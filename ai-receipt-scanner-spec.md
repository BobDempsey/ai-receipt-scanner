# AI Receipt Scanner spec

The next project linked from bobdempsey83.com/portfolio. It reads a photo or PDF of a receipt and returns typed fields a person can check, correct and export. There is no chat box anywhere in it, which is the point: the three AI projects already on the portfolio are all things you type at, and this one is a workflow with a model inside it.

Read `docs/portfolio-project-spec.md` in the bobdempsey83.com repo first. That file is the baseline for every portfolio project (themes, fixed nav, footer, About page, UI style, no-signup demo, README, CI, rate limits, and the card and resume entry added when it ships). This spec fills in what is specific to this app, and where the two disagree, this one wins.

## 1. Name and badges

The project is **AI Receipt Scanner**. The portfolio card carries the `ai` badges `AI Vision` and `AI Extraction`, and a third badge comes from the tech list, where `OpenAI API` renders `OpenAI LLM`.

This one runs on OpenAI too, so all four AI projects share a provider. What separates this card from the three above it is the shape of the app, a workflow with no chat box, rather than the vendor behind it.

## 2. What a visitor does

They land on the page and see the drop zone in the hero, with three sample receipts sitting under it. They can try the app without finding a file of their own, and without scrolling.

They drop in a photo or a PDF. The image stays on the left at full height and the extracted form fills in on the right as the model reads it. A PDF's first page becomes an image in the browser before anything is sent, and that image is what the left pane shows, so the visitor checks a value against the same bitmap the model read. When the PDF runs to more than one page the app names the count beside it, such as the first page of four, rather than leaving the visitor to wonder what happened to page two. When a photograph is larger than the host will carry, the browser reduces it before it posts and the app says so, naming the size before and after, so a visitor checking the fields against their own file knows the model read a smaller copy. Every field shows a confidence state, and reaching a field, by a click or by keyboard focus, marks the region of the image the value came from. One field is marked at a time, so nothing on the image claims two fields were read from the same words.

Fields the app is not sure about are flagged. The visitor fixes them inline, and the app rechecks the arithmetic on every edit.

When the form is right they export: download JSON, download CSV, or copy either to the clipboard, and the copy confirms when it worked and says plainly when the browser refused it. A session table below the panes holds every receipt they have scanned, newest first, naming each one's merchant, date and total and saying when it carries an arithmetic warning, so they can do several and export the batch as one file. Selecting a row reopens that receipt into the panes as the receipt every control acts on, and it comes back with no picture, because the app keeps no upload, so nothing marks a region on it. A session holding nothing shows no list at all. Receipts reach the table one upload at a time.

If the upload is not a receipt, the app says so and shows nothing else.

The landing page is the app page. There is no separate marketing page: the workspace is the hero, usable without scrolling, and the sections that explain it sit underneath in the order a visitor needs them, numbered step cards for the pipeline, a row of stat tiles carrying figures, two real screenshots of the running app that open full size on click, and a closing band carrying the action that follows from the demo. `app/layout.tsx` renders the nav and the footer, so every route carries both and a page added later cannot forget either. That layout stays a server component, and the two pieces that need state, the theme toggle and the year the footer prints, are client components beneath it.

The control in the hero is a file picker offering the four accepted types, with the three samples under it. Drag and drop onto the page is still wanted and is not built, so the drop zone named above states the intent rather than the control a visitor presses today.

The stat tiles carry figures the code already settles: 12 fields per receipt, 4 values on every line item, 4 file formats up to 8 MB, and 40 scans a session. No accuracy percentage appears anywhere on the site yet, because the labelled set of section 8 has not been measured. `lib/project-facts.ts` holds every figure the site states, each derived from the constant behind it rather than typed a second time, and the About page reads that module directly.

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

**One model call per receipt.** The image goes to `gpt-6.1-sol` with Structured Outputs on the Responses API, `text: { format: zodTextFormat(modelReceiptSchema, "receipt") }`, the SDK helper that writes the `json_schema` format out of a Zod schema with `strict: true` and the name the format requires. That schema is the field set above. Strict mode forces the shape, so there is no JSON parsing out of prose and no retry loop around a malformed response. Zod validates the parsed object a second time on the server, against `receiptSchema`, the same shape carrying the decimal and date patterns strict mode will not accept, because a schema the model satisfies can still be wrong about types. A PDF never reaches that call as a PDF: the page rasterizes its first page and posts the bitmap, so the route takes `image/jpeg`, `image/png` and `image/webp`, and no document parser runs on the server.

**Per-field confidence comes from the model.** Every field in the response schema carries a sibling `confidence` between 0 and 1 and a `sourceText` holding the characters the model read the value from. Anything under 0.8 is flagged for review in the UI.

**Field highlighting is matched, not generated.** The model does not return coordinates, and asking it to would produce numbers that look precise and are not. Instead the app gets word boxes from the document itself, then fuzzy-matches each field's `sourceText` against those words to find the region. A PDF's first page gives boxes from its pdf.js text layer when it has one, and a text layer of a few words is still an answer, so there is no word count below which the app reaches for OCR instead. A first page with no extractable text at all is rasterized and run through the same tesseract.js pass an image takes, which is how a scanned invoice gets the highlights a photograph gets. An image goes through tesseract.js in a web worker on the client, so the OCR pass costs nothing on the server and the file never has to be stored to be measured. The pass starts from the same press that sends the extraction, so the two run beside each other, and the fields stay readable, editable and exportable whether or not the boxes have landed. For a PDF, boxes from either source are expressed in the pixels of the rasterized page, so one basis serves both and the mark lands on the bitmap the pane is showing.

The candidates the matcher scores are the runs of adjacent word boxes within one text line, capped at the `sourceText` token count plus two, so no candidate spans two lines. It scores each candidate as a normalized Levenshtein ratio, `1 - distance / max(len)`, over text case folded with whitespace and every punctuation mark except the decimal point stripped, because "4200" and "42.00" are different amounts. A candidate counts as a match at 0.72 or above, held as `MATCH_THRESHOLD` in `lib/highlight-match.ts`. That number is a judgment rather than a measurement: the 40 labelled fixtures of section 8 are the only evidence that can confirm it or replace it.

For the OCR pass alone the browser downscales the image to a 2000-pixel long edge and multiplies every box back by the scale it used, so a region is always expressed in the image's natural pixels. That scale is separate from the downscaling the upload itself needs against Vercel's 4.5 MB request body cap, and it does not change the bytes the model sees. A PDF page is rasterized at twice its CSS size, capped at that same 2000-pixel long edge, and written out as PNG rather than JPEG, because a scanned receipt's thin strokes are what the model and the OCR pass both read and JPEG's ringing is worst exactly there. tesseract.js serves its worker script, its six wasm core variants and its English language data from `public/tesseract/` rather than from a CDN, so an outage elsewhere cannot break the demo, and that worker keeps the language data out of the browser's storage, because the session table of section 5 is the only thing this app writes there. pdf.js serves its own worker from `public/pdfjs/` on the same argument, and one shared copy step puts both vendors' files there out of `node_modules` before every dev run and every build.

When no candidate clears the threshold, the field shows no highlight rather than a wrong one, and the panel says which of the two absent cases it is: a null `sourceText` means the receipt printed no value to find, and a `sourceText` with no region means the app could not find that text on the image. The highlight is display only. No region, no selection and no word box reaches the receipt object, the arithmetic checks or the download.

**Arithmetic is checked in code, not by the model.** Line items sum to the subtotal, and subtotal plus taxes plus tip equals the total. A mismatch is surfaced as a warning on the two fields involved, with the difference named. The app never quietly rewrites a number to make the math close.

**Not a receipt is a first-class answer.** The response schema has an `isReceipt` boolean and a `reason` string. When it comes back false, the app shows the reason and stops, which is this project's version of the rule that the AI feature admits when something is past its data.

**The CSV is one row per line item, with the receipt's own fields repeated on every row**, so a spreadsheet can group or pivot on any of them. A receipt that itemized nothing still gets one row whose item columns are empty, and a field the receipt did not print is an empty cell rather than a 0, because a 0 claims the receipt printed one. The column names and their order are the same on every export: the receipt's own fields in snake case (`merchant`, `merchant_address`, `date`, `time`, `currency`, `subtotal`, `tip`, `total`, `payment_method`, `card_last4`), then numbered `tax_1_label` and `tax_1_amount` pairs, then `item_description`, `item_quantity`, `item_unit_price` and `item_amount`. The item columns carry that prefix so an item amount is never read as the receipt total. Tax columns are sized to the widest receipt in the export, which is what lets one header serve every receipt in a file and makes the single-receipt export the batch export over a list of one. Quoting is minimal: a comma, a double quote or a newline puts a cell in quotes and an inner quote doubles, nothing else is altered, so no leading apostrophe, no thousands separator and no currency symbol reaches the file. Rows end CRLF.

**A CSV carries no `confidence` and no `sourceText`.** Thirty-odd fields each gaining two siblings would bury the amounts a visitor opened the file for, so JSON is the export that carries both and the app says so where the CSV control sits. A receipt the model refused contributes no CSV data row and is not held in the session table either, because it fills no column the table lists; JSON is the format that carries a refusal and its reason. The batch JSON is `{ receipts: [ ... ] }`, each entry the envelope of `receipt`, `warnings` and `edited` the single-receipt download already writes, with no count and no timestamp around it. The four files download as `receipt.json`, `receipt.csv`, `session-receipts.json` and `session-receipts.csv`.

## 5. What is stored

Nothing on the server. Uploads are held in memory for the length of the request and never written to disk or to object storage. Extracted results live in the browser, in IndexedDB keyed to the tab's session, so a reload keeps the table and no visitor's scan can reach another visitor.

The table is one IndexedDB database, `ai-receipt-scanner`, holding a `receipts` store indexed by `sessionId`. The session id is a random id in `sessionStorage`, created once per tab, so the table's lifetime is the tab's while the records outlive it harmlessly and a record whose session is gone is never listed. A stored record holds exactly six keys: `id`, `sessionId`, `savedAt`, `receipt`, `warnings` and `edited`. No id and no timestamp reaches the receipt object, which Zod governs, and no upload bytes and no image reach the store, which is why a reopened receipt has fields and no picture. The app writes the record on extraction and again on every accepted edit, add and remove, so the stored copy is true at all times rather than at scan time, and an edit keeps the record's original `savedAt`, so the list stays in scan order. The store enforces no count of its own, because the 40-per-session cap of section 6 is a separate check the app runs. When a browser offers no IndexedDB, or refuses it in a private window, the app reports an empty table and leaves the receipt on screen working rather than blanking the panel.

The only server-side state is rate-limit counters. They live in Upstash Redis, reached over its REST API with the `KV_REST_API_URL` and `KV_REST_API_TOKEN` the Vercel marketplace integration writes, because a counter in a serverless function's memory counts one warm instance rather than an address. There is no database to seed, which is also why nothing one visitor does changes what the next one sees.

Say all of this on the page, next to the drop zone. A stranger uploading a real receipt deserves to know before they do it, not in the About page afterwards.

## 6. Caps and limits

| Limit | Value |
| --- | --- |
| File size | 8 MB |
| File types | `image/jpeg`, `image/png`, `image/webp`, `application/pdf` |
| PDF pages read | 1 (the first) |
| Files per batch | 5, at the server route |
| Extractions per IP | 20 an hour, counted before the model call |
| Extractions per session | 40, in the app |
| Request body posted | 3,300,000 bytes, which the browser reduces an image to fit |

Reject an oversized or wrong-typed file in the browser before it is uploaded, and again on the server, because the browser check is a convenience and not a control. The four types are what the page offers a visitor; the server route accepts the three image types, because the page rasterizes a PDF's first page before it posts. Both checks name the four a visitor can pick, so a refusal never reads as the app rejecting a type the page offered, and both answer with one code, `unsupported_type`, whose message reads "The app reads JPEG, PNG and WebP images and PDF receipts."

A PDF of more than one page carries a notice beside the document naming the count, such as the first page of four. A single-page PDF says nothing about pages, because it left nothing out, and neither does an image.

An image the host will not carry is reduced rather than refused. The browser re-encodes a chosen image as JPEG at quality 0.82 and halves its long edge only when the re-encode at the natural size is not enough on its own, stopping at the first size whose encoded bytes fit `BODY_BUDGET_BYTES`, 3,300,000. That budget is 4,500,000 times three quarters, for the base64 expansion the route applies when it builds the data URL, with 75,000 bytes held back for the multipart wrapper. Below a 640-pixel long edge the app gives up and says the image is too large to send even reduced, because a receipt's body text stops being legible under that. The 8 MB file cap is unchanged by any of this, and a rasterized PDF page reaches the same path as an image like any other. The workspace says when it reduced an image, naming the size before and after, and says nothing when nothing was reduced.

The five-file cap is checked at the server route alone. The page's picker submits one file, so the browser has no batch to check and the app claims no check it does not make. A request carrying more files than that can only be one crafted outside the app, and the route refuses it before it calls the model.

The hour of the per-IP limit is a fixed window. The counter key is the caller's address plus the clock hour, incremented with `INCRBY` and given an `EXPIRE` on the first write of that window alone, so the stated reset time stays put and an old window retires with no sweep behind it. A refused request answers with the code `rate_limited`, the 20, the fact that the allowance is shared by everyone sending from the same address, and the time it returns, which the page formats in the visitor's own zone from the epoch-millisecond `resetAt` the route sends. The cost of a fixed window is a boundary burst: a visitor can spend twenty at 10:59 and twenty more at 11:00, which for a demo whose risk is a bored stranger buys a refusal a visitor can act on. A request with no usable forwarded address counts against one shared key rather than passing uncounted, so a missing address cannot become an unlimited lane.

A counter the route cannot reach refuses the extraction, with `rate_limited`, HTTP 503 and no reset time to name, because failing open on a route that spends money is the wrong default. Credentials that are absent altogether instead allow the extraction and log loudly, because a deployment nobody finished should not take the demo down. Both choices are the opposite way round from the session table, which keeps working when a browser refuses IndexedDB, and the difference is that a lost list costs the visitor nothing where an uncounted model call costs money.

The session cap of 40 counts against the same tab session id the stored receipts are keyed to, held in `sessionStorage` beside that id rather than derived from the stored records, because a visitor could otherwise lower the cap by scanning receipts the app refused to store, and because the count has to work in a browser offering no IndexedDB. It survives a reload, ends when the tab does, and a new tab starts at zero. The app checks it before anything leaves the browser, so a refusal costs no request, and the server deliberately does not check it again: the server cannot verify a tab session id a browser asserts, so the cap is an in-app courtesy and the per-IP limit is the control. Its code is `session_cap_reached`, which never reaches a response body, because the app refuses before it sends.

One extraction is one model call. A refusal the route made before calling the model costs nothing against either allowance, the hourly refusal included, and a call that was made and then failed costs one, because the money was spent.

## 7. The samples

Three fictional receipts ship with the app under `public/samples/`: `grocery-thermal.jpg`, a thermal receipt from LANTERN ROW MARKET with eleven line items, `restaurant-tip.jpg`, a bill from THE COPPER KETTLE BISTRO carrying a tip and two tax lines whose printed figures all add up, and `invoice-scanned.pdf`, a scan from ALDERWAY OFFICE SUPPLY CO. with no text layer, so it exercises the rasterize and the OCR fallback of section 4. Each is labelled fictional where the visitor reads it, and each loads with one press through the same submit an upload uses, so nothing downstream of the picker learns that a sample is not a file the visitor chose.

Pick them so they exercise the hard parts rather than the easy one. The grocery receipt is the one that does not balance: its eleven items sum to 66.73 against a printed subtotal of 67.63, a gap of 0.90, so a visitor sees the arithmetic warning without having to hunt for a bad receipt. Its printed total agrees with its printed subtotal, so that gap raises the line-item warning alone. `scripts/make-sample-receipts.mjs` writes the three files and holds the reason behind every amount printed on them.

## 8. Accuracy, measured

Hand-label 40 receipts and keep them in the repo as fixtures with their expected output. Report field-level accuracy, and report `total` and `date` separately, because those two are what anyone would actually use.

Put the numbers in three places, the landing page's stat tiles, the About page and the README, and keep them equal in all three. When the prompt or the model changes, rerun the set and change all three together. Until the set is labelled the tiles carry figures the code settles instead, because a tile reading "coming soon" is worse than a tile reading something true.

Document the failure cases in the README rather than hiding them, and name them on the About page as well. `lib/project-facts.ts` is where they live, the About page renders them and the README transcribes them, so the two documents cannot answer the question differently. The eight cases it names today are faded thermal paper, handwriting, angled or crumpled photographs, a PDF past its first page, a receipt printed in another language, a receipt whose own arithmetic is wrong, the review flag the deployed model has never yet triggered, and a missing highlight that is not a missing field. A reader learns more from the cases it gets wrong than from the figure it gets right.

## 9. Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16, React 19, TypeScript |
| UI | Mantine, with its PostCSS preset |
| Site chrome | The nav and the footer in `app/layout.tsx`, so every route carries them, with the theme toggle on Mantine's `useMantineColorScheme` and `ColorSchemeScript` the one thing applying the stored theme before first paint |
| Shared measurements | CSS custom properties on `:root` in `app/globals.css`: `--content-max` at 72rem, `--prose-measure` at 65ch, a clamped headline scale with tight tracking, and `--nav-height`. Every container reads `Container size="var(--content-max)"` |
| Accent | Mantine's teal at `primaryShade` light 9 and dark 5, with Mantine's own dimmed text overridden because it missed the contrast floor |
| Motion | CSS alone: a hover lift and a scroll reveal on `animation-timeline: view()`, every rule inside `@media (prefers-reduced-motion: no-preference)` behind an `@supports` guard |
| Model | OpenAI API, `gpt-6.1-sol`, Structured Outputs in strict mode on the Responses API |
| Validation | Zod, shared between the client and the server route |
| OCR for boxes | tesseract.js in a web worker, its worker, wasm core and language data self-hosted under `public/tesseract/`; `pdfjs-dist` 6.4.299 for a PDF's first page, its text layer and its rasterizing, with its worker self-hosted under `public/pdfjs/` |
| Session state | IndexedDB, database `ai-receipt-scanner`, with the tab's session id and its extraction count in `sessionStorage` |
| Rate-limit counters | Upstash Redis over its REST API through `@upstash/redis`, keyed by address and clock hour |
| Host | Vercel, with Web Analytics in production builds only |
| Tests | Vitest for the schema, the arithmetic checks and the matcher; Playwright for the upload-to-export path |

Slice 8 measured the contrast rather than assuming it, and the shipped ratios are the numbers a later theme change has to beat: body text at 21.00 to 1 in light and 9.37 to 1 in dark, the accent against the surface behind it at 5.00 and 7.29, dimmed text at 8.18 and 7.83, and a label on a filled accent at 5.00 and 9.86. The shades moved because the defaults failed: teal 6 measured 2.55 to 1 against the white body and teal 8 measured 3.94 to 1 against the dark one, and Mantine's own dimmed text measured 3.32 and 4.04.

The scroll reveal animates from a visible state, 88 percent opacity half a line low, so a browser without `animation-timeline` and an animation that never fires both leave the content readable where it stands. Nothing runs on first paint.

Next and React, chosen over the Nuxt this spec originally called for. The Vue argument was that the resume is retargeted at Vue and Nuxt; React won anyway, on the grounds that it is the stack the work gets done in.

## 10. Card and tech tags

The portfolio card shows only the first five `tech` entries, so order them `OpenAI API`, `Next.js`, `TypeScript`, `Mantine`, `tesseract.js`, with `Zod` and `Vercel` behind the cut.

The card description leads with the AI feature and says what the app does for the person using it, the way the three cards above it do.

## 11. Demo URL

`https://ai-receipt-scanner.bobdempsey83.com`, with the GitHub repo at `BobDempsey/ai-receipt-scanner`.

## 12. The blog post

This project has a post in it, and it is the highlighting: the model will not give you coordinates you can trust, so the app earns them from OCR word boxes and a fuzzy match against the text the model says it read. That is a real trade-off with a real failure mode (no match, no highlight), which is the kind of thing the portfolio spec asks a post to be about.
