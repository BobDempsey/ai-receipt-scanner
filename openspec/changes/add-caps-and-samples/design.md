# Design

## Context

See proposal.md for motivation. What exists today: `lib/extract-receipt.ts` checks the type against `ACCEPTED_IMAGE_TYPES` and the size against `MAX_FILE_BYTES`, in that order, before it builds the data URL and calls the model. `lib/session-store.ts` holds `tabSessionId()`, a random id in `sessionStorage` created once per tab, which the IndexedDB records are keyed to. `lib/pdf-page.ts` already rasterizes through `createImageBitmap` into an `OffscreenCanvas` and caps a long edge, so the browser-side resize this slice needs has a working sibling to follow. The workspace holds every phase and every refusal already, so two more refusals are two more states rather than a new mechanism.

Two facts shape the limiter. The app runs on Vercel's Node runtime, not a middleware edge function, so "at the edge" in the spec means before the model call rather than in a geographically distributed worker. And Vercel caps a serverless request body at 4.5 MB while the product spec promises 8 MB files, which is the gap the downscale closes.

## Goals / Non-Goals

**Goals:**

- A per-IP count that holds across instances, so the cap is a real control rather than a decoration.
- A session cap that agrees with the session table about what a session is.
- A visitor who can read, from any refusal, which cap they hit and when they can act again.
- Three samples that make the app demonstrable with nothing in hand, one of them showing the arithmetic warning.
- A 10 MB phone photograph that produces a result.

**Non-Goals:**

- Multi-file upload. The picker still takes one file; the batch cap guards the route against a crafted request.
- A distributed middleware limiter. The counter sits in the route's own path, which is where the money is spent.
- Per-visitor identity of any kind. An IP and a tab session id are what the app counts, and it stores no profile.
- Charging, quotas or an allowlist. The caps are flat.
- Replacing the samples with real receipts. All three are fictional and labelled so.

## Decisions

**The per-IP counter lives in Upstash Redis, reached over its REST API.** A counter in process memory is per warm instance, so twenty becomes twenty times however many instances are running, which is not a cap. Upstash's REST client works from a serverless function with no connection pooling to manage, its free tier covers a portfolio demo, and the two credentials are environment variables rather than a build step. The integration writes them as `KV_REST_API_URL` and `KV_REST_API_TOKEN`, so the client is constructed from those names rather than through `Redis.fromEnv()`, which looks for `UPSTASH_` ones that do not exist here. The alternative considered was a Vercel KV store, which is now the same Upstash product behind a different name. The client is `@upstash/redis`, and the module around it is small enough that swapping the store later is one file.

**The window is fixed, and the key carries the hour.** The counter key is the IP plus the current hour, `INCR` with an `EXPIRE` on first write, so a window needs no scheduled cleanup and no sorted set. A fixed window lets the refusal name a wall-clock time the visitor can read, which a rolling window cannot do without returning a per-request estimate. The cost is the boundary burst: a visitor can spend twenty at 10:59 and twenty more at 11:00. For a portfolio demo whose risk is a bored stranger rather than a determined one, forty calls in two minutes is an acceptable worst case against an explanation a visitor can actually understand.

**An unreachable counter refuses the extraction.** Failing open on a route that spends money is the wrong default: the limiter exists because the OpenAI bill is real. The refusal says the app could not check its own limit, which is honest, and the failure is logged so it is diagnosable. This is the opposite of the choice `lib/session-store.ts` made, where an unreachable IndexedDB leaves the app working, and the difference is that a lost session list costs the visitor nothing while an uncounted model call costs Bob money.

**The IP comes from the platform's forwarded header, and a missing one is its own bucket.** A request with no usable address is counted against one shared key rather than waved through, so the absence of an address cannot become an unlimited lane. The header the platform sets is read in one place so a change of host is one line.

**The session cap counts against `tabSessionId()`, in `sessionStorage` beside it.** The spec's open point asked what the cap keys off and whether it resets; keying it to the same id the stored receipts use means the cap and the table cannot disagree about what a session is, and a reload keeps both. The count lives in `sessionStorage` rather than in the IndexedDB table, because deriving it by counting stored records would make a cap that a visitor could lower by scanning receipts the app refused to store, and because the count has to survive even when IndexedDB is unavailable. A new tab starts at zero, which is what the per-IP limit is for.

**The session cap is checked before anything leaves the browser.** It is the only cap the app can enforce without a request, so enforcing it early is free and tells the visitor instantly. It is deliberately not re-checked on the server: the server cannot verify a tab session id a browser asserts, and a cap that pretends to be a control while resting on a client-supplied value is worse than one that says plainly it is an in-app courtesy. The per-IP limit is the control, which is what the limits spec already says.

**The downscale keeps the long edge as large as the body allows.** One fixed target would throw away detail on receipts that did not need it, and refusing above 4.5 MB would reject ordinary phone photographs. The resize runs through `createImageBitmap` into an `OffscreenCanvas`, re-encodes as JPEG at a quality the module names, and halves the long edge until the encoded blob fits the body budget with room for the base64 expansion the route applies. The budget is a named constant below 4.5 MB, because base64 adds about a third and the multipart wrapper adds more. A PDF already arrives as a rasterized PNG capped at 2000 pixels, so it reaches this path as an image like any other.

**The three samples are static files under `public/samples/`, fetched and handed to the existing path.** A sample press fetches the file, wraps it as a `File`, and calls the same submit the picker calls, so nothing about extraction, measuring, editing or storing learns that a sample is different from an upload. The grocery sample is the one whose items do not sum, because it is the receipt with enough line items for a gap to be worth explaining. The PDF sample exercises the slice 5 path, so the three between them cover the line items, the two tax lines and the rasterize.

**Two codes, and only one of them is a response.** `rate_limited` is a route response carrying the reset time. `session_cap_reached` never leaves the browser, because the app refuses before it sends, so it joins the error vocabulary as a code the workspace keys its copy off rather than one the route ever returns. Keeping both in one union means the workspace's copy table stays exhaustive and TypeScript finds a missing case.

**The rate-limit check runs before the file is read.** A refused request should cost as little as possible, so the allowance is checked before the multipart body is parsed. That also means the batch count and the type check happen after it, which is the right order: an IP over its allowance learns that rather than learning its file was the wrong type.

## Risks / Trade-offs

- **The Upstash integration has to exist on the Vercel project before any of this can be verified in production**, and provisioning it is Bob's action, not an agent's. → The tasks put it first and name it as a step to confirm rather than to perform. Until the credentials exist, the limiter refuses every extraction by its own fail-closed rule, which would take the demo down; the module therefore treats absent credentials as "no limiter configured" and logs loudly, distinct from a configured store that cannot be reached.
- **The fixed window allows a boundary burst of forty calls.** → Stated above and accepted. A sliding window is the upgrade if the demo ever draws real traffic, and the module is one file.
- **The session cap rests on a client-supplied value and can be cleared.** → Said plainly rather than dressed up. The per-IP limit is the control, and the About page will say which is which.
- **A downscaled image may read worse than the original**, so an accuracy number measured on full-size fixtures is not the number a phone photograph gets. → The workspace says when it reduced an image, and slice 9 measures the fixtures at the size the app would actually send.
- **Three sample files add weight to the repo.** → They are small fictional receipts, they are what the portfolio baseline requires on a cold load, and they replace nothing.
- **`@upstash/redis` is a dependency on a hosted service for a demo that otherwise needs none.** → It is the only server-side state the spec permits, and it is what makes the cap real. The free tier covers this traffic, and the module boundary keeps the swap cheap.
