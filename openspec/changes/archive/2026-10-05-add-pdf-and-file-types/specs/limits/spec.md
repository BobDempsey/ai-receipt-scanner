# Spec Delta

## MODIFIED Requirements

### Requirement: Four accepted file types

The app SHALL accept `image/jpeg`, `image/png`, `image/webp` and `application/pdf`, and SHALL reject every other type. The four are what the page accepts from the visitor; the server route accepts the three image types, because the page rasterizes a PDF before it posts. Both checks SHALL name the four types the visitor can pick, so a refusal never reads as the app rejecting a type the page offered.

#### Scenario: A HEIC photo

- **WHEN** a visitor picks a HEIC file
- **THEN** the app rejects it and names the types it accepts

#### Scenario: A file whose extension disagrees with its bytes

- **WHEN** an upload named `receipt.jpg` is not one of the four accepted types
- **THEN** the server route rejects it on the type it actually is

#### Scenario: A PDF at the picker and at the route

- **WHEN** a visitor picks a PDF
- **THEN** the page accepts it, rasterizes its first page, and posts an image the route accepts

### Requirement: Only the first page of a PDF is read

For an `application/pdf` upload, the app SHALL read the first page only, for extraction and for word boxes alike, and SHALL tell the visitor it did so.

#### Scenario: A four-page PDF

- **WHEN** a visitor uploads a four-page PDF
- **THEN** the app extracts from page one and ignores pages two to four
- **AND** the app tells the visitor it read the first page only

#### Scenario: A single-page PDF

- **WHEN** a visitor uploads a PDF of one page
- **THEN** the app says nothing about pages, because there is nothing it left out

#### Scenario: A PDF with no pages at all

- **WHEN** an uploaded PDF carries no page the app can read
- **THEN** the app refuses it, says it could not read a page from that file, and makes no model call

## ADDED Requirements

### Requirement: A refused type is named by one stable code

The app SHALL answer a refused file type with the code `unsupported_type`, and SHALL use that one code wherever a type is refused, at the picker and at the route alike.

#### Scenario: A refused type at the route

- **WHEN** the route refuses an upload on its type
- **THEN** the response carries the code `unsupported_type` and a message naming the types the app accepts

#### Scenario: No code names a single format

- **WHEN** the app grows or drops an accepted type
- **THEN** the refusal code is unchanged, because it names the category rather than one format
