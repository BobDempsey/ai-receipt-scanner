# Design

## Context

Slice 1 left a working path: `lib/receipt-schema.ts` builds the model-facing and validating schemas from one function, `lib/extract-receipt.ts` makes one OpenAI call and validates the answer, `app/api/extract/route.ts` wraps it, `lib/receipt-fields.ts` turns a validated receipt into panel rows, `components/FieldPanel.tsx` prints them and `components/ReceiptWorkspace.tsx` holds the state and the JSON download. See `proposal.md` for why slice 2 exists, and the four delta specs for what it has to do.

Three constraints from `handoff.md` shape every decision below. Money is a decimal string and never a float. The arithmetic is checked in code and never by the model. The app never rewrites a number to make the maths close, so the only thing a mismatch may produce is a warning.

One constraint comes from the existing code. `DECIMAL_PATTERN` admits one to three decimal places, so an amount is not guaranteed to be a whole number of cents.

## Goals / Non-Goals

**Goals:**

- Exact decimal arithmetic over the strings the model returned, with no float anywhere between the schema and the warning.
- One checker, written as a pure function over a validated receipt, that slice 3's recheck can call unchanged on every edit.
- A warning carrying enough data that the panel and the export both render it without recomputing anything.
- Line items in both schemas and on screen, read-only, with the same confidence treatment the flat fields already get.

**Non-Goals:**

- A third check comparing each item's `quantity` times its `unitPrice` against its `amount`. Both source documents name two checks, and multiplication is the one operation the decimal module would otherwise need.
- A general-purpose decimal type. The module covers what the two checks ask for and nothing more.
- Inline editing, and with it the recheck the arithmetic spec already requires. Slice 3 wires the checker to an edit; slice 2 runs it once per extraction.
- A versioned export envelope. The file shape changes once here and slice 6 settles the batch shape.

## Decisions

### The decimal arithmetic is hand-rolled over scaled `BigInt`, with no library

`lib/decimal.ts` parses a decimal string into a sign, a `BigInt` of its digits and a scale (the count of fractional places). Addition and comparison lift both operands to the wider of the two scales by multiplying the digits by a power of ten, then add or compare the `BigInt`s. Rendering writes the digits back out at that common scale, so "47.6" against "47.60" compares equal and a difference between two-place amounts renders as "0.50" rather than "0.5".

The two checks need four operations: parse, add, subtract and compare, plus render for the message and the export. That is roughly fifty lines under Vitest, and `BigInt` makes every one of them exact.

Alternatives considered:

- **Integer cents.** Scale every amount by 100 into a `BigInt` of cents. Rejected because `DECIMAL_PATTERN` admits a third decimal place, so a unit price of "1.005" would have to round on the way in, and rounding a value to run a check is the thing this slice exists to avoid. Preserving the scale costs one extra multiplication and loses nothing.
- **`decimal.js` or `big.js`.** Correct, tested and well understood. Rejected for now because the app's own contract is strings at both ends, so a library still needs a parse step and a render step beside it, and neither library's multiply, divide, power or rounding-mode surface is wanted here. `big.js` stays the obvious replacement if a later slice needs multiplication for a per-item check or division for a percentage. The module keeps its operations behind named functions so that swap touches one file.
- **Scale by 100 into `Number`.** Rejected outright. It is the float trap the handoff rule names, wearing a scale factor.

### The checks run in the browser, over the validated object

`lib/arithmetic.ts` exports a pure function from a validated `Receipt` to an array of warnings, and `ReceiptWorkspace` calls it when a result arrives. The route's response contract stays exactly as slice 1 left it: a validated receipt or one error code.

Slice 3 rechecks on every keystroke-settled edit, which has to happen in the browser anyway. Running the checker on the server as well would mean two paths that can disagree about the same receipt, and the server has nothing to add, because warnings are derived from values the browser already holds.

### A warning is data, with its wording built in one place

Each warning carries the check that raised it, the two field identifiers it names, the two compared decimals, the absolute difference as a decimal string at the common scale, and a message the module composed. The panel reads the field identifiers to decide which rows to mark and prints the message; the export writes the whole object into `warnings`.

The alternative, letting the panel compose its own sentence and the export compose another, puts the same arithmetic into words twice and lets the two drift. The difference is reported as an absolute value with the direction carried in the message ("the line items sum to 48.10, which is 0.50 more than the subtotal of 47.60"), because a signed number on screen asks the visitor to work out which way the sign points.

### Field identifiers reach the panel through `receipt-fields.ts`

`fieldRows` gains a stable `field` key on the rows a check can name: `subtotal`, `total`, and a computed `lineItemsTotal` row the panel shows beside `subtotal`. A warning attaches to a row by matching that key, so neither the label text nor the row order carries meaning.

The computed item total is a row the app produced rather than a value the receipt printed, so the panel labels it as computed and gives it no confidence.

### `lineItems` follows the shape `taxes` already uses

A nullable array of objects, each entry holding `description`, `quantity`, `unitPrice` and `amount` with their flat `…Confidence` and `…SourceText` siblings. Nullable rather than optional, because strict Structured Outputs puts every property in `required`. `taxes` already proves nested objects inside an array work in strict mode, so the slice adds no new shape risk.

Null and empty both mean the app read no items, and the checker treats them the same. `quantity` is typed as a string on `DECIMAL_PATTERN` rather than as a number, so "0.734" on a weighed item survives as printed.

### Skipping beats guessing on a missing value

The sum check runs only when `subtotal` is non-null and every item carries an `amount`. One null amount skips the check, because summing the rest would name a difference the receipt does not have. The total check runs only when `subtotal` and `total` are both non-null, and treats a null `tip` and an absent `taxes` array as contributing nothing, which is what the existing spec's scenarios already say.

### The JSON download becomes an envelope

`receiptToJson` returns `{ "receipt": { … }, "warnings": [ … ] }`. The warnings are derived rather than validated, so folding them in beside `merchant` would mix two kinds of key in one object and put a key the Zod schema rejects inside the object the schema governs.

`warnings` is always present, empty when both checks pass, so a reader can tell a receipt the app checked from one it did not. Slice 1's download shape changes, which costs nothing while the only consumer is a visitor reading a file, and slice 6's batch export wants an envelope regardless.

### The prompt gains wording for the items

`EXTRACTION_PROMPT` in `lib/model.ts` picks up a line asking for one entry per purchased line in the printed order, with the quantity as printed and null when the receipt prints none, and no entry invented for a receipt that itemizes nothing. Slice 9 tunes the wording against the fixtures.

## Risks / Trade-offs

- **Exact comparison warns on a receipt that rounds its own tax line** → The message names the 0.01, which takes a visitor a second to read and dismiss, and the app never hides a real misread behind a tolerance. Slice 9's fixtures measure how often it happens; a note severity below warning can be added later without changing the comparison, which is what makes this answer safe to give now.
- **The model may miss a line on a long grocery receipt, and an empty `lineItems` is not a flag** → The sum check catches a missed line whenever the receipt prints a subtotal, because the remaining items will not reach it. A receipt with items and no subtotal has nothing to check against, and the panel showing the computed item total is what lets the visitor notice.
- **The model may return the items out of printed order** → The prompt asks for printed order and nothing enforces it. Order matters to a reader rather than to a check, and slice 9's fixtures are where it gets measured.
- **A third decimal place can appear on one side of a comparison and not the other** → Both sides lift to the wider scale before anything is added or compared, which is the case the differing-scale scenarios in the arithmetic delta cover.
- **The download shape changes under anyone who scripted against slice 1** → Nobody has. Recorded in `handoff.md` so slice 6 knows the envelope is deliberate.
- **The hand-rolled module could be wrong in a way a library would not be** → Every operation is covered by Vitest, including the sums that break as floats, differing scales, negative differences and a zero difference. If a later slice needs multiplication or division, `big.js` replaces the module behind the same function names.

## Migration Plan

Nothing to migrate. No stored data, no API consumers, and the one shape that changes is a file a visitor downloads.

Deploy order: land the schema and the decimal module with their tests, then the checker, then the panel and the export, then push `main` and exercise the path on the production URL with a receipt whose items sum and one whose items do not. Rollback is Vercel's previous deployment.

## Open Questions

- Whether the line items render as their own table or as rows continuing the flat field table. Either satisfies the delta, and the answer is cosmetic until slice 8 styles the panel.
- The exact warning sentence. The module owns the wording in one place, so changing it later touches one string and its test.
