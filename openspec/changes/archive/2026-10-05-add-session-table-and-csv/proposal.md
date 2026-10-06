# Proposal

## Why

A visitor who scans five receipts gets five downloads and loses all of them on a reload, because the app holds one receipt at a time and holds it nowhere. The product spec has promised a session table since the start, and the panel currently apologizes for its absence in a sentence beside the download. This is slice 6 of the nine-slice plan, and the spec's CSV open point says the batch export depends on the same answer the single-receipt CSV needs, so both land together.

## What Changes

- Every extracted receipt is kept in IndexedDB, keyed to the tab session, with its warnings and its edited list beside it, so a reload comes back with the table intact.
- A table below the workspace lists the session's receipts, and selecting one reopens it in the panes for reading, correcting and exporting.
- CSV export arrives, and the shape is settled: one row per line item, the receipt's own fields repeated on every row. Taxes flatten into numbered `tax_n_label` and `tax_n_amount` column pairs, sized to the widest receipt in the export. A receipt that itemized nothing still gets one row, with its item columns empty.
- Copy to clipboard sits beside each download, for JSON and for CSV, giving the same bytes the download gives.
- Batch export takes the whole table out as one CSV and as one JSON, by download or by clipboard.
- The panel's sentence about a reload losing the receipt goes, because it is no longer true. What replaces it says where the receipts live and that closing the tab is what ends them.
- Batch upload stays out. Receipts reach the table one upload at a time, and the five-file cap stays with slice 7 alongside the other caps.

## Capabilities

### New Capabilities

None. The `export` capability already describes the session table, the CSV and the batch export; this slice implements them and settles the one shape it left open.

### Modified Capabilities

- `export`: the CSV shape is settled, which retires the open point, and the column conventions, the batch file shape and the clipboard confirmation become stated behavior rather than a promise.
- `receipt-workspace`: the session table appears below the panes, selecting a row reopens that receipt, and the workspace states the session's real lifetime rather than the single-receipt one.

## Impact

- New `lib/session-store.ts` for the IndexedDB table: open, put, list, get, and the tab-session key.
- New `lib/receipt-csv.ts` for the row builder, the column sizing and the quoting, pure and shared by the single and the batch export.
- New `components/SessionTable.tsx` for the list and its per-row export controls.
- `lib/receipt-json.ts` gains the batch envelope beside the single one, and the filename constants.
- `components/ReceiptWorkspace.tsx` writes each result to the table, reads the table on mount, reopens a selected receipt, and carries the new export controls and the corrected lifetime sentence.
- No change to the Zod field set, the extraction route, the arithmetic, the edit module, the matcher or the PDF path. A stored receipt is the same validated object, so nothing downstream learns it came from the table.
