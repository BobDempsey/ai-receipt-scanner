# Proposal

## Why

Slice 1 proved the path from one JPEG to a validated flat field set to a JSON download, and nothing in it catches a model that reads a decimal into the wrong field. The arithmetic checks are what catch that, and they need the line items the slice 1 schemas left out, so slice 2 adds both and makes the first mismatch visible to a visitor in the deployed app.

## What Changes

Slice 2 of the vertical-slice plan in `tasks.md`: line items and the arithmetic warnings.

- Add `lineItems` to the model-facing schema and the validating schema, each entry holding `description`, `quantity`, `unitPrice` and `amount` with the flat `…Confidence` and `…SourceText` siblings slice 1 established. `quantity` is a decimal string on the same pattern as an amount, so a weight like "0.734" survives as the receipt printed it.
- Render the line items read-only in the field panel, under the flat fields, with the item total the checker computed shown beside them.
- Add the arithmetic checker as a pure module that runs in code and never asks the model: the line item amounts sum to `subtotal`, and `subtotal` plus every `taxes[].amount` plus `tip` equals `total`.
- Surface each mismatch as a warning on both fields in the comparison, naming the difference as a decimal string. No value gets rewritten to close a gap, at extraction time or at export time.
- Do the arithmetic on the decimal strings with scaled `BigInt` integers written for this app, rather than taking a decimal library. `design.md` carries the reasoning.
- Carry the line items and the warnings in the JSON download.
- Answer three of the eight open points and write each answer into the spec it belongs to:
  - **Tolerance.** Comparison is exact decimal equality at a common scale, with no cent of tolerance. A receipt that rounds its own tax line produces a warning naming 0.01, which is true and visible rather than hidden.
  - **Empty `lineItems`.** An empty or absent array is not itself a warning. The app skips the sum check and shows the absence in the panel, because nothing in this slice can tell a receipt that printed no items from items the model missed.
  - **Warnings in the export.** The JSON download carries the warnings beside the field set, in an envelope holding the validated receipt under `receipt` and the derived warnings under `warnings`.

Out of scope for slice 2, each belonging to a later slice: inline editing and the recheck on every edit (slice 3); field highlighting and the OCR word-box pipeline (slice 4); PDF uploads and the remaining file types (slice 5); CSV export, copy to clipboard, batch export and the IndexedDB session table (slice 6); the file caps, the rate limits and the three sample receipts (slice 7); the landing page, the site chrome, the About page and the README (slice 8); the 40 labelled fixtures and the accuracy numbers (slice 9).

The arithmetic spec's requirement that every edit rechecks the arithmetic stays as it is and arrives with slice 3's editing. Slice 2 builds the checker that recheck will call, and runs it once per extraction.

The five open points this slice leaves alone are the highlight threshold and similarity measure, the scanned PDF with no text layer, the CSV shape, the per-IP window, and the session cap.

## Capabilities

### New Capabilities

None. Slice 2 widens four capabilities that already exist.

### Modified Capabilities

- `extraction`: the field set requirement states `lineItems` as part of the schema the route sends and validates, and names `quantity` as a decimal string beside the two monetary values in an item.
- `arithmetic`: the tolerance open point is answered as exact decimal equality at a common scale; the empty-`lineItems` open point is answered as an absence rather than a flag; a null item amount is added as a reason to skip the sum check; and the checks are stated to run as a pure function in the browser over the validated object.
- `receipt-workspace`: the field panel renders the line items read-only under the flat fields with their confidences, shows the computed item total, and shows each arithmetic warning on both fields in its comparison.
- `export`: the warnings open point is answered. The JSON download carries an envelope with the validated receipt and the derived warnings, every amount still a decimal string.

## Impact

- **New code**: `lib/decimal.ts` (scaled `BigInt` parse, add, subtract, compare and render over decimal strings), `lib/arithmetic.ts` (the two checks and the warnings they produce), a line-item table in the field panel, and warning rendering on a field row.
- **Modified code**: `lib/receipt-schema.ts` gains the `lineItems` array in both built schemas, `lib/receipt-fields.ts` gains stable field identifiers so a warning attaches to a row, `lib/receipt-json.ts` changes the download to the envelope shape, `components/FieldPanel.tsx` gains the items and the warnings, `components/ReceiptWorkspace.tsx` runs the checker when a result arrives, and `lib/model.ts` gains prompt wording for the items.
- **New dependencies**: none. The decimal arithmetic is written in this repo and `BigInt` is in the language.
- **Tests**: Vitest over `lib/decimal.ts` and `lib/arithmetic.ts` (matching sums, mismatching sums, differing scales, nulls, an empty array, a null item amount), extended schema tests for the item shape, and extended field-panel and export tests.
- **Documents**: `handoff.md` records the decimal decision and the three answered open points, and `tasks.md` ticks slice 2. `ai-receipt-scanner-spec.md` needs no correction, because its sections 3 and 4 already describe the field set and the in-code arithmetic this slice builds.
- **Risk**: the JSON download changes shape from the bare receipt to the envelope. No visitor depends on the slice 1 shape yet, and slice 6's batch export wants an envelope anyway.
