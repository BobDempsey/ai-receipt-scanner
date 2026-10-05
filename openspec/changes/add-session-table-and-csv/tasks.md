# Tasks

Slice 6 of the nine-slice plan: the session table, CSV and batch export. The slice is finished when a visitor on the deployed app scans three receipts, reloads, finds all three still listed, reopens one and corrects it, and takes the whole session out as one CSV and one JSON.

## 1. The CSV builder

- [x] 1.1 Add `lib/receipt-csv.ts` with the column spec: the receipt's own fields by their property names, then the numbered `tax_n_label` and `tax_n_amount` pairs, then `item_description`, `item_quantity`, `item_unit_price` and `item_amount`. Verify a unit test asserts the exact header string for a receipt with one tax.
- [x] 1.2 Implement the quoting: a comma, a double quote or a newline forces quotes, an inner quote doubles, everything else stays bare, and no value is otherwise altered. Verify unit tests cover a merchant with a comma, a description holding a double quote, a value with a newline, and a plain decimal staying bare.
- [x] 1.3 Build one row per line item with the receipt fields repeated, and one row with empty item columns for a receipt that itemized nothing. Verify unit tests cover a six-item receipt giving six rows, a receipt with no items giving one row, and a null `tip` reaching an empty cell rather than a zero.
- [x] 1.4 Size the tax columns to the widest receipt in the export, so the single-receipt export is the batch export over a list of one. Verify a unit test covers two receipts with two taxes and none, the header carrying two pairs and the second receipt's cells empty.
- [x] 1.5 Carry no `confidence` and no `sourceText` in any CSV column, and verify a unit test asserts neither word appears in the header of a full export.

## 2. The session store

- [x] 2.1 Add `lib/session-store.ts` with the stored record shape: an id, the session id, a timestamp, and the `receipt`, `warnings` and `edited` the download already carries. Verify a unit test covers the record builder, including that no id or timestamp reaches the receipt object.
- [x] 2.2 Implement the tab session id: a random id held in `sessionStorage`, created once per tab, so the lifetime is the tab's. Verify a unit test covers a missing value creating one, an existing value being reused, and a throwing `sessionStorage` not throwing out of the module.
- [x] 2.3 Implement open, put, get and list-by-session over IndexedDB directly, with no wrapper library, each wrapped so a failure resolves to a reported absence rather than throwing into the render. Verify unit tests against a stand-in IndexedDB cover a put then a list, a list filtered to one session, newest-first ordering, and an unavailable database leaving the app usable.
- [x] 2.4 Verify no receipt bytes and no image reach the store: a unit test asserts the stored record's keys are exactly the six the shape names.

## 3. The batch envelope and the filenames

- [x] 3.1 Add the batch JSON envelope to `lib/receipt-json.ts` beside the single one, carrying every receipt's own `receipt`, `warnings` and `edited`, and verify a unit test covers three receipts and the one-receipt case producing the same shape.
- [x] 3.2 Name the four files (single JSON, single CSV, batch JSON, batch CSV) as constants in one place, replacing the comment on `RECEIPT_JSON_FILENAME` that says slice 6 settles this, and verify `npm run typecheck` passes.

## 4. The session table component

- [x] 4.1 Add `components/SessionTable.tsx` listing the session's receipts newest first, each row naming its merchant, date and total, saying when the receipt carries an arithmetic warning, and reporting a selection upward. Verify in the dev server that three receipts list in order with the warned one marked.
- [x] 4.2 Show no list at all with an empty table, and verify it in the dev server before anything is scanned.
- [x] 4.3 Make each row reachable by keyboard with a visible focus ring, selecting on Enter, and verify in the dev server.
- [x] 4.4 Put the batch controls beside the list, naming how many receipts they will export, and verify in the dev server with one receipt and with three.

## 5. The workspace

- [x] 5.1 Write the record on every extraction and again on every accepted edit, add and remove, so the stored record is true at all times rather than at scan time. Verify in the dev server that a correction then a reload comes back corrected.
- [x] 5.2 Read the table on mount and list what the session holds, and verify in the dev server that a reload after three receipts lists all three.
- [x] 5.3 Reopen a selected receipt into the panes with its fields, warnings and edited markers, making it what every control acts on. Verify in the dev server that the download, the arithmetic and an edit all act on the reopened receipt.
- [x] 5.4 Say in the document pane that a reopened receipt's image is not kept, worded apart from the slice 4 sentence about text the matcher could not find. Verify in the dev server.
- [x] 5.5 Add the CSV download and the two copy controls beside the JSON download, confirming a copy and saying plainly when the clipboard refused. Verify all three in the dev server, the refusal with the clipboard permission denied.
- [x] 5.6 Replace the sentence saying a reload loses the receipt with what is now true: the session's receipts live in this browser and end with the tab, and nothing about them reaches the server. Verify the storage policy beside the picker still reads correctly with three receipts held.
- [x] 5.7 Verify in the dev server that the batch CSV and the batch JSON both carry all three receipts, and that the single-receipt JSON still carries exactly `receipt`, `warnings` and `edited`.

## 6. The specs and the record

- [x] 6.1 Update `ai-receipt-scanner-spec.md` where it disagrees with what this slice settled, including the CSV shape, the column names, the clipboard behaviour and the session lifetime, and verify the product spec and the two delta specs now say the same thing.
- [ ] 6.2 Record the slice 6 decisions in `handoff.md`: the session key in `sessionStorage` against the records in IndexedDB, the record shape, the column spec and its prefixes, the single export being the batch over a list of one, the CSV carrying no model metadata, and the reopened receipt having no image. Retire the section 8 gotcha saying the product spec's reload promise and the app disagree, because this slice reconciles them. Verify the outstanding-work inventory and `tasks.md` at the repo root both reflect the slice as done once group 7 passes.
- [x] 6.3 Run `npm run lint`, `npm run typecheck` and `npm test`, and verify all three pass with the new unit tests counted.

## 7. End to end in the running app

- [ ] 7.1 Deploy to production and verify on https://ai-receipt-scanner.bobdempsey83.com that three scanned receipts all list newest first, that a reload keeps them, that reopening one carries its fields and its edits, that correcting a reopened receipt updates both the row and the stored record, that the single CSV carries one row per line item with the receipt fields repeated, that a receipt with no items still gets a row, that the batch CSV carries all three under one header with the tax columns sized to the widest, that both copy controls confirm, that a second browser profile sees none of it, and that the single-receipt JSON still carries exactly the three keys.
