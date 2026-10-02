# Spec Delta

## ADDED Requirements

### Requirement: The field panel renders each extracted value as a control

The field panel SHALL render every editable value as a control the visitor types into, carrying the value the app holds, beside the field's label and its confidence. A value the app computed SHALL stay text the visitor reads.

#### Scenario: A receipt extracted successfully

- **WHEN** the extraction returns a validated field set
- **THEN** the panel lists each field with its label, its value in a control the visitor can type into, and its confidence

#### Scenario: A field the receipt does not print

- **WHEN** `tip` comes back null
- **THEN** the panel shows an empty control marked as absent rather than one reading 0, so nothing in the panel reads as a zero the receipt printed

#### Scenario: A visitor corrects an item amount

- **WHEN** the visitor clicks an item amount the model misread
- **THEN** the panel gives them a control carrying that amount, and the correction they commit reaches the panel, the checks and the download

#### Scenario: The computed row stays text

- **WHEN** the panel shows the line item total
- **THEN** that row is text the visitor reads, labelled as computed, with no control on it

#### Scenario: A visitor reaching a field by keyboard

- **WHEN** the visitor moves focus through the panel with the keyboard
- **THEN** each control takes focus in the order the panel lists the fields, with a visible focus ring

### Requirement: A refused edit is reported against the field that refused it

When the app refuses a committed edit, the field panel SHALL say so against that field, naming what the field accepts, and SHALL leave every other field, every review flag and every warning as it was.

#### Scenario: A date the schema does not admit

- **WHEN** the visitor commits "02/10/2026" into `date`
- **THEN** the panel marks `date` as refused, says the field takes an ISO date such as 2026-10-02, and shows the value the field held before the edit

#### Scenario: A money value the schema does not admit

- **WHEN** the visitor commits "42,00" into `total`
- **THEN** the panel marks `total` as refused and says the field takes a decimal amount such as 42.00

#### Scenario: The refusal clears when the visitor fixes it

- **WHEN** the visitor commits an accepted value into a field the panel marked as refused
- **THEN** the panel drops the refusal from that field

### Requirement: The panel tells a value the visitor typed from a value the model read

The field panel SHALL mark each field the visitor has edited as a value they typed, and SHALL show no model confidence against it, so a reader of the panel can tell which values came off the receipt through the model and which came from a person.

#### Scenario: One corrected field among the rest

- **WHEN** the visitor corrects `subtotal` and commits
- **THEN** that row reads as a value the visitor typed, carries no confidence figure and carries no review flag, while every other row still shows the confidence the model gave it

#### Scenario: A corrected field stops asking for review

- **WHEN** a field flagged at a confidence of 0.62 is corrected
- **THEN** the review flag leaves that row

### Requirement: The panel offers add and remove on the line item table

The field panel SHALL offer a control that adds a line item and a control that removes one, each reachable by keyboard with an accessible name, so a visitor can put back a line the model missed or drop one it read twice.

#### Scenario: A visitor adds a missing line

- **WHEN** the visitor uses the add control
- **THEN** the table gains a row whose four values are empty controls marked absent, and the visitor types the missing line into it

#### Scenario: A visitor removes a duplicated line

- **WHEN** the visitor uses the remove control on the third row
- **THEN** that row leaves the table, the remaining rows keep their values, and the computed item total and the warnings follow from what is left

#### Scenario: Adding the first item to a receipt that itemized nothing

- **WHEN** the panel says it read no line items and the visitor uses the add control
- **THEN** the table appears with one empty row, and the message about reading no items goes

## MODIFIED Requirements

### Requirement: Money is rendered exactly as the app holds it

The field panel SHALL show each monetary value as the decimal string the app holds, with its digits and its decimal places unchanged, in the control it renders and in the text of a computed row alike, and SHALL NOT reformat, round or localize it.

#### Scenario: An amount with trailing zeros

- **WHEN** `total` holds the string "42.00"
- **THEN** the panel shows 42.00 rather than 42

#### Scenario: A value the visitor typed

- **WHEN** the visitor commits "42.5" into `total`
- **THEN** the control shows 42.5, because the panel prints what the app holds rather than padding it

### Requirement: The line items appear under the flat fields

The field panel SHALL list the line items below the flat fields, one row per item carrying its `description`, `quantity`, `unitPrice` and `amount` in the order the receipt printed them, and SHALL show the confidence the model gave those values. Each of the four values SHALL be editable in place.

#### Scenario: A grocery receipt with six lines

- **WHEN** the extraction returns six line items
- **THEN** the panel lists six rows under the flat fields, in the printed order, each showing its description, quantity, unit price and amount

#### Scenario: An item value the model was unsure of

- **WHEN** an item's `amount` carries a confidence of 0.61
- **THEN** the panel flags that row for review the way it flags a low-confidence flat field

#### Scenario: A line printing no quantity

- **WHEN** an item's `quantity` is null
- **THEN** the row shows the quantity as absent rather than as 1 or as an empty cell the visitor might read as zero

#### Scenario: An item row the visitor corrected

- **WHEN** the visitor corrects the `amount` on a flagged row and commits
- **THEN** that value reads as one the visitor typed and the row's review flag clears if no other value on it is still below the threshold

## REMOVED Requirements

### Requirement: The field panel renders extracted values read-only

**Reason**: Slice 3 is the change the requirement's own closing sentence pointed at. Every extracted value is now a control the visitor types into, so a requirement that the panel offer no input contradicts the behavior the app has.

**Migration**: The requirement "The field panel renders each extracted value as a control" above replaces it, and the `field-editing` capability carries the rules an edit follows. No stored data and no API shape changes, so nothing outside the panel has to migrate.
