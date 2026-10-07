# Tasks

Slice 7 of the nine-slice plan: the caps, the rate limits and the three samples. The slice is finished when a visitor on the deployed app loads a sample with one press, a 6 MB photograph extracts after the browser reduces it, and the twenty-first extraction from one address is refused with the time it can try again.

## 1. The Upstash store

- [x] 1.1 The Vercel project has the Upstash for Redis integration (database `upstash-kv-red-drawer`), connected to all three environments. It writes `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL` and `REDIS_URL`; the limiter uses the first two. Both are in `.env.local`.
- [x] 1.2 Add `@upstash/redis` to the dependencies, list `KV_REST_API_URL` and `KV_REST_API_TOKEN` in `.env.example` with placeholders, and verify `npm run typecheck` passes and that `git status` shows no secret in a committed file.
- [x] 1.3 Run `npm run build` and verify it completes with the client in the tree.

## 2. The per-IP limiter

- [x] 2.1 Add `lib/rate-limit.ts` with the fixed-window counter: the key is the address plus the current hour, `INCR` with an `EXPIRE` on first write, and the result carries whether the request is allowed, how many remain and the wall-clock time the window resets. Verify unit tests against a stand-in client cover the first request, the twentieth, the twenty-first, and the expiry being set once rather than on every call.
- [x] 2.2 Read the caller's address from the platform's forwarded header in one place, and count a request with no usable address against a single shared key rather than letting it through. Verify unit tests cover a normal header, a comma-separated chain taking the first entry, and a missing header reaching the shared key.
- [x] 2.3 Treat an unreachable store as a refusal and absent credentials as no limiter configured, logging each loudly and distinctly. Verify unit tests cover both, and that the two are not reported as the same thing, because one is an outage and the other is a deployment that was never finished.
- [x] 2.4 Count one unit per model call, so a request carrying several files costs that many. Verify a unit test covers a five-file request spending five.

## 3. The route

- [x] 3.1 Check the allowance in `lib/extract-receipt.ts` before the body is read, so a refused request costs as little as possible, and answer `rate_limited` with the reset time. Verify unit tests cover a refused request making no model call, the reset time reaching the body, and the body carrying no provider detail.
- [x] 3.2 Add `rate_limited` and `session_cap_reached` to `EXTRACTION_ERROR_CODES` in `lib/receipt-schema.ts`, and verify `npm run typecheck` finds every copy table that needs the new keys.
- [x] 3.3 Enforce the five-file cap at the route, counting the files in the form, and verify unit tests cover six files refused without a model call and one file passing.
- [x] 3.4 Verify the check order with a unit test: an address over its allowance is told that rather than being told its file is the wrong type.

## 4. The session cap

- [x] 4.1 Add `lib/session-count.ts` counting extractions against `tabSessionId()` from `lib/session-store.ts`, held in `sessionStorage` so a reload keeps it and a new tab starts at zero. Verify unit tests cover the first count, the fortieth, the forty-first being refused, a reload keeping the count, and a throwing `sessionStorage` not throwing out of the module.
- [x] 4.2 Do not count a refusal the app never sent, and do count an extraction whose model call failed, because the call was made. Verify unit tests cover both.
- [x] 4.3 Check the cap in the workspace before anything leaves the browser, and verify in the dev server that the refusal appears with no request in the network log.

## 5. The downscale

- [x] 5.1 Add `lib/downscale.ts` resizing an image through `createImageBitmap` into an `OffscreenCanvas` until the encoded blob fits a named body budget below 4.5 MB, halving the long edge as needed and keeping it as large as still fits. Follow the shape `lib/pdf-page.ts` already uses. Verify unit tests cover the pure budget and scale computations for a file already inside the budget, one needing one halving, and one that cannot be made to fit.
- [x] 5.2 Refuse a file that still will not fit, as its own message rather than the 8 MB one, and verify a unit test covers the refusal.
- [x] 5.3 Wire it into the submit path before the post, for an uploaded image and for a rasterized PDF page alike, and say in the workspace when a reduction happened. Verify in the dev server with a 6 MB photograph that the notice appears, the extraction succeeds, and the document pane shows the image the model read.
- [x] 5.4 Verify in the dev server that a small file produces no notice, because nothing was reduced.

## 6. The three samples

- [x] 6.1 Make three fictional receipts and put them under `public/samples/`: a thermal grocery receipt with many line items whose sum disagrees with its printed subtotal, a restaurant receipt with a tip and two tax lines, and a scanned PDF invoice. Verify each loads in a browser and reads as a plausible receipt.
- [x] 6.2 Add `lib/samples.ts` naming the three with their paths and their descriptions, and verify a unit test covers the list being the three the workspace renders.
- [x] 6.3 Render the three under the picker, each loading with one press through the same submit an upload uses, labelled fictional where the visitor reads them. Verify in the dev server that each extracts and joins the session list.
- [x] 6.4 Verify in the dev server that the grocery sample raises the arithmetic warning on both rows it names, and that the PDF sample goes through the rasterize and highlights.

## 7. The two refusals on screen

- [x] 7.1 Report the hourly limit as its own state, naming the 20, that it is shared by everyone behind that address, and the time it resets, with no immediate retry control. Verify in the dev server by forcing the refusal.
- [x] 7.2 Report the session cap as its own state, saying a new tab starts a new session, and verify in the dev server with the cap lowered for the test and then put back.
- [x] 7.3 Verify in the dev server that every receipt already in the session list stays readable, correctable and exportable while either cap stands.

## 8. The specs and the record

- [x] 8.1 Update `ai-receipt-scanner-spec.md` where it disagrees with what this slice settled, including the fixed window and its retry time, the session cap keying off the tab session, the batch cap living at the route alone, the downscale, and the three samples, and verify the product spec and the three delta specs now say the same thing.
- [ ] 8.2 Record the slice 7 decisions in `handoff.md`: the fixed window and the boundary burst it accepts, the fail-closed limiter against the session store's fail-open, the session cap resting on a client value and being a courtesy rather than a control, the body budget below 4.5 MB, and which sample carries the mismatch. Verify the outstanding-work inventory and `tasks.md` at the repo root both reflect the slice as done once group 9 passes.
- [x] 8.3 Run `npm run lint`, `npm run typecheck` and `npm test`, and verify all three pass with the new unit tests counted.

## 9. End to end in the running app

- [ ] 9.1 Deploy to production and verify on https://ai-receipt-scanner.bobdempsey83.com that each of the three samples loads with one press and extracts, that the grocery sample shows the arithmetic warning, that the PDF sample highlights, that a 6 MB photograph is reduced with the notice and still extracts, that the twenty-first extraction from one address is refused naming the reset time with no model call made, that the refusal leaves the already-scanned receipts usable, and that the session cap refuses without a request leaving the browser.
