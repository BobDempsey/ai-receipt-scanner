# Spec Delta

## MODIFIED Requirements

### Requirement: One model call per receipt

The server route SHALL send each receipt to `gpt-6.1-sol` in exactly one OpenAI call, using Structured Outputs on the Responses API with `text: { format: { type: "json_schema", strict: true, schema } }` and the field set as the schema. The route SHALL NOT parse JSON out of prose and SHALL NOT retry around a malformed response, because strict mode forces the shape.

#### Scenario: A single accepted upload

- **WHEN** a visitor uploads one accepted file and the server route passes the limit checks
- **THEN** the route makes exactly one OpenAI call for that file
- **AND** the route reads the structured object straight from the response without a second prompt

#### Scenario: Several files in one batch

- **WHEN** a visitor submits a batch of accepted files
- **THEN** the route makes one OpenAI call per file in the batch and no extra calls

#### Scenario: A PDF upload

- **WHEN** a visitor uploads a PDF
- **THEN** the route makes exactly one call, on the rasterized first page, and no call on the PDF bytes

#### Scenario: The model id is pinned, not inferred

- **WHEN** the route builds a request
- **THEN** it names `gpt-6.1-sol` from the app's own configuration rather than asking the provider for a latest alias

#### Scenario: The model id changes

- **WHEN** anyone swaps the pinned id for another model
- **THEN** the replacement accepts image input and supports strict Structured Outputs, and the accuracy figures get rerun against the labelled fixtures in the same change

## ADDED Requirements

### Requirement: The model reads an image, and a PDF becomes one in the browser

The route SHALL send the model an image and SHALL carry the bytes inline with the media type the upload itself declares. A PDF SHALL reach the route already rasterized to an image by the browser, so no PDF parser runs on the server and the route accepts no PDF of its own.

#### Scenario: A PNG upload

- **WHEN** a visitor uploads a PNG
- **THEN** the route sends the model those bytes inline as a PNG rather than converting them

#### Scenario: A PDF posted straight to the route

- **WHEN** a request carries `application/pdf` to the route without passing through the page
- **THEN** the route refuses it as an unsupported type and makes no model call

#### Scenario: What the server parses

- **WHEN** any accepted upload arrives
- **THEN** the server reads its bytes and its declared type and parses no document format of its own

### Requirement: Every accepted type reaches the same field set

The app SHALL return the same validated field set, with the same confidences and source strings, whatever accepted type the receipt arrived as. The type SHALL NOT appear in the response, and SHALL NOT change the arithmetic, the editing or the export.

#### Scenario: The same receipt as a JPEG and as a PDF

- **WHEN** the same receipt is uploaded once as a photograph and once as a PDF of the same page
- **THEN** both answers carry the same field names and the same shape, and nothing in either names the format it came from

#### Scenario: The download is unchanged

- **WHEN** a visitor downloads the JSON for a receipt that arrived as a PDF
- **THEN** the file carries `receipt`, `warnings` and `edited` and nothing about the upload's type
