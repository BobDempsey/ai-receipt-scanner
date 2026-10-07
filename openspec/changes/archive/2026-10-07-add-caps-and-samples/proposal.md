# Proposal

## Why

Every cap the spec names is unenforced except the file size and the type: no rate limit stands between a stranger and the OpenAI bill, nothing stops a session running a thousand extractions, and a cold load shows an empty drop zone where the portfolio baseline asks for something on screen the moment the page opens. This is slice 7 of the nine-slice plan, and it settles the last two open points in the capability specs: what the per-IP hour means, and what the session cap keys off.

## What Changes

- Twenty extractions per IP per hour, counted in Upstash Redis so the number holds across serverless instances rather than per warm instance. The window is fixed and the rejection names the minute the visitor can try again.
- Forty extractions per session, counted against the same tab session id the IndexedDB table already uses, so the cap and the table agree on what a session is. It resets when the tab's session does, which is when the tab closes.
- The browser downscales an image that would exceed Vercel's 4.5 MB request body, keeping the long edge as large as still fits, and refuses only what cannot fit at all. The stated 8 MB file cap survives, because a 10 MB phone photograph now reaches the model as a smaller image rather than as an error.
- Three fictional sample receipts sit under the drop zone and load with one press: a thermal grocery receipt with many line items, a restaurant receipt with a tip and two tax lines, and a scanned PDF invoice. One of the three has a line-item sum that disagrees with its printed subtotal, so a visitor meets the arithmetic warning without hunting for a bad receipt. All three are labelled fictional on the page.
- Two error codes arrive: `rate_limited` for the edge refusal and `session_cap_reached` for the in-app one, which never leaves the browser.
- **BREAKING** for the spec rather than the code: the five-file batch cap is enforced at the route, where a crafted request can carry several files, and not in the picker, which still takes one file at a time. The limits spec said a visitor drops eight files on a drop zone; no slice has built multi-file upload, and this slice does not either, so the spec now says where the cap is checked and why.

## Capabilities

### New Capabilities

None. All three capabilities this touches already exist.

### Modified Capabilities

- `limits`: the per-IP window becomes a fixed hour with a named retry time, the session cap keys off the tab session and resets with it, the batch cap moves to the route alone with the reason stated, and the browser downscale joins the size cap.
- `extraction`: the route refuses a rate-limited request before it calls the model, and the two new codes join the vocabulary.
- `receipt-workspace`: the three samples sit under the picker on a cold load, the two cap refusals read as their own states, and the downscale is reported when it happens.

## Impact

- New `lib/rate-limit.ts` for the fixed-window counter over Upstash Redis, read by the route before it calls the model.
- New `lib/session-count.ts` for the in-app cap, counted against `tabSessionId()` from `lib/session-store.ts`.
- New `lib/downscale.ts` for the browser-side resize to fit the body cap, which the PDF rasterize path already has a sibling of in `lib/pdf-page.ts`.
- New `public/samples/` holding the three fictional receipts, and `lib/samples.ts` naming them.
- `lib/extract-receipt.ts` gains the rate-limit check and the batch-count check; `lib/receipt-schema.ts` gains the two codes.
- `components/ReceiptWorkspace.tsx` gains the sample row, the two refusal states and the downscale notice.
- `@upstash/redis` joins the dependencies, reading `KV_REST_API_URL` and `KV_REST_API_TOKEN`, which are the names the Upstash marketplace integration writes. Both are in Vercel and belong in `.env.example` with placeholders.
- No change to the Zod field set, the arithmetic, the editing, the matcher, the PDF path or the export envelopes.
