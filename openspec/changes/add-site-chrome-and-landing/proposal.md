# Proposal

## Why

The app works and looks like a prototype: one bare `<main>` holding the workspace, no nav, no footer, no theme toggle, no About page, and nothing on the page explaining what a visitor is looking at or who made it. Every other project linked from bobdempsey83.com meets a baseline this one does not, and a portfolio piece that cannot be read by someone who arrived from a card is not finished. This is slice 8 of the nine-slice plan, and it is the one that turns a working tool into a page.

## What Changes

- A fixed nav carrying the project name linking home, the main action, a GitHub icon opening the repo in a new tab, and a light and dark toggle whose choice is remembered.
- A footer on every page reading the copyright with the year taken from the render, the name linking to bobdempsey83.com in a new tab, an About link and the GitHub icon.
- The landing page becomes the app page: the hero holds the drop zone and the three samples, usable without scrolling, with bento sections below it. Numbered step cards explain the pipeline, a row of stat tiles carries figures, and screenshots of the running app open full size on click.
- A closing action band before the footer carrying the one or two actions that follow from the demo.
- An About page in plain language: the pipeline, the stack, and the honest limits, including the failure cases the model has.
- One shared max width across the landing page, the About page and the app, one accent colour checked at 4.5:1 against its background in both themes, and a 4xl headline with tight tracking against base body text.
- CSS-only motion behind `prefers-reduced-motion: no-preference`: a hover lift, a scroll reveal, nothing on first paint.
- An accessibility pass over the whole page: keyboard reach, visible focus rings, alt text, accessible names on icon-only buttons, and a phone-width layout.
- A README opening with the live link and a screenshot, then the stack table, then setup from a clean clone, then how the extraction works, then the documented failure cases.
- The stat tiles carry figures the app can state today, such as the field count, the accepted formats and the caps. The accuracy numbers are slice 9's, and they land in the tiles, the About page and the README together, because the three have to agree.

## Capabilities

### New Capabilities

- `site-chrome`: the page around the app, covering the theme, the nav, the footer, the About page, the landing sections, the shared measurements and the accessibility floor. It owns what a visitor reads rather than what the app computes, which is why it is its own capability rather than more requirements on `receipt-workspace`.

### Modified Capabilities

- `receipt-workspace`: the workspace becomes the hero of a page rather than the whole page, and it has to stay usable without scrolling with the nav above it.

## Impact

- New `app/about/page.tsx`, and `app/page.tsx` gains the sections around the workspace.
- New `components/SiteNav.tsx`, `components/SiteFooter.tsx`, `components/StepCards.tsx`, `components/StatTiles.tsx`, `components/Screenshots.tsx` and `components/ActionBand.tsx`, with CSS modules beside them.
- `app/layout.tsx` wraps every page in the nav and the footer; the Mantine theme gains the shared max width and the type scale. `ColorSchemeScript` and `primaryColor: "teal"` are already there, so the no-flash rule and the accent are set rather than introduced.
- New `public/screenshots/` holding real captures of the running app.
- `README.md` is rewritten.
- No change to `lib/`, to the route, or to anything the app computes. This slice adds no behaviour the specs already describe for extraction, arithmetic, editing, highlighting, export or the caps.
