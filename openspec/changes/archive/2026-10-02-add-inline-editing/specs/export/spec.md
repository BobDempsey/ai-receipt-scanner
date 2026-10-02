# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

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
