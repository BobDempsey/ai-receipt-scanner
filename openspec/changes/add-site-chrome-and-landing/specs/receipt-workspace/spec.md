# Spec Delta

## MODIFIED Requirements

### Requirement: The document sits on the left and the fields on the right

The workspace SHALL show the chosen document in a pane on the left at the full height of the workspace, and the extracted fields in a panel on the right, so a visitor checks a value against the printed receipt without scrolling between the two. The workspace sits inside the site's chrome as the hero of the page, so it SHALL share the site's content width and SHALL stay usable with the nav above it.

#### Scenario: A wide screen

- **WHEN** the viewport is wide enough for two panes
- **THEN** the document pane fills the left side at full height and the field panel sits to its right

#### Scenario: The document appears before the fields do

- **WHEN** the visitor submits a file and the extraction has not returned
- **THEN** the document pane already shows the image

#### Scenario: The workspace inside the page

- **WHEN** a visitor loads the landing page
- **THEN** the workspace starts and ends at the same horizontal position as the sections below it, and the nav covers none of it
