# Spec Delta

## ADDED Requirements

### Requirement: Three sample receipts sit under the picker

The workspace SHALL offer three fictional sample receipts under the file picker, each loading into the app with one press, so a visitor with no receipt to hand sees the app work. The samples SHALL be labelled fictional where the visitor reads them. One of the three SHALL carry a line-item sum that disagrees with its printed subtotal, so the arithmetic warning is reachable without hunting for a bad receipt.

#### Scenario: A cold load

- **WHEN** a visitor opens the app having scanned nothing
- **THEN** the three samples are on screen under the picker, each named, and the page says they are fictional

#### Scenario: A visitor presses a sample

- **WHEN** the visitor presses one of the three
- **THEN** that receipt loads and extracts the way one they picked themselves would, and it joins the session list like any other

#### Scenario: The sample that does not balance

- **WHEN** the visitor extracts the sample whose items do not reach its printed subtotal
- **THEN** the arithmetic warning appears on both rows it names, without the visitor having to find a flawed receipt of their own

#### Scenario: The samples cover the formats

- **WHEN** a visitor reads the three
- **THEN** one is a thermal grocery receipt with many line items, one a restaurant receipt with a tip and two tax lines, and one a scanned PDF invoice, so the three between them exercise the line items, the taxes and the PDF path

### Requirement: A cap refusal is its own state, not a failure

The workspace SHALL report a refusal on the hourly limit and a refusal on the session cap as states of their own, each naming the cap, what it is and what the visitor can do next, rather than as the generic failure a model error produces. Neither SHALL offer a try-again control that would only be refused again.

#### Scenario: The hourly limit

- **WHEN** the route refuses on the per-IP limit
- **THEN** the workspace says the limit is 20 an hour, that it is shared by everyone behind that address, names the time it resets, and offers no immediate retry

#### Scenario: The session cap

- **WHEN** the session has spent its 40 extractions
- **THEN** the workspace says so before it sends anything, and says a new tab starts a new session

#### Scenario: The receipts already scanned stay usable

- **WHEN** either cap refuses a new upload
- **THEN** every receipt already in the session list stays readable, correctable and exportable

### Requirement: The workspace says when it reduced an image

The workspace SHALL tell the visitor when it downscaled an image to fit the request, naming that it did so, so a visitor comparing the extraction against their original knows the model read a smaller copy.

#### Scenario: A large photograph

- **WHEN** the browser downscales a 6 MB photograph before sending it
- **THEN** the workspace says it reduced the image to send it, and the document pane shows the image the model read

#### Scenario: A file that needed no reduction

- **WHEN** the chosen file already fits
- **THEN** the workspace says nothing about reducing it, because nothing was reduced
