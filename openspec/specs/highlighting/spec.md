# Highlighting Specification

## Purpose

Shows a visitor which part of the uploaded document a field was read from, by matching the model's `sourceText` against word boxes the app measures from the document itself rather than against coordinates the model invented.

## Requirements

### Requirement: Coordinates are matched, never generated

The app SHALL derive every highlight region from word boxes measured on the document. The app SHALL NOT ask the model for coordinates and SHALL NOT accept coordinates from the model response, because model-supplied numbers look precise without being accurate.

#### Scenario: The model response is inspected for geometry

- **WHEN** the app builds a highlight for a field
- **THEN** the region comes from matched word boxes and from no value in the model response

### Requirement: Image word boxes come from tesseract.js in a web worker

For an uploaded `image/jpeg`, `image/png` or `image/webp` file, the app SHALL produce word boxes by running tesseract.js in a web worker in the visitor's browser. The OCR pass SHALL NOT run on the server, and the file SHALL NOT be stored in order to be measured.

#### Scenario: A photographed receipt

- **WHEN** a visitor uploads a JPEG receipt
- **THEN** the browser runs the OCR pass in a web worker and produces word boxes for the image
- **AND** the main thread stays responsive while the pass runs

### Requirement: PDF word boxes come from the pdf.js text layer

For an uploaded `application/pdf` file, the app SHALL read word boxes from the first page's pdf.js text layer.

#### Scenario: A PDF invoice with a text layer

- **WHEN** a visitor uploads a PDF whose first page carries a text layer
- **THEN** the app takes word boxes from that text layer without an OCR pass

#### Scenario: A PDF with no extractable text layer

- **WHEN** the first page of an uploaded PDF yields no extractable text
- **THEN** the app produces no word boxes for that document and therefore shows no highlights, while extraction and arithmetic still run

**Open point:** neither source document says whether a scanned PDF should instead be rasterized and sent through tesseract.js, even though one of the three shipped samples is a scanned PDF invoice. The scenario above states the behavior that follows from the stated rules; the choice itself is unresolved.

### Requirement: Fuzzy matching from source text to word boxes

For each extracted field, the app SHALL fuzzy-match that field's `sourceText` against the document's word boxes and SHALL use the best match above the matching threshold as the field's highlight region.

#### Scenario: Source text spanning several words

- **WHEN** a field's `sourceText` reads "TOTAL 42.00" and two adjacent word boxes carry those two tokens
- **THEN** the app highlights the region covering both boxes

#### Scenario: Source text with OCR noise

- **WHEN** the word boxes read "T0TAL" where the field's `sourceText` reads "TOTAL"
- **THEN** the fuzzy match still clears the threshold and the app highlights that box

### Requirement: No match means no highlight

When no candidate match clears the matching threshold, the app SHALL show no highlight for that field rather than the closest region. An absent highlight SHALL NOT block the visitor from reading, editing or exporting the field.

#### Scenario: A value the OCR pass never read

- **WHEN** a field's `sourceText` matches no word box above the threshold
- **THEN** clicking that field shows no highlight on the image pane
- **AND** the field stays editable and exportable

**Open point:** neither source document names a numeric matching threshold or the string-similarity measure it applies to, so both are unresolved. Pick them against the 40 labelled fixtures rather than by guess, and record the chosen values here once set.

### Requirement: Clicking a field highlights its region

The app SHALL highlight the matched region on the document pane when the visitor selects the corresponding field, so the visitor can check a value against the printed receipt without leaving the form.

#### Scenario: A visitor checks the total

- **WHEN** the visitor clicks the `total` field and that field has a match above the threshold
- **THEN** the document pane marks the matched region

#### Scenario: A visitor reaches the field by keyboard

- **WHEN** the visitor moves focus to a field with the keyboard
- **THEN** the same highlight appears, with a visible focus ring on the field
