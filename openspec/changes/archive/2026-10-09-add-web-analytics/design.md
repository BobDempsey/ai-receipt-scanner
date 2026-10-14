# Design

## Context

See proposal.md for motivation. What exists today: `app/layout.tsx` is a server component that wraps every route in `SiteProviders`, the nav and the footer, and puts Mantine's `ColorSchemeScript` in the head. Nothing in the tree loads an analytics script. The Vercel project `ai-receipt-scanner` deploys production from `main` and builds a preview for every other branch.

`@vercel/analytics` 2.0.1 ships `Analytics` from `@vercel/analytics/next` as a client component marked `"use client"`. It renders null, wraps its route tracking in a `Suspense` boundary because it reads `useSearchParams`, and on mount appends a deferred script. In its default `auto` mode it picks the script by `process.env.NODE_ENV`: `development` or `test` loads a debug script from `va.vercel-scripts.com` that logs instead of sending, and anything else loads `/_vercel/insights/script.js` from the deployment itself. Its props are `beforeSend`, `debug`, `mode`, `scriptSrc`, `dsn` and the endpoint overrides.

## Goals / Non-Goals

**Goals:**

- Count page views on the production deployment, on every route, with no page having to opt in.
- Count nothing on a preview, a local build or a dev server.
- Keep the layout a server component.
- Leave no document saying the server holds less than it does.

**Non-Goals:**

- Custom events, such as counting extractions or exports. A page view answers whether anyone reaches the demo, and an event per extraction would be a second counter of the thing the rate limiter already counts.
- Speed Insights. A separate product with its own package, and not what the baseline asks for.
- A consent banner. Web Analytics sets no cookie and stores no identifier on the device, so there is nothing to consent to.
- A `beforeSend` filter. No URL in the app carries anything a visitor typed or uploaded, so there is nothing to strip.

## Decisions

**The gate is `VERCEL_ENV === "production"`, read in the layout on the server.** The package's own `auto` mode keys off `NODE_ENV`, and Vercel builds a preview with `NODE_ENV` set to `production` too, so `auto` alone would count every preview a branch or a pull request produces and mix them into the production figures. `VERCEL_ENV` is the variable Vercel sets to `production`, `preview` or `development` per deployment, and it is absent from a local build. Reading it in the server component means the decision is made where the variable exists, and a preview's flight payload never references the client component, so nothing mounts it and nothing is requested. Its code still rides in the layout's shared client chunk, which Turbopack builds the same either way, and that cost is a few kilobytes of JavaScript that never runs. The rejected alternative was `mode="production"` with `NEXT_PUBLIC_VERCEL_ENV` read in the browser, which moves the same check to the client and ships the component to every preview to decide there.

**The layout renders the component directly, beside the chrome inside `body`.** It is a client leaf under a server layout, the same shape the nav's toggle and the footer's year already take. It sits after `SiteProviders` rather than inside it, because it needs no Mantine context and has no business in the theme provider. A wrapper component of our own would hold one line of logic and a comment, which is what the layout already holds.

**The documents say page views are counted, beside the rate-limit counter.** The project's rule that nothing is stored is about uploads and receipts, and it still holds: the app writes no receipt to any server. The About page and the README went further, saying the rate-limit counter is the only state on a server, and once Vercel counts page views that sentence claims less than ships. Both now name the page-view count, say it sets no cookie, and say it carries no receipt. The sentence beside the picker stays as it is, because it speaks about the upload and the upload reaches no disk and no database.

**The `extraction` and `limits` specs keep their wording.** Both say rate-limit counters are the only server-side state the app keeps. The page-view count lives in Vercel's analytics service rather than in anything this app's routes write, so the statement about the app stays true, and the `site-chrome` requirements this change adds are where the host's count is stated.

## Risks / Trade-offs

- The dashboard toggle is outside the repo → Web Analytics has to be enabled on the Vercel project before `/_vercel/insights/script.js` exists. Until then the production page requests it, gets a 404, and the component logs one line asking for the toggle. Nothing breaks, and nothing is counted.
- An ad blocker drops the script → the count undercounts by whatever share of visitors block it. That is the accepted cost of a cookieless counter with no server-side fallback.
- `VERCEL_ENV` is read at build time for a statically rendered page → a prerendered page keeps the answer its own build saw, so a preview build served as production without a rebuild would stay uncounted. This project ships by pushing `main` and letting Vercel build production from it, so every production page is built with `production`.

## Migration Plan

Enable Web Analytics on the project in the Vercel dashboard, push `main`, and confirm that the production page requests `/_vercel/insights/script.js` with a 200 and that a preview deployment requests nothing. Rollback is reverting the commit; the counted page views stay in the dashboard either way.

## Open Questions

None.
