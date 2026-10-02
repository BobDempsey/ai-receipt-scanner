# Spec Delta

## ADDED Requirements

### Requirement: A line item quantity is a decimal string

Each line item's `quantity` SHALL be a decimal string carrying the digits the receipt prints, never a float or a number, so a weight survives as printed and a count stays exact.

#### Scenario: A receipt selling fruit by weight

- **WHEN** the receipt prints a quantity of 0.734 kg
- **THEN** `quantity` is the string "0.734"

#### Scenario: A receipt selling two of something

- **WHEN** the receipt prints a quantity of 2
- **THEN** `quantity` is the string "2" rather than the number 2

#### Scenario: A receipt that prints no quantity

- **WHEN** a line prints a description and an amount and no quantity
- **THEN** `quantity` comes back null rather than defaulting to "1"

## MODIFIED Requirements

### Requirement: The extracted field set

The model response SHALL carry one flat object per receipt holding `merchant`, `merchantAddress`, `date`, `time`, `currency`, `subtotal`, `taxes`, `tip`, `total`, `paymentMethod`, `cardLast4`, and a `lineItems` array whose entries each hold `description`, `quantity`, `unitPrice` and `amount`. `taxes` entries each hold `label` and `amount`. Every value in a `lineItems` entry SHALL carry the same `confidence` and `sourceText` siblings the flat fields carry.

#### Scenario: A receipt printing two tax lines

- **WHEN** the receipt prints two separate tax lines
- **THEN** `taxes` holds two entries, each with its own `label` and `amount`

#### Scenario: A field the receipt does not print

- **WHEN** the receipt prints no time, no address, no tip, no payment method and no card digits
- **THEN** `time`, `merchantAddress`, `tip`, `paymentMethod` and `cardLast4` come back null rather than invented or zeroed

#### Scenario: A grocery receipt printing six lines

- **WHEN** the receipt prints six purchased lines
- **THEN** `lineItems` holds six entries in the printed order, each with its `description`, `quantity`, `unitPrice` and `amount`

#### Scenario: A line item value the model is unsure of

- **WHEN** the model reads a faint item amount
- **THEN** that entry's `amount` carries its own `confidence` and the `sourceText` the value was read from, beside the value rather than wrapping it

#### Scenario: A receipt printing no purchased lines

- **WHEN** the upload is a card slip printing a total and nothing itemized
- **THEN** `lineItems` comes back empty rather than carrying an invented entry
