# Design

## Context

See proposal.md for the motivation and the measured figures.

Two modules decide what a visitor sees when they select a field. `buildRegionMap` in `lib/highlight-match.ts` walks `editableAddresses(receipt)`, scores each address's `sourceText` against the measured lines and keeps the matches that clear the threshold. `selectionNote` in `components/ReceiptWorkspace.tsx` then prints a sentence when the selected address has no region, choosing between the two entries of `NO_REGION_COPY` on whether that address's `sourceText` is null.

The change adds a third cause of an absent region, which both modules have to agree on: the map must not produce a region for `currency`, and the panel must print the third sentence for exactly the addresses the map refuses.

## Goals / Non-Goals

**Goals:**

- One rule naming the fields the app declines to mark, read by both the map and the panel.
- A sentence of its own for that cause, worded apart from the two that exist.
- The refusal costs nothing elsewhere: the value, the confidence, the `sourceText`, the edits, the arithmetic and both exports are untouched.

**Non-Goals:**

- Changing the prompt, the schema or the model. The quoting defect stays; this change stops the app acting on it for one field.
- Rerunning the accuracy harness. It measures what the model reads, and nothing this change touches alters a single extracted value.
- A general "fields a visitor may not highlight" setting. One field is refused, for a stated reason, and the rule is the place a second one would be added if evidence ever named one.

## Decisions

**The rule is a predicate over a `FieldAddress`, not a list of strings.** `isMarkable(address)` in `lib/highlight-match.ts` answers false for the flat `currency` address and true for everything else. An address rather than a field name, because the map is keyed by address and the panel holds the selected address, so both callers pass the thing they already have and neither has to take an address apart. A bare `Set<"currency">` would make the tax and line item cases the caller's problem twice.

**The refusal happens in `buildRegionMap`, not in `bestMatch`.** The matcher scores text against lines and knows nothing about fields, which is what slice 5 protected when the PDF text layer arrived: "the word box source is the page's decision and the matcher never learns it". Teaching `bestMatch` which field it is scoring would put field knowledge in the one module with no business holding it. The map is already the module that walks addresses, so it is where an address can be refused.

**The panel asks the same predicate rather than re-deriving the cause.** `selectionNote` checks `isMarkable(selected)` first, then falls back to the existing `sourceText === null` test. Deriving it a second way, for example by naming `currency` in the component, is exactly how the map and the copy drift apart: a later change that refuses a second field would fix one site and leave the other printing a sentence about text the app never looked for.

**The sentence names the reason, not the mechanism.** It says the app does not mark this field and why in plain words, so it reads as a decision rather than as a failure. Slice 4 settled that an absent mark is worded by its cause, and this is a third cause rather than a third phrasing of the second.

**`currency` keeps its `sourceText` in the schema and in the exports.** It is what the model read, the JSON export has always carried it, and removing it to stop a highlight would change a file people may have scripted against to fix a thing that has nothing to do with the file. The panel still shows it.

## Risks / Trade-offs

- [A visitor who wants to see where the currency came from no longer can] → The symbol repeats down a column of amounts, so the region was never a useful answer, and 25 of the 29 wrong marks scored a perfect 1, so what they were being shown was confidently wrong. The `sourceText` stays on screen.
- [The prompt still quotes an address for `currency`, so the defect survives for any later consumer of `sourceText`] → Recorded in the handoff and in `fixtures/REPORT.md` rather than hidden by this change. A prompt change asking for the shortest run of characters a value was read from stays available, and it is the change that would need a fixture rerun.
- [A second field is refused later and the rule turns into a list nobody audits] → The predicate holds one field and states its evidence in a comment pointing at `fixtures/REPORT.md`. Anything added to it needs the same.
- [The eight remaining wrong marks are untouched] → True, and they are a different shape: they score below 1 and are spread over fields rather than concentrated in one. The report names them and this change does not claim them.
