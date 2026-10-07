# Design

## Design

See proposal.md for motivation. What exists today: `app/layout.tsx` already carries `ColorSchemeScript` with `defaultColorScheme="auto"`, a Mantine theme with `primaryColor: "teal"`, and the Geist pair as CSS variables, so the no-flash rule and the accent are already set rather than introduced here. `app/page.tsx` is three lines around `<ReceiptWorkspace />`, which wraps itself in a Mantine `Container size="xl"`. There is no nav, no footer, no second page and no README worth the name.

The baseline this slice answers lives at `C:\code\bobdempsey83.com\docs\portfolio-project-spec.md` and is summarized in handoff.md section 7, which is the version used here.

## Goals / Non-Goals

**Goals:**

- A page a stranger arriving from a portfolio card can read without being told anything first.
- One theme choice honoured before the first paint, which Mantine already does, now with a control for it.
- The app itself as the hero, not a banner above the app.
- An About page and a README that cannot drift apart, because the limits and the figures live in one module both read.
- Keyboard reach and a phone layout proven in a browser rather than assumed.

**Non-Goals:**

- The accuracy numbers. Slice 9 measures them and lands them in the tiles, the About page and the README together.
- Any change to what the app computes. No `lib/` module is touched.
- A blog post or the portfolio card. Those are ship steps after slice 9.
- A design system. Mantine's theme is the system, extended with a few tokens.
- Server-rendered theme detection beyond what `ColorSchemeScript` already does.

## Decisions

**The landing page is the app page.** The baseline asks for the product in the hero, usable without scrolling, which here is the drop zone and the three samples. Splitting a marketing page from an app page would put a click between a visitor and the thing worth seeing, and would leave the app page outside the chrome the baseline wants on every page. So `app/page.tsx` renders the chrome, the workspace as the hero, then the sections below it.

**The nav and the footer live in `app/layout.tsx`, not in each page.** Two pages exist today and a third may arrive; putting the chrome in the layout means a new page cannot forget it, which is what the footer requirement asks for. The layout stays a server component, and the two pieces that need state, the theme toggle and anything that reads the year at render, are client components beneath it.

**The theme toggle uses Mantine's own `useMantineColorScheme`.** The handoff records this as a gotcha already: `ColorSchemeScript` plus that hook is what satisfies the apply-before-first-paint rule, and a hand-rolled store beside it would be a second source of truth with a flash of its own. The toggle is an icon-only control, so it carries an accessible name that says what it switches to.

**The shared measurements become theme tokens rather than repeated numbers.** One `--content-max` used by the nav, the footer, the workspace and every section, one headline scale, and a prose measure of about 65 characters. The workspace currently sets `Container size="xl"` itself; it moves to the shared token so the hero and the sections below it line up, which is the one visible thing the `receipt-workspace` delta asks for.

**The accent stays teal, and the contrast is measured rather than assumed.** It is already the Mantine primary, it is not the accent of the sibling portfolio projects, and the slice 4 highlight overlay is already drawn from it. The check is a real contrast calculation against the light and dark surfaces it sits on, recorded in the task so a later theme change has a number to beat rather than an opinion.

**The stat tiles carry figures the app can state today.** The accuracy numbers belong to slice 9, and a tile reading "coming soon" is worse than a tile reading something true. So the tiles carry the field count, the accepted formats, the per-session cap and the line-item support, each of which the code already settles. Slice 9 replaces or extends them in the same change that writes the same numbers into the About page and the README, which is the gotcha the handoff already records about the three places agreeing.

**The honest limits live in one module that the About page imports.** The README cannot import TypeScript, so the module is the source and the README is written from it, with the About page rendering it directly. That makes a drift between the two a visible edit to one file rather than a silent disagreement, which is what the spec's "both change together" scenario asks for.

**The screenshots are real captures of the running app, taken in the browser.** The baseline rules out illustrations. They are committed under `public/screenshots/`, taken at a fixed viewport so they do not shift between captures, and each carries alt text describing what it shows rather than naming the file. Clicking one opens it at full size, which Mantine's image modal covers without a new dependency.

**Motion is CSS only, and the scroll reveal uses `animation-timeline: view()`.** No observer, no JavaScript, nothing to fail. Every rule sits inside `@media (prefers-reduced-motion: no-preference)`, so a visitor who asked for less gets the final state with no opt-out needed, and content that depends on an animation to be readable is the thing the spec forbids: the reveal animates opacity and position from a visible starting state rather than from `display: none`.

**The README is rewritten rather than patched.** Its current content predates most of the app. It opens with the live link and a screenshot, then the stack table, then setup from a clean clone, then how the extraction works, then the documented failure cases. The setup steps have to work from a clean clone, which means naming the two environment variable pairs and the fact that `predev` copies the vendor assets.

## Risks / Trade-offs

- **The hero must stay usable without scrolling while the nav takes vertical space.** → The nav is short, the workspace's own heading shrinks, and the check is made at a phone width and a laptop height in the browser rather than on a desktop monitor where everything fits.
- **`animation-timeline: view()` is not in every browser.** → It is progressive: where it is missing, the content is simply already in place, which is the same state the reduced-motion visitor gets. Nothing depends on it.
- **Screenshots go stale as the app changes.** → They are captured by a script kept beside them, the way the samples are, so slice 9 or a later change can retake them rather than hand-cropping.
- **A landing page is a lot of new surface for a slice that adds no behaviour.** → It adds no `lib/` code and no spec requirement about what the app computes, so the risk is visual rather than functional, and the existing 436 tests still cover everything the app does.
- **The About page and the README can still drift in prose even with one figures module.** → The module holds the figures and the failure cases; the prose around them is short enough that a reviewer can read both in a minute, and the spec names the rule.
