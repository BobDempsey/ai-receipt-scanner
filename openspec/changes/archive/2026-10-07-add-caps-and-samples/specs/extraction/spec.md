# Spec Delta

## ADDED Requirements

### Requirement: A rate-limited request never reaches the model

The route SHALL check the per-IP allowance before it calls the model, and SHALL answer a refused request with a stable code and the time the allowance returns. No model call SHALL happen for a refused request, and the refusal SHALL carry no provider detail and no key material.

#### Scenario: An IP over its hourly allowance

- **WHEN** a request arrives from an address that has spent its allowance
- **THEN** the route answers with the rate-limit code and the reset time, and makes no OpenAI call

#### Scenario: What the refusal body holds

- **WHEN** the route refuses on the rate limit
- **THEN** the body carries the code, a message a visitor can read and the reset time, and nothing about the provider or the counter store

#### Scenario: The check runs before the file is read

- **WHEN** a rate-limited request carries a large file
- **THEN** the route refuses it without reading the bytes, because a refused request should cost as little as possible

### Requirement: The counted unit is one model call

The app SHALL count one extraction per model call against both the per-IP allowance and the session cap, and a request the route refused before calling the model SHALL cost nothing. The route makes one model call per request, so no request spends more than one unit today; a request carrying several files is refused on the batch cap rather than extracted file by file.

#### Scenario: A refused upload costs nothing

- **WHEN** the route refuses an upload on its type or its size
- **THEN** no allowance is spent, because no model call was made

#### Scenario: A failed model call

- **WHEN** the model call itself fails after the allowance was counted
- **THEN** the extraction still counts, because the call was made and the cost was incurred
