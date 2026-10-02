# Spec Delta

## ADDED Requirements

### Requirement: The line items appear under the flat fields

The field panel SHALL list the line items below the flat fields, one row per item carrying its `description`, `quantity`, `unitPrice` and `amount` in the order the receipt printed them, and SHALL show the confidence the model gave those values. Inline editing of an item arrives in a later change.

#### Scenario: A grocery receipt with six lines

- **WHEN** the extraction returns six line items
- **THEN** the panel lists six rows under the flat fields, in the printed order, each showing its description, quantity, unit price and amount as text the visitor reads

#### Scenario: An item value the model was unsure of

- **WHEN** an item's `amount` carries a confidence of 0.61
- **THEN** the panel flags that row for review the way it flags a low-confidence flat field

#### Scenario: A line printing no quantity

- **WHEN** an item's `quantity` is null
- **THEN** the row shows the quantity as absent rather than as 1 or as an empty cell the visitor might read as zero

### Requirement: The panel shows the item total it computed

The field panel SHALL show the sum of the line item amounts as its own row beside `subtotal`, labelled as a figure the app computed rather than one the receipt printed.

#### Scenario: A receipt whose items add up

- **WHEN** the six item amounts sum to "47.60" and `subtotal` reads "47.60"
- **THEN** the panel shows an item total of 47.60 marked as computed, with no warning on either row

#### Scenario: No line items read

- **WHEN** `lineItems` comes back empty
- **THEN** the panel says it read no line items and shows no item total, rather than showing a total of 0.00

### Requirement: An arithmetic warning appears on both fields it names

The field panel SHALL show each arithmetic warning against both fields in its comparison, with the difference named in words a visitor can act on, and SHALL leave every value exactly as the app holds it.

#### Scenario: A subtotal that the items do not reach

- **WHEN** the items sum to "48.10" and `subtotal` reads "47.60"
- **THEN** the warning appears on the item total row and on the `subtotal` row, naming the 0.50 difference, and both values stay as they are

#### Scenario: A visitor reading only the total

- **WHEN** `subtotal` plus taxes plus `tip` disagrees with `total` by 0.20
- **THEN** the warning is on the `total` row as well as the `subtotal` row, so the visitor sees it wherever they are looking

#### Scenario: A receipt that balances

- **WHEN** both checks pass
- **THEN** the panel shows no warning and says nothing about the arithmetic beyond the computed item total

## MODIFIED Requirements

### Requirement: The field panel renders extracted values read-only

The field panel SHALL show each extracted field's label, its value and its confidence, and SHALL present every value as text the visitor reads rather than a control they type into. This covers the line item values as well as the flat fields. Inline editing arrives in a later change.

#### Scenario: A receipt extracted successfully

- **WHEN** the extraction returns a validated field set
- **THEN** the panel lists each field with its value and its confidence

#### Scenario: A field the receipt does not print

- **WHEN** `tip` comes back null
- **THEN** the panel shows `tip` as absent rather than as 0 or as an empty value the visitor might read as zero

#### Scenario: A visitor tries to correct an item amount

- **WHEN** the visitor clicks an item amount the model misread
- **THEN** the panel offers no input, because editing is a later change, and the JSON download is how the visitor takes the value out meanwhile
