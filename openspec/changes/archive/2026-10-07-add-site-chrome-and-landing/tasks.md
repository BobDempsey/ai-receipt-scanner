# Tasks

Slice 8 of the nine-slice plan: the site chrome, the landing page, the About page and the README. The slice is finished when a stranger can land on the deployed page from a portfolio card, understand what the app does without being told, use it without scrolling, switch the theme, read the honest limits, and find the repository.

## 1. The shared measurements

- [x] 1.1 Add the shared tokens to the Mantine theme in `app/layout.tsx`: one content max width, a headline scale with tight tracking, and a prose measure of about 65 characters. Verify `npm run build` passes and nothing in the workspace moves except its width.
- [x] 1.2 Move the workspace off its own `Container size="xl"` onto the shared width, and verify in the dev server that it starts and ends at the same horizontal position as a section placed below it.
- [x] 1.3 Measure the real contrast of the teal accent against the light and the dark surfaces it sits on, for body text and for the accent itself, and record both ratios in the task's commit message. Verify each clears 4.5 to 1, and if one does not, adjust the shade rather than the requirement.

## 2. The nav and the footer

- [x] 2.1 Add `components/SiteNav.tsx` fixed to the top, carrying the project name linking home, the main action, a repository link opening in a new tab, and the theme toggle. Verify in the dev server that it stays on screen at the bottom of the page.
- [x] 2.2 Use `useMantineColorScheme` for the toggle, so `ColorSchemeScript` stays the one thing applying the stored theme before first paint. Verify in the dev server that setting dark, reloading, and watching the first frame shows no light flash, and that a visitor with no stored choice follows their system.
- [x] 2.3 Give the toggle and the repository link accessible names saying what they do, and verify with the browser's accessibility tree rather than by reading the source.
- [x] 2.4 Add `components/SiteFooter.tsx` carrying the copyright with the year read at render, the name linking to bobdempsey83.com in a new tab, an About link and a repository link. Verify in the dev server that it appears on both pages.
- [x] 2.5 Wrap every page in the nav and the footer from `app/layout.tsx`, keeping the layout a server component. Verify `npm run build` passes and the About page carries both.

## 3. The hero

- [x] 3.1 Keep the drop zone and the three samples usable without scrolling under the nav. Verify in the dev server at a 1280x800 laptop viewport and at a 390x844 phone viewport, reporting what is visible at each before any scroll.
- [x] 3.2 Shorten whatever the workspace says above the picker so the hero earns its space, without losing the storage policy the `receipt-workspace` spec requires beside the picker. Verify the policy is still readable before a file is chosen.

## 4. The sections below the hero

- [x] 4.1 Add `components/StepCards.tsx`: numbered cards describing the pipeline in order, as panels rather than paragraphs under headings. Verify in the dev server that a visitor who has uploaded nothing can read what the app does to a receipt.
- [x] 4.2 Add `components/StatTiles.tsx` carrying figures the app can state today, each read from the code rather than typed twice: the field count, the accepted formats, the per-session cap and the line-item support. Verify a unit test asserts each tile's figure against the constant it comes from.
- [x] 4.3 Capture real screenshots of the running app at a fixed viewport, keep the capture script beside them under `scripts/`, and commit them to `public/screenshots/`. Verify each file is well under a megabyte and shows the current app.
- [x] 4.4 Add `components/Screenshots.tsx` rendering them side by side on a wide screen, each with alt text describing what it shows, each opening full size on click. Verify both in the dev server, including the alt text in the accessibility tree.
- [x] 4.5 Add `components/ActionBand.tsx` before the footer carrying the one or two actions that follow from the demo. Verify in the dev server that the page does not end in a footer alone.

## 5. The About page and the limits module

- [x] 5.1 Add `lib/project-facts.ts` holding the figures the site states and the honest failure cases, so the About page and the README cannot disagree about either. Verify a unit test covers the list being non-empty and every figure matching the constant it derives from.
- [x] 5.2 Add `app/about/page.tsx` in plain language: what the app does to a receipt, what it is built on, and where it fails, rendering the limits from that module. Verify in the dev server that it names faded thermal paper, handwriting and angled photographs.
- [x] 5.3 Verify in the dev server that the About page shares the site's content width and carries the same nav and footer.

## 6. Motion and the accessibility pass

- [x] 6.1 Add the CSS-only motion: a hover lift and a scroll reveal through `animation-timeline: view()`, every rule inside `@media (prefers-reduced-motion: no-preference)`, nothing on first paint. Verify in the dev server with the preference set both ways, and confirm the reveal animates from a visible state rather than from `display: none`.
- [x] 6.2 Tab from the top of the page to the bottom and verify every control takes focus in reading order with a visible ring, including the nav, the samples, the workspace, the session table rows and the footer.
- [x] 6.3 Verify every image carries alt text and every icon-only control an accessible name, reading the accessibility tree rather than the source.
- [x] 6.4 Verify at a 390-pixel viewport that the page scrolls only downward, on both pages.

## 7. The README

- [x] 7.1 Rewrite `README.md`: the live link and a screenshot first, then the stack table, then setup from a clean clone, then how the extraction works, then the documented failure cases read from the same facts the About page uses. Verify the setup steps by following them in a clean clone of the repo into a temporary directory, and report what you had to change.
- [x] 7.2 Verify the README and the About page state the same limits and the same figures, naming each one you compared.

## 8. The specs and the record

- [x] 8.1 Update `ai-receipt-scanner-spec.md` where it disagrees with what this slice settled, and verify the product spec and the two delta specs now say the same thing.
- [x] 8.2 Record the slice 8 decisions in `handoff.md`: the landing page being the app page, the chrome living in the layout, the shared tokens, the contrast figures, the facts module behind the About page and the README, and the stat tiles waiting on slice 9 for the accuracy numbers. Verify the outstanding-work inventory and `tasks.md` at the repo root both reflect the slice as done once group 9 passes.
- [x] 8.3 Run `npm run lint`, `npm run typecheck`, `npm run build` and `npm test`, and verify all four pass.

## 9. End to end in the running app

- [x] 9.1 Deploy to production and verify on https://ai-receipt-scanner.bobdempsey83.com that the nav stays fixed and the footer carries the current year, that the theme toggle holds across a reload with no flash, that the hero is usable without scrolling at a laptop and a phone viewport, that the steps, the tiles, the screenshots and the action band all render, that a screenshot opens full size, that the About page carries the chrome and the limits, that tabbing crosses the whole page with a visible ring, that a reduced-motion visitor sees no animation, that the phone width scrolls only downward, and that an extraction still runs end to end from the hero.
