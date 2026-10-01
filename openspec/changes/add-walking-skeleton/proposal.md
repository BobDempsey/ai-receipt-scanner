# Proposal

## Why

No application code exists yet, so every decision in `ai-receipt-scanner-spec.md` and the five capability specs is untested. Slice 1 is the walking skeleton: the thinnest path that carries one JPEG through the model to a JSON file a visitor can keep, running in the deployed app, so that every later slice widens a path already known to work rather than guessing at one.

## What Changes

Slice 1 of the vertical-slice plan in `tasks.md`.

- Scaffold Next.js 15 with the App Router, React 19 and TypeScript **in place** in this existing directory, then add Mantine with `postcss-preset-mantine`, `MantineProvider` and `ColorSchemeScript` in the root layout. `ai-receipt-scanner-spec.md`, `handoff.md`, `tasks.md`, `openspec/` and `.claude/` are not to be deleted, emptied or overwritten. If the generator refuses to run in a non-empty directory, generate into a sibling temporary directory and copy the files in.
- Accept one JPEG, chosen in the browser and held in memory. Nothing is persisted on either side.
- Add one server route that makes a single OpenAI call with Structured Outputs in strict mode and returns the flat field set plus `isReceipt` and `reason`.
- Pin the model id to `gpt-6.1-sol`, read off OpenAI's published model list on 2026-10-01 rather than carried in from memory. That page records `image_input` and `structured_outputs` among its supported features, text and image input, a 1,050,000-token context window, and $2 per million input tokens against `gpt-6-astra` at $10. `gpt-6-luna` costs $0.10 per million and stays the candidate to re-measure against once slice 9 has the 40 labelled fixtures, because a receipt on faded thermal paper is where the cheapest model fails and this slice has no accuracy numbers yet to judge it by.
- **Correct the API shape.** OpenAI now documents Structured Outputs on the Responses API as `text: { format: { type: "json_schema", strict: true, schema } }`. The `response_format: { type: "json_schema", strict: true }` wording in the extraction spec and in section 4 of `ai-receipt-scanner-spec.md` is the older Chat Completions shape. This change fixes both, so the delta does not carry the correction alone.
- Add the shared Zod schema for the slice 1 field set and validate the parsed model object on the server before anything reaches the browser.
- Render the chosen image on the left and the extracted fields read-only on the right.
- Offer a JSON download of the validated result.
- Deploy to Vercel with `OPENAI_API_KEY` set as a server-side environment variable, and confirm the path works in the deployed app.
- Answer one of the eight open points: what a visitor sees when server-side Zod validation fails.

Out of scope for slice 1, each belonging to a later slice: line items, the arithmetic checks, inline editing, highlighting and the OCR word-box pipeline, PDF uploads, CSV export, copy to clipboard, batch upload, the session table and IndexedDB, rate limits, the three sample receipts, the landing page and the site chrome, the About page, and the accuracy fixtures.

Two existing requirements are implemented in part rather than changed. The `limits` spec names four accepted file types; slice 1 wires the `image/jpeg` branch and leaves the other three to later slices. The `extraction` spec names `lineItems`; slice 1 omits it from the model schema and the Zod schema, and slice 2 adds it. Neither spec changes, because the end state both describe is still the end state.

## Capabilities

### New Capabilities

- `receipt-workspace`: the two-pane working surface a visitor uses to put a receipt into the app and read what came back. Covers choosing a file, the document pane on the left, the field panel on the right, the states between choosing and reading (working, failed, not a receipt), and the storage policy stated next to the picker. Later slices widen it with inline editing, highlight selection and the session table.

### Modified Capabilities

- `extraction`: the strict Structured Outputs call moves to the Responses API `text.format` shape and names the pinned model id; the slice 1 field set is stated as the flat object without `lineItems`; the open point on what a visitor sees when server-side Zod validation fails is answered.
- `export`: the single-receipt JSON download is stated to carry the validated object as the app holds it, including the `confidence` and `sourceText` siblings, and to work with no session table behind it. The CSV shape and whether a CSV file carries warnings stay open for slice 6.

## Impact

- **New code**: the whole tree. `package.json`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `app/layout.tsx`, `app/page.tsx`, the extraction route under `app/api/`, the shared Zod schema, the model client, and the two panes as Mantine components.
- **New dependencies**: `next`, `react`, `react-dom`, `typescript`, `@mantine/core`, `@mantine/hooks`, `postcss-preset-mantine`, `postcss-simple-vars`, `postcss`, `zod`, `openai`.
- **Secrets**: `OPENAI_API_KEY`, read on the server only, never reaching the client bundle. A `.env.example` lists it with a placeholder; `.env.local` stays out of git.
- **Hosting**: a Vercel project linked to `BobDempsey/ai-receipt-scanner`. The custom subdomain, Web Analytics and CI are not part of this slice.
- **Documents**: section 4 of `ai-receipt-scanner-spec.md` gets the Responses API shape and the pinned model id. `tasks.md` gets slice 1 ticked. `handoff.md` records the model id, the pin's evidence, and the scaffold outcome.
- **Risk**: the scaffold runs over a directory holding the only record of the project. The scaffold task checks `git status` afterwards and confirms the five protected paths are present and unmodified.
