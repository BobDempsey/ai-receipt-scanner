# Spec Delta

## MODIFIED Requirements

### Requirement: Every edit rechecks the arithmetic

The app SHALL rerun both checks after each inline edit a visitor commits, including an added or a removed line item, and SHALL update or clear the warnings from that run. An edit the app refused SHALL change no warning, because the receipt it would have changed stayed as it was.

#### Scenario: A visitor fixes a misread subtotal

- **WHEN** the visitor corrects `subtotal` so the line items now sum to it
- **THEN** the app clears the warning from `subtotal` and from the line item total without a page reload

#### Scenario: A visitor introduces a mismatch

- **WHEN** the visitor edits `total` to a value the parts no longer reach
- **THEN** the app raises the warning on `total` and on `subtotal`, naming the new difference

#### Scenario: A visitor narrows a difference without closing it

- **WHEN** a warning names a difference of 0.50 and the visitor corrects an item amount so the gap becomes 0.10
- **THEN** the warning stays on both rows and now names 0.10

#### Scenario: A visitor adds the line the model missed

- **WHEN** the items sum to 0.50 short of the printed subtotal and the visitor adds an item with an `amount` of "0.50"
- **THEN** the sum check passes and the app clears the warning from both rows

#### Scenario: A visitor removes a line the model read twice

- **WHEN** the items sum to 4.25 more than the printed subtotal because one line appears twice, and the visitor removes the copy
- **THEN** the sum check passes and the app clears the warning from both rows

#### Scenario: An added item with no amount yet

- **WHEN** the visitor adds a line item and has committed no `amount` into it
- **THEN** the app skips the line item sum check rather than summing the items it can read, so no difference is named off a half-typed row

#### Scenario: A correction the app refused

- **WHEN** the visitor commits a malformed value and the app refuses it
- **THEN** every warning stays exactly as it was, because the app reran the checks over no change

#### Scenario: A correction that fixes one check and breaks the other

- **WHEN** the visitor corrects `subtotal` so the items now sum to it, while `subtotal` plus taxes plus `tip` no longer reaches `total`
- **THEN** the app clears the line item warning and raises the total warning, naming the difference the new subtotal produces

#### Scenario: A cleared field skips the check that needed it

- **WHEN** the visitor clears `subtotal` and commits
- **THEN** the app skips both checks that need a subtotal and clears their warnings, rather than treating the absence as a difference

#### Scenario: The recheck costs no request

- **WHEN** the app reruns the checks after an edit
- **THEN** it computes every warning from the values the browser already holds and sends no request of any kind
