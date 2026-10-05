import { describe, expect, it, vi } from "vitest";
import {
  openFirstPage,
  PDF_RASTER_SCALE,
  PdfPageError,
  pdfOpenFailureReason,
  pdfRasterScale,
  readTextLayer,
  textItemWordBoxes,
  textLayerMeasurement,
  type PdfDocumentShape,
  type PdfFirstPage,
  type PdfLibraryShape,
  type PdfTextItemShape,
  type PdfViewportBasis,
} from "./pdf-page";
import { OCR_LONG_EDGE } from "./word-boxes";

/**
 * The viewport pdf.js builds for an unrotated page at a given scale.
 *
 * `d` is negative and `f` carries the scaled page height, which together are the
 * flip from PDF user space to the bitmap's rows. Every coordinate expectation
 * below is read off this basis.
 */
function basis(scale: number, pageHeight: number): PdfViewportBasis {
  return { scale, transform: [scale, 0, 0, -scale, 0, pageHeight * scale] };
}

/** One text item on an unrotated page, at a 12-unit font size. */
function item(str: string, x: number, y: number, width: number): PdfTextItemShape {
  return { str, transform: [12, 0, 0, 12, x, y], width, height: 12 };
}

describe("pdfRasterScale", () => {
  it("doubles a letter page, because 144 dots per inch fits inside the cap", () => {
    expect(pdfRasterScale(612, 792)).toBe(PDF_RASTER_SCALE);
    expect(PDF_RASTER_SCALE).toBe(2);
  });

  it("pulls a large page back so its long edge lands on the shared cap", () => {
    const scale = pdfRasterScale(1224, 1584);

    expect(scale).toBeCloseTo(OCR_LONG_EDGE / 1584, 10);
    expect(1584 * scale).toBeCloseTo(OCR_LONG_EDGE, 6);
  });

  it("still doubles a page whose doubled long edge is exactly the cap", () => {
    expect(pdfRasterScale(700, OCR_LONG_EDGE / PDF_RASTER_SCALE)).toBe(PDF_RASTER_SCALE);
  });

  it("goes below 1 for a page already past the cap at its own size", () => {
    expect(pdfRasterScale(2400, 1000)).toBeCloseTo(OCR_LONG_EDGE / 2400, 10);
  });

  it("falls back to the plain scale for a page of no reported size", () => {
    expect(pdfRasterScale(0, 0)).toBe(PDF_RASTER_SCALE);
    expect(pdfRasterScale(Number.NaN, Number.NaN)).toBe(PDF_RASTER_SCALE);
  });
});

describe("textItemWordBoxes", () => {
  it("flips the vertical axis, landing a known item on a known pixel rectangle", () => {
    /* y 700 on a 792-unit page sits 92 units from the top, which is 184 pixels
     * at scale 2, and the box rises one 24-pixel font height above that. */
    const boxes = textItemWordBoxes(item("TOTAL", 72, 700, 36), basis(2, 792));

    expect(boxes).toEqual([
      { text: "TOTAL", rect: { left: 144, top: 160, width: 72, height: 24 } },
    ]);
  });

  it("splits a multi-word item, giving each word its share of the item's width", () => {
    const boxes = textItemWordBoxes(item("SUBTOTAL 38.40", 72, 600, 98), basis(2, 792));

    expect(boxes).toEqual([
      { text: "SUBTOTAL", rect: { left: 144, top: 360, width: 112, height: 24 } },
      { text: "38.40", rect: { left: 270, top: 360, width: 70, height: 24 } },
    ]);
  });

  it("drops an item carrying nothing but whitespace", () => {
    expect(textItemWordBoxes(item("   ", 72, 600, 20), basis(2, 792))).toEqual([]);
  });

  it("drops an item of no width, which the overlay would mark invisibly", () => {
    expect(textItemWordBoxes(item("TOTAL", 72, 600, 0), basis(2, 792))).toEqual([]);
  });

  it("drops an item whose transform pdf.js did not report", () => {
    expect(textItemWordBoxes({ str: "TOTAL", width: 36 }, basis(2, 792))).toEqual([]);
  });

  it("bounds a quarter-turned run rather than reporting a negative width", () => {
    const rotated: PdfTextItemShape = { str: "TOTAL", transform: [0, 12, -12, 0, 72, 700], width: 36 };
    const [box] = textItemWordBoxes(rotated, basis(2, 792));

    expect(box.rect.width).toBeGreaterThan(0);
    expect(box.rect.height).toBeGreaterThan(0);
  });
});

describe("readTextLayer", () => {
  it("keeps a label and a far-right amount on one line", () => {
    const lines = readTextLayer(
      {
        items: [
          item("SUBTOTAL", 72, 600, 48),
          item("38.40", 480, 600, 30),
          item("TOTAL", 72, 570, 30),
          item("42.00", 480, 570, 30),
        ],
      },
      basis(2, 792),
    );

    expect(lines).toHaveLength(2);
    expect(lines[0].words.map((word) => word.text)).toEqual(["SUBTOTAL", "38.40"]);
    expect(lines[1].words.map((word) => word.text)).toEqual(["TOTAL", "42.00"]);
  });

  it("reads the words of one item into the same line as its neighbours", () => {
    const lines = readTextLayer({ items: [item("TOTAL 42.00", 72, 700, 80)] }, basis(2, 792));

    expect(lines).toHaveLength(1);
    expect(lines[0].words.map((word) => word.text)).toEqual(["TOTAL", "42.00"]);
  });

  it("returns nothing for a page whose text layer carries no items", () => {
    expect(readTextLayer({ items: [] }, basis(2, 792))).toEqual([]);
    expect(readTextLayer({}, basis(2, 792))).toEqual([]);
  });
});

describe("textLayerMeasurement", () => {
  it("answers null for an empty text layer, which is what sends the page to OCR", () => {
    expect(textLayerMeasurement({ items: [] }, basis(2, 792), 1224, 1584)).toBeNull();
  });

  it("answers null for a layer holding only items with no readable text", () => {
    expect(
      textLayerMeasurement({ items: [item(" ", 72, 700, 10)] }, basis(2, 792), 1224, 1584),
    ).toBeNull();
  });

  it("answers a measurement for a thin layer of six words rather than null", () => {
    const measurement = textLayerMeasurement(
      {
        items: [
          item("HARBOUR STREET GROCERS", 72, 740, 150),
          item("TOTAL", 72, 700, 36),
          item("42.00", 480, 700, 30),
          item("VISA", 72, 660, 24),
        ],
      },
      basis(2, 792),
      1224,
      1584,
    );

    expect(measurement).not.toBeNull();
    expect(measurement?.lines.flatMap((line) => line.words)).toHaveLength(6);
  });

  it("carries the rasterized page's pixel size as the basis of every rectangle", () => {
    const measurement = textLayerMeasurement(
      { items: [item("TOTAL", 72, 700, 36)] },
      basis(2, 792),
      1224,
      1584,
    );

    expect(measurement?.naturalWidth).toBe(1224);
    expect(measurement?.naturalHeight).toBe(1584);
  });
});

describe("pdfOpenFailureReason", () => {
  it("reads pdf.js's own PasswordException as a protected file", () => {
    const thrown = new Error("No password given");
    thrown.name = "PasswordException";

    expect(pdfOpenFailureReason(thrown)).toBe("protected");
  });

  it("reads every other failed open as a file it could not read", () => {
    expect(pdfOpenFailureReason(new Error("Invalid PDF structure"))).toBe("unreadable");
    expect(pdfOpenFailureReason("broken")).toBe("unreadable");
    expect(pdfOpenFailureReason(null)).toBe("unreadable");
  });
});

/** A stand-in for the one pdf.js call this module makes. */
function standIn(document: PdfDocumentShape<string> | Error): PdfLibraryShape<string> {
  return {
    getDocument: () => ({
      promise:
        document instanceof Error ? Promise.reject(document) : Promise.resolve(document),
    }),
  };
}

/** The bytes a stand-in never reads. */
const SOURCE = { data: new Uint8Array([1, 2, 3]) };

describe("openFirstPage", () => {
  it("hands back the document and its first page, opening the file once", async () => {
    const getDocument = vi.fn(() => ({
      promise: Promise.resolve({ numPages: 4, getPage: async () => "page one" }),
    }));

    const handle = await openFirstPage({ getDocument }, SOURCE);

    expect(handle.page).toBe("page one");
    expect(handle.document.numPages).toBe(4);
    expect(getDocument).toHaveBeenCalledTimes(1);
  });

  it("refuses a file pdf.js cannot open as unreadable", async () => {
    const failure = await openFirstPage(
      standIn(new Error("Invalid PDF structure")),
      SOURCE,
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(PdfPageError);
    expect((failure as PdfPageError).reason).toBe("unreadable");
  });

  it("refuses a password-protected file as protected", async () => {
    const locked = new Error("No password given");
    locked.name = "PasswordException";

    const failure = await openFirstPage(standIn(locked), SOURCE).catch(
      (error: unknown) => error,
    );

    expect((failure as PdfPageError).reason).toBe("protected");
    expect((failure as PdfPageError).message).toContain("password");
  });

  it("refuses a document reporting no pages at all", async () => {
    const destroy = vi.fn(async () => undefined);

    const failure = await openFirstPage(
      standIn({ numPages: 0, getPage: async () => "page one", destroy }),
      SOURCE,
    ).catch((error: unknown) => error);

    expect((failure as PdfPageError).reason).toBe("no_page");
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("refuses a document whose first page pdf.js cannot parse", async () => {
    const failure = await openFirstPage(
      standIn({
        numPages: 1,
        getPage: async () => {
          throw new Error("Page is not available");
        },
      }),
      SOURCE,
    ).catch((error: unknown) => error);

    expect((failure as PdfPageError).reason).toBe("no_page");
  });

  it("carries the library's error as the cause rather than letting it reach the caller", async () => {
    const cause = new Error("Invalid PDF structure");
    const failure = await openFirstPage(standIn(cause), SOURCE).catch(
      (error: unknown) => error,
    );

    expect(failure).not.toBe(cause);
    expect((failure as PdfPageError).cause).toBe(cause);
  });
});

describe("the shape readFirstPage answers with", () => {
  it("names the bitmap, its pixel size, the page count and the measurement", () => {
    const answer: PdfFirstPage = {
      image: new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }),
      naturalWidth: 1224,
      naturalHeight: 1584,
      pageCount: 4,
      measurement: textLayerMeasurement(
        { items: [item("TOTAL", 72, 700, 36)] },
        basis(2, 792),
        1224,
        1584,
      ),
    };

    expect(Object.keys(answer).sort()).toEqual([
      "image",
      "measurement",
      "naturalHeight",
      "naturalWidth",
      "pageCount",
    ]);
    expect(answer.image.type).toBe("image/png");
    expect(answer.measurement?.lines[0].words[0].text).toBe("TOTAL");
  });
});
