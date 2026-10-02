# Spec Delta

## ADDED Requirements

### Requirement: Comparison is exact, with no tolerance

Each check SHALL compare two decimals for exact equality after aligning their scales, and SHALL allow no tolerance of a cent or any other amount. A difference of 0.01 SHALL raise a warning naming 0.01, because a receipt that rounds its own tax line and a model that misread a digit look the same to the app, and the visitor is the one who can tell them apart.

#### Scenario: A receipt rounding its own tax line

- **WHEN** `subtotal` plus the tax plus `tip` comes to "55.01" and `total` reads "55.00"
- **THEN** the app warns on `total` and on `subtotal`, naming the difference of 0.01 rather than passing the check

#### Scenario: Two amounts written at different scales

- **WHEN** the line items sum to "47.6" and `subtotal` reads "47.60"
- **THEN** the check passes, because the two decimals are equal once their scales align

#### Scenario: An amount carrying a third decimal place

- **WHEN** a line item amount reads "1.005" and the other amounts carry two places
- **THEN** the app compares every amount at the widest scale the receipt used, with no digit dropped or rounded away

### Requirement: A warning names its check, both fields and the difference

Each warning SHALL carry which of the two checks raised it, the identifier of each field in the comparison, and the difference as a decimal string with its digits intact, so the panel and the export both read the same numbers off the same warning.

#### Scenario: A subtotal mismatch

- **WHEN** the line items sum to "48.10" and `subtotal` reads "47.60"
- **THEN** the warning names the line-item check, names the line item total and `subtotal` as the fields involved, and carries the difference as the string "0.50"

#### Scenario: A total mismatch

- **WHEN** `subtotal` plus taxes plus `tip` comes to "55.20" and `total` reads "55.00"
- **THEN** the warning names the total check, names `subtotal` and `total`, and carries the difference as the string "0.20"

### Requirement: The checks need no further model call and no second request

The app SHALL compute every warning from the validated object it already holds, SHALL make no additional model call to run a check, and SHALL send no request to the server to run one.

#### Scenario: A result arrives

- **WHEN** an extraction returns a validated receipt
- **THEN** the app runs both checks on what it already holds and sends no further request of any kind

## MODIFIED Requirements

### Requirement: Arithmetic runs on decimal strings

The app SHALL compare and add monetary values as decimals, never as floating-point numbers, so a check never fails or passes because of binary rounding.

#### Scenario: Amounts that round badly as floats

- **WHEN** the line items read "0.10", "0.20" and "0.30" and `subtotal` reads "0.60"
- **THEN** the check passes exactly

#### Scenario: A sum a float would get wrong

- **WHEN** the line items read "0.10", "0.20" and "0.30" and `subtotal` reads "0.60"
- **THEN** the check passes, because the app adds the decimals rather than three floats whose sum is 0.6000000000000001

### Requirement: A missing value is not a mismatch

When a field a check needs is null, the app SHALL skip that check rather than treating the absence as a difference. An empty or absent `lineItems` array SHALL NOT be a warning of its own: the app skips the sum check and shows the absence, because nothing in the app can tell a receipt that printed no items from items the model missed.

#### Scenario: A receipt with no tip

- **WHEN** `tip` is null and `subtotal` plus taxes equals `total`
- **THEN** the app reports no warning

#### Scenario: A receipt with no line items read

- **WHEN** the model returns an empty `lineItems` array
- **THEN** the app skips the line-item check, reports no warning about the items, and shows that it read no line items

#### Scenario: A card slip with a total and nothing itemized

- **WHEN** the upload prints a total and no purchased lines, so `lineItems` comes back empty
- **THEN** the app still runs the total check and reports no warning about the missing items

#### Scenario: A line item whose amount the model could not read

- **WHEN** one entry's `amount` is null and the others carry values
- **THEN** the app skips the sum check rather than summing the rest and naming a difference the receipt does not have

#### Scenario: Items read but no subtotal printed

- **WHEN** `lineItems` carries three amounts and `subtotal` is null
- **THEN** the app skips the sum check and still shows the item total it computed
