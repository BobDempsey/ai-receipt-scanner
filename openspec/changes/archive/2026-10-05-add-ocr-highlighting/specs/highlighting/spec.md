# Spec Delta

## MODIFIED Requirements

### Requirement: Image word boxes come from tesseract.js in a web worker

For an uploaded `image/jpeg`, `image/png` or `image/webp` file, the app SHALL produce word boxes by running tesseract.js in a web worker in the visitor's browser. The OCR pass SHALL NOT run on the server, and the file SHALL NOT be stored in order to be measured. The pass SHALL start when the visitor submits the file and SHALL run beside the model call rather than before it, and the extracted fields SHALL stay readable, editable and exportable whether or not the pass has finished.

#### Scenario: A photographed receipt

- **WHEN** a visitor uploads a JPEG receipt
- **THEN** the browser runs the OCR pass in a web worker and produces word boxes for the image
- **AND** the main thread stays responsive while the pass runs

#### Scenario: The fields arrive before the boxes do

- **WHEN** the model call returns while the OCR pass is still running
- **THEN** the field panel shows every value and accepts corrections, and the app says the regions are still being measured

#### Scenario: The OCR pass fails

- **WHEN** the OCR pass throws or produces no words at all
- **THEN** the app shows no regions, says it could not measure the image, and leaves extraction, arithmetic, editing and export working

### Requirement: Fuzzy matching from source text to word boxes

For each extracted field, the app SHALL fuzzy-match that field's `sourceText` against the document's word boxes and SHALL use the best match above the matching threshold as the field's highlight region. The candidates SHALL be the runs of adjacent word boxes on one text line, and the app SHALL score each candidate as a normalized edit-distance ratio against the `sourceText`, taking the highest-scoring candidate and, where two score alike, the earlier one on the page.

#### Scenario: Source text spanning several words

- **WHEN** a field's `sourceText` reads "TOTAL 42.00" and two adjacent word boxes carry those two tokens
- **THEN** the app highlights the region covering both boxes

#### Scenario: Source text with OCR noise

- **WHEN** the word boxes read "T0TAL" where the field's `sourceText` reads "TOTAL"
- **THEN** the fuzzy match still clears the threshold and the app highlights that box

#### Scenario: The same text printed twice

- **WHEN** a receipt prints "42.00" on both the subtotal line and the total line and both candidates score alike for one field
- **THEN** the app marks the earlier region rather than both

#### Scenario: A candidate spanning two lines

- **WHEN** the words nearest a field's `sourceText` sit on two different text lines
- **THEN** no candidate spans both lines, so the app scores each line's run on its own

### Requirement: No match means no highlight

When no candidate match clears the matching threshold, the app SHALL show no highlight for that field rather than the closest region, and SHALL tell the visitor that this field matched nothing on the image. An absent highlight SHALL NOT block the visitor from reading, editing or exporting the field.

#### Scenario: A value the OCR pass never read

- **WHEN** a field's `sourceText` matches no word box above the threshold
- **THEN** selecting that field shows no highlight on the image pane and the app says it could not find that text on the image
- **AND** the field stays editable and exportable

#### Scenario: A field the receipt never printed

- **WHEN** a field's `sourceText` is absent because the receipt printed no such value
- **THEN** the app matches nothing for that field and says the receipt printed no value to find, rather than reporting a failed match

## ADDED Requirements

### Requirement: The similarity measure compares normalized text

The app SHALL compare a `sourceText` against a candidate run on text normalized the same way on both sides: case folded, with whitespace and punctuation other than the decimal point removed. The comparison SHALL NOT depend on how the receipt spaced or punctuated the value.

#### Scenario: Spacing the OCR pass read differently

- **WHEN** a field's `sourceText` reads "TOTAL 42.00" and the word boxes read "TOTAL:" and "42.00"
- **THEN** the normalized forms match and the candidate clears the threshold

#### Scenario: A decimal point is not punctuation to strip

- **WHEN** a field's `sourceText` reads "42.00" and a candidate reads "4200"
- **THEN** the two do not normalize to the same text, so the candidate scores lower than an exact "42.00" elsewhere on the page

### Requirement: The matching threshold is a provisional value this slice names

The app SHALL treat a candidate as a match only at a similarity of 0.72 or above. This value SHALL be held in one place so a later slice can change it in one line, and SHALL be confirmed or replaced against the 40 labelled fixtures, which are the only evidence that can settle it.

#### Scenario: A single misread character in a short token

- **WHEN** a four-character `sourceText` matches a candidate with one character wrong, scoring 0.75
- **THEN** the candidate clears the threshold and the app marks that region

#### Scenario: A candidate that is merely nearby

- **WHEN** the best candidate for a field scores 0.5
- **THEN** the app marks nothing, because a region that is close is a wrong answer rather than a partial one

### Requirement: A region is expressed in the image's own pixels

The app SHALL hold each matched region in the pixel coordinates of the image the OCR pass measured, and SHALL scale it to the rendered size when it marks the document pane, so the mark stays on the same words as the pane changes width.

#### Scenario: The visitor narrows the window

- **WHEN** the document pane renders the image smaller than its own pixel size
- **THEN** the marked region covers the same printed words it covered before

#### Scenario: A rotated or resized image is never remeasured

- **WHEN** the pane re-renders the same image at a new size
- **THEN** the app rescales the regions it already holds and runs no second OCR pass

### Requirement: One field's region is marked at a time

The app SHALL mark the region of the field the visitor has selected and SHALL mark no other, so nothing on the image claims two fields were read from the same words.

#### Scenario: The visitor moves to a second field

- **WHEN** the visitor selects `subtotal` while `total` is marked
- **THEN** the mark leaves `total`'s region and appears on `subtotal`'s

#### Scenario: Nothing selected yet

- **WHEN** the fields have arrived and the visitor has selected none of them
- **THEN** the image pane carries no mark

### Requirement: The highlight reaches nothing but the display

The app SHALL keep every matched region out of the receipt object, the arithmetic checks and the export. A region SHALL NOT change a value, a confidence, a warning or the downloaded file.

#### Scenario: A download taken with a field selected

- **WHEN** the visitor downloads the JSON while a region is marked
- **THEN** the file carries the receipt, the warnings and the edited list exactly as it would with nothing selected

#### Scenario: A corrected field keeps its region

- **WHEN** the visitor corrects a value whose `sourceText` matched a region
- **THEN** the region stays on the words the model read the original from, because the `sourceText` is unchanged, and no arithmetic warning moves
