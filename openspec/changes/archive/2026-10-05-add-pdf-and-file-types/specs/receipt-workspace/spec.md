# Spec Delta

## MODIFIED Requirements

### Requirement: The visitor chooses one receipt at a time

The workspace SHALL let a visitor pick a single receipt file and SHALL submit that one file for extraction. The picker SHALL offer every accepted type, so a visitor reads which formats the app takes before they go looking for one it does not.

#### Scenario: A visitor picks a JPEG

- **WHEN** the visitor picks a JPEG from their own machine
- **THEN** the workspace accepts that file and offers to extract it

#### Scenario: A visitor picks a second file

- **WHEN** the visitor picks another file while one is already chosen
- **THEN** the workspace replaces the chosen file with the new one rather than queuing both

#### Scenario: A visitor picks a PDF or a PNG

- **WHEN** the visitor picks a PDF, a PNG or a WebP
- **THEN** the workspace accepts it the way it accepts a JPEG

#### Scenario: A visitor opens the file dialog

- **WHEN** the visitor opens the picker
- **THEN** the dialog offers the four accepted types rather than every file on the machine

### Requirement: The workspace states which step it is on

The workspace SHALL show the visitor which of its states it is in: waiting for a file, extracting, showing a result, refusing the upload because it is not a receipt, or reporting a failure. The workspace SHALL also report the measuring of the image beside those states, because that pass runs on its own schedule, and SHALL NOT hold the fields back until it finishes. For a PDF it SHALL report the rasterizing of the first page as well, because that step runs before the extraction can start.

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

#### Scenario: A PDF is being rasterized

- **WHEN** the visitor submits a PDF
- **THEN** the workspace says it is reading the first page, and the extraction starts once that page is an image

#### Scenario: The rasterizing fails

- **WHEN** the first page of a PDF cannot be rasterized
- **THEN** the workspace says it could not read a page from that file, makes no extraction request, and offers the visitor the control to try again

## ADDED Requirements

### Requirement: The document pane shows the page the app read

For a PDF, the document pane SHALL show the rasterized first page rather than an embedded document viewer, so what the visitor checks a value against is the same bitmap the model read and the word boxes were measured on.

#### Scenario: A PDF invoice on screen

- **WHEN** the visitor submits a PDF and the first page is rasterized
- **THEN** the document pane shows that page as an image, and a marked region lands on the words the visitor can see

#### Scenario: Nothing to preview before the page is read

- **WHEN** the visitor has picked a PDF and not yet submitted it
- **THEN** the pane says it will show the first page once the extraction starts, rather than showing a blank frame

### Requirement: The workspace says when it read one page of several

For a PDF of more than one page, the workspace SHALL say it read the first page only, next to the document it is showing, so a visitor with a two-page invoice knows the second page was never read rather than assuming it was.

#### Scenario: A four-page PDF

- **WHEN** the visitor submits a four-page PDF
- **THEN** the workspace says it read the first page of four

#### Scenario: A one-page PDF

- **WHEN** the visitor submits a PDF of a single page
- **THEN** the workspace says nothing about pages, because it left nothing out

#### Scenario: An uploaded image

- **WHEN** the visitor submits a JPEG, a PNG or a WebP
- **THEN** the workspace says nothing about pages, because the notice belongs to PDFs alone
