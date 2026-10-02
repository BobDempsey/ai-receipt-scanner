# Design

## Context

Slices 1 and 2 left the pieces this slice wires together. `lib/receipt-schema.ts` builds the model-facing and the validating schema from one function, so `receiptSchema` is already the single statement of what a value may be. `lib/receipt-fields.ts` turns a validated receipt into panel rows and already carries a stable `field` key on the three rows an arithmetic warning can name. `lib/arithmetic.ts` is a pure function from a receipt to warnings, written that way in slice 2 so this slice could call it unchanged. `components/ReceiptWorkspace.tsx` holds the receipt and the warnings in React state and composes the download; `components/FieldPanel.tsx` prints them.

See `proposal.md` for why, and the five delta specs for what the app has to do.

Four constraints shape the decisions below. Money is a decimal string and never a float. The app never rewrites a number to make a sum close. Nothing is stored, so an edit has nowhere to live but the tab. And the Vitest suite runs in a Node environment over `lib/**` and `app/**` with no renderer and no DOM, so anything that needs a test has to be a function rather than a component.

One constraint comes from the schema. Every editable field is nullable and none is optional, so an emptied field always has a legal value to commit, and `isReceipt` is the only non-nullable property in the object and is not editable.

## Goals / Non-Goals

**Goals:**

- One statement of what a value may be, used by the server on the model's answer and by the browser on a visitor's edit, with no second copy of a regex anywhere.
- Every rule an edit follows expressed as a pure function over the receipt, so the existing Node test environment can reach all of it.
- A commit model that never refuses a value the visitor has not finished typing.
- An edit that leaves the panel, the checks and the download agreeing with each other after every keystroke-settled change.

**Non-Goals:**

- A form library. The receipt is the single source of truth and the schema is the single source of rules, and a form library would hold a second copy of both.
- An undo stack. Escape reverts the field being edited and nothing further, because a history wants the durable session slice 6 brings.
- A render test suite. Adding a DOM environment and a renderer is its own change, and slice 8 is where the panel's markup settles.
- A per-item third check comparing `quantity` times `unitPrice` against `amount`. Slice 2 ruled it out and nothing here changes that.

## Decisions

### A field address names the thing being edited, and its string form is what the export carries

`lib/field-edit.ts` defines an address covering the three shapes the receipt holds: a flat field, a cell on a tax entry, and a cell on a line item entry. Each address has a string form built from the property path the receipt already uses, so `total`, `taxes.1.amount` and `lineItems.3.amount` name exactly what they look like they name. The panel hands an address back when a control commits, the edited list holds addresses, and the export writes their string form.

Alternatives considered:

- **An opaque id per editable cell.** Stable under a removal, and unreadable in a downloaded file. A reader of the JSON has to be able to see which field a correction landed on, which an index path gives for free.
- **A row index plus a label.** The label is display text that slice 8 will rewrite, so keying anything off it puts a rename in the path of a correction.

An index path shifts when an item is removed, which the next decision handles.

### Removing an item remaps the recorded addresses, and React gets a separate row key

Two problems hide in one place. Removing the second of four items moves the third into its index, so a recorded edit against `lineItems.2.amount` would start describing a different line. And a React list keyed by index hands the removed row's draft text to the row that took its place.

Each gets its own mechanism, because each has its own job. The pure `removeLineItem` function remaps every recorded address above the removed index, which is a few lines and a test. The workspace keeps a parallel array of row keys, generated when an item arrives and used as the React key alone, never exported and never written into the receipt. The schema has no room for an id and should not grow one, since an id is a fact about this browser tab rather than about the receipt.

### The per-field validator is pulled off `receiptSchema`, not restated

For a flat field, the validator is `receiptSchema.shape[key]`. For a cell on a tax or a line item entry, the slice unwraps the nullable array and takes the element's shape, so the rules reach the cell without being retyped. Zod 4 gives both steps as plain calls on the schema objects.

The alternative is a table of per-field regexes in the editing module. It would work on the day it was written and drift the first time `DECIMAL_PATTERN` changes, and the extraction spec already treats the shared schema as the control that keeps a float out of a money field. Deriving the validator means a change to the schema reaches the edit path with no second edit.

Each address resolves to a validator through one function, which also gives the slice its own test surface: a test can assert that every address in the receipt resolves, which catches a field added to the schema later and never made editable.

### The refusal sentence is composed by the app, keyed off the field kind

Zod's issue text is for a developer. The panel needs a sentence naming what the field takes, so `lib/field-edit.ts` composes one per kind of field: an ISO date, a 24-hour time, an ISO 4217 code, a decimal amount with up to three places, four card digits, free text. The wording lives in one place, the way slice 2 put the warning wording in one place, so the panel and any later surface read the same sentence off the same rejection object.

A rejection is data: the address, the text the visitor typed, and the sentence. The workspace holds the rejections beside the receipt and the panel marks the field, which keeps the component a shell over values someone else computed.

### An accepted edit is a pure transformation producing a new receipt

`applyEdit` takes the receipt, an address and the committed text, and returns either a rejection or a new receipt with three changes: the value written, the field's confidence set to null, and the `sourceText` left exactly as it was. The caller folds the address into the edited list and reruns `arithmeticWarnings` over the returned receipt.

Writing the confidence to null rather than carrying a separate "the visitor typed this" flag into the review rule is what makes the review flag clear for free. `needsReview` already reads `confidence !== null && confidence < 0.8`, so a null confidence is not flagged and nothing in `lib/receipt-fields.ts` needs a second condition. The panel still has to tell a field the model gave no confidence for from a field the visitor typed, and the edited list is what tells them apart. That is the reason the edited list exists as data rather than being inferred from a null confidence.

Alternatives considered for the confidence:

- **Set it to 1.** It would read as a certainty the app has no basis for, and the export would hand a reader a model confidence of 1 on a value the model never saw.
- **Leave the model's figure.** A field corrected from a 0.62 reading would keep asking for review after the visitor fixed it, which is the opposite of what the slice is for.
- **Add a `…Origin` sibling to the schema.** It would survive a reload and travel in the receipt, and it would also change the object the model is asked to produce, since both schemas come off one builder. Strict Structured Outputs would then ask the model to fill in a field about the visitor. Held beside the receipt instead, the way the warnings are.

### The commit model lives in the cell, and the receipt never sees a draft

Each editable cell is a Mantine `TextInput` holding its own draft string in component state, seeded from the value the app holds. It commits on blur and on Enter, reverts on Escape, and reports nothing in between. The workspace receives a commit, calls `applyEdit`, and either records a rejection or sets a new receipt, a new edited list and new warnings together in one pass.

Per-keystroke keeping was the alternative and the proposal says why it loses: `2026-1` and `42.` are both malformed and both unavoidable on the way to a valid value, so a visitor correcting a date would watch the app refuse four of the ten characters they typed. A debounce would soften that without fixing it, and it would make a test wait on a timer. Blur and Enter are also what a keyboard visitor already expects from a table of inputs.

The draft lives in the cell rather than in the workspace because a draft is not a fact about the receipt. Keeping drafts in the workspace would put a value that has passed no validation beside the values that have.

### The workspace holds four pieces of state, set together

The workspace already holds `receipt` and `warnings`. It gains the edited list and the rejections. An accepted commit sets receipt, edited list and warnings in one handler so no render can show a receipt beside warnings computed from an earlier one. A refused commit sets a rejection and touches nothing else, which is what the arithmetic delta's refused-edit scenario asks for.

Add and remove are the same shape: a pure function returning a new receipt and a remapped edited list, then a recheck.

### The download envelope gains a third key

`receiptToJson` takes the edited list beside the receipt and the warnings, and writes `{ "receipt": …, "warnings": […], "edited": […] }`. `edited` is always present and empty when the visitor changed nothing, matching what slice 2 decided for `warnings`, so a reader can tell an untouched receipt from one whose edits were not recorded.

Folding the markers into the receipt was the alternative and fails the same way slice 2's warnings did: the Zod schema governs what sits under `receipt`, and a key the schema rejects cannot go inside it.

## Risks / Trade-offs

- **A visitor types a correction and navigates away without blurring the field** → Blur fires when the page loses the field in every path that leads to the download button, because pressing the button moves focus. The risk is a visitor who edits the last field and reloads, which loses the receipt anyway.
- **An added item with no amount turns the sum check off, which is the check the visitor was trying to satisfy** → `lineItemTotal` already reports `incomplete` for a null amount and `lib/receipt-fields.ts` already prints the note saying one item amount is missing, so the panel states why no sum appeared. The arithmetic delta covers it as a scenario.
- **Index-path addresses can be remapped wrongly** → The remap is a pure function with tests over a removal below, at and above a recorded edit, and over two recorded edits either side of the removal.
- **The validator derivation depends on Zod 4 internals holding still** → It uses the public `shape`, `unwrap` and `element` surface rather than reaching into `_def`. A test asserting that every address in a receipt resolves to a validator fails loudly on an upgrade that moves any of it.
- **No render test covers the commit, the revert or the refusal** → The suite has no DOM environment and this slice does not add one. Every rule lives in `lib/field-edit.ts` under test, the component holds the draft and the three keyboard paths, and the end-to-end tasks exercise those three paths on the production URL. Slice 8 is the change that can afford a renderer.
- **A visitor may read a cleared confidence as the app losing information** → The panel says the value is one they typed, which is the honest statement, and the `sourceText` stays in the file so the original reading is still traceable.
- **The envelope changes shape a second time in two slices** → Nobody consumes the file but a visitor reading it, an added key breaks no reader of the two already there, and slice 6 inherits a shape that now carries everything the batch export needs.

## Migration Plan

Nothing to migrate. No stored data, no API consumer, and the one shape that changes is a file a visitor downloads.

Deploy order: land `lib/field-edit.ts` with its tests, then the editable cells and the rejection rendering, then add and remove, then the envelope key, then push `main` and exercise the paths on the production URL. Rollback is Vercel's previous deployment.

## Open Questions

- Whether the add control sits above or below the line item table. Either satisfies the delta and slice 8 styles the panel.
- Whether a refused edit holds the visitor's text in the field or shows the previous value with the refusal beside it. The delta requires the receipt to keep the old value and the refusal to be visible; which of the two the control shows is a detail the apply step can settle against how Mantine's `TextInput` handles an error state.
