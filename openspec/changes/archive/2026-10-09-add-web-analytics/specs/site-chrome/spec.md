# Spec Delta

## ADDED Requirements

### Requirement: Page views are counted on the production deployment alone

The site SHALL count page views with the host's own analytics on every route of the production deployment, and SHALL count nothing on a preview deployment, a local build or a development server.

#### Scenario: A visitor on the production site

- **WHEN** a visitor opens any page of the production deployment
- **THEN** the page loads the host's analytics script and the visit is counted as a page view

#### Scenario: A preview deployment

- **WHEN** someone opens a preview deployment built from a branch or a pull request
- **THEN** the page loads no analytics script and nothing is counted, even though the preview was built for production

#### Scenario: A local run

- **WHEN** a developer runs the app with `next dev`, or builds and starts it on their own machine
- **THEN** the page loads no analytics script and sends nothing to the host

### Requirement: A page view carries no receipt, and the site says what it carries

The page-view count SHALL set no cookie and SHALL carry no receipt: no upload, no extracted field and no edit reaches a URL, so no page view can record one. The About page and the README SHALL say that the host counts page views and what a page view carries, so neither document claims the server holds less than it does.

#### Scenario: A visitor extracts a receipt

- **WHEN** a visitor uploads a receipt, corrects a field and exports the result on the production site
- **THEN** no page view records the file, a field value or an edit, and no cookie is set

#### Scenario: A visitor reads what the site keeps

- **WHEN** a visitor reads the About page or the README on what is kept
- **THEN** each says that the host counts page views without a cookie and that a page view carries no receipt, beside the rate-limit counter both already name
