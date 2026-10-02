# Spec Delta

## MODIFIED Requirements

### Requirement: Per-field confidence and source text

Every field in the response SHALL carry a sibling `confidence` between 0 and 1 and a sibling `sourceText` holding the characters the model read the value from. The app SHALL flag any field whose `confidence` is below 0.8 for review. A confidence describes the model's reading, so once the visitor has overwritten a value the app SHALL hold no confidence for that field and SHALL keep the `sourceText` the model read the original from.

#### Scenario: A faint line item price

- **WHEN** a field comes back with `confidence` 0.62
- **THEN** the app flags that field for review in the form

#### Scenario: A clearly printed total

- **WHEN** a field comes back with `confidence` 0.94
- **THEN** the app shows the field in its confident state and flags nothing

#### Scenario: A field the visitor overwrote

- **WHEN** the visitor commits a correction over a field the model read at `confidence` 0.62
- **THEN** the app holds no confidence for that field and flags it no longer, because the 0.62 described the value the correction replaced

#### Scenario: The source text outlives the value

- **WHEN** the visitor overwrites a field whose `sourceText` reads "T0TAL 42.00"
- **THEN** the app keeps that `sourceText`, because it records what the document shows rather than what the field now holds
