# Tasks

This is not a new vertical slice. It is a correction inside slice 4's highlighting path, which the slice 9 fixture run measured, so it touches the matcher's caller and the panel's copy and nothing else. It still ends in the running app, because a highlight is only checkable there.

## 1. The rule

- [x] 1.1 Add `isMarkable(address: FieldAddress): boolean` to `lib/highlight-match.ts`, answering false for the flat `currency` address and true for every other address, with a comment naming the evidence in `fixtures/REPORT.md`. Verify the unit tests in 1.3 pass.
- [x] 1.2 Call it from `buildRegionMap` so a refused address is never scored and never lands in the map. Verify a map built over a receipt whose `currencySourceText` matches a line exactly holds no entry for `currency` and still holds the entry that line belongs to.
- [x] 1.3 Cover both in `lib/highlight-match.test.ts`: `isMarkable` false for `currency` and true for a flat field, a tax cell and a line item cell; `buildRegionMap` refusing `currency` while `merchantAddress` still matches the address line the model quoted; and the `$\nFairhaven Bay, OR 97000` shape from the report marking nothing. Verify `npm test` passes.

## 2. The sentence

- [x] 2.1 Add a third entry to `NO_REGION_COPY` in `components/ReceiptWorkspace.tsx` saying the app does not mark this field and why, worded apart from the absent and the unmatched sentences. Verify by reading the three side by side: no two share an opening clause.
- [x] 2.2 Branch `selectionNote` on `isMarkable(selected)` before the existing `sourceText === null` test, so the third sentence is chosen by the same predicate the map refuses on. Verify the branch order by selecting a `currency` whose `sourceText` is null and reading the unmarked sentence rather than the absent one.

## 3. End to end in the running app

- [x] 3.1 Run the dev server, load the grocery sample, wait for the measuring message to clear, then select `currency`. Verify no mark appears, no previously standing mark is left behind, and the unmarked sentence is the one printed.
- [x] 3.2 In the same session select `merchantAddress`, then `total`, then `currency` again. Verify the address and the total each mark their own region, and that selecting `currency` clears the mark rather than leaving the previous one standing.
- [x] 3.3 Download the JSON for that receipt. Verify `currency`, `currencyConfidence` and `currencySourceText` are all present and unchanged, and that the file still carries `receipt`, `warnings` and `edited` and nothing else.
- [x] 3.4 Run `npm run lint`, `npx next typegen`, `npm run typecheck`, `npm test` and `npm run build`. Verify all five pass and that no model call is made by the suite.
