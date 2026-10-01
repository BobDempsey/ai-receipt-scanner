# Design

## Context

The repository holds four Markdown documents, the OpenSpec scaffold and the Claude command set. There is no `package.json`, no Next tree and no `.env`. See `proposal.md` for why this slice exists and what it covers; see the three delta specs for what it has to do.

Two constraints shape every decision below. The first is that the four documents and the two generated directories are the entire record of the project, so the scaffold has to arrive without displacing them. The second is that the app stores nothing, which rules out any approach that parks the uploaded file somewhere to make the rest easier.

## Goals / Non-Goals

**Goals:**

- One request path from a chosen JPEG to a validated object, with one OpenAI call in the middle and no storage on either end.
- A single Zod schema that both generates the model's JSON Schema and validates the answer, so the two cannot drift apart.
- A pinned model id with its evidence recorded, so a later accuracy run knows what it measured.
- A deployed URL that works, because a slice that only runs locally has not been checked.

**Non-Goals:**

- Any shape the code would have to grow into later. Slice 1 writes the smallest thing that satisfies the deltas and leaves room rather than scaffolding for features that are out of scope.
- A reusable upload abstraction. One file, one route, one call.
- Theme switching, the fixed nav or the footer. `ColorSchemeScript` goes in now because Mantine wants it in the root layout from the start, and the toggle that drives it arrives with the chrome in slice 8.

## Decisions

### The scaffold runs in place, with five protected paths

`npx create-next-app@latest . --ts --app` runs in this directory. The generator refuses to overwrite a conflicting file and writes happily alongside non-conflicting ones, and none of the protected paths collide with anything it writes.

Protected, and not to be deleted, emptied or overwritten: `ai-receipt-scanner-spec.md`, `handoff.md`, `tasks.md`, `openspec/`, `.claude/`.

If the generator refuses to run because the directory is not empty, the fallback is to scaffold into a sibling temporary directory and copy the generated files in, rather than clearing anything here. Either way the task that runs it checks `git status` afterwards and confirms all five paths are present and unmodified. The tree is committed before the generator runs, so a mistake is recoverable with `git restore`.

Alternative considered: scaffold into a sibling directory unconditionally and copy in every time. Rejected as the default because it hides the generator's own conflict checks behind a copy step, and a copy over a protected file is exactly the failure the rule exists to prevent. It stays the fallback.

The generator offers Tailwind and ESLint. Tailwind gets declined, because Mantine replaces it rather than sitting beside it, and two resets mean two sources of spacing truth.

### The model is `gpt-6.1-sol`

Read off OpenAI's published model list and the model's own page on 2026-10-01. That page lists `image_input` and `structured_outputs` among its supported features, text and image as its input modalities, a 1,050,000-token context window with 128,000 output tokens, and $2 per million input tokens against $10 output.

Alternatives on the same list:

- `gpt-6-astra` at $10 per million input. Five times the cost for a task whose hard part is reading faint characters rather than reasoning. Worth revisiting only if the fixtures show `sol` missing totals.
- `gpt-6-luna` at $0.10 per million input. Twenty times cheaper and the obvious candidate for a public demo behind rate limits. Not chosen now because this slice has no accuracy numbers to judge it by, and a receipt on faded thermal paper is where the cheapest model fails. Slice 9 measures both against the 40 labelled fixtures and the figure decides it.

The id lives in one module, not scattered through the route, so slice 9 can swap it in one place.

### Structured Outputs goes through the Responses API

OpenAI documents Structured Outputs on the Responses API as `text: { format: { type: "json_schema", strict: true, schema } }`, and the guide's examples are all `client.responses.create()`. The `response_format: { type: "json_schema", strict: true }` wording carried in the extraction spec and in section 4 of `ai-receipt-scanner-spec.md` is the older Chat Completions shape. Both documents get corrected in this change, so the delta does not carry the fix alone.

### The Zod schema generates the model's JSON Schema

The Zod schema is the single source of truth. The OpenAI SDK's Zod helper for the Responses API text format (`zodTextFormat`, to be confirmed against the installed SDK version) turns it into the strict JSON Schema sent with the request, and the same Zod schema validates the parsed answer afterwards. The schema module is shared, so slice 3's form reads the same shape the server enforces.

Alternative considered: hand-write the JSON Schema next to the Zod schema. Rejected because the two drift on the first field anyone adds, and strict mode's bookkeeping (every property in `required`, `additionalProperties: false` on every object) is exactly the kind of thing a generator gets right every time.

Strict mode requires every property to appear in `required`, so a field a receipt may not print is typed nullable rather than optional. The Zod schema uses `.nullable()` throughout and never `.optional()`.

### Money is a plain string in the model schema and a regex in Zod

Every amount is typed `string` in the JSON Schema sent to the model, with the decimal shape enforced by a Zod regex on the way back. Whether strict Structured Outputs honours the `pattern` keyword is not something this slice depends on. Tightening the model-side schema is a later optimization, and the Zod check is the control either way.

### Confidence and source text are flat sibling keys

The extraction spec requires `total` to be the string "42.00", which rules out wrapping each value in an object. Strict mode forbids a map with open-ended keys, which rules out `confidence` and `sourceText` objects keyed by field path. What is left, and what the spec's word "sibling" describes, is flat suffixed keys beside each value: `merchant`, `merchantConfidence`, `merchantSourceText`, and the same pattern for every field. Each `taxes[]` entry carries its own `labelConfidence`, `labelSourceText`, `amountConfidence` and `amountSourceText`, so nesting needs no special case.

Verbose, and it keeps every value exactly where the spec says it is while staying inside what strict mode allows.

### The slice 1 field set

`isReceipt`, `reason`, `merchant`, `merchantAddress`, `date`, `time`, `currency`, `subtotal`, `taxes[]` with `label` and `amount`, `tip`, `total`, `paymentMethod`, `cardLast4`, each with its two sibling keys. `lineItems` is absent from both schemas and arrives in slice 2.

When `isReceipt` is false the route still returns 200 with `reason` filled and the field values null, because refusing a photo of a menu is an answer rather than a failure.

### The image reaches the model as a base64 data URL

The route reads the uploaded bytes from the request's `FormData`, encodes them, and passes them as an image input part in the same call. The file touches no disk and no object storage.

Alternative considered: upload to OpenAI's Files API first and reference the file id. Rejected outright, because it stores the visitor's receipt on a third party's disk, which is the one thing the storage policy promises does not happen.

### The route runs on the Node runtime

`app/api/extract/route.ts` on the Node runtime rather than the Edge runtime, because the OpenAI SDK and base64 handling are both more predictable there and nothing in this slice needs edge placement. The per-IP limiter in slice 7 is what wants the edge, and it sits in front of this route rather than inside it.

### The error contract

The route answers either a validated object or `{ error: { code, message } }`. Slice 1 needs four codes: `not_jpeg`, `too_large`, `model_call_failed`, `validation_failed`. The browser keys its copy off `code` and never renders a message the server built from a provider error, so nothing from OpenAI's wording or from a Zod issue path reaches the page.

`validation_failed` is the open point this slice answers. The visitor reads that the model's answer did not match the shape the app expects, with a suggestion to try the same file again or try a clearer photo, and a control that resubmits. The route makes no second call of its own, and the server logs the failing field paths without the bytes and without the model's answer.

### State lives in React

A single client component holds the chosen file, the request state and the result. No store library, no router state, no persistence. IndexedDB arrives with the session table in slice 6.

## Risks / Trade-offs

- **The scaffold runs over the only record of the project** → Commit first, name the five protected paths in the task, check `git status` afterwards, and fall back to a sibling temporary directory rather than clearing anything.
- **Vercel's serverless functions cap a request body well below the 8 MB file cap the spec names** (4.5 MB at the time of writing, and base64 adds about a third on top) → Slice 1 accepts the JPEG a visitor picks and will fail on a large one. Slice 7 owns the 8 MB cap and will need a different upload path, most likely client-side downscaling before the post. Recorded here so slice 7 does not discover it late.
- **The pinned model may be the wrong price point** → Slice 9 measures `gpt-6-luna` against the same fixtures and the figure decides. The id sits in one module so the swap is one line.
- **`gpt-6.1-sol` may read a decimal into the wrong field and still satisfy the schema** → Nothing in this slice catches that. The arithmetic checks in slice 2 and the fixtures in slice 9 are what catch it, which is why the slice order puts them early.
- **Declining Tailwind leaves the generator's default styles unopinionated** → Mantine's own styles and theme carry the whole surface from slice 1 forward, so there is no interim styling to unwind in slice 8.
- **A read-only form makes a wrong value unfixable** → Accepted for one slice. Inline editing is slice 3, and the JSON download means a visitor is not stuck with a value they cannot get out.

## Migration Plan

Nothing to migrate. No users, no data, no existing deployment.

Deploy order: commit the scaffold, link the Vercel project to `BobDempsey/ai-receipt-scanner`, set `OPENAI_API_KEY` for Production and Preview, push, then exercise the path on the deployed URL with a real JPEG. Rollback is Vercel's previous deployment, or `git revert` if the tree is the problem.

The custom subdomain, Web Analytics and GitHub Actions are not part of this slice, so the deployment is reachable at its `vercel.app` URL until slice 8.

## Open Questions

- The download filename. `receipt.json` is enough for slice 1; whether it carries the merchant and date is cosmetic and can change without touching a spec.
- The prompt wording beside the schema. Slice 1 needs something that works; slice 9 tunes it against the fixtures, and the accuracy figures are what justify any wording.
