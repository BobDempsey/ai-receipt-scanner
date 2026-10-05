# Spec Delta

## MODIFIED Requirements

### Requirement: The storage policy sits beside the file picker

The workspace SHALL state next to the file picker that the app keeps nothing: the upload lives in memory for the length of the request and the result lives in the visitor's browser. The policy SHALL be readable before the visitor picks a file. Where the workspace says how long a result lasts, it SHALL say what is actually true: the session's receipts live in this browser and end when the visitor closes the tab, and nothing about them reaches the server.

#### Scenario: A first-time visitor

- **WHEN** a visitor loads the workspace and has picked nothing
- **THEN** the storage policy is already on screen next to the picker

#### Scenario: What the workspace says a reload does

- **WHEN** the visitor reads what the app says about keeping a receipt
- **THEN** it says the session's receipts survive a reload in this browser and end with the tab, rather than saying a reload loses them

#### Scenario: The policy stays true about the server

- **WHEN** the visitor reads the policy with a session table holding three receipts
- **THEN** it still says the app keeps nothing on the server, because the table is in the browser

## ADDED Requirements

### Requirement: The session's receipts are listed below the panes

The workspace SHALL list the session's receipts below the two panes once the table holds one, showing enough of each to tell them apart, and SHALL say how many it holds. With an empty table the workspace SHALL show no list rather than an empty one.

#### Scenario: A visitor scans a third receipt

- **WHEN** the extraction for a third receipt returns
- **THEN** the list below the panes shows three rows, newest first, each naming its merchant, date and total

#### Scenario: A receipt carrying a warning

- **WHEN** one of the listed receipts carries an arithmetic warning
- **THEN** its row says so, so a visitor knows which receipts still want checking without opening each one

#### Scenario: Nothing scanned yet

- **WHEN** the visitor has scanned nothing in this session
- **THEN** the workspace shows no list and no empty table, because a table of no rows tells a visitor nothing

### Requirement: Selecting a listed receipt reopens it

The workspace SHALL reopen a listed receipt in the two panes when the visitor selects its row, carrying its fields, its warnings and its edited markers, and SHALL make it the receipt every control on screen acts on. A row SHALL be reachable by keyboard with a visible focus ring.

#### Scenario: A visitor goes back to an earlier receipt

- **WHEN** the visitor selects the first row after scanning three receipts
- **THEN** the field panel carries that receipt's values, its warnings and its edited markers, and the download controls act on it

#### Scenario: Correcting a reopened receipt

- **WHEN** the visitor corrects a field on a reopened receipt
- **THEN** the edit follows the rules it already follows, the arithmetic rechecks, and the row in the list follows the change

#### Scenario: The document pane for a reopened receipt

- **WHEN** the visitor reopens a receipt from an earlier upload
- **THEN** the document pane says the image is not kept, because the app stores no upload, and the field panel is still complete and still exportable

#### Scenario: Reaching a row by keyboard

- **WHEN** the visitor moves focus into the list with the keyboard
- **THEN** each row takes focus with a visible ring and selecting it reopens that receipt

### Requirement: The batch controls say what they will export

The workspace SHALL offer the batch export beside the list, naming how many receipts it will carry, so a visitor knows before they press it whether it covers the one on screen or all of them.

#### Scenario: Three receipts in the session

- **WHEN** the table holds three receipts
- **THEN** the batch controls say they export all three, and the single-receipt controls stay with the receipt on screen

#### Scenario: One receipt in the session

- **WHEN** the table holds one receipt
- **THEN** the batch controls say they export that one, rather than reading as a different operation from the single-receipt download
