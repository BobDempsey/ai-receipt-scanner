# Spec Delta

## MODIFIED Requirements

### Requirement: A file is at most 8 MB

The app SHALL reject any upload larger than 8 MB. Because the hosting platform caps a request body below that, the browser SHALL downscale an image that would exceed the body cap, keeping its long edge as large as still fits, and SHALL refuse only a file that cannot be made to fit at all. The downscale SHALL NOT change what the app tells the visitor the file cap is.

#### Scenario: A 12 MB photo

- **WHEN** a visitor picks a 12 MB file
- **THEN** the browser rejects it before uploading and names the 8 MB cap

#### Scenario: An oversized file reaching the route directly

- **WHEN** a 12 MB upload arrives at the server route
- **THEN** the route rejects it without calling the model

#### Scenario: A 6 MB phone photograph

- **WHEN** a visitor picks a 6 MB JPEG, which is inside the file cap and outside the body cap
- **THEN** the browser downscales it until the body fits, says it did so, and the extraction runs on the smaller image

#### Scenario: A file that cannot be made to fit

- **WHEN** downscaling an accepted file still leaves a body the platform will not carry
- **THEN** the app refuses it, says the image is too large to send even reduced, and makes no request

### Requirement: Five files per batch

The app SHALL accept at most 5 files in one request, enforced by the server route, which is where a request carrying several files can arrive. The picker accepts one file at a time, so the browser has no batch to check; the app SHALL NOT claim a browser-side batch check it does not make.

#### Scenario: A visitor drops eight files

- **WHEN** eight accepted files are submitted in one request
- **THEN** the request is rejected naming the 5-file cap, rather than the first five being processed silently
- **AND** such a request can only arrive at the route, because the app's picker submits one file

#### Scenario: An oversized batch reaching the route

- **WHEN** a request carries more than 5 files
- **THEN** the server route rejects it without calling the model

#### Scenario: A visitor using the app's own picker

- **WHEN** a visitor picks a file through the app
- **THEN** one file is submitted, so the batch cap is never the reason an upload is refused

### Requirement: Twenty extractions per IP per hour at the edge

The app SHALL limit each IP address to 20 extractions an hour, enforced before the request reaches the model call. The hour SHALL be a fixed window, so a visitor's allowance refills at a stated clock time rather than drifting, and the rejection SHALL tell the visitor when they can try again. Rate-limit counters SHALL be the only server-side state the app keeps.

#### Scenario: The twenty-first extraction from one IP

- **WHEN** an IP address has run 20 extractions within the hour and sends another
- **THEN** the edge rejects the request, and no OpenAI call happens

#### Scenario: A batch counts per file

- **WHEN** a request carries several files
- **THEN** the limiter counts one unit per model call the request will make, because the cost being counted is the call
- **AND** the route makes one call per request today, so no request spends more than one, and a request carrying more than 5 files is refused rather than extracted file by file

#### Scenario: What a rate-limited visitor reads

- **WHEN** the limiter refuses a request
- **THEN** the app says the hourly limit is 20, that it is shared by everyone behind that address, and names the time the window resets

#### Scenario: The window resets

- **WHEN** the fixed hour ends
- **THEN** the full allowance is available again, rather than one extraction becoming free each time an old one ages out

#### Scenario: The counter store is unreachable

- **WHEN** the rate-limit store cannot be reached
- **THEN** the app refuses the extraction rather than letting it through uncounted, because an unenforced limit on a route that spends money is worse than a refused upload

### Requirement: Forty extractions per session in the app

The app SHALL limit each session to 40 extractions, counted against the same tab session the stored receipts are keyed to, so the cap and the session table agree on what a session is. The allowance SHALL reset when that session does, which is when the visitor closes the tab, and SHALL NOT reset on a reload.

#### Scenario: The forty-first extraction in a session

- **WHEN** a session has run 40 extractions and the visitor uploads again
- **THEN** the app refuses the upload and names the session cap

#### Scenario: A reload mid-session

- **WHEN** a visitor has run 12 extractions and reloads the page
- **THEN** the count is still 12, because the session is the tab's and the reload did not end it

#### Scenario: A new tab

- **WHEN** the visitor opens the app in a second tab
- **THEN** that tab starts at zero, and the per-IP limit is what still stands between the two tabs and the model

#### Scenario: The session cap costs no request

- **WHEN** the app refuses an upload on the session cap
- **THEN** nothing leaves the browser, because the app knows the count without asking the server

### Requirement: Every cap is checked in the browser and again on the server

The app SHALL check size, type and page count in the browser before uploading, and the server route SHALL check size, type and the batch count again on every request. The app SHALL NOT treat a passing browser check as proof a request is within the caps.

#### Scenario: A request that skips the browser

- **WHEN** a request reaches the route without going through the app's own form
- **THEN** the route applies every cap it owns and rejects the request if any fails

#### Scenario: A rejection a visitor can read

- **WHEN** the app or the route rejects an upload on any cap
- **THEN** the visitor sees which cap it failed and what the cap is, rather than a generic failure
