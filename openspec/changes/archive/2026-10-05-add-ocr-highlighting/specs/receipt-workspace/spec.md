# Spec Delta

## MODIFIED Requirements

### Requirement: The workspace states which step it is on

The workspace SHALL show the visitor which of its states it is in: waiting for a file, extracting, showing a result, refusing the upload because it is not a receipt, or reporting a failure. The workspace SHALL also report the measuring of the image beside those states, because that pass runs on its own schedule, and SHALL NOT hold the fields back until it finishes.

#### Scenario: An extraction in flight

- **WHEN** the visitor submits a file and the route has not answered
- **THEN** the workspace shows that it is working and does not show an empty field panel the visitor could mistake for a result

#### Scenario: A result arrives

- **WHEN** the route returns a validated field set
- **THEN** the working state clears and the field panel carries the values

#### Scenario: The image is still being measured

- **WHEN** the fields have arrived and the measuring pass has not finished
- **THEN** the workspace says it is still measuring the image and the panel stays usable

#### Scenario: The measuring finishes after the fields

- **WHEN** the measuring pass finishes while the visitor is already reading the fields
- **THEN** the measuring message goes and selecting a field marks its region, with nothing else on screen rearranged

## ADDED Requirements

### Requirement: The document pane marks the region of the selected field

The document pane SHALL mark the matched region of the selected field over the image it already shows, and SHALL keep the image legible under the mark rather than covering it.

#### Scenario: A visitor checks the total

- **WHEN** the visitor selects the `total` field and that field matched a region
- **THEN** the document pane marks that region over the image and the printed characters stay readable through the mark

#### Scenario: A region outside the visible part of a tall receipt

- **WHEN** the selected field's region sits below the visible part of a scrolled document pane
- **THEN** the pane brings that region into view

### Requirement: Selecting a field is what asks for its region

The field panel SHALL treat a visitor reaching a field as selecting it, whether they click its control or move focus to it with the keyboard, and SHALL carry that selection to the document pane. Selecting a field SHALL NOT change its value, its confidence or its edited marker.

#### Scenario: A visitor clicks a field

- **WHEN** the visitor clicks the `subtotal` control
- **THEN** that field becomes the selected one and its region is marked

#### Scenario: A visitor tabs through the panel

- **WHEN** the visitor moves focus from one control to the next with the keyboard
- **THEN** each field becomes the selected one as it takes focus, with its visible focus ring, and the mark follows

#### Scenario: A visitor selects a field and types

- **WHEN** the visitor selects a field, types a correction and commits it
- **THEN** the edit follows the rules it already follows and the selection is what it was

#### Scenario: A computed row carries no region

- **WHEN** the visitor reaches the line item total, which the app computed rather than read
- **THEN** the pane marks nothing, because no `sourceText` sits behind a computed figure

### Requirement: The panel says when a field matched nothing

The field panel SHALL say against the selected field when the app found no region for it, distinguishing a value the app could not find on the image from a value the receipt never printed, so an absent mark reads as an answer rather than as a pane that failed to draw.

#### Scenario: A field whose text the measuring pass never read

- **WHEN** the visitor selects a field whose `sourceText` matched no region above the threshold
- **THEN** the panel says the app could not find that text on the image, and the field stays editable and exportable

#### Scenario: A field the receipt did not print

- **WHEN** the visitor selects a field the receipt printed no value for
- **THEN** the panel says there is nothing on the image to mark, rather than reporting a failed match
