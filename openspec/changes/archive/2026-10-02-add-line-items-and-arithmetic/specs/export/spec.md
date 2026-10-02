# Spec Delta

## MODIFIED Requirements

### Requirement: JSON export of a single receipt

The app SHALL export the current receipt as JSON in an envelope holding the validated field set under `receipt` and the arithmetic warnings under `warnings`. The field set SHALL carry the values as the visitor has them after any edits, the `confidence` and `sourceText` siblings, `isReceipt`, `reason` and the `lineItems` array. The export SHALL work on the receipt on screen whether or not a session table holds anything.

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
