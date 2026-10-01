# Spec Delta

## Purpose

Holds the two-pane working surface a visitor uses to put a receipt into the app and read what came back: the file picker, the document pane on the left, the field panel on the right, and the states between choosing a file and reading its values.

## ADDED Requirements

### Requirement: The visitor chooses one receipt at a time

The workspace SHALL let a visitor pick a single receipt file and SHALL submit that one file for extraction.

#### Scenario: A visitor picks a JPEG

- **WHEN** the visitor picks a JPEG from their own machine
- **THEN** the workspace accepts that file and offers to extract it

#### Scenario: A visitor picks a second file

- **WHEN** the visitor picks another file while one is already chosen
- **THEN** the workspace replaces the chosen file with the new one rather than queuing both

### Requirement: The chosen file stays in the browser until the visitor submits it

The workspace SHALL hold the chosen file in browser memory and SHALL send its bytes nowhere until the visitor asks for an extraction.

#### Scenario: A visitor picks a file and stops

- **WHEN** the visitor picks a file and does not submit it
- **THEN** no request carrying those bytes leaves the browser

#### Scenario: A visitor reloads before submitting

- **WHEN** the visitor reloads the page with a file chosen and not yet submitted
- **THEN** the workspace comes back empty, because it kept no copy of the file

### Requirement: The document sits on the left and the fields on the right

The workspace SHALL show the chosen document in a pane on the left at the full height of the workspace, and the extracted fields in a panel on the right, so a visitor checks a value against the printed receipt without scrolling between the two.

#### Scenario: A wide screen

- **WHEN** the viewport is wide enough for two panes
- **THEN** the document pane fills the left side at full height and the field panel sits to its right

#### Scenario: The document appears before the fields do

- **WHEN** the visitor submits a file and the extraction has not returned
- **THEN** the document pane already shows the image

### Requirement: The panes stack on a narrow screen

On a viewport too narrow for two panes, the workspace SHALL stack the document pane above the field panel rather than scrolling the page sideways.

#### Scenario: A phone

- **WHEN** a visitor opens the workspace on a phone-width viewport
- **THEN** the document pane sits above the field panel and the page scrolls only downward

### Requirement: The field panel renders extracted values read-only

The field panel SHALL show each extracted field's label, its value and its confidence, and SHALL present every value as text the visitor reads rather than a control they type into. Inline editing arrives in a later change.

#### Scenario: A receipt extracted successfully

- **WHEN** the extraction returns a validated field set
- **THEN** the panel lists each field with its value and its confidence

#### Scenario: A field the receipt does not print

- **WHEN** `tip` comes back null
- **THEN** the panel shows `tip` as absent rather than as 0 or as an empty value the visitor might read as zero

### Requirement: Money is rendered exactly as the app holds it

The field panel SHALL print each monetary value as the decimal string the app holds, with its digits and both decimal places unchanged, and SHALL NOT reformat, round or localize it for display.

#### Scenario: An amount with trailing zeros

- **WHEN** `total` holds the string "42.00"
- **THEN** the panel shows 42.00 rather than 42

### Requirement: The workspace states which step it is on

The workspace SHALL show the visitor which of its states it is in: waiting for a file, extracting, showing a result, refusing the upload because it is not a receipt, or reporting a failure.

#### Scenario: An extraction in flight

- **WHEN** the visitor submits a file and the route has not answered
- **THEN** the workspace shows that it is working and does not show an empty field panel the visitor could mistake for a result

#### Scenario: A result arrives

- **WHEN** the route returns a validated field set
- **THEN** the working state clears and the field panel carries the values

### Requirement: A failed extraction is reported in place, and resubmitting is the visitor's choice

When the route returns an error, the workspace SHALL show what failed where the field panel would have been, SHALL keep the document pane as it is, and SHALL offer the visitor a control to submit the same file again. The workspace SHALL NOT resubmit on its own.

#### Scenario: The server could not validate the model's answer

- **WHEN** the route reports that the model's answer failed validation
- **THEN** the workspace says the model's answer did not match the shape the app expects, suggests trying the same file again or a clearer photo, and shows no field values
- **AND** the document pane still shows the image the visitor chose

#### Scenario: A visitor chooses to try again

- **WHEN** the visitor uses the try-again control after a failure
- **THEN** the workspace submits the same file once more as a new extraction

#### Scenario: Nothing retries by itself

- **WHEN** an extraction fails for any reason
- **THEN** the workspace waits for the visitor and sends no second request of its own

### Requirement: The storage policy sits beside the file picker

The workspace SHALL state next to the file picker that the app keeps nothing: the upload lives in memory for the length of the request and the result lives in the visitor's browser. The policy SHALL be readable before the visitor picks a file.

#### Scenario: A first-time visitor

- **WHEN** a visitor loads the workspace and has picked nothing
- **THEN** the storage policy is already on screen next to the picker
