# Spec Delta

## MODIFIED Requirements

### Requirement: PDF word boxes come from the pdf.js text layer

For an uploaded `application/pdf` file, the app SHALL read word boxes from the first page's pdf.js text layer. When that page yields no extractable text, the app SHALL rasterize it and run the same OCR pass it runs on an uploaded image, rather than showing no highlights at all.

#### Scenario: A PDF invoice with a text layer

- **WHEN** a visitor uploads a PDF whose first page carries a text layer
- **THEN** the app takes word boxes from that text layer without an OCR pass

#### Scenario: A PDF with no extractable text layer

- **WHEN** the first page of an uploaded PDF yields no extractable text
- **THEN** the app rasterizes that page and measures it with the OCR pass, so a scanned invoice gets the same highlights a photograph gets

#### Scenario: A page whose text layer holds only a few words

- **WHEN** the first page's text layer yields some text but not enough to match the fields against
- **THEN** the app takes the text layer it found and runs no OCR pass, because a partial text layer is a partial answer rather than a failure

#### Scenario: The OCR fallback fails too

- **WHEN** the rasterized page produces no words either
- **THEN** the app shows no regions, says it could not measure the page, and leaves extraction, arithmetic, editing and export working

### Requirement: A region is expressed in the image's own pixels

The app SHALL hold each matched region in the pixel coordinates of the image the OCR pass measured, and SHALL scale it to the rendered size when it marks the document pane, so the mark stays on the same words as the pane changes width. For a PDF, those coordinates SHALL be the pixels of the rasterized page the document pane shows, whether the boxes came from the text layer or from the OCR pass.

#### Scenario: The visitor narrows the window

- **WHEN** the document pane renders the image smaller than its own pixel size
- **THEN** the marked region covers the same printed words it covered before

#### Scenario: A rotated or resized image is never remeasured

- **WHEN** the pane re-renders the same image at a new size
- **THEN** the app rescales the regions it already holds and runs no second OCR pass

#### Scenario: Text layer coordinates reach the same basis

- **WHEN** word boxes come from a pdf.js text layer, whose own units are not pixels
- **THEN** the app converts them to the pixels of the rasterized page before it holds them, so one basis serves every source of boxes
