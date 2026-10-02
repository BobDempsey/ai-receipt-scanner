# Export Specification

## Purpose

Lets a visitor take a corrected receipt out of the app as JSON or CSV, by download or by clipboard, one receipt at a time or the whole session at once, with the session table held in the browser so the app stores nothing on the server.

## Requirements

### Requirement: JSON export of a single receipt

The app SHALL export the current receipt as JSON in an envelope holding the validated field set under `receipt`, the arithmetic warnings under `warnings` and the fields the visitor edited under a third key. The field set SHALL carry the values as the visitor has them after any edits, the `confidence` and `sourceText` siblings, `isReceipt`, `reason` and the `lineItems` array. The warnings SHALL be the ones the app recomputed after the last accepted edit. The export SHALL work on the receipt on screen whether or not a session table holds anything.

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
- **THEN** the download succeeds on the receipt on screen alone

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
