# Receipt Workspace Specification

## Purpose

Holds the two-pane working surface a visitor uses to put a receipt into the app and read what came back: the file picker, the document pane on the left, the field panel on the right, and the states between choosing a file and reading its values.

## Requirements

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
