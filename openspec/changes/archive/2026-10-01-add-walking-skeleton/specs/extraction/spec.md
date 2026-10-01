# Spec Delta

## ADDED Requirements

### Requirement: The OpenAI key never reaches the browser

The app SHALL read `OPENAI_API_KEY` on the server only. The key SHALL NOT appear in the client bundle, in a response body, or in any value the browser can read.

#### Scenario: A visitor inspects the shipped JavaScript

- **WHEN** a visitor reads every file the browser downloaded
- **THEN** none of them carries the key or any value derived from it

#### Scenario: An extraction fails

- **WHEN** the route returns an error of any kind
- **THEN** the response body carries no key material and no provider credentials

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

#### Scenario: The model id is pinned, not inferred

- **WHEN** the route builds a request
- **THEN** it names `gpt-6.1-sol` from the app's own configuration rather than asking the provider for a latest alias

#### Scenario: The model id changes

- **WHEN** anyone swaps the pinned id for another model
- **THEN** the replacement accepts image input and supports strict Structured Outputs, and the accuracy figures get rerun against the labelled fixtures in the same change

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
