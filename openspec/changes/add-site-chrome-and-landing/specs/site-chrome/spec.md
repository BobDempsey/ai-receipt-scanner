# Spec Delta

## Purpose

Holds the page around the app: the theme a visitor chooses, the nav and the footer on every page, the sections that explain the demo, the About page, and the measurements and accessibility floor the whole site shares. It owns what a visitor reads rather than what the app computes.

## ADDED Requirements

### Requirement: The theme is chosen, remembered and applied before first paint

The site SHALL offer a light and a dark theme, toggled from the nav, SHALL remember the choice across visits, and SHALL apply the stored theme before the first paint so no visitor sees a flash of the wrong one.

#### Scenario: A visitor picks dark and returns

- **WHEN** a visitor sets the dark theme and loads the site again later
- **THEN** the page paints dark from the first frame, with no light flash

#### Scenario: A visitor who has chosen nothing

- **WHEN** a visitor arrives with no stored choice
- **THEN** the site follows the theme their system asks for

#### Scenario: Both themes are readable

- **WHEN** a visitor reads any page in either theme
- **THEN** the body text and the accent both clear a 4.5 to 1 contrast ratio against what sits behind them

### Requirement: A nav sits at the top of every page

The site SHALL show a nav fixed to the top of the viewport the whole way down a page, carrying the project name linking home, the main action, a link to the repository that opens in a new tab, and the theme toggle. Every control in it SHALL be reachable by keyboard and SHALL carry an accessible name.

#### Scenario: A visitor scrolls to the bottom

- **WHEN** a visitor scrolls to the end of the landing page
- **THEN** the nav is still on screen

#### Scenario: An icon-only control

- **WHEN** a screen reader reaches the repository link or the theme toggle
- **THEN** each announces what it does, rather than announcing an image or nothing

#### Scenario: The nav does not cover the hero

- **WHEN** a visitor loads the page
- **THEN** the drop zone and the samples are both visible under the nav without scrolling

### Requirement: A footer sits on every page

The site SHALL show a footer on every page carrying the copyright with the current year, the author's name linking to bobdempsey83.com in a new tab, a link to the About page, and a link to the repository. The year SHALL come from the render rather than from a constant written at build time.

#### Scenario: The year changes

- **WHEN** the year turns over and the site has not been rebuilt
- **THEN** the footer shows the new year

#### Scenario: Every page carries it

- **WHEN** a visitor reaches the About page
- **THEN** the same footer is there

### Requirement: The hero holds the product

The landing page SHALL put the app itself at the top, with the drop zone and the three samples usable without scrolling, rather than an illustration or a description of the app above the app.

#### Scenario: A visitor arrives from the portfolio

- **WHEN** a visitor lands on the page for the first time
- **THEN** they can start an extraction without scrolling, because the drop zone and the samples are both in the first screen

#### Scenario: A phone

- **WHEN** a visitor opens the page on a phone-width viewport
- **THEN** the drop zone and at least one sample are reachable without scrolling past a banner

### Requirement: The sections below the hero explain the demo

The landing page SHALL carry, below the hero, numbered step cards describing the pipeline, a row of stat tiles carrying figures, and real screenshots of the running app that open full size when clicked. The sections SHALL be panels rather than paragraphs under small headings.

#### Scenario: A visitor who has not uploaded anything

- **WHEN** a visitor scrolls past the hero without using the app
- **THEN** the steps tell them what the app does to a receipt, in order

#### Scenario: A screenshot

- **WHEN** a visitor clicks a screenshot
- **THEN** it opens at full size, and the image carries alt text describing what it shows

#### Scenario: A figure with nothing behind it

- **WHEN** a stat tile carries a figure
- **THEN** that figure is one the app can state today rather than a placeholder, and the same figure appears wherever else the site states it

### Requirement: A closing band carries the action that follows

The landing page SHALL end, before the footer, with a band carrying the one or two actions that follow from the demo, so a visitor who has read the page has somewhere to go.

#### Scenario: A visitor reaches the bottom

- **WHEN** a visitor scrolls past the last section
- **THEN** the band offers the next action rather than the page ending in a footer alone

### Requirement: An About page states the pipeline, the stack and the honest limits

The site SHALL carry an About page in plain language covering what the app does to a receipt, what it is built on, and where it fails. The limits SHALL name real failure cases rather than hedging, and SHALL agree with what the README says.

#### Scenario: A visitor asks what it cannot do

- **WHEN** a visitor reads the About page
- **THEN** it names the cases the app reads badly, such as faded thermal paper, handwriting and angled photographs

#### Scenario: The About page and the README disagree

- **WHEN** either document's limits or figures change
- **THEN** both change together, because a visitor who reads one and then the other must not find two answers

### Requirement: The site shares one set of measurements

The site SHALL use one maximum content width across the landing page, the About page and the app, one accent colour, and a headline scale with tight tracking set against base body text, so the three pages read as one site.

#### Scenario: A visitor moves between pages

- **WHEN** a visitor goes from the landing page to the About page
- **THEN** the content starts and ends at the same horizontal position on both

#### Scenario: Prose line length

- **WHEN** a visitor reads a paragraph on a wide screen
- **THEN** the line holds to about 65 characters rather than running the width of the window

### Requirement: Motion is decoration and never blocks reading

The site SHALL keep every animation behind `prefers-reduced-motion: no-preference`, SHALL run nothing on first paint, and SHALL NOT make any content depend on an animation to become readable.

#### Scenario: A visitor who asked for reduced motion

- **WHEN** a visitor with that preference loads the page
- **THEN** every section is in its final position immediately and nothing animates

#### Scenario: A scroll reveal that never fires

- **WHEN** an animation fails to run for any reason
- **THEN** the content it would have revealed is still readable

### Requirement: Every control is reachable and named

The site SHALL make every control reachable by keyboard with a visible focus ring, SHALL give every image alt text, SHALL give every icon-only control an accessible name, and SHALL work down to a phone-width viewport without sideways scrolling.

#### Scenario: A keyboard visitor crosses the page

- **WHEN** a visitor tabs from the top of the page to the bottom
- **THEN** every control takes focus in the order it is read, each with a visible ring

#### Scenario: A narrow viewport

- **WHEN** the viewport is phone width
- **THEN** the page scrolls only downward
