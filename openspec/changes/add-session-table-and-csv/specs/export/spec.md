# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
