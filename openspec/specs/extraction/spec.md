# Extraction Specification

## Purpose

Turns one uploaded receipt image or PDF into a typed field set a person can read, check and correct, with a confidence and a source string on every field, and with "this is not a receipt" available as an answer instead of a guess.

## Requirements

### Requirement: One model call per receipt

The server route SHALL send each receipt to `gpt-6.1-sol` in exactly one OpenAI call, using Structured Outputs on the Responses API with `text: { format: { type: "json_schema", strict: true, schema } }` and the field set as the schema. The route SHALL NOT parse JSON out of prose and SHALL NOT retry around a malformed response, because strict mode forces the shape.

#### Scenario: A single accepted upload

- **WHEN** a visitor uploads one accepted file and the server route passes the limit checks
- **THEN** the route makes exactly one OpenAI call for that file
- **AND** the route reads the structured object straight from the response without a second prompt

#### Scenario: Several files in one batch

- **WHEN** a visitor submits a batch of accepted files
- **THEN** the route makes one OpenAI call per file in the batch and no extra calls

#### Scenario: The model id is pinned, not inferred

- **WHEN** the route builds a request
- **THEN** it names `gpt-6.1-sol` from the app's own configuration rather than asking the provider for a latest alias

#### Scenario: The model id changes

- **WHEN** anyone swaps the pinned id for another model
- **THEN** the replacement accepts image input and supports strict Structured Outputs, and the accuracy figures get rerun against the labelled fixtures in the same change

### Requirement: The extracted field set

The model response SHALL carry one flat object per receipt holding `merchant`, `merchantAddress`, `date`, `time`, `currency`, `subtotal`, `taxes`, `tip`, `total`, `paymentMethod`, `cardLast4`, and a `lineItems` array whose entries each hold `description`, `quantity`, `unitPrice` and `amount`. `taxes` entries each hold `label` and `amount`.

#### Scenario: A receipt printing two tax lines

- **WHEN** the receipt prints two separate tax lines
- **THEN** `taxes` holds two entries, each with its own `label` and `amount`

#### Scenario: A field the receipt does not print

- **WHEN** the receipt prints no time, no address, no tip, no payment method and no card digits
- **THEN** `time`, `merchantAddress`, `tip`, `paymentMethod` and `cardLast4` come back null rather than invented or zeroed

### Requirement: Money is a decimal string

Every monetary value SHALL be a decimal string, never a float or a number. This covers `subtotal`, `tip`, `total`, each `taxes[].amount`, and each line item's `unitPrice` and `amount`.

#### Scenario: A whole-currency amount

- **WHEN** the printed total reads 42.00
- **THEN** `total` is the string "42.00" and keeps its trailing zeros

#### Scenario: The model returns a number

- **WHEN** the model returns `total` as a JSON number
- **THEN** server-side validation rejects the object rather than coercing it

### Requirement: Dates and times carry no guesses

`date` SHALL be an ISO date local to the receipt, with no timezone guessing applied. `time` SHALL be a 24-hour string when the receipt prints one and null otherwise.

#### Scenario: A receipt with no timezone printed

- **WHEN** the receipt prints a date and no timezone
- **THEN** `date` holds the printed date as an ISO date and the app shifts it by no offset

### Requirement: Currency is inferred, never defaulted

`currency` SHALL be an ISO 4217 code inferred from the printed symbol and the locale of the receipt. The app SHALL NOT fall back to USD silently.

#### Scenario: A receipt printing a pound sign

- **WHEN** the receipt prints amounts with a pound sign and a UK address
- **THEN** `currency` is "GBP"

#### Scenario: The symbol and locale do not settle it

- **WHEN** neither the symbol nor the locale identifies a currency
- **THEN** the app surfaces the currency as unresolved for the visitor to set, rather than filling in USD

### Requirement: Per-field confidence and source text

Every field in the response SHALL carry a sibling `confidence` between 0 and 1 and a sibling `sourceText` holding the characters the model read the value from. The app SHALL flag any field whose `confidence` is below 0.8 for review.

#### Scenario: A faint line item price

- **WHEN** a field comes back with `confidence` 0.62
- **THEN** the app flags that field for review in the form

#### Scenario: A clearly printed total

- **WHEN** a field comes back with `confidence` 0.94
- **THEN** the app shows the field in its confident state and flags nothing

### Requirement: Not a receipt is a first-class answer

The response schema SHALL carry an `isReceipt` boolean and a `reason` string. When `isReceipt` is false the app SHALL show the reason and stop, showing no field form and no extracted values.

#### Scenario: A photo of a menu

- **WHEN** the model returns `isReceipt: false` with a reason
- **THEN** the app shows that reason and renders no field form for the upload

### Requirement: Zod validates the model output on the server

The server route SHALL validate the parsed model object against the shared Zod schema before returning anything to the browser, because a response that satisfies the model's JSON schema can still be wrong about types.

#### Scenario: A response that fails validation

- **WHEN** the parsed object fails the Zod schema
- **THEN** the route returns an error for that file instead of passing the object to the browser
- **AND** the route returns no partially validated fields

#### Scenario: What the response tells the browser

- **WHEN** validation fails
- **THEN** the route answers with a stable error identifier naming a validation failure, and with no Zod issue text, no field paths and no fragment of the model's answer

#### Scenario: What the server keeps

- **WHEN** validation fails
- **THEN** the server logs the failing field paths so the failure is diagnosable, and logs neither the uploaded bytes nor the model's full answer

#### Scenario: The route does not try again on its own

- **WHEN** validation fails
- **THEN** the route returns the error without making a second OpenAI call, leaving a resubmission to the visitor as a new extraction

### Requirement: The OpenAI key never reaches the browser

The app SHALL read `OPENAI_API_KEY` on the server only. The key SHALL NOT appear in the client bundle, in a response body, or in any value the browser can read.

#### Scenario: A visitor inspects the shipped JavaScript

- **WHEN** a visitor reads every file the browser downloaded
- **THEN** none of them carries the key or any value derived from it

#### Scenario: An extraction fails

- **WHEN** the route returns an error of any kind
- **THEN** the response body carries no key material and no provider credentials

### Requirement: Uploads live in memory only

The server route SHALL hold each upload in memory for the length of the request and SHALL NOT write it to disk or to object storage. The only server-side state the app keeps SHALL be rate-limit counters.

#### Scenario: A request finishes

- **WHEN** the route returns a result or an error for an upload
- **THEN** the file bytes exist nowhere on the server afterwards

#### Scenario: The visitor reads the policy before uploading

- **WHEN** a visitor loads the page
- **THEN** the storage policy sits next to the drop zone, not only on the About page
