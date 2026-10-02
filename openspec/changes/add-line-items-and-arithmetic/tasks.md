# Tasks

Slice 2 of the vertical-slice plan in the repo's `tasks.md`: line items and the arithmetic warnings. The items reach both schemas and the field panel, the two checks run in code over the decimal strings, a mismatch shows as a warning on both fields naming the difference, and the JSON download carries the items and the warnings, working in the deployed app.

## 1. Decimal arithmetic over the strings

- [x] 1.1 Add `lib/decimal.ts` parsing a decimal string into a sign, a `BigInt` of its digits and a scale, with add, subtract, compare and render functions that lift both operands to the wider scale first, and verify `tsc --noEmit` passes
- [x] 1.2 Render a result at the common scale of its operands, and verify a difference between two-place amounts renders as "0.50" rather than "0.5"
- [x] 1.3 Add Vitest coverage for `lib/decimal.ts`: "0.10" plus "0.20" plus "0.30" equals "0.60", "0.07" plus "0.01" equals "0.08", "47.6" compares equal to "47.60", a third decimal place against two places, a negative difference, a zero difference, and a malformed string rejected rather than coerced. Verify `npm test` passes
- [x] 1.4 Confirm no function in the module converts a value to `Number` at any point, by reading the module and verifying the tests in 1.3 cover the sums a float gets wrong

## 2. Line items in both schemas

- [x] 2.1 Add `lineItems` to `buildReceiptSchema` in `lib/receipt-schema.ts` as a nullable array whose entries hold `description`, `quantity`, `unitPrice` and `amount`, each with its flat `…Confidence` and `…SourceText` siblings, using `.nullable()` and never `.optional()`, and verify `tsc --noEmit` passes
- [x] 2.2 Type `quantity`, `unitPrice` and `amount` as strings on `DECIMAL_PATTERN` in the validating schema and as plain strings in the model-facing schema, and verify the schema accepts `quantity` "0.734" and "2" and rejects the number 2
- [x] 2.3 Extend `lib/receipt-schema.test.ts` with a receipt carrying six items, an item whose `quantity` is null, an item whose `amount` is null, an empty `lineItems` array, a null `lineItems`, and an item confidence outside 0 to 1. Verify `npm test` passes
- [x] 2.4 Add the line-item wording to `EXTRACTION_PROMPT` in `lib/model.ts`, asking for one entry per purchased line in printed order, the quantity as printed and null when absent, and no entry invented for a receipt that itemizes nothing. Verify the prompt string carries no em dash

## 3. The two checks and their warnings

- [x] 3.1 Add `lib/arithmetic.ts` exporting a pure function from a validated `Receipt` to an array of warnings, built only on `lib/decimal.ts`, and verify it makes no network call and reads nothing outside the object it was given
- [x] 3.2 Implement the line-item check summing every item `amount` against `subtotal`, and verify a receipt summing to "47.60" against a `subtotal` of "47.60" produces no warning
- [x] 3.3 Implement the total check adding `subtotal`, every `taxes[].amount` and `tip` against `total`, treating a null `tip` and an absent `taxes` array as contributing nothing, and verify a restaurant receipt with a tip and two tax lines that balances produces no warning
- [x] 3.4 Give each warning its check, the two field identifiers (`lineItemsTotal`, `subtotal`, `total`), the two compared decimals, the absolute difference as a decimal string at the common scale, and a message the module composed naming the direction. Verify the items-sum mismatch carries the difference "0.50" and names both the item total and `subtotal`
- [x] 3.5 Skip a check rather than warn when a value it needs is missing: `subtotal` null, `total` null, any item `amount` null, and `lineItems` empty or null. Verify each case produces no warning and that an empty `lineItems` is not a flag of its own
- [x] 3.6 Leave every extracted value untouched, and verify the checker returns warnings only and mutates no field on the receipt it was given
- [x] 3.7 Add Vitest coverage for `lib/arithmetic.ts` over every scenario in the arithmetic delta: both checks passing, both failing, a 0.01 rounding difference warned rather than tolerated, differing scales, each skip case, and a card slip with a total and no items. Verify `npm test` passes

## 4. The line items and the warnings on screen

- [x] 4.1 Add a stable `field` key to the rows `lib/receipt-fields.ts` returns for `subtotal` and `total`, and a computed `lineItemsTotal` row carrying the item sum with no confidence, and verify the existing field-row tests still pass
- [x] 4.2 Render the line items read-only in `components/FieldPanel.tsx` below the flat fields, one row per item with its description, quantity, unit price and amount in printed order, and verify a six-item receipt shows six rows in order
- [x] 4.3 Flag an item row for review when one of its four confidences is below 0.8, the way a flat field is flagged, and verify a row with an `amount` confidence of 0.61 carries the review badge
- [x] 4.4 Show an absent item value as absent rather than as 0 or an empty cell, and verify an item with a null `quantity` reads as absent
- [x] 4.5 Show the computed item total beside `subtotal`, labelled as computed, and show that the app read no line items when `lineItems` is empty rather than showing a total of 0.00. Verify both states
- [x] 4.6 Print every item amount and the computed total as the decimal string the app holds, with no reformatting, rounding or localizing, and verify an amount of "42.00" renders as 42.00
- [x] 4.7 Show each warning on both rows it names, with the message the module composed, and verify a subtotal mismatch marks the item total row and the `subtotal` row while leaving both values as they are
- [x] 4.8 Run the checker in `components/ReceiptWorkspace.tsx` when a result arrives, holding the warnings beside the receipt in component state, and verify no second request leaves the browser when the warnings appear
- [x] 4.9 Extend the field-panel tests with a six-item receipt, an empty `lineItems`, a low-confidence item value, a subtotal mismatch and a total mismatch, and verify `npm test` passes

## 5. The export

- [x] 5.1 Change `receiptToJson` in `lib/receipt-json.ts` to the envelope holding the validated receipt under `receipt` and the warnings under `warnings`, and verify the saved file parses and carries both keys
- [x] 5.2 Write `warnings` as an empty array when both checks pass rather than omitting the key, and verify a balancing receipt downloads with `"warnings": []`
- [x] 5.3 Carry every line item with its `…Confidence` and `…SourceText` siblings into the file, and verify a six-item receipt exports six entries under `receipt.lineItems`
- [x] 5.4 Keep every monetary value a decimal string with its digits and both decimal places, in the field set and in each warning's difference, and verify a `total` of "42.00" and a difference of "0.50" both reach the file as strings
- [x] 5.5 Add export tests over the envelope, the empty `warnings` array, the items and a warned receipt exporting with its values unaltered, and verify `npm test` passes

## 6. Fold the decisions back into the documents

- [x] 6.1 Record in `handoff.md` the decimal decision and why `lib/decimal.ts` is hand-rolled over scaled `BigInt` rather than a library, the three answered open points (exact comparison with no tolerance, an empty `lineItems` is not a flag, the JSON export carries the warnings), and the new download envelope that slice 6 inherits. Verify the file carries no em dash and no AI attribution
- [x] 6.2 Tick slice 2 in the repo's `tasks.md`, and verify the other nine entries are untouched
- [x] 6.3 Confirm `ai-receipt-scanner-spec.md` needs no correction for this slice by reading its sections 3 and 4 against the delta specs, and report any disagreement rather than leaving the delta to carry a fix alone

## 7. Verify the slice end to end in the deployed app

- [ ] 7.1 Run `npm run lint`, `npm run typecheck` and `npm test`, and verify all three pass with no warning introduced by this slice
- [ ] 7.2 Push `main` and verify the Vercel production build succeeds with no type or lint error
- [ ] 7.3 On the production URL, extract a JPEG grocery receipt with several line items, and verify the panel lists every item under the flat fields with its quantity, unit price and amount, and that the computed item total matches the printed subtotal with no warning
- [ ] 7.4 On the production URL, extract a receipt whose line items do not sum to its printed subtotal, and verify the warning appears on the item total row and on the `subtotal` row naming the difference, and that neither number changed
- [ ] 7.5 On the production URL, extract a restaurant receipt with a tip and two tax lines, and verify the total check passes or warns on both `subtotal` and `total` naming the difference, matching what the printed receipt says
- [ ] 7.6 On the production URL, download the JSON for the warned receipt and verify the file carries the line items, the warning with its difference as a decimal string, and every amount unaltered
- [ ] 7.7 On the production URL, extract an upload that itemizes nothing, and verify the panel says it read no line items, reports no warning about them, and still runs the total check
