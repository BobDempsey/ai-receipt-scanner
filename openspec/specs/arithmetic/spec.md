# Arithmetic Specification

## Purpose

Checks a receipt's own sums in code rather than trusting the model to do the maths, and reports any mismatch as a warning that names the difference so the visitor decides what to fix.

## Requirements

### Requirement: Line items sum to the subtotal

The app SHALL add the `amount` of every line item and compare the sum against `subtotal`. The app SHALL run this check in code and SHALL NOT ask the model to confirm it.

#### Scenario: A receipt whose items add up

- **WHEN** the line item amounts sum to the printed subtotal
- **THEN** the app reports no warning on `subtotal` or on the line items

#### Scenario: A receipt whose items do not add up

- **WHEN** the line item amounts sum to 48.10 and `subtotal` reads 47.60
- **THEN** the app warns on `subtotal` and on the line item total, naming the difference of 0.50

### Requirement: Subtotal plus taxes plus tip equals the total

The app SHALL add `subtotal`, every `taxes[].amount` and `tip`, and compare the sum against `total`.

#### Scenario: A restaurant receipt with a tip and two tax lines

- **WHEN** `subtotal` plus both tax amounts plus `tip` equals `total`
- **THEN** the app reports no warning on either side of the comparison

#### Scenario: A total that does not follow from its parts

- **WHEN** `subtotal` plus taxes plus `tip` comes to 55.20 and `total` reads 55.00
- **THEN** the app warns on `total` and on `subtotal`, naming the difference of 0.20

### Requirement: A mismatch is a warning on both fields involved

Each mismatch SHALL surface as a warning naming the difference, attached to both fields in the comparison, so the visitor sees it wherever they are looking.

#### Scenario: A visitor looking only at the total

- **WHEN** the subtotal and total disagree by 0.20
- **THEN** the warning appears on `total` as well as on `subtotal`, and it states the 0.20 difference rather than saying only that the maths fails

### Requirement: The app never corrects a number silently

The app SHALL leave every extracted value as the model read it and SHALL NOT rewrite a number to close a mismatch, neither at extraction time nor at export time.

#### Scenario: A mismatch flows through to export

- **WHEN** a visitor exports a receipt that still carries an arithmetic warning
- **THEN** the exported values match what the form shows, with no amount adjusted to balance

### Requirement: Arithmetic runs on decimal strings

The app SHALL compare and add monetary values as decimals, never as floating-point numbers, so a check never fails or passes because of binary rounding.

#### Scenario: Amounts that round badly as floats

- **WHEN** the line items read "0.10", "0.20" and "0.30" and `subtotal` reads "0.60"
- **THEN** the check passes exactly

**Open point:** neither source document states a tolerance for these comparisons. The scenarios above assume exact decimal equality. Confirm that against the 40 labelled fixtures, since a real receipt can round its own tax line, and record the decision here.

### Requirement: Every edit rechecks the arithmetic

The app SHALL rerun both checks after each inline edit a visitor makes, and SHALL update or clear the warnings from that run.

#### Scenario: A visitor fixes a misread subtotal

- **WHEN** the visitor corrects `subtotal` so the line items now sum to it
- **THEN** the app clears the warning from `subtotal` and from the line item total without a page reload

#### Scenario: A visitor introduces a mismatch

- **WHEN** the visitor edits `total` to a value the parts no longer reach
- **THEN** the app raises the warning on `total` and on `subtotal`, naming the new difference

### Requirement: A missing value is not a mismatch

When a field a check needs is null, the app SHALL skip that check rather than treating the absence as a difference.

#### Scenario: A receipt with no tip

- **WHEN** `tip` is null and `subtotal` plus taxes equals `total`
- **THEN** the app reports no warning

#### Scenario: A receipt with no line items read

- **WHEN** the model returns an empty `lineItems` array
- **THEN** the app skips the line-item check instead of warning that the items sum to zero

**Open point:** the source documents do not say whether an empty `lineItems` array on a receipt that visibly has items should itself be flagged. The scenario above only skips the sum check.
