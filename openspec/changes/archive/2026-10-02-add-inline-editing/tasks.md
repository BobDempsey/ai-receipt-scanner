# Tasks

Slice 3 of the vertical-slice plan in the repo's `tasks.md`: inline editing with a recheck on every edit. Every extracted value becomes a control the visitor types into, a committed edit is validated against the same Zod rules the server uses, the two arithmetic checks rerun on every accepted edit, a corrected field stops asking for review and reads as a value the visitor typed, the visitor can add and remove a line item, and the JSON download carries the edited values, the recomputed warnings and the list of edited fields, working in the deployed app.

## 1. Field addresses and the per-field validator

The plan wrote eleven editable flat fields and the schema holds ten. `merchant`, `merchantAddress`, `date`, `time`, `currency`, `subtotal`, `tip`, `total`, `paymentMethod` and `cardLast4` are editable; `taxes` and `lineItems` are the two collections, and `isReceipt` and `reason` are not editable. Task 1.3 now reads ten.

- [x] 1.1 Add `lib/field-edit.ts` with an address type covering a flat field, a tax entry cell and a line item entry cell, plus the string form (`total`, `taxes.1.amount`, `lineItems.3.amount`) that the export carries, and verify `tsc --noEmit` passes
- [x] 1.2 Resolve each address to its validator off `receiptSchema` itself, taking `shape[key]` for a flat field and unwrapping the nullable array to the element shape for a tax or an item cell, with no regex restated in the module. Verify by reading the module and confirming it imports `receiptSchema` and declares no pattern of its own
- [x] 1.3 Enumerate the editable addresses for a given receipt, leaving out `isReceipt`, `reason`, every `…Confidence`, every `…SourceText` and the computed item total, and verify the list holds the ten flat fields plus two cells per tax entry plus four cells per line item
- [x] 1.4 Add Vitest coverage asserting every enumerated address resolves to a validator, so a field added to the schema later and never made editable fails loudly. Verify `npm test` passes
- [x] 1.5 Compose the refusal sentence per kind of field (ISO date, 24-hour time, ISO 4217 code, decimal amount of up to three places, four card digits, free text) in this module alone, and verify the module carries no em dash and no Zod issue text

## 2. Applying one accepted edit

- [x] 2.1 Add `applyEdit(receipt, address, text)` returning either a rejection or a new receipt, pure and mutating nothing it was given, and verify a test asserting the input receipt is unchanged after a call
- [x] 2.2 Commit an accepted value, set that field's `…Confidence` to null and leave its `…SourceText` exactly as it was, and verify a correction over a field read at 0.62 leaves no confidence and the original source string
- [x] 2.3 Commit an emptied field as null rather than as an empty string, and verify a cleared `tip` reads as absent and a cleared `subtotal` makes both checks that need it skip
- [x] 2.4 Keep a committed monetary value as the digits the visitor typed, with no rounding, padding, trailing-zero stripping or localizing, and verify "42.00" stays "42.00" and "42.5" stays "42.5"
- [x] 2.5 Refuse a value the validator rejects, returning the address, the text the visitor typed and the sentence from 1.5, and verify a malformed date, a money value written with a comma, a money value with four decimal places and a currency of "pounds" are each refused with the receipt untouched
- [x] 2.6 Add Vitest coverage over every address kind: a flat text field, `date`, `time`, `currency`, `cardLast4`, a money field, a tax label, a tax amount, and each of the four line item cells. Verify `npm test` passes

## 3. Adding and removing a line item

- [x] 3.1 Add `addLineItem(receipt)` returning a new receipt whose item list gains an entry with every value null and every confidence null, and verify an added item invents no description and that a receipt whose `lineItems` was empty or null comes back with a one-item list
- [x] 3.2 Add `removeLineItem(receipt, index)` returning a new receipt without that entry, and verify removing the only item leaves an empty list rather than a null
- [x] 3.3 Remap the recorded edited addresses on a removal so an address above the removed index follows its item, and verify a removal below, at and above a recorded edit, and two recorded edits either side of one removal
- [x] 3.4 Add Vitest coverage for the add and the remove against the arithmetic checks: an added item with no amount skips the sum check, an added item carrying the missing 0.50 makes it pass, and removing a duplicated line makes it pass. Verify `npm test` passes

## 4. The editable rows in the field panel

- [x] 4.1 Give every editable row in `lib/receipt-fields.ts` its field address, and mark a row the visitor has edited off the edited list rather than off its null confidence, and verify the existing field-row tests still pass
- [x] 4.2 Extend `lib/receipt-fields.test.ts` over the new row data: an address on each editable row, no address on the computed item total, and the visitor-typed marker on an edited row with no review flag. Verify `npm test` passes
- [x] 4.3 Render each editable value in `components/FieldPanel.tsx` as a Mantine `TextInput` carrying the value the app holds, with the computed item total left as text, and verify a null field shows an empty control marked absent rather than one reading 0
- [x] 4.4 Hold the draft string in the cell, commit on blur and on Enter, revert on Escape, and report nothing in between, and verify by typing a part-formed date into the running app and seeing no refusal until commit
- [x] 4.5 Mark a refused field in the panel with the sentence the rejection carries, and clear that mark when the visitor commits an accepted value, and verify both states in the running app
- [x] 4.6 Show an edited field as a value the visitor typed, with no confidence figure and no review flag, and verify a field flagged at 0.62 loses the flag once corrected
- [x] 4.7 Render each line item cell as a control and add the add and remove controls with accessible names, each reachable by keyboard with a visible focus ring, and verify keyboard reach in the running app
- [x] 4.8 Replace the panel's closing read-only sentence with one saying the correction lives in this browser tab and the download is how the visitor keeps it, and verify the sentence carries no em dash
- [x] 4.9 Key each item row off a row key the workspace generates rather than off its index, held outside the receipt and never exported, and verify removing a middle row leaves no draft text on the row that took its place

## 5. The workspace holds the edits and rechecks

- [x] 5.1 Hold the edited list and the rejections beside the receipt and the warnings in `components/ReceiptWorkspace.tsx`, and verify picking a new file or extracting again clears all four
- [x] 5.2 On an accepted commit, set the new receipt, the new edited list and the warnings from `arithmeticWarnings` in one handler, and verify no render shows a receipt beside warnings computed from an earlier one
- [x] 5.3 On a refused commit, record the rejection and leave the receipt, the edited list and the warnings as they were, and verify the warnings are identical before and after a refusal
- [x] 5.4 Rerun the checks after an add and after a remove the same way, and verify a warning that named 0.50 names 0.10 once the visitor narrows the gap
- [x] 5.5 Confirm the recheck sends nothing: read the handler and verify it calls `arithmeticWarnings` over state the browser already holds and makes no `fetch`

## 6. The export

- [x] 6.1 Add the `edited` key to the envelope in `lib/receipt-json.ts`, holding the string form of each edited address, always present and empty when the visitor changed nothing, and verify the saved file parses and carries all three keys
- [x] 6.2 Pass the edited list from the workspace into the download beside the receipt and the warnings, and verify a corrected `total` reaches the file with `totalConfidence` null and `totalSourceText` unchanged
- [x] 6.3 Carry an added line item into the file with the values the visitor typed, its confidences null, and its address among the edited fields, and verify a six-item receipt plus one added item exports seven entries
- [x] 6.4 Add export tests over the third key, the empty edited list, a cleared warning, a warning whose difference changed, and an added item. Verify `npm test` passes

## 7. Fold the decisions back into the documents

- [x] 7.1 Record in `handoff.md` the three decisions this slice settled (an edit is kept on commit by blur or Enter with Escape reverting; an overwritten field carries a null confidence and keeps its `sourceText`, with the edited list beside the receipt telling a typed value from a read one; edits do not survive a reload because the receipt does not either), the call to keep add and remove of a line item in scope and why, and the third envelope key slice 6 inherits. Verify the file carries no em dash and no AI attribution
- [x] 7.2 Tick slice 3 in the repo's `tasks.md`, and verify the other entries are untouched
- [x] 7.3 Confirm `ai-receipt-scanner-spec.md` needs no correction for this slice by reading its sections 2 and 5 against the delta specs, and report any disagreement rather than leaving a delta to carry a fix alone

## 8. Verify the slice end to end in the deployed app

- [x] 8.1 Run `npm run lint`, `npm run typecheck` and `npm test`, and verify all three pass with no warning introduced by this slice
- [x] 8.2 Push `main` and verify the Vercel production build succeeds with no type or lint error
- [x] 8.3 On the production URL, extract a JPEG receipt, correct `merchant` and commit with Enter, and verify the panel shows the corrected value, marks it as one you typed, shows no confidence against it and refuses nothing
- [x] 8.4 On the production URL, type "02/10/2026" into `date` and commit, and verify the panel refuses it, names what the field takes, keeps the previous value, and leaves every warning as it was
- [x] 8.5 On the production URL, extract a receipt whose items do not sum to its printed subtotal, correct the misread item amount, and verify the warning clears from both rows with no page reload
- [x] 8.6 On the production URL, edit `total` to a value its parts do not reach, and verify the warning appears on `total` and on `subtotal` naming the new difference
- [x] 8.7 On the production URL, add a line item, verify the panel says the sum check is skipped while its amount is absent, then type the missing amount and verify the sum check passes and the warning clears
- [x] 8.8 On the production URL, remove a line item and verify the row leaves, the computed item total follows the remaining items, and the warnings follow from what is left
- [x] 8.9 On the production URL, clear `tip` and commit, and verify the panel reads it as absent and the total check skips rather than naming a difference
- [x] 8.10 On the production URL, download the JSON after several corrections and verify the file carries the edited values, the recomputed warnings, the `edited` list naming each corrected field, a null confidence on each of them, and every original `sourceText` intact
- [x] 8.11 On the production URL, correct a field and reload, and verify the workspace comes back empty with no receipt and no edits, which is the lifetime this slice records
- [x] 8.12 On the production URL, reach every control in the panel with the keyboard alone, including add and remove, and verify each takes focus with a visible ring and commits with Enter
