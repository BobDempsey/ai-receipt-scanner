# Handoff: AI Receipt Scanner

**Last updated:** 2026-10-01 (first entry; baseline spec read and folded in the same day)

## 1. State of the project

No application code exists yet. The repo holds `ai-receipt-scanner-spec.md`, this handoff, `tasks.md`, and the OpenSpec scaffold. There is no `package.json` and no Next scaffold. Every section below is read off the spec or established in session, not off working code.

Done on 2026-10-01: `git init` on `main`, with the three Markdown files committed as `1f670e5` before anything was generated. `openspec init --tools claude` run, which created `openspec/` (`specs/`, `changes/archive/`, `config.yaml` on the `spec-driven` schema) and six `/opsx:` commands with their skills under `.claude/`. `openspec/config.yaml` now carries the project context: read the handoff first, build in vertical slices, the fixed stack, the nothing-is-stored rule, the decimal and arithmetic rules, the no-deletion rule, and the prose rules. `openspec/specs/` now holds five capability specs (extraction, highlighting, arithmetic, export, limits), seeded from the product spec and passing `openspec validate --specs --strict`, committed as `ee43c38`.

## 2. What the project is

A Next.js web app that takes a photo or PDF of a receipt and returns typed fields a person can check, correct and export as JSON or CSV. It is the fourth AI project linked from bobdempsey83.com/portfolio, and it deliberately has no chat box: the other three are things you type at, this one is a workflow with a model inside it.

Demo URL will be `https://ai-receipt-scanner.bobdempsey83.com`, repo `BobDempsey/ai-receipt-scanner`.

## 3. Stack, and why

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 15, React 19, TypeScript | Overrides the spec, which called for Nuxt so the resume could show Vue. Bob chose React on 2026-10-01. |
| UI | Mantine, with its PostCSS preset | Bob chose Mantine on 2026-10-01 over the Nuxt UI the spec listed and the shadcn/ui considered earlier the same day, partly because `@mantine/dropzone`, `NumberInput`, `Table` and `useForm` cover most of this app's surface, and partly because shadcn/ui has already carried several projects. Mantine brings its own styling, so Tailwind is out rather than layered on top. |
| Model | OpenAI API, a vision-capable GPT model, Structured Outputs in strict mode | Bob chose OpenAI on 2026-10-01, replacing the `claude-sonnet-5` the spec listed. Strict mode forces the output shape. |
| Validation | Zod, shared client and server | A schema the model satisfies can still be wrong about types. |
| OCR for boxes | tesseract.js in a web worker; pdf.js for PDFs with a text layer | Keeps OCR off the server, and the file never has to be stored to be measured. |
| Session state | IndexedDB, keyed to the tab session | No database, nothing stored server-side. |
| Host | Vercel, Web Analytics in production builds only | Portfolio baseline. |
| Tests | Vitest (schema, arithmetic, matcher), Playwright (upload to export) | |
| Process | OpenSpec, spec-driven development, built in vertical slices by agents | Bob chose it on 2026-10-01. Each change gets a proposal, spec deltas and a task list in its own folder before any code, reviewable as a PR. |

## 4. Decisions already made

- **One model call per receipt.** The image goes to the model with Structured Outputs, `response_format: { type: "json_schema", strict: true }`, whose schema is the field set. No JSON parsing out of prose, no retry loop around a malformed response. Zod validates the parsed object again on the server.
- **Confidence comes from the model.** Each field carries a sibling `confidence` (0 to 1) and a `sourceText` holding the characters the value was read from. Anything under 0.8 is flagged for review.
- **Highlighting is matched, never generated.** The model does not return coordinates, and asking it to would produce numbers that look precise and are not. The app gets word boxes from the document (pdf.js text layer, or tesseract.js for images), then fuzzy-matches each field's `sourceText` against those words. No match clearing the threshold means no highlight, rather than a wrong one.
- **Arithmetic is checked in code.** Line items sum to the subtotal; subtotal plus taxes plus tip equals the total. A mismatch is a warning naming the difference, on both fields involved. The app never rewrites a number to make the math close.
- **"Not a receipt" is a first-class answer.** The response schema carries `isReceipt` and `reason`. False means show the reason and stop.
- **Money is a decimal string, never a float.**
- **Nothing is stored.** Uploads live in memory for the length of the request. Results live in the browser. The only server-side state is rate-limit counters. This is stated on the page next to the drop zone, not buried in About.
- **Currency is inferred from the symbol and locale**, never silently defaulted to USD.
- **Delegate the building to background agents.** Bob wants to keep talking while the work happens, so implementation runs in subagents rather than inline on the main thread. One agent per slice, or per independent piece of a slice, launched together in a single message when the pieces do not depend on each other. Report what came back; do not make him wait on a tool call to ask a question. This overrides the harness default of not spawning agents unasked, and it was asked for on 2026-10-01.
- **Agents do most of the development, in vertical slices.** Each OpenSpec change is one thin path through every layer rather than one layer across every feature: upload, model call, validation, form, export, deployed and working before the next slice starts. The first slice is a walking skeleton (a single JPEG to the flat fields to a JSON download, live on Vercel), and every slice after it widens that path. No slice is finished until it runs end to end in the deployed app, which is what makes the work checkable without a human reading the diff.
- **Eight open points are deliberately unresolved.** The capability specs mark each with an `**Open point:**` line, and Bob decided on 2026-10-01 to let the slice that needs an answer settle it rather than deciding all eight up front. They are: the highlight match threshold and similarity measure; whether a scanned PDF with no text layer gets rasterized and OCR'd or simply shows no highlight; whether arithmetic comparison is exact or carries a cent of tolerance; whether empty `lineItems` is itself a flag; the CSV shape, meaning one row per receipt or per line item and how taxes flatten; whether the per-IP window is fixed or rolling and what the rejection tells the visitor; what keys the 40-per-session cap and whether it resets; and what the visitor sees when server-side Zod validation fails. Whichever slice answers one records the answer in that spec through the normal `/opsx:` loop.
- **The slice order is the order of risk, not of layers.** Highlighting and the accuracy fixtures come after editing and arithmetic, because they are the parts most likely to need rework, and rework on top of a working path costs less than rework on top of a half-built layer. Section 9 lists everything outstanding as an inventory; `tasks.md` carries the slice order.
- **The work runs through OpenSpec**, already initialized. Run it with `npx @fission-ai/openspec@latest` rather than a global install. The loop is `/opsx:explore` to think an idea through, `/opsx:propose` to draft the change and its spec deltas, `/opsx:apply` to implement against the plan, `/opsx:archive` to fold the finished change back into the main specs. Needs Node 20.19 or higher; this machine has Node 24.19.0. Six more workflows (`new`, `continue`, `ff`, `bulk-archive`, `verify`, `onboard`) are available behind `openspec config profile` and are not installed.
- **`ai-receipt-scanner-spec.md` stays the product spec.** OpenSpec's `openspec/specs/` holds the capability specs derived from it, one per capability rather than one long document. When the two disagree, fix the product spec in the same change rather than letting the delta carry the correction alone.

## 5. The field set

One flat object per receipt plus a line-item array: `merchant`, `merchantAddress`, `date` (ISO, no timezone guessing), `time` (24h or null), `currency` (ISO 4217), `subtotal`, `taxes` (array of `label` plus `amount`, because a receipt can carry more than one), `tip`, `total`, `paymentMethod`, `cardLast4`, `lineItems` (`description`, `quantity`, `unitPrice`, `amount`). The full table with nullability is section 3 of the spec.

## 6. Caps and limits

| Limit | Value |
| --- | --- |
| File size | 8 MB |
| File types | `image/jpeg`, `image/png`, `image/webp`, `application/pdf` |
| PDF pages read | 1 (the first) |
| Files per batch | 5 |
| Extractions per IP | 20 an hour, at the edge |
| Extractions per session | 40, in the app |

Enforce in the browser and again on the server. The browser check is a convenience, not a control.

## 7. The portfolio baseline

The baseline every portfolio project has to meet lives at `C:\code\bobdempsey83.com\docs\portfolio-project-spec.md`, with the card rules in that repo's `CLAUDE.md` and the resume rules in `docs/resume-spec.md`. It has been read. Where it and `ai-receipt-scanner-spec.md` disagree, this project's spec wins and the baseline fills the gaps. What it requires, in short:

**Chrome.** Light and dark themes toggled from the nav, the choice remembered, and the stored theme applied before first paint so nobody sees a flash of the wrong one. A nav bar fixed to the top of the viewport the whole way down, carrying the project name linking home, the main action, a GitHub icon opening the repo in a new tab, and the theme toggle. A footer on every page reading `© <year> - Bob Dempsey` with the name linking to bobdempsey83.com in a new tab, plus an About link and the GitHub icon, with the year taken from the render rather than a build constant. An About page in plain language covering the pipeline, the stack and the honest limits.

**Reach.** Works down to a phone. Every control reachable by keyboard with a visible focus ring, alt text on images, accessible names on icon-only buttons.

**UI style.** The hero holds the product itself, usable without scrolling, which here is the drop zone and the three samples. Real screenshots of the running app instead of illustrations, each opening full size on click. Sections below the hero are a bento of panels (numbered step cards, a row of stat tiles, two screenshots side by side on a wide screen) rather than paragraphs under small headings. Figures instead of adjectives, held equal across the page, the README and the About page. Motion is decoration only: hover lift, a CSS scroll reveal using `animation-timeline: view()`, a loading spinner, nothing on first paint, everything behind `prefers-reduced-motion: no-preference`. A 4xl or 5xl headline with tight tracking against base body text, balanced headline, pretty-wrapped prose held to about 65 characters a line. One max width shared by the landing page, the About page and the app, with the footer matching. One accent color on badges, numbered chips, the primary button and a blurred hero glow, checked at 4.5:1 against its background in both themes. The last section before the footer is a band carrying the one or two actions that follow from the demo.

**Demo.** A live subdomain reachable with no sign-up, no account and no key, with something on every screen the moment it loads. Fictional data labelled as fictional. Nothing one visitor does changes what the next one sees.

**Repo.** README opening with the live link and a screenshot, then a stack table, then setup steps that work from a clean clone, then how the AI feature actually works. GitHub description leading with what the app does for its user, Website pointing at the custom subdomain rather than the `vercel.app` URL, and topics covering the technique, the stack and the host. A `.env.example` listing every variable with a placeholder, and no secret in the client bundle.

**Build.** GitHub Actions running lint, typecheck and tests on every push. Vercel deploys with Web Analytics in production builds only. Rate limits on every route that calls a model, by IP at the edge and by session in the app.

**On ship.** Add the card under `content/portfolio/` in the bobdempsey83.com repo, regenerate `public/chat-context.json`, add the project to `resumeProjects` in `app/utils/portfolio-data.ts`, and regenerate the PDF. The card keeps the word AI in each `ai` label and leaves the provider out, because the card derives a second badge from `tech`, where `OpenAI API` renders `OpenAI LLM`. External links in `content/` markdown carry the `i-lucide-external-link` icon. That repo's own code style is Prettier at 100 characters, no semicolons, double quotes, es5 trailing commas, and conventional commits.

## 8. Gotchas

- **The accuracy numbers appear in three places**, not two: the About page, the README, and the landing page's stat tiles, which the baseline requires be held equal to the other two. Change all of them together whenever the prompt or the model changes.
- **The AI feature label has to agree across the card, the README and the app.** The spec's badges are `AI Vision` and `AI Extraction`; `OpenAI LLM` is derived from the tech list, so do not hand-write it as a third `ai` entry.
- **The baseline's "seed it with data so every screen has something on it" meets a project that stores nothing.** The three sample receipts are what satisfies it. A cold load has to show the samples under the drop zone, not an empty session table alone.
- **One of the three sample receipts must have a line-item sum that does not match its printed subtotal**, so a visitor sees the arithmetic warning without hunting for a bad receipt. All three samples are labelled fictional on the page.
- **`OPENAI_API_KEY` is not set anywhere yet.** No `.env` exists.
- **Pin the model id before wiring the route.** The spec now says "a vision-capable GPT model" rather than naming one, because the id should be read off OpenAI's current model list at build time rather than carried in from a stale note. Structured Outputs in strict mode and image input both need checking against whichever id gets picked.
- **Mantine replaces Tailwind, it does not sit beside it.** Running both means two resets and two sources of spacing truth, so the baseline's UI requirements (one shared max width, a 4xl or 5xl headline with tight tracking, one accent color) are expressed in Mantine's theme and CSS modules. `Tailwind CSS` also comes off the portfolio card's tech list, where `Mantine` takes its slot.
- **Mantine's own color-scheme script is what satisfies the no-flash rule.** `ColorSchemeScript` in the root layout plus `useMantineColorScheme` for the nav toggle covers the baseline's "apply the stored theme before first paint" requirement; do not hand-roll a second theme store next to it.
- **All four portfolio AI projects now run on OpenAI.** The original spec put this one on Claude so the portfolio showed two providers; that argument is gone, so the card and the README have to lean on the shape of the app instead.

- **Scaffold into this directory without destroying it.** `ai-receipt-scanner-spec.md`, `handoff.md` and `tasks.md` are the only files here and they are the whole record of the project, so losing them loses everything decided so far. `create-next-app` refuses to scaffold over conflicting files but is happy alongside non-conflicting ones, and those three conflict with nothing it writes, so `npx create-next-app@latest . --ts` in place is safe. Check `git status` after it runs and confirm all three are still there and unmodified. If any tool wants to empty the directory first, scaffold into a sibling temp directory and copy the generated files in instead.

## 9. Not done

This is an inventory of everything outstanding, grouped by area for lookup. It is not the build order; `tasks.md` carries that, as vertical slices.

- [x] ~~`git init` and commit the three existing Markdown files first.~~ **Done**, `1f670e5`.
- [ ] Create `BobDempsey/ai-receipt-scanner` on GitHub and push `main`. No remote is set.
- [x] ~~Install OpenSpec and run `openspec init`.~~ **Done**, including the project context in `openspec/config.yaml`.
- [x] ~~Commit the OpenSpec scaffold.~~ **Done**, `06a6d11`.
- [x] ~~Seed `openspec/specs/` from `ai-receipt-scanner-spec.md`, split by capability.~~ **Done**, `ee43c38`.
- [ ] Run every piece of work below through `/opsx:propose`, `/opsx:apply`, `/opsx:archive` rather than editing straight into the tree.
- [x] ~~Clone or locate the bobdempsey83.com repo and read `docs/portfolio-project-spec.md`.~~ **Done.** It is at `C:\code\bobdempsey83.com`; the requirements are section 7 above.
- [ ] Scaffold Next.js 15 in place, App Router, TypeScript, then add Mantine, including `postcss-preset-mantine` and the `MantineProvider` with `ColorSchemeScript` in the root layout.
- [ ] Zod schema for the field set, shared between client and server, with the `confidence` and `sourceText` siblings plus `isReceipt` and `reason`.
- [ ] Server route: one OpenAI call per receipt using Structured Outputs in strict mode, Zod-validated, in-memory only.
- [ ] Arithmetic checker with named-difference warnings.
- [ ] OCR word-box pipeline: tesseract.js web worker for images, pdf.js text layer for PDFs.
- [ ] Fuzzy matcher from `sourceText` to word boxes, with a threshold below which no highlight shows.
- [ ] Site chrome from the baseline: light and dark themes applied before first paint and remembered, fixed nav, footer with the rendered year, shared max width, one accent at 4.5:1 in both themes.
- [ ] Hero drop zone with the three samples under it, usable without scrolling; left image pane at full height, right form filling in live, per-field confidence states, click-to-highlight.
- [ ] Bento sections below the hero: numbered step cards, stat tiles carrying the accuracy figures, screenshots that open full size.
- [ ] Closing action band before the footer.
- [ ] Accessibility pass: keyboard reach, visible focus rings, alt text, accessible names on icon-only buttons, phone width.
- [ ] CSS-only motion behind `prefers-reduced-motion: no-preference`, nothing on first paint.
- [ ] Inline editing, with a recheck on every edit.
- [ ] Export: JSON and CSV, download and copy, single receipt and batch.
- [ ] Session table in IndexedDB keyed to the tab session.
- [ ] Storage-policy copy next to the drop zone.
- [ ] Three fictional sample receipts: thermal grocery with many line items, restaurant with a tip and two tax lines, scanned PDF invoice.
- [ ] File size, type, page and batch enforcement on both sides; IP and session rate limits.
- [ ] 40 hand-labelled receipt fixtures with expected output; field-level accuracy reported, with `total` and `date` broken out separately.
- [ ] Vitest for the schema, the arithmetic and the matcher; Playwright for upload to export.
- [ ] README: live link and screenshot first, then the stack table, then setup from a clean clone, then how the extraction works, then the accuracy numbers and the documented failure cases (faded thermal paper, handwritten totals, angled photos, uncovered languages).
- [ ] About page in plain language: pipeline, stack, honest limits, same accuracy numbers.
- [ ] `.env.example` with `OPENAI_API_KEY` as a placeholder.
- [ ] GitHub repo settings: description, Website set to the subdomain rather than the `vercel.app` URL, topics for the technique, stack and host.
- [ ] CI on GitHub Actions: lint, typecheck, tests on every push.
- [ ] Deploy to Vercel at `ai-receipt-scanner.bobdempsey83.com`, Web Analytics in production builds only.
- [ ] Portfolio card under `content/portfolio/` in the bobdempsey83.com repo: `ai` badges `AI Vision` and `AI Extraction`, tech ordered `OpenAI API`, `Next.js`, `TypeScript`, `Mantine`, `tesseract.js`, with `Zod` and `Vercel` behind the five-entry cut. The description leads with the AI feature.
- [ ] Regenerate `public/chat-context.json` in that repo.
- [ ] Add the project to `resumeProjects` in `app/utils/portfolio-data.ts` and regenerate the PDF.
- [ ] Blog post under `content/blog/` on the highlighting trade-off: the model will not give you coordinates you can trust, so the app earns them from OCR word boxes and a fuzzy match, and the failure mode is an honestly absent highlight.

## 10. Working style

Nothing in this repo gets deleted, emptied or overwritten to make room for generated code. Commit before any scaffold or codemod, and when a tool wants a clean directory, generate elsewhere and copy in. Ask before removing a file Bob has not asked to remove.

The writing rules in `~/.claude/CLAUDE.md` apply to every piece of prose here and in the repo: no em dashes, no negate-then-assert reversals, active voice with a named actor, and no AI attribution in commit messages or PR bodies.
