# Field Editing Specification

## Purpose

Lets a visitor correct what the model read, in place and one field at a time, with every correction checked against the same rules the app validated the model's answer with, so a typed value is as trustworthy as a read one.

## Requirements

### Requirement: Every extracted value is editable in place

The app SHALL let the visitor change each value the model read off the receipt: every flat field, each tax entry's label and amount, and each line item's description, quantity, unit price and amount. The app SHALL NOT offer an edit on a value it produced itself or on a value that describes the model's reading rather than the receipt.

#### Scenario: A misread merchant name

- **WHEN** the visitor changes `merchant` from what the model read to what the receipt prints
- **THEN** the app holds the visitor's value and shows it wherever it showed the model's

#### Scenario: A tax amount the model misread

- **WHEN** the visitor changes the amount on the second tax entry
- **THEN** the app holds the new amount against that entry and leaves the first entry alone

#### Scenario: A line item amount the model misread

- **WHEN** the visitor changes the fourth line item's `amount`
- **THEN** the app holds the new amount against that item and leaves the other items alone

#### Scenario: A value the app computed

- **WHEN** the visitor tries to change the line item total
- **THEN** the app offers no edit, because the app computed that figure from the item amounts rather than reading it off the receipt

#### Scenario: A value describing the model's reading

- **WHEN** the visitor looks at a field's confidence or its source text
- **THEN** the app offers no edit on either, because both record what the model did rather than what the receipt prints

### Requirement: An edit is kept on commit, never per keystroke

The app SHALL hold the visitor's typing as a draft while the field has focus and SHALL write it into the receipt once the visitor commits it, by leaving the field or by pressing Enter. The app SHALL NOT validate, write or recheck a value while the visitor is still typing it.

#### Scenario: A date part way through being typed

- **WHEN** the visitor has typed "2026-1" into `date` and has not committed
- **THEN** the app refuses nothing and flags nothing, because the value is a draft rather than an edit

#### Scenario: An amount part way through being typed

- **WHEN** the visitor has typed "42." into `total` and has not committed
- **THEN** the app leaves the receipt as it was and raises no warning off the draft

#### Scenario: A visitor presses Enter

- **WHEN** the visitor finishes typing "2026-10-02" into `date` and presses Enter
- **THEN** the app validates and writes that value

#### Scenario: A visitor leaves the field

- **WHEN** the visitor finishes typing and moves focus to another field
- **THEN** the app validates and writes the value they left behind, the same way Enter would have

### Requirement: A visitor can abandon an edit

The app SHALL return a field to the value it held before the edit when the visitor presses Escape, and SHALL leave the receipt, the warnings and the review flags as they were.

#### Scenario: A visitor changes their mind

- **WHEN** the visitor has typed over `total` and presses Escape
- **THEN** the field shows the value it held before the edit and the app records no edit against it

### Requirement: A committed edit is validated against the shared schema

The app SHALL validate every committed edit against the same Zod rules the server validated the model's answer with, taken from the shared schema rather than restated. A value that fails SHALL be refused, and the field SHALL keep the value the receipt held before the edit.

#### Scenario: A malformed date

- **WHEN** the visitor commits "02/10/2026" into `date`
- **THEN** the app refuses the edit, names what the field accepts, and leaves `date` as it was

#### Scenario: A money value that is not a decimal string

- **WHEN** the visitor commits "42,00" into `total`
- **THEN** the app refuses the edit and leaves `total` as it was

#### Scenario: A money value with too many decimal places

- **WHEN** the visitor commits "42.0000" into `total`
- **THEN** the app refuses the edit, because the shared schema admits one to three decimal places

#### Scenario: A currency code the schema does not admit

- **WHEN** the visitor commits "pounds" into `currency`
- **THEN** the app refuses the edit and leaves `currency` as it was

#### Scenario: A quantity on a weighed item

- **WHEN** the visitor commits "0.734" into a line item's `quantity`
- **THEN** the app accepts it, because a quantity carries the same decimal rules an amount does

#### Scenario: A refused edit changes nothing else

- **WHEN** the app refuses an edit
- **THEN** the receipt, every other field, the review flags and the warnings stay exactly as they were

### Requirement: Emptying a field records that the receipt did not print it

The app SHALL commit an emptied field as absent rather than as an empty string or a zero, because a field the receipt does not print is already absent in the extracted field set.

#### Scenario: A tip the receipt never printed

- **WHEN** the visitor clears `tip`, which the model read a figure into by mistake, and commits
- **THEN** the app holds `tip` as absent and the panel shows it as absent rather than as 0

#### Scenario: A cleared field leaves the checks something to skip

- **WHEN** the visitor clears `subtotal` and commits
- **THEN** the app skips both checks that need a subtotal rather than treating the absence as a difference

### Requirement: A money edit keeps the digits the visitor typed

The app SHALL hold a committed monetary value as the decimal string the visitor typed, with its digits and its decimal places unchanged, and SHALL NOT round it, pad it, strip a trailing zero or localize it.

#### Scenario: An amount with trailing zeros

- **WHEN** the visitor commits "42.00" into `total`
- **THEN** the app holds the string "42.00", the panel shows 42.00, and the export carries "42.00"

#### Scenario: An amount written at a narrower scale

- **WHEN** the visitor commits "42.5" into `total`
- **THEN** the app holds "42.5" rather than padding it to "42.50"

### Requirement: An overwritten field carries no model confidence and keeps its source text

Once the visitor has overwritten a value, the app SHALL hold no model confidence for that field, because the confidence described a reading the value no longer carries. The app SHALL keep the field's `sourceText` as the model read it, because those characters record what the document shows.

#### Scenario: A low-confidence field the visitor corrects

- **WHEN** a field came back with a confidence of 0.62 and the visitor commits a correction
- **THEN** the app holds no confidence for that field and stops flagging it for review

#### Scenario: A high-confidence field the visitor overwrites

- **WHEN** a field came back with a confidence of 0.97 and the visitor commits a different value
- **THEN** the app holds no confidence for that field rather than keeping the 0.97 the model gave the value it replaced

#### Scenario: The source text survives the edit

- **WHEN** the visitor corrects a field whose `sourceText` reads "T0TAL 42.00"
- **THEN** the app keeps that `sourceText` unchanged, so a reader and a later highlight can still find where the original came from

### Requirement: The app records which fields the visitor edited

The app SHALL keep a record of every field the visitor has edited, held beside the receipt rather than inside it, so the panel and the export can tell a value the visitor typed from a value the model read.

#### Scenario: One field corrected out of twelve

- **WHEN** the visitor corrects `total` and commits
- **THEN** the app records `total` as edited and records nothing against the other fields

#### Scenario: A field edited back to what the model read

- **WHEN** the visitor types over a value, commits, then types the model's original value back and commits again
- **THEN** the app still records the field as edited, because the app holds no model confidence for it any more

#### Scenario: A refused edit records nothing

- **WHEN** the app refuses a committed edit
- **THEN** the app records no edit against that field

### Requirement: A visitor can add a line item

The app SHALL let the visitor add a line item, because a line the model missed is a common reason the item amounts do not reach the printed subtotal and the app corrects no number on the visitor's behalf. A new item SHALL start with every value absent and no model confidence, and SHALL be editable the way an extracted item is.

#### Scenario: A receipt that lost a line to a crease

- **WHEN** the items sum to 0.50 less than the printed subtotal and the visitor adds an item and types the missing line into it
- **THEN** the item total now reaches the subtotal and the warning on both rows clears

#### Scenario: A new item starts empty

- **WHEN** the visitor adds an item and types nothing into it
- **THEN** every value on that item reads as absent, the app holds no confidence for any of them, and nothing is invented into the description

#### Scenario: The sum check waits for the new amount

- **WHEN** the visitor has added an item whose `amount` is still absent
- **THEN** the app skips the line item sum check and says why, rather than summing the items it can read and naming a difference the receipt has not got

#### Scenario: A receipt the model itemized nothing from

- **WHEN** `lineItems` came back empty and the visitor adds an item
- **THEN** the app holds a one-item list and shows the item total it computed from that item

### Requirement: A visitor can remove a line item

The app SHALL let the visitor remove a line item, so an item the model read twice or invented leaves the receipt.

#### Scenario: An item the model read twice

- **WHEN** the model returned the same line twice and the visitor removes one copy
- **THEN** the remaining items sum to the printed subtotal and the warning clears

#### Scenario: The last item removed

- **WHEN** the visitor removes the only item on the receipt
- **THEN** the app holds an empty item list, says it holds no line items, shows no item total, and reports no warning about their absence

### Requirement: An edit lives as long as the receipt on screen

An edit SHALL last as long as the app holds the receipt it belongs to, and SHALL NOT survive a page reload, because the receipt itself does not. The app SHALL tell the visitor that the download is how a corrected receipt leaves the app.

#### Scenario: A visitor reloads after correcting a field

- **WHEN** the visitor corrects three fields and reloads the page
- **THEN** the workspace comes back empty, with no receipt and no edits, because the app stored neither

#### Scenario: A visitor extracts a second receipt

- **WHEN** the visitor submits another file after correcting the first receipt
- **THEN** the app holds the new receipt with no edit recorded against it and no warning carried over from the previous one

#### Scenario: The visitor reads how to keep a correction

- **WHEN** the visitor has corrected a field
- **THEN** the app states beside the download that the correction lives in this browser tab and that the download is how they keep it
