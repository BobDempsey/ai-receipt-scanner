# Tasks

Slice 1 of the vertical-slice plan in the repo's `tasks.md`: the walking skeleton. One JPEG, one model call, the flat fields read-only, a JSON download, working in the deployed app.

## 1. Protect the tree, then scaffold in place

- [x] 1.1 Commit the working tree before anything is generated, and verify `git status` reports it clean with the commit on `main` and pushed to `origin`
- [x] 1.2 Write down the five protected paths that must not be deleted, emptied or overwritten (`ai-receipt-scanner-spec.md`, `handoff.md`, `tasks.md`, `openspec/`, `.claude/`) and verify each one exists before the generator runs
- [x] 1.3 Run `npx create-next-app@latest . --ts --app` **in this directory**, declining Tailwind, and verify the generator wrote `package.json`, `tsconfig.json`, `next.config.ts` and `app/layout.tsx` without touching any protected path. If the generator refuses to run because the directory is not empty, scaffold into a sibling temporary directory and copy the generated files in; never clear this directory to satisfy it
- [x] 1.4 Verify the five protected paths are still present and unmodified by reading `git status` and `git diff --stat`, and stop and report if any of them appears as changed or deleted
- [x] 1.5 Run `npm run dev` and verify the generated page loads at `http://localhost:3000`

## 2. Mantine

- [x] 2.1 Install `@mantine/core`, `@mantine/hooks`, `postcss-preset-mantine`, `postcss-simple-vars` and `postcss`, and verify `npm install` completes and `package.json` lists all five
- [x] 2.2 Add `postcss.config.mjs` with `postcss-preset-mantine` and `postcss-simple-vars`, and verify the dev server restarts without a PostCSS error
- [x] 2.3 Put `ColorSchemeScript` in the root layout's `<head>` and wrap the body in `MantineProvider`, importing `@mantine/core/styles.css`, and verify a Mantine `Button` on the page renders with Mantine's styles rather than the browser default
- [x] 2.4 Confirm Tailwind is absent from `package.json`, `postcss.config.mjs` and `app/globals.css`, and remove it if the generator added it anyway

## 3. The shared Zod schema

- [ ] 3.1 Write the slice 1 schema module holding `isReceipt`, `reason`, `merchant`, `merchantAddress`, `date`, `time`, `currency`, `subtotal`, `taxes[]` (`label`, `amount`), `tip`, `total`, `paymentMethod` and `cardLast4`, each with its flat `…Confidence` and `…SourceText` sibling keys, using `.nullable()` and never `.optional()`, and verify `tsc --noEmit` passes
- [ ] 3.2 Type every monetary value as a string carrying a decimal regex, and verify the schema rejects a JSON number for `total` and accepts the string `"42.00"` with its trailing zeros intact
- [ ] 3.3 Install Vitest and add schema tests covering a full receipt, every nullable field absent, two tax lines, a number where a decimal string belongs, and a confidence outside 0 to 1, and verify `npm test` passes
- [ ] 3.4 Keep the pinned model id `gpt-6.1-sol` in its own module with a comment recording that it was read off OpenAI's model list on 2026-10-01 and carries `image_input` and `structured_outputs`, and verify the route imports it from there rather than naming a model inline

## 4. The extraction route

- [ ] 4.1 Add `app/api/extract/route.ts` on the Node runtime, reading one file from `FormData`, and verify a `curl` post of a JPEG reaches the handler
- [ ] 4.2 Reject anything that is not `image/jpeg` with `{ error: { code: "not_jpeg" } }`, and verify a PNG post is refused without an OpenAI call
- [ ] 4.3 Encode the uploaded bytes as a base64 data URL in memory and pass them as the image input of one `client.responses.create()` call, with `text.format` set to the strict JSON Schema derived from the Zod schema, and verify the route writes nothing to disk and makes exactly one call per request
- [ ] 4.4 Validate the parsed object with the same Zod schema before returning, and verify that a deliberately broken parse returns `{ error: { code: "validation_failed" } }` carrying no Zod issue text, no field paths and no fragment of the model's answer
- [ ] 4.5 Log the failing field paths on a validation failure without the uploaded bytes and without the model's full answer, and verify the server log shows the paths and neither of the two
- [ ] 4.6 Return 200 with `reason` filled and the field values null when `isReceipt` is false, and verify a photo of a menu comes back as a refusal rather than an error
- [ ] 4.7 Read `OPENAI_API_KEY` on the server only, add `.env.example` listing it with a placeholder, keep `.env.local` out of git, and verify `npm run build` then a grep of `.next/static` finds no trace of the key
- [ ] 4.8 Add route tests covering the not-a-JPEG refusal, the validation failure response and the `isReceipt: false` path with the OpenAI client stubbed, and verify `npm test` passes

## 5. The workspace

- [ ] 5.1 Build the client component holding the chosen file, the request state and the result, with a file picker that replaces the chosen file rather than queuing a second one, and verify picking twice leaves one file selected
- [ ] 5.2 Show the storage policy next to the picker, stating that the upload lives in memory for the length of the request and the result lives in the browser, and verify it is on screen before any file is chosen
- [ ] 5.3 Lay the workspace out with the document pane on the left at full height and the field panel on the right, stacking the two on a narrow viewport, and verify at a phone width that the panes stack and the page scrolls only downward
- [ ] 5.4 Render the chosen JPEG in the document pane as soon as it is picked, and verify the image is on screen while the extraction is still in flight
- [ ] 5.5 Render the extracted fields read-only in the right panel with each field's value and confidence, showing an absent field as absent rather than as 0 or empty, and verify a receipt with no tip shows `tip` as absent
- [ ] 5.6 Print every monetary value as the decimal string the app holds, with no reformatting, rounding or localizing, and verify a `total` of `"42.00"` renders as 42.00
- [ ] 5.7 Show which state the workspace is in (waiting, working, result, not a receipt, failed), and verify the working state replaces the field panel rather than leaving an empty panel on screen
- [ ] 5.8 On an error, show the failure where the field panel would be, keep the document pane as it is, and offer a control that resubmits the same file once per press, with `validation_failed` reading that the model's answer did not match the shape the app expects and suggesting the same file again or a clearer photo. Verify nothing resubmits on its own
- [ ] 5.9 Verify the key never reaches the browser by reading the network tab on a failed extraction and confirming the response body carries no credentials

## 6. The JSON download

- [ ] 6.1 Add a JSON download of the validated object, carrying every field with its `…Confidence` and `…SourceText` siblings plus `isReceipt` and `reason`, and verify the saved file parses and holds the confidence values
- [ ] 6.2 Verify the download works on the receipt on screen with no session table in the app, and that every monetary string in the file keeps its digits and both decimal places

## 7. Fold the decisions back into the documents

- [ ] 7.1 Replace the `response_format: { type: "json_schema", strict: true }` wording in section 4 of `ai-receipt-scanner-spec.md` with the Responses API `text.format` shape, name `gpt-6.1-sol` in section 9's stack table, and verify the file carries no em dash and no AI attribution
- [ ] 7.2 Record in `handoff.md` the pinned model id with its evidence and the date it was read, the scaffold outcome, the Vercel body-size ceiling that slice 7 inherits, and the deployed URL, and verify section 9's slice 1 entries are ticked
- [ ] 7.3 Tick slice 1 in the repo's `tasks.md`, and verify the remaining nine entries are untouched

## 8. Deploy and verify end to end

- [ ] 8.1 Link a Vercel project to `BobDempsey/ai-receipt-scanner` and set `OPENAI_API_KEY` for Production and Preview, and verify `vercel env ls` lists it for both with no value printed
- [ ] 8.2 Push `main` and verify the production build succeeds in Vercel's log with no type or lint error
- [ ] 8.3 On the deployed URL, pick a real JPEG receipt, extract it, read the fields in the right panel against the image on the left, download the JSON, and verify the file holds the values the panel showed with every amount a decimal string
- [ ] 8.4 On the deployed URL, submit a photo that is not a receipt and verify the app shows the model's reason and no field values
- [ ] 8.5 On the deployed URL, submit a PNG and verify the app refuses it by name without calling the model
