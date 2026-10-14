# Tasks

This change belongs to no slice of the nine. It is the baseline's Build item, Web Analytics in production builds only, and it widens the deployed path by one script on every page without touching the upload, the model call, the validation, the form or the export. It is finished when the production site counts page views, a preview and a local run count nothing, and no document describes the deployment differently from what ships.

## 1. The dependency

- [x] 1.1 Install `@vercel/analytics` pinned at 2.0.1, and verify `npm ls @vercel/analytics` reports 2.0.1 and `package.json` names that exact version.
- [x] 1.2 Read the 2.0.1 package's own types under `node_modules/@vercel/analytics/dist/next/`, and verify the import path, the component name and its props before writing the layout against them.

## 2. The layout

- [x] 2.1 Render `<Analytics />` from `@vercel/analytics/next` in `app/layout.tsx` behind `process.env.VERCEL_ENV === "production"` read on the server, with a comment saying why `NODE_ENV` is not the gate. Verify the file carries no `"use client"` and `npm run build` still lists every route as it did.
- [x] 2.2 Build and start the app locally with `VERCEL_ENV` unset, and verify in a browser that the page requests nothing under `/_vercel/insights/` and nothing from `va.vercel-scripts.com`.
- [x] 2.3 Build and start the app locally with `VERCEL_ENV=production`, and verify in a browser that the page requests `/_vercel/insights/script.js` on both the landing page and the About page. Locally that request answers 404, which is expected off Vercel.

## 3. The documents

- [x] 3.1 Change the Host row and the "What it keeps" paragraph in `app/about/page.tsx`, and the Host row and the "Nothing is stored" paragraph in `README.md`, so both say Vercel counts page views on the production site without a cookie and that a page view carries no receipt. Verify the two state the same thing, and that neither still says the rate-limit counter is the only state on a server.
- [x] 3.2 Change the Host row and section 5 of `ai-receipt-scanner-spec.md` to match, and verify the product spec and the delta spec now say the same thing.
- [x] 3.3 Record the change in `handoff.md`: a dated entry in section 1, the Host row in section 3, and the Web Analytics item in section 9 ticked with what remains. Tick the same line in `tasks.md` at the repo root. Verify both read as done.
- [x] 3.4 Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`, and verify all four pass.

## Workflow follow-up

- Archive the change, and verify `openspec validate --all --strict` passes with both requirements folded into `openspec/specs/site-chrome/spec.md`.
- Bob enables Web Analytics on the `ai-receipt-scanner` project in the Vercel dashboard, then pushes `main`.
- On https://ai-receipt-scanner.bobdempsey83.com, verify that the landing page and the About page each request `/_vercel/insights/script.js` with a 200 and send a page view, that a preview deployment requests nothing under `/_vercel/insights/`, that no cookie is set, that an extraction still runs end to end from a sample, and that the dashboard shows the visits within a few minutes.
