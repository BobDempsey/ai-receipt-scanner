# Proposal

## Why

Slices 1 and 2 read a receipt into typed fields and told the visitor when its sums do not agree, and then left them with nothing to do about it. Every value on screen is read-only, so a visitor who can see the misread digit still downloads the misread digit, and the arithmetic warning that found the problem cannot be cleared by fixing it. Slice 3 gives the visitor the correction, revalidates what they typed against the rules the server already applies, and reruns the two checks so a warning changes and clears as the numbers get right.

## What Changes

Slice 3 of the vertical-slice plan in `tasks.md`: inline editing with a recheck on every edit.

- Make every extracted value editable in place: the flat fields, each tax label and amount, and each line item's `description`, `quantity`, `unitPrice` and `amount`. `isReceipt`, `reason`, every confidence, every source string and the computed item total stay read-only, because the app or the model produced them rather than the receipt.
- Validate a committed edit against the same Zod rules the server validated the model's answer with, taken off `receiptSchema` itself rather than retyped, so a malformed date or a money value that is not a decimal string is refused at the field and the old value stays in the receipt.
- Rerun `arithmeticWarnings` after every accepted edit, so a warning changes, appears or clears as the visitor corrects numbers. The checker already runs in the browser, so nothing new goes to the server.
- Clear the review flag on a field the visitor has corrected, and mark the row as a value they typed rather than one the model read.
- Let the visitor add a line item and remove one, because a missed line is the common reason a sum does not match and the app refuses to rewrite a number to close the gap.
- Carry the edited values, the recomputed warnings and the list of edited fields into the JSON download.

### The three decisions this slice records

- **An edit is kept on commit, not per keystroke.** Blur or Enter commits, Escape reverts to the value the field held before the edit. The field holds the visitor's draft text while it has focus, and the app validates, writes and rechecks once on commit. Per-keystroke keeping would refuse a half-typed date (`2026-1`) and a half-typed amount (`42.`) as malformed while the visitor is still typing, so every correction would pass through a rejected state on its way to a valid one.
- **A corrected field's `confidence` becomes null and its `sourceText` stays as the model read it.** Null is a value the schema already permits and already means the app has no model confidence for this field, so the review flag clears without a second rule, and nothing claims a certainty on the visitor's behalf. `sourceText` is a record of the characters on the paper, so slice 4's highlighting still points a corrected field at the region the original was read from, which is where a visitor checks their own correction. The app tells a typed value from a read value by a separate list of edited field addresses held beside the receipt, the way the warnings are held beside it, because the Zod schema governs what sits inside the receipt object.
- **Edits do not survive a page reload in this slice.** The edited receipt, the warnings and the edited-field list live in the workspace's React state, which is where the extracted receipt already lives, so a reload loses the receipt and its edits together. The panel says so beside the download, and the download is how a visitor keeps a corrected receipt until slice 6 puts the session table in IndexedDB.

Add and remove of a line item stays in scope. Without it, a visitor whose receipt lost a line to a crease can only make the sum agree by editing a number the receipt did not print, which is the silent correction the app exists to refuse. The cost is small, because `lineItems` is already a nullable array of entries whose every value is nullable, so an added entry is a blank one the schema accepts, and `lineItemTotal` already reports `incomplete` and skips the sum check while an item amount is missing.

### Out of scope

Each of these belongs to a later slice: field highlighting and the OCR word-box pipeline (slice 4); PDF uploads and the remaining file types (slice 5); CSV export, copy to clipboard, batch export and the IndexedDB session table (slice 6); the file caps, the rate limits and the three sample receipts (slice 7); the landing page, the site chrome, the About page and the README (slice 8); the 40 labelled fixtures and the accuracy numbers (slice 9).

Two things this slice leaves alone deliberately. It adds no undo history beyond Escape on the field being edited, because an undo stack wants the durable session slice 6 brings. It re-extracts nothing from an edit, because the route's contract stays exactly as slice 1 left it.

This slice settles what an edit is for the arithmetic spec's recheck requirement, which is the commit model above. The five open points it leaves alone are the highlight match threshold and similarity measure, the scanned PDF with no text layer, the CSV shape, the per-IP window, and the session cap.

## Capabilities

### New Capabilities

- `field-editing`: how a visitor changes an extracted value and what the app does with the change. Covers which values are editable, the commit and revert model, per-field validation against the shared Zod schema, what happens to a field's confidence and source text once a human has overwritten it, the recheck that follows an accepted edit, adding and removing a line item, and how long an edit lives.

### Modified Capabilities

- `receipt-workspace`: the field panel's read-only requirement is replaced. The panel renders each editable value as a control the visitor types into, shows a rejected edit against the field that refused it, distinguishes a value the visitor typed from a value the model read, and offers the add and remove controls on the line item table.
- `arithmetic`: the recheck requirement gains the cases editing introduces, so a rejected edit rechecks nothing, an added or removed line item reruns the sum check, and a corrected field clears the warning on both rows it named.
- `extraction`: the per-field confidence requirement states that a confidence belongs to the model's reading, so a field the visitor overwrote carries a null confidence and keeps the `sourceText` the model read the original value from.
- `export`: the JSON envelope carries the values as the visitor has them, the warnings recomputed from those values, and a third key naming the fields the visitor edited, so a reader of the file can tell a typed value from a read one.

## Impact

- **New code**: `lib/field-edit.ts` (a field address type covering the flat fields, the tax entries and the line item entries; a per-field validator derived from `receiptSchema.shape`; pure functions that apply an accepted edit, add an item and remove one; the edited-field list), and editable cells plus add and remove controls in the field panel.
- **Modified code**: `components/FieldPanel.tsx` gains the controls, the rejection message, the visitor-typed marker and the item buttons; `components/ReceiptWorkspace.tsx` holds the edited receipt and the edited-field list, applies an accepted edit and reruns the checker; `lib/receipt-fields.ts` gains the field address on every editable row so a control knows what it writes; `lib/receipt-json.ts` gains the `edited` key in the envelope.
- **Unchanged**: `lib/receipt-schema.ts` keeps its shape, `lib/arithmetic.ts` and `lib/decimal.ts` keep their functions, and `lib/extract-receipt.ts` with `app/api/extract/route.ts` keeps its contract. Slice 2 built the checker as a pure function so this slice could call it unchanged.
- **New dependencies**: none. Mantine's `TextInput` covers every cell and Zod is already shared.
- **Tests**: Vitest over `lib/field-edit.ts` (each field address, a valid commit, a malformed date, a money value with four decimal places, a money value written with a comma, an emptied field committing as null, the confidence cleared, the source text kept, an item added, an item removed, the edited list remapped after a removal), over `lib/receipt-fields.ts` for the editable address on each row and the visitor-typed marker, over `lib/arithmetic.ts` for an edited receipt rechecked, and over the export envelope with its `edited` key. The suite runs in a Node environment over `lib/` and `app/` and renders no components, so the panel's own behavior is verified by the end-to-end tasks rather than by a render test, which is why every rule an edit follows lives in `lib/` and the component stays a thin shell.
- **Documents**: `handoff.md` records the three decisions, the add-and-remove call and the third envelope key; `tasks.md` ticks slice 3. `ai-receipt-scanner-spec.md` needs no correction, because its section 2 already says the visitor fixes fields inline and the app rechecks the arithmetic on every edit.
- **Risk**: the download envelope gains a key, which slice 6's batch export inherits. Nobody consumes the file but a visitor reading it, and an added key breaks no reader of the two keys already there.
