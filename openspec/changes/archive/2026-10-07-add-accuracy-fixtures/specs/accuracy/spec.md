# Spec Delta

## Purpose

Says what the project measures about its own reading of a receipt, how it measures it, and what it is allowed to claim in public. It owns the labelled fixture set, the comparison rules, the published figures, and the rule that every place stating a figure states the same one.

## ADDED Requirements

### Requirement: Forty labelled fixtures, with the label exact by construction

The project SHALL hold at least 40 receipt fixtures, each paired with the field set it should produce. The label SHALL be produced by the same process that produced the image, so no value is transcribed by hand and no fixture can disagree with its own label.

#### Scenario: A fixture and its label

- **WHEN** a fixture is generated
- **THEN** its label is written in the same run from the same values the image was drawn from

#### Scenario: A hand-typed expectation

- **WHEN** anyone adds a fixture whose label was typed rather than generated
- **THEN** the set is no longer exact by construction, so the harness refuses it rather than measuring against a value nobody can check

#### Scenario: Regenerating the set

- **WHEN** the generator runs again
- **THEN** it produces the same fixtures and the same labels, so a figure measured last month is comparable to one measured today

### Requirement: The fixtures are damaged on purpose, and each damage is named

Fixtures SHALL cover the conditions a real receipt arrives in: fading, blur, rotation, perspective, cropping, noise and heavy compression. Each fixture SHALL record which degradations were applied to it, so a failure is traceable to a cause rather than to an image.

#### Scenario: A failure that needs explaining

- **WHEN** a fixture's `total` is read wrong
- **THEN** the report says which degradations that fixture carries, so the failure can be attributed

#### Scenario: A clean set

- **WHEN** every fixture is a clean render
- **THEN** the measurement does not describe what a photograph gets, so the set SHALL carry degraded fixtures as well as clean ones

#### Scenario: Honesty about what the damage is

- **WHEN** the project states a figure measured on this set
- **THEN** it says the damage is applied in code rather than photographed, because synthetic fading is not thermal paper

### Requirement: The harness runs the real extraction path

The measurement SHALL send each fixture through the same extraction the app uses, including the pinned model, the prompt and the server-side validation, and SHALL compare what comes back to the label. It SHALL NOT measure a stand-in, a cached answer or a different prompt.

#### Scenario: A measurement that would flatter the app

- **WHEN** the harness is tempted to skip validation or to retry a failed call
- **THEN** it does neither, because the figure has to describe what a visitor gets

#### Scenario: A fixture the model refuses

- **WHEN** the model answers that a fixture is not a receipt
- **THEN** every field of that fixture counts as wrong, rather than being excluded from the denominator

### Requirement: Money and dates are compared as the app holds them

A monetary value SHALL be compared as the decimal string the app holds, so "42.00" and "42.0" are not silently equal and nothing is parsed into a float to be compared. A date SHALL be compared as the ISO string. An absent value SHALL match only an absent value.

#### Scenario: Trailing zeros

- **WHEN** the label holds "42.00" and the model returned "42.0"
- **THEN** the comparison does not treat them as the same value, because the app's contract is the string

#### Scenario: A field the receipt did not print

- **WHEN** the label holds null for `tip` and the model returned "0.00"
- **THEN** that field counts as wrong, because inventing a zero is the failure the app exists to avoid

#### Scenario: A field the model left null

- **WHEN** the label holds a value and the model returned null
- **THEN** that field counts as wrong rather than as skipped

### Requirement: Three figures are published and one report is kept

The project SHALL publish field accuracy across all fields, and `total` and `date` broken out on their own, because those two are what a person checks first. A per-field breakdown and the per-fixture results SHALL be written to a report the repository keeps, so every published figure has something behind it.

#### Scenario: A reader asks where a figure came from

- **WHEN** someone reads a published accuracy figure
- **THEN** the repository holds the report it was computed from, naming the model, the date and every fixture's result

#### Scenario: A figure with no report

- **WHEN** a figure is published without the run behind it
- **THEN** the project has claimed something it cannot show, which this requirement forbids

### Requirement: Every place states the same measured figures

The stat tiles, the About page and the README SHALL state the same accuracy figures, and SHALL change together. No place SHALL state a figure the report does not hold.

#### Scenario: A rerun moves a number

- **WHEN** a new run produces a different figure
- **THEN** all three places change in the same change, with the report updated beside them

#### Scenario: A rounded figure

- **WHEN** a figure is rounded for display
- **THEN** every place rounds it the same way, so a reader comparing two of them finds one answer

### Requirement: A model or prompt change reruns the measurement

The project SHALL rerun the fixtures whenever the pinned model, the extraction prompt or the field schema changes, and SHALL update the published figures in the same change. A figure measured against a model the app no longer calls SHALL NOT stay on the site.

#### Scenario: Swapping the pinned model

- **WHEN** anyone changes the model id
- **THEN** the same change reruns the fixtures and updates the three places and the report

#### Scenario: A prompt tweak

- **WHEN** the extraction prompt changes
- **THEN** the figures are rerun, because the prompt is part of what was measured

### Requirement: The measurement is invoked by a person, never by the suite

The harness SHALL be a script someone runs deliberately, and SHALL NOT run as part of the test suite, the build or any automatic check, because every run spends real money against the model.

#### Scenario: The test suite

- **WHEN** `npm test` runs
- **THEN** no model call is made and no fixture is measured

#### Scenario: A deploy

- **WHEN** the project builds for production
- **THEN** the build makes no model call

### Requirement: The thresholds are checked against the fixtures

The matching threshold for a highlight and the confidence below which a field is flagged for review SHALL both be checked against this fixture set, and either confirmed with the evidence or changed. Neither SHALL remain a judgment once there is a set to measure it against.

#### Scenario: The match threshold

- **WHEN** the fixtures are measured
- **THEN** the report says how many correct highlights the threshold admitted and how many wrong ones it refused, and the value is confirmed or changed on that evidence

#### Scenario: The review line

- **WHEN** the fixtures are measured
- **THEN** the report says whether a confidence below the review line actually predicts a wrong value, and the line is confirmed or changed on that evidence
