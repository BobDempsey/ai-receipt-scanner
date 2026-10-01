# Export Specification

## Purpose

Lets a visitor take a corrected receipt out of the app as JSON or CSV, by download or by clipboard, one receipt at a time or the whole session at once, with the session table held in the browser so the app stores nothing on the server.

## Requirements

### Requirement: JSON export of a single receipt

The app SHALL export the current receipt as JSON, carrying the field set as the visitor has it after any edits, together with that receipt's `confidence` and `sourceText` siblings, `isReceipt` and `reason`. The export SHALL work on the receipt on screen whether or not a session table holds anything.

#### Scenario: A visitor downloads one receipt as JSON

- **WHEN** the visitor chooses the JSON download for the receipt on screen
- **THEN** the browser saves a JSON file holding that receipt's fields, taxes and line items

#### Scenario: An edited field reaches the file

- **WHEN** the visitor corrects `merchant` and then exports
- **THEN** the exported JSON carries the corrected value, not the model's original

#### Scenario: The file carries what the app validated

- **WHEN** the visitor downloads the JSON for a receipt
- **THEN** the file holds the object that passed server-side validation, including each field's `confidence` and `sourceText`, so a reader can tell which values the model was unsure of

#### Scenario: A download with no session behind it

- **WHEN** the visitor downloads the JSON for the first receipt of the session, with no session table in the app yet
- **THEN** the download succeeds on the receipt on screen alone

### Requirement: CSV export of a single receipt

The app SHALL export the current receipt as CSV.

#### Scenario: A visitor downloads one receipt as CSV

- **WHEN** the visitor chooses the CSV download for the receipt on screen
- **THEN** the browser saves a CSV file holding that receipt's values

**Open point:** neither source document states how CSV flattens the two nested arrays, `taxes` and `lineItems`, nor whether the file carries one row per receipt or one row per line item. Settle that shape before implementation and record it here, because the batch export depends on the same answer.

### Requirement: Copy to clipboard in either format

The app SHALL offer copy to clipboard for JSON and for CSV, giving the same content the matching download gives.

#### Scenario: A visitor copies JSON

- **WHEN** the visitor chooses copy for JSON
- **THEN** the clipboard holds the same JSON the JSON download would have saved
- **AND** the app confirms the copy happened

### Requirement: Batch export of the session

The app SHALL export every receipt held in the session table as one JSON file and as one CSV file, by download or by clipboard, so a visitor who scanned several receipts takes them out in a single file.

#### Scenario: A visitor scans three receipts and exports once

- **WHEN** the session table holds three receipts and the visitor chooses the batch CSV download
- **THEN** the browser saves one CSV carrying all three receipts

#### Scenario: A session with one receipt

- **WHEN** the session table holds one receipt
- **THEN** the batch export produces the same single-receipt content, in the batch file shape

### Requirement: Exported money stays a decimal string

Every monetary value in an exported file SHALL be the decimal string the app holds, with its digits unchanged. The app SHALL NOT round, reformat or convert an amount to a number on the way out.

#### Scenario: An amount with trailing zeros

- **WHEN** `total` holds "42.00"
- **THEN** the exported JSON carries the string "42.00" and the exported CSV carries 42.00 with both decimal places

### Requirement: The session table lives in IndexedDB, keyed to the tab session

The app SHALL hold every receipt the visitor has scanned in an IndexedDB table keyed to the tab's session, SHALL survive a reload with that table intact, and SHALL keep no copy of a receipt on the server.

#### Scenario: A visitor reloads the page

- **WHEN** the visitor reloads after scanning two receipts
- **THEN** the session table still lists both receipts with their fields and warnings

#### Scenario: A second visitor arrives

- **WHEN** another visitor opens the app
- **THEN** that visitor sees none of the first visitor's receipts, because the table is keyed to a tab session in the browser

#### Scenario: The session table appears below the form

- **WHEN** the session table holds at least one receipt
- **THEN** the app lists those receipts below the form, each selectable and each exportable on its own

### Requirement: A warned receipt still exports

The app SHALL let a visitor export a receipt that carries an arithmetic warning, without blocking the export and without altering a value to clear the warning.

#### Scenario: Exporting a receipt whose items do not sum

- **WHEN** the receipt on screen carries a subtotal mismatch warning and the visitor exports it
- **THEN** the export succeeds with the values as shown

**Open point:** the source documents do not say whether an exported file carries the arithmetic warnings or the per-field confidence values alongside the field set. Decide that with the CSV shape above.
