# Export Specification

## Purpose

Lets a visitor take a corrected receipt out of the app as JSON or CSV, by download or by clipboard, one receipt at a time or the whole session at once, with the session table held in the browser so the app stores nothing on the server.

## Requirements

### Requirement: JSON export of a single receipt

The app SHALL export the current receipt as JSON in an envelope holding the validated field set under `receipt`, the arithmetic warnings under `warnings` and the fields the visitor edited under a third key. The field set SHALL carry the values as the visitor has them after any edits, `isReceipt` and `reason` among them, and the warnings SHALL be the ones the app recomputed after the last accepted edit.

#### Scenario: A visitor downloads one receipt as JSON

- **WHEN** the visitor chooses the JSON download for the receipt on screen
- **THEN** the browser saves a JSON file holding that receipt's fields, taxes and line items

#### Scenario: An edited field reaches the file

- **WHEN** the visitor corrects `merchant` and then exports
- **THEN** the exported JSON carries the corrected value, not the model's original

#### Scenario: The file carries what the app validated

- **WHEN** the visitor downloads the JSON for a receipt
- **THEN** the file holds the object that passed server-side validation under `receipt`, including each field's `confidence` and `sourceText`, so a reader can tell which values the model was unsure of

#### Scenario: A download with no session behind it

- **WHEN** the visitor downloads the JSON for the first receipt of the session, with no session table in the app yet
- **THEN** the download succeeds on the receipt on screen alone, because the export reads the receipt on screen rather than the table

#### Scenario: Each line item reaches the file

- **WHEN** the receipt carries six line items
- **THEN** the file holds six entries under `receipt.lineItems`, each with its `description`, `quantity`, `unitPrice`, `amount` and their `confidence` and `sourceText` siblings

#### Scenario: A receipt the checks found nothing wrong with

- **WHEN** both arithmetic checks pass
- **THEN** the file carries `warnings` as an empty array rather than omitting the key, so a reader can tell a checked receipt from an unchecked one

#### Scenario: A correction that cleared a warning

- **WHEN** the visitor corrects the field a warning named, the warning clears, and the visitor downloads the JSON
- **THEN** the file carries the corrected value and no longer carries that warning

#### Scenario: A correction that changed a difference

- **WHEN** a warning named a difference of 0.50, the visitor narrows the gap to 0.10 and downloads the JSON
- **THEN** the file carries the warning naming "0.10", because the app recomputed it from the values the visitor now has

### Requirement: The JSON export names the fields the visitor edited

An exported JSON file SHALL carry a key naming each field the visitor edited, beside the receipt and the warnings, so a reader can tell a value a person typed from a value the model read. The key SHALL always be present, empty when the visitor edited nothing.

#### Scenario: A receipt with two corrections

- **WHEN** the visitor corrects `date` and one line item's `amount` and then downloads the JSON
- **THEN** the file names both of those fields as edited and names no other field

#### Scenario: A receipt the visitor did not touch

- **WHEN** the visitor downloads the JSON without editing anything
- **THEN** the file carries the edited key as an empty list rather than omitting it

#### Scenario: An edited field carries no confidence

- **WHEN** the visitor corrects `total` and downloads the JSON
- **THEN** `receipt.total` holds the corrected string, `receipt.totalConfidence` is null, and `receipt.totalSourceText` still holds the characters the model read the original from

#### Scenario: An added line item reaches the file

- **WHEN** the visitor adds a line item, types a description and an amount into it, and downloads the JSON
- **THEN** the file carries that entry under `receipt.lineItems` with the values the visitor typed, with its confidences null, and names the entry among the edited fields

### Requirement: CSV export of a single receipt

The app SHALL export the current receipt as CSV with one row per line item, repeating the receipt's own fields on every row, so a spreadsheet can group or pivot on any of them. A receipt that itemized nothing SHALL still produce one row, with its item columns empty rather than zero.

#### Scenario: A visitor downloads one receipt as CSV

- **WHEN** the visitor chooses the CSV download for the receipt on screen
- **THEN** the browser saves a CSV file holding that receipt's values

#### Scenario: A receipt with six line items

- **WHEN** the receipt carries six line items
- **THEN** the file holds a header row and six data rows, each carrying that item's description, quantity, unit price and amount beside the merchant, date, subtotal, total and the other receipt fields

#### Scenario: A receipt that itemized nothing

- **WHEN** the receipt carries no line items, such as a card slip printing a total alone
- **THEN** the file holds a header row and one data row, whose item columns are empty, because an empty cell says the receipt printed no item where a zero would claim it printed one worth nothing

#### Scenario: A field the receipt did not print

- **WHEN** `tip` is null
- **THEN** that cell is empty rather than 0, matching how the field panel shows an absent value

### Requirement: Copy to clipboard in either format

The app SHALL offer copy to clipboard for JSON and for CSV, giving the same content the matching download gives, and SHALL tell the visitor the copy happened. Where a download exists, a copy SHALL sit beside it, for one receipt and for the batch alike.

#### Scenario: A visitor copies JSON

- **WHEN** the visitor chooses copy for JSON
- **THEN** the clipboard holds the same JSON the JSON download would have saved
- **AND** the app confirms the copy happened

#### Scenario: A visitor copies CSV

- **WHEN** the visitor chooses copy for CSV
- **THEN** the clipboard holds the same CSV the CSV download would have saved, header row included
- **AND** the app confirms the copy happened

#### Scenario: The clipboard refuses

- **WHEN** the browser refuses the clipboard write
- **THEN** the app says the copy did not happen and leaves the download as the way out, rather than reporting a success it did not get

### Requirement: Batch export of the session

The app SHALL export every receipt held in the session table as one JSON file and as one CSV file, by download or by clipboard, so a visitor who scanned several receipts takes them out in a single file. The batch CSV SHALL carry one header row and then the rows of every receipt, in the order the session table lists them, and SHALL size its tax columns to the widest receipt in the export so every receipt's taxes fit the one header.

#### Scenario: A visitor scans three receipts and exports once

- **WHEN** the session table holds three receipts and the visitor chooses the batch CSV download
- **THEN** the browser saves one CSV carrying all three receipts

#### Scenario: A session with one receipt

- **WHEN** the session table holds one receipt
- **THEN** the batch export produces the same single-receipt content, in the batch file shape

#### Scenario: Receipts with different numbers of taxes

- **WHEN** one receipt carries two tax lines and another carries none
- **THEN** the header carries two tax column pairs, the first receipt's rows fill both, and the second receipt's rows leave both empty

#### Scenario: Telling one receipt's rows from another's

- **WHEN** a reader opens a batch CSV of three receipts
- **THEN** each row carries the receipt fields of the receipt it belongs to, so the rows of one receipt are identifiable without a separator row

### Requirement: Exported money stays a decimal string

Every monetary value in an exported file SHALL be the decimal string the app holds, with its digits unchanged. The app SHALL NOT round, reformat or convert an amount to a number on the way out.

#### Scenario: An amount with trailing zeros

- **WHEN** `total` holds "42.00"
- **THEN** the exported JSON carries the string "42.00" and the exported CSV carries 42.00 with both decimal places

### Requirement: The session table lives in IndexedDB, keyed to the tab session

The app SHALL hold every receipt the visitor has scanned in an IndexedDB table keyed to the tab's session, SHALL survive a reload with that table intact, and SHALL keep no copy of a receipt on the server. Each stored receipt SHALL carry the warnings and the edited list the app held for it, so a reopened receipt reads exactly as it did before the reload.

#### Scenario: A visitor reloads the page

- **WHEN** the visitor reloads after scanning two receipts
- **THEN** the session table still lists both receipts with their fields and warnings

#### Scenario: A second visitor arrives

- **WHEN** another visitor opens the app
- **THEN** that visitor sees none of the first visitor's receipts, because the table is keyed to a tab session in the browser

#### Scenario: The session table appears below the form

- **WHEN** the session table holds at least one receipt
- **THEN** the app lists those receipts below the form, each selectable and each exportable on its own

#### Scenario: A corrected receipt comes back corrected

- **WHEN** the visitor corrects two fields, reloads, and reopens that receipt from the table
- **THEN** the corrected values are there, those two fields still read as values the visitor typed, and the warnings are the ones the app recomputed after the last edit

#### Scenario: A correction after a reopen

- **WHEN** the visitor reopens a receipt from the table and corrects a field
- **THEN** the stored record is updated, so a later reload shows that correction too

### Requirement: A warned receipt still exports

The app SHALL let a visitor export a receipt that carries an arithmetic warning, without blocking the export and without altering a value to clear the warning. An exported JSON file SHALL carry every warning the app raised, each naming its check, the two fields involved and the difference as a decimal string.

#### Scenario: Exporting a receipt whose items do not sum

- **WHEN** the receipt on screen carries a subtotal mismatch warning and the visitor exports it
- **THEN** the export succeeds with the values as shown

#### Scenario: The warning travels with the numbers

- **WHEN** the visitor downloads the JSON for a receipt whose items sum to "48.10" against a `subtotal` of "47.60"
- **THEN** the file carries a warning naming the line-item check, the line item total, `subtotal` and the difference "0.50", beside the unaltered values

#### Scenario: A reader checks the file against the receipt

- **WHEN** someone reads the downloaded file
- **THEN** every amount in it matches what the app held, with the warning explaining the gap rather than any number adjusted to close it

### Requirement: The CSV columns are named and ordered the same every time

A CSV export SHALL carry a header row naming every column, and SHALL order the columns the same way on every export: the receipt's own fields, then its numbered tax pairs, then the line item columns. A column name SHALL say which of the two it belongs to, so a reader can tell a receipt-level amount from an item-level one.

#### Scenario: A reader opens two exports a week apart

- **WHEN** a reader compares a CSV exported today with one exported a week ago
- **THEN** the columns are in the same order with the same names, so a script written against one reads the other

#### Scenario: Item columns are distinguishable from receipt columns

- **WHEN** a reader reads the header row
- **THEN** the line item columns are named apart from the receipt columns, so the item amount is never mistaken for the receipt total

### Requirement: The CSV quotes what it must and nothing else

The app SHALL quote any value holding a comma, a double quote or a line break, SHALL escape a double quote by doubling it, and SHALL leave every other value unquoted. A value SHALL reach the file as the app holds it, with no leading apostrophe, no thousands separator and no currency symbol added.

#### Scenario: A merchant name with a comma

- **WHEN** a merchant reads "Harbour Street Grocers, Ltd"
- **THEN** that cell is quoted and the comma stays inside the quotes

#### Scenario: A description holding a quote mark

- **WHEN** an item description reads `12" tortillas`
- **THEN** the cell is quoted and the inner quote is doubled

#### Scenario: A plain value

- **WHEN** a cell holds 42.00
- **THEN** it reaches the file unquoted as 42.00

### Requirement: A CSV export carries no confidence and no source text

A CSV export SHALL carry the values the visitor has, and SHALL NOT carry the `confidence` or `sourceText` siblings, because a spreadsheet row that doubled its width with model metadata would bury the numbers a visitor opened it for. The JSON export remains the format that carries them.

#### Scenario: A visitor wants the model's certainty

- **WHEN** a visitor needs each field's confidence
- **THEN** the JSON export carries it and the app says so where the CSV control sits

#### Scenario: An edited field in a CSV

- **WHEN** the visitor corrected `total` and exports CSV
- **THEN** the cell carries the corrected value, with nothing in the row marking it as typed rather than read
