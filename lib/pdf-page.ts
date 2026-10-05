/**
 * Reads the first page of a PDF the visitor chose: a PNG of that page, how many
 * pages the document holds, and the word boxes of its text layer.
 *
 * One call opens the document once and answers all three. The page count, the
 * rasterized bitmap and the text layer are three questions about the same first
 * page, and opening the file twice to answer two of them would parse the bytes
 * twice and risk the two answers describing different renders of the page.
 *
 * The rasterize is what makes the rest of the app need no PDF special case. The
 * workspace hands the same bitmap to the preview, to the extraction request and
 * to the OCR pass, so every rectangle the app holds sits in the pixels of the
 * image the visitor is looking at, whether the boxes came from this text layer
 * or from tesseract. `Measurement` comes back in the shape `createOcrPass`
 * returns for exactly that reason, and `lib/highlight-match.ts` never learns
 * which source produced the words it scores.
 *
 * The pure functions above `readFirstPage` carry every rule worth testing: the
 * scale the rasterize uses, the conversion from pdf.js text coordinates into
 * page pixels, the split of a multi-word item, and the decision that a page
 * yielded no usable text. The suite runs in a Node environment with no canvas
 * and no worker, so `readFirstPage` itself is exercised in the running app and
 * everything it decides lives in a function the suite can call directly.
 *
 * pdf.js reaches this module through a dynamic `import("pdfjs-dist")` inside the
 * call, and every browser global it touches is read inside the call too, so a
 * server render of the component that imports this module pulls in neither the
 * library nor its worker.
 */

import type { PDFPageProxy } from "pdfjs-dist";
import {
  groupWordsIntoLines,
  OCR_LONG_EDGE,
  type Measurement,
  type Rect,
  type TextLine,
  type WordBox,
} from "./word-boxes";

/** Where the browser fetches the pdf.js worker from. */
const WORKER_SRC = "/pdfjs/pdf.worker.min.mjs";

/**
 * How far the rasterize magnifies the page's own CSS size.
 *
 * A PDF page at scale 1 is 72 dots per inch, which is too coarse for the model
 * to read small print off and too coarse for tesseract on a scanned page.
 * Doubling it gives roughly 144 dots per inch, which reads a receipt's body text
 * comfortably and still produces a request body the route can take.
 */
export const PDF_RASTER_SCALE = 2;

/**
 * The scale the rasterize actually uses, given the page's size at scale 1.
 *
 * `PDF_RASTER_SCALE` is the scale a normal page gets. A large page is pulled
 * back so its long edge lands on `OCR_LONG_EDGE`, the same 2000 pixels the OCR
 * pass already downscales an image to. One number serves both caps because the
 * rasterized page is the image the OCR pass measures when the text layer yields
 * nothing: rasterizing past that edge would hand tesseract pixels it would
 * immediately throw away, and it would grow the request body for nothing.
 *
 * A page already so large that scale 1 overshoots the cap comes back below 1,
 * which is the right answer rather than an edge case: the cap is what the model
 * and tesseract both read, and the page's own dots per inch does not change it.
 */
export function pdfRasterScale(pageWidth: number, pageHeight: number): number {
  const longEdge = Math.max(pageWidth, pageHeight);

  if (!Number.isFinite(longEdge) || longEdge <= 0) {
    return PDF_RASTER_SCALE;
  }

  return Math.min(PDF_RASTER_SCALE, OCR_LONG_EDGE / longEdge);
}

/** Why the app could not read a page out of the file the visitor chose. */
export type PdfFailureReason = "unreadable" | "no_page" | "protected";

/**
 * The one error this module throws, carrying the reason the workspace words.
 *
 * No raw pdf.js error reaches the caller. The library throws its own exception
 * types from inside a worker, reconstructs them on the main thread by name, and
 * their messages name internal structures a visitor cannot act on, so the module
 * classifies the failure here and the workspace reads one of three reasons.
 */
export class PdfPageError extends Error {
  readonly reason: PdfFailureReason;

  constructor(reason: PdfFailureReason, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PdfPageError";
    this.reason = reason;
  }
}

/**
 * Reads a failed document open as one of the two reasons an open can fail.
 *
 * pdf.js sets `name` on every exception it throws and preserves that name when
 * it rebuilds the error on the main thread from the worker's reply, which makes
 * the name the one part of the error shape safe to branch on. A password-
 * protected file arrives as `PasswordException`; the module takes everything
 * else as a file it could not read, because a visitor can do nothing different
 * about a corrupt file than about one pdf.js rejects for any other reason.
 */
export function pdfOpenFailureReason(cause: unknown): PdfFailureReason {
  const name =
    typeof cause === "object" && cause !== null && "name" in cause
      ? String((cause as { name?: unknown }).name)
      : "";

  return name === "PasswordException" ? "protected" : "unreadable";
}

/** What `getDocument` is handed, which is the file's bytes and the worker path. */
export type PdfDocumentSource = {
  readonly data: Uint8Array;
};

/**
 * The parts of a loaded pdf.js document this module reads.
 *
 * The shape is structural and generic over the page, so the real
 * `PDFDocumentProxy` satisfies it and so does a hand-written object in a test.
 * That is what puts the three failure reasons under test in a Node environment,
 * where no worker boots and no canvas exists.
 */
export type PdfDocumentShape<TPage> = {
  readonly numPages: number;
  getPage(pageNumber: number): Promise<TPage>;
  destroy?(): Promise<void>;
};

/** The one pdf.js entry point this module calls. */
export type PdfLibraryShape<TPage> = {
  getDocument(source: PdfDocumentSource): { readonly promise: Promise<PdfDocumentShape<TPage>> };
};

/** A loaded document and its first page, held together so neither is reopened. */
export type PdfFirstPageHandle<TPage> = {
  readonly document: PdfDocumentShape<TPage>;
  readonly page: TPage;
};

/**
 * Opens the document and claims its first page, or throws `PdfPageError`.
 *
 * Three failures end here rather than reaching the caller. A file pdf.js refuses
 * to open is `unreadable`, a password-protected one is `protected`, and a
 * document that reports no pages or hands back nothing for page one is
 * `no_page`. A document that opened is destroyed before the `no_page` throw,
 * because the caller gets no handle to destroy it with.
 */
export async function openFirstPage<TPage>(
  library: PdfLibraryShape<TPage>,
  source: PdfDocumentSource,
): Promise<PdfFirstPageHandle<TPage>> {
  let document: PdfDocumentShape<TPage>;

  try {
    document = await library.getDocument(source).promise;
  } catch (cause) {
    const reason = pdfOpenFailureReason(cause);

    throw new PdfPageError(
      reason,
      reason === "protected"
        ? "that PDF is password-protected, so the app could not open it"
        : "the app could not read that PDF",
      { cause },
    );
  }

  try {
    if (!Number.isFinite(document.numPages) || document.numPages < 1) {
      throw new PdfPageError("no_page", "that PDF carries no page the app can read");
    }

    const page = await document.getPage(1);

    if (!page) {
      throw new PdfPageError("no_page", "that PDF carries no page the app can read");
    }

    return { document, page };
  } catch (cause) {
    await closeDocument(document);

    if (cause instanceof PdfPageError) {
      throw cause;
    }

    /* A `getPage` that throws is a first page pdf.js has, and cannot parse. The
     * visitor is in the same position either way: there is no page to read. */
    throw new PdfPageError("no_page", "that PDF carries no page the app can read", { cause });
  }
}

/** Releases a document and its worker, swallowing a teardown failure. */
async function closeDocument<TPage>(document: PdfDocumentShape<TPage>): Promise<void> {
  try {
    await document.destroy?.();
  } catch {
    /* The page is already read or already lost. A failed teardown changes
     * neither answer, and reporting it would replace the real reason. */
  }
}

/**
 * The basis a text item is converted against, taken off the viewport the
 * rasterize rendered through.
 *
 * `transform` is the viewport's own matrix, in pdf.js order `[a, b, c, d, e, f]`.
 * Reading it rather than rebuilding it from a scale and a height is what carries
 * the page's rotation and a viewBox whose origin is not zero, both of which a
 * scanned invoice can have.
 */
export type PdfViewportBasis = {
  readonly scale: number;
  readonly transform: readonly number[];
};

/**
 * The parts of one pdf.js text item this module reads.
 *
 * `type` is here because pdf.js interleaves marked-content markers into the same
 * `items` array as the text, and a marker carries a `type` and nothing else.
 * Naming it keeps the real `TextContent` assignable to the shape below, and a
 * marker falls out of the reader anyway on the `str` check.
 */
export type PdfTextItemShape = {
  readonly str?: string | null;
  readonly transform?: readonly number[] | null;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly type?: string | null;
};

/** The parts of a `getTextContent()` result this module reads. */
export type PdfTextContentShape = {
  readonly items?: readonly PdfTextItemShape[] | null;
};

/** Multiplies two pdf.js matrices, which is how a text item reaches page pixels. */
function multiply(left: readonly number[], right: readonly number[]): number[] {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

/** The axis-aligned box around four points. */
function boundingRect(points: readonly (readonly [number, number])[]): Rect {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);

  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}

/**
 * One word of a text item, as a rectangle in the rasterized page's pixels.
 *
 * pdf.js reports a text item in PDF user space, whose origin sits at the bottom
 * left of the page and whose y axis climbs, while the rasterized bitmap counts
 * down from its top left. The viewport's matrix is where that flip lives: its
 * `d` term is negative and its `f` term carries the page height, so multiplying
 * the item's own matrix through it lands the text baseline on a pixel row. The
 * module does the multiplication itself rather than asking the viewport to
 * convert a point, so the flip is this module's arithmetic and the suite pins it.
 *
 * The item's matrix places the left end of its baseline. The box runs from there
 * along the baseline for `width` user units times the viewport scale, and rises
 * one font height above it. The height is the glyph scale pdf.js reports rather
 * than a measured ink extent, so a descender hangs a pixel or two below the box.
 * The matcher reads the text and never the geometry, and the overlay marks a
 * region rather than tracing a letter, so neither cares.
 */
function wordRect(
  item: PdfTextItemShape,
  basis: PdfViewportBasis,
  startFraction: number,
  endFraction: number,
): Rect | null {
  const transform = item.transform;

  if (!transform || transform.length < 6 || !transform.every(Number.isFinite)) {
    return null;
  }

  if (basis.transform.length < 6 || !basis.transform.every(Number.isFinite)) {
    return null;
  }

  const combined = multiply(basis.transform, transform);
  const angle = Math.atan2(combined[1], combined[0]);
  const fontHeight = Math.hypot(combined[2], combined[3]);
  const userWidth = typeof item.width === "number" && Number.isFinite(item.width) ? item.width : 0;
  const runWidth = userWidth * basis.scale;

  const alongX = Math.cos(angle);
  const alongY = Math.sin(angle);
  const startX = combined[4] + runWidth * startFraction * alongX;
  const startY = combined[5] + runWidth * startFraction * alongY;
  const endX = combined[4] + runWidth * endFraction * alongX;
  const endY = combined[5] + runWidth * endFraction * alongY;

  /* The ascent direction is the baseline turned a quarter turn, which in pixels
   * counted downward points up the page. */
  const riseX = fontHeight * alongY;
  const riseY = -fontHeight * alongX;

  const rect = boundingRect([
    [startX, startY],
    [endX, endY],
    [startX + riseX, startY + riseY],
    [endX + riseX, endY + riseY],
  ]);

  return rect.width > 0 && rect.height > 0 ? rect : null;
}

/**
 * Splits one text item into the words the matcher scores, each with its own box.
 *
 * A single text item often holds a whole printed line, "SUBTOTAL 38.40" among
 * them, and the matcher scores runs of adjacent words. Handing it the item as one
 * box would make that line a single token, so a field whose `sourceText` is
 * "38.40" would either match the whole line or nothing, and the mark would cover
 * the label as well as the amount.
 *
 * The split is proportional to character count and therefore approximate: it
 * assumes every character in the item takes the same share of the item's width,
 * which is false for a proportional font. A receipt's text layer is usually
 * monospaced thermal output where the assumption holds exactly, and where it does
 * not the error is a few pixels inside a line the visitor is already looking at.
 * pdf.js offers no per-glyph advance to do better without re-running the font.
 */
export function textItemWordBoxes(
  item: PdfTextItemShape,
  basis: PdfViewportBasis,
): WordBox[] {
  const str = typeof item.str === "string" ? item.str : "";

  if (str.trim().length === 0) {
    return [];
  }

  const boxes: WordBox[] = [];
  const pattern = /\S+/g;
  let match = pattern.exec(str);

  while (match !== null) {
    const rect = wordRect(
      item,
      basis,
      match.index / str.length,
      (match.index + match[0].length) / str.length,
    );

    if (rect) {
      boxes.push({ text: match[0], rect });
    }

    match = pattern.exec(str);
  }

  return boxes;
}

/**
 * Reads a whole text layer into the text lines the matcher wants.
 *
 * The words go through `groupWordsIntoLines` from `lib/word-boxes.ts` rather than
 * through a grouping written here. pdf.js reports no line structure of its own,
 * only an `hasEOL` flag per item that a receipt's generator sets as it pleases,
 * and the rule the matcher needs is already written once: a label at the left
 * margin and its amount at the right belong to one line, so words group by
 * vertical midpoint and the horizontal gap between them is ignored.
 */
export function readTextLayer(
  content: PdfTextContentShape,
  basis: PdfViewportBasis,
): TextLine[] {
  const words = (content.items ?? []).flatMap((item) => textItemWordBoxes(item, basis));

  return groupWordsIntoLines(words);
}

/**
 * The measurement a text layer yields, or null when the page carries no usable
 * text at all.
 *
 * Null means the page gave nothing, which is the one case that sends the page to
 * the OCR pass. A thin layer is still an answer: six words with exact
 * coordinates are six real words, and the matcher already returns nothing rather
 * than something wrong for the fields those six do not cover. A word-count
 * threshold below which the app rasterized and OCR'd anyway would throw exact
 * coordinates away in favour of approximate ones, and it would need a number
 * nobody here can defend.
 */
export function textLayerMeasurement(
  content: PdfTextContentShape,
  basis: PdfViewportBasis,
  naturalWidth: number,
  naturalHeight: number,
): Measurement | null {
  const lines = readTextLayer(content, basis);

  return lines.length === 0 ? null : { lines, naturalWidth, naturalHeight };
}

/** The page's own pixel size is the basis every rectangle in `measurement` uses. */
export type PdfFirstPage = {
  /** The first page rasterized to a PNG. */
  image: Blob;
  naturalWidth: number;
  naturalHeight: number;
  /** How many pages the document holds, so the workspace can say it read one of four. */
  pageCount: number;
  /** The text layer's word boxes, or null when the page yields no usable text. */
  measurement: Measurement | null;
};

/**
 * Writes a canvas out as a PNG.
 *
 * PNG rather than JPEG, because a scanned receipt's thin strokes are exactly what
 * the model and tesseract both have to read, and JPEG's ringing is worst against
 * a hard edge on a light ground. The file is larger, which is what the long-edge
 * cap above is holding down.
 */
function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new PdfPageError("unreadable", "the browser could not write that page out as an image"));
    }, "image/png");
  });
}

/**
 * Rasterizes the first page of a PDF and reads its text layer.
 *
 * The import and every browser global sit inside this call. The document is
 * opened once and destroyed before the call returns, because pdf.js holds a
 * worker per document and the workspace keeps the bitmap rather than the handle.
 */
export async function readFirstPage(file: File): Promise<PdfFirstPage> {
  const pdfjs = await import("pdfjs-dist");

  pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const library: PdfLibraryShape<PDFPageProxy> = {
    getDocument: (source) => pdfjs.getDocument({ data: source.data }),
  };

  const { document: pdf, page } = await openFirstPage(library, { data: bytes });

  try {
    const unscaled = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: pdfRasterScale(unscaled.width, unscaled.height) });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));

    const context = canvas.getContext("2d");

    if (!context) {
      throw new PdfPageError("unreadable", "the browser gave no 2d context to draw that page into");
    }

    /* A PDF page paints no background of its own, so a canvas left transparent
     * writes black text onto black once the PNG is flattened. */
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvas, viewport }).promise;

    const image = await canvasToPng(canvas);
    const content = await page.getTextContent();

    /*
     * The boxes land in the canvas the visitor sees rather than in the
     * viewport's fractional size. The canvas holds whole pixels, so its size is
     * a rounding of the viewport's and the two differ by under a pixel, which is
     * well inside the width of the mark the overlay draws.
     */
    const measurement = textLayerMeasurement(
      content,
      { scale: viewport.scale, transform: viewport.transform },
      canvas.width,
      canvas.height,
    );

    return {
      image,
      naturalWidth: canvas.width,
      naturalHeight: canvas.height,
      pageCount: pdf.numPages,
      measurement,
    };
  } catch (cause) {
    if (cause instanceof PdfPageError) {
      throw cause;
    }

    /* A page that opened and then failed to render is a page the app could not
     * read, and the visitor's next move is the same one. */
    throw new PdfPageError("no_page", "the app could not read the first page of that PDF", {
      cause,
    });
  } finally {
    await closeDocument(pdf);
  }
}
