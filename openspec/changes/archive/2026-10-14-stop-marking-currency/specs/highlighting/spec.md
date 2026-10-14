# Spec Delta

## ADDED Requirements

### Requirement: The app declines to mark the currency field

The app SHALL NOT match or mark a region for `currency`, and SHALL tell the visitor that it does not mark this field. The value, its confidence and its `sourceText` SHALL stay readable, editable and exportable, unchanged in the panel and in both exports. The set of fields the app declines to mark SHALL be held in one place, so the region map and the sentence the panel prints cannot disagree about it.

#### Scenario: A visitor selects the currency field

- **WHEN** the visitor selects `currency` on a receipt whose image the pass measured
- **THEN** no mark appears on the document pane, no mark already standing is replaced, and the app says it does not mark this field
- **AND** the currency value, its confidence and its `sourceText` stay on screen and in the JSON export unchanged

#### Scenario: The model quotes an address as the currency source

- **WHEN** the model answers `$\nFairhaven Bay, OR 97000` as the `sourceText` for `currency` and those words sit on the image
- **THEN** the app marks nothing, rather than marking the address line those words match

#### Scenario: Another field still marks the same words

- **WHEN** the visitor selects `merchantAddress` after selecting `currency` on that receipt
- **THEN** the address line is marked as it was before, because the rule names the field rather than the text

## MODIFIED Requirements

### Requirement: No match means no highlight

When no candidate match clears the matching threshold, the app SHALL show no highlight for that field rather than the closest region, and SHALL tell the visitor that this field matched nothing on the image. An absent highlight SHALL NOT block the visitor from reading, editing or exporting the field. Each cause of an absent highlight SHALL be worded apart from the others, so an absent mark reads as an answer rather than as a pane that failed to draw.

#### Scenario: A value the OCR pass never read

- **WHEN** a field's `sourceText` matches no word box above the threshold
- **THEN** selecting that field shows no highlight on the image pane and the app says it could not find that text on the image
- **AND** the field stays editable and exportable

#### Scenario: A field the receipt never printed

- **WHEN** a field's `sourceText` is absent because the receipt printed no such value
- **THEN** the app matches nothing for that field and says the receipt printed no value to find, rather than reporting a failed match

#### Scenario: A field the app declines to mark

- **WHEN** the visitor selects a field the app does not mark, and that field carries a `sourceText` the pass could have matched
- **THEN** the app says it does not mark this field, rather than saying the text could not be found or that the receipt printed no value
