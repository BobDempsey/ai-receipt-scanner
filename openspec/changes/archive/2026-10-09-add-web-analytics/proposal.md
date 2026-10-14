# Proposal

## Why

The portfolio baseline asks every project to deploy on Vercel with Web Analytics in production builds only, and this one counts nothing today. Bob cannot tell whether anyone who opens the portfolio card ever reaches the demo, which pages they read, or whether the About page is worth its upkeep. The product spec's stack table and the handoff's stack row have both claimed Web Analytics since the start, so two documents describe a deployment that does not ship. This change makes them true.

## What Changes

- The site renders Vercel's Web Analytics component from the root layout, so every route counts its page views without a page having to remember to.
- The component renders on the production deployment alone. Vercel builds a preview with `NODE_ENV` set to `production` as well, so the layout reads Vercel's own `VERCEL_ENV` on the server and renders the component only when it is `production`. A preview build, a local `next build` and `next dev` all render nothing and request nothing.
- Web Analytics sets no cookie and records a page view's path, referrer, country, browser and device. A receipt never reaches a URL in this app, so no page view can carry anything a visitor uploaded or extracted.
- The About page and the README stop saying that a rate-limit counter is the only state on a server. Both say that Vercel counts page views on the production site without a cookie, and that a page view carries no receipt. The Host rows on both say Web Analytics runs on the production deployment.
- The product spec's Host row and its section on what is stored say the same thing.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `site-chrome`: gains two requirements. Page views are counted on the production deployment alone, and a page view carries no receipt while the About page and the README say what it does carry. The capability owns the page around the app and what a visitor reads about it, which is where a counter that runs on every page and a sentence on the About page both belong. The `extraction` and `limits` specs keep their wording that rate-limit counters are the only server-side state the app keeps: the page-view count is Vercel's, held by the host rather than by any route this app runs, and the new requirements say so.

## Impact

- New dependency `@vercel/analytics`, pinned at 2.0.1.
- `app/layout.tsx` renders `<Analytics />` from `@vercel/analytics/next` behind the `VERCEL_ENV` check, and stays a server component.
- `app/about/page.tsx` changes its Host row and its "What it keeps" paragraph; `README.md` changes its Host row and its "Nothing is stored" paragraph.
- `ai-receipt-scanner-spec.md` changes its Host row and section 5.
- The Vercel project needs Web Analytics enabled in its dashboard before the script it serves at `/_vercel/insights/script.js` exists. Without that toggle the request for the script answers 404, nothing is counted, and the component logs one line to the console.
- No change to `lib/`, to the route, or to anything the app computes.
