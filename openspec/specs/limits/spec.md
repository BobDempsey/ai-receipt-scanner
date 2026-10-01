# Limits Specification

## Purpose

Caps what a visitor can send the app and how often, covering file size, file type, PDF pages, batch size and extraction rate, and enforces each cap in the browser for speed and again on the server because the browser check is a convenience rather than a control.

## Requirements

### Requirement: A file is at most 8 MB

The app SHALL reject any upload larger than 8 MB.

#### Scenario: A 12 MB photo

- **WHEN** a visitor picks a 12 MB file
- **THEN** the browser rejects it before uploading and names the 8 MB cap

#### Scenario: An oversized file reaching the route directly

- **WHEN** a 12 MB upload arrives at the server route
- **THEN** the route rejects it without calling the model

### Requirement: Four accepted file types

The app SHALL accept `image/jpeg`, `image/png`, `image/webp` and `application/pdf`, and SHALL reject every other type.

#### Scenario: A HEIC photo

- **WHEN** a visitor picks a HEIC file
- **THEN** the app rejects it and names the types it accepts

#### Scenario: A file whose extension disagrees with its bytes

- **WHEN** an upload named `receipt.jpg` is not one of the four accepted types
- **THEN** the server route rejects it on the type it actually is

### Requirement: Only the first page of a PDF is read

For an `application/pdf` upload, the app SHALL read the first page only, for extraction and for word boxes alike.

#### Scenario: A four-page PDF

- **WHEN** a visitor uploads a four-page PDF
- **THEN** the app extracts from page one and ignores pages two to four
- **AND** the app tells the visitor it read the first page only

### Requirement: Five files per batch

The app SHALL accept at most 5 files in one batch.

#### Scenario: A visitor drops eight files

- **WHEN** a visitor drops eight accepted files on the drop zone
- **THEN** the app rejects the batch, naming the 5-file cap, rather than silently processing the first five

#### Scenario: An oversized batch reaching the route

- **WHEN** a request carries more than 5 files
- **THEN** the server route rejects it without calling the model

### Requirement: Twenty extractions per IP per hour at the edge

The app SHALL limit each IP address to 20 extractions an hour, enforced at the edge before the request reaches the route that calls the model. Rate-limit counters SHALL be the only server-side state the app keeps.

#### Scenario: The twenty-first extraction from one IP

- **WHEN** an IP address has run 20 extractions within the hour and sends another
- **THEN** the edge rejects the request, and no OpenAI call happens

#### Scenario: A batch counts per file

- **WHEN** a visitor submits a batch of 5 files
- **THEN** the limiter counts 5 extractions against that IP, because each file costs one model call

**Open point:** neither source document says whether the hour is a fixed window or a rolling one, nor what the rejection tells the visitor about when they can try again. Settle both before wiring the limiter.

### Requirement: Forty extractions per session in the app

The app SHALL limit each session to 40 extractions, enforced in the app.

#### Scenario: The forty-first extraction in a session

- **WHEN** a session has run 40 extractions and the visitor uploads again
- **THEN** the app refuses the upload and names the session cap

**Open point:** the source documents give the number but not the identity behind it. Whether the session cap keys off the same tab session the IndexedDB table uses, and whether it ever resets, is unresolved. The per-IP limit at the edge is the control; this one is the in-app cap.

### Requirement: Every cap is checked in the browser and again on the server

The app SHALL check size, type, page count and batch size in the browser before uploading, and the server route SHALL check the same caps again on every request. The app SHALL NOT treat a passing browser check as proof a request is within the caps.

#### Scenario: A request that skips the browser

- **WHEN** a request reaches the route without going through the app's own form
- **THEN** the route applies every cap itself and rejects the request if any fails

#### Scenario: A rejection a visitor can read

- **WHEN** the app or the route rejects an upload on any cap
- **THEN** the visitor sees which cap it failed and what the cap is, rather than a generic failure
