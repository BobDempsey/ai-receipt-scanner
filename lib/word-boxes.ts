/**
 * What a measured word is, and the two pure steps the browser pass needs.
 *
 * The OCR pass runs in the visitor's browser against a downscaled copy of the
 * image, so every box it reports sits in the coordinates of that copy rather
 * than of the file the visitor chose. Everything downstream, the overlay above
 * all, reads a region in the image's own natural pixels, so the pass multiplies
 * each box back by the scale factor it used before it hands anything on. That
 * multiplication is `scaleRect`, and it lives here as a pure function because
 * the suite runs in a Node environment and cannot drive the pass itself.
 *
 * A word alone is not enough to generate candidates from. A receipt prints a
 * label and its amount on one line with a wide gap between them, and the matcher
 * may not join words across two printed lines, so words arrive grouped into text
 * lines. tesseract reports that grouping itself; `groupWordsIntoLines` is the
 * fallback for output that carries none.
 *
 * The helpers above `OCR_LONG_EDGE` touch no browser API and import nothing, so
 * the suite covers them directly. The measuring pass below them is the one part
 * that needs a browser: it reaches tesseract.js through a dynamic import inside
 * the call, so a server render of the component that imports this module pulls
 * in neither the library nor its wasm.
 */

import type { OEM, Worker as TesseractWorker, WorkerOptions } from "tesseract.js";

/** A rectangle in pixels, with its origin at the top left of the image. */
export type Rect = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
};

/** One word the OCR pass read, and where it sits. */
export type WordBox = {
  /** The characters the pass read, exactly as it read them. */
  readonly text: string;
  readonly rect: Rect;
};

/**
 * The words of one printed line, in the order they appear from left to right.
 *
 * The matcher takes its candidate runs from inside one of these and never across
 * two, which is what keeps a region off the line above.
 */
export type TextLine = {
  readonly words: readonly WordBox[];
};

/** Multiplies a measured rectangle back into the image's natural pixels. */
export function scaleRect(rect: Rect, factor: number): Rect {
  return {
    left: rect.left * factor,
    top: rect.top * factor,
    width: rect.width * factor,
    height: rect.height * factor,
  };
}

/**
 * Multiplies a whole measured set back into natural pixels.
 *
 * The values stay fractional. Rounding a box to whole pixels would move its edge
 * by up to half a pixel for no gain, since the overlay writes its position as a
 * percentage of the natural size and the matcher reads no coordinate at all.
 */
export function scaleWordBoxes(words: readonly WordBox[], factor: number): WordBox[] {
  return words.map((word) => ({ text: word.text, rect: scaleRect(word.rect, factor) }));
}

/** The vertical centre of a box, which is what the fallback groups on. */
function midpoint(rect: Rect): number {
  return rect.top + rect.height / 2;
}

/** The middle word height of a set, averaging the two middle values on an even count. */
function medianHeight(words: readonly WordBox[]): number {
  const heights = words.map((word) => word.rect.height).sort((a, b) => a - b);
  const middle = Math.floor(heights.length / 2);
  return heights.length % 2 === 1
    ? heights[middle]
    : (heights[middle - 1] + heights[middle]) / 2;
}

/**
 * Groups loose words into text lines by vertical midpoint, for output that
 * carries no line structure of its own.
 *
 * A word joins the open line when its midpoint sits within half a median word
 * height of that line's own midpoint, and opens a new line otherwise. Half a
 * word height is wide enough to hold a line whose words the pass measured a
 * pixel or two apart and narrow enough to refuse the line above, since printed
 * lines on a receipt sit more than a word height apart.
 *
 * The horizontal distance between two words is deliberately ignored. A receipt
 * prints "TOTAL" at the left margin and "42.00" at the right, and a grouping
 * that split on the gap between them would put the two halves of every money
 * line on separate lines, which is the one case this fallback exists to get
 * right.
 */
export function groupWordsIntoLines(words: readonly WordBox[]): TextLine[] {
  if (words.length === 0) {
    return [];
  }

  const tolerance = medianHeight(words) / 2;
  const ordered = [...words].sort((a, b) => midpoint(a.rect) - midpoint(b.rect));

  const lines: WordBox[][] = [];
  let open: WordBox[] = [ordered[0]];
  let openMidpoint = midpoint(ordered[0].rect);

  for (const word of ordered.slice(1)) {
    const centre = midpoint(word.rect);

    if (Math.abs(centre - openMidpoint) <= tolerance) {
      open.push(word);
      openMidpoint = open.reduce((total, held) => total + midpoint(held.rect), 0) / open.length;
      continue;
    }

    lines.push(open);
    open = [word];
    openMidpoint = centre;
  }

  lines.push(open);

  return lines.map((line) => ({
    words: [...line].sort((a, b) => a.rect.left - b.rect.left),
  }));
}

/**
 * The longest edge, in pixels, of the copy the OCR pass measures.
 *
 * A phone photograph of a receipt runs 3000 pixels or more on its long edge and
 * tesseract's cost climbs with the pixel count, so an unscaled pass can take
 * most of a minute. At 2000 pixels a receipt's body text still stands well above
 * the ten-pixel cap height tesseract needs. Slice 7 owns downscaling the upload
 * itself against Vercel's body cap; this constant is a separate scale chosen for
 * OCR speed and changes nothing about the bytes the model reads.
 */
export const OCR_LONG_EDGE = 2000;

/**
 * How far the pass shrinks an image before it measures it, as a multiplier at or
 * below 1.
 *
 * An image already inside the cap comes back 1, which tells the pass to hand the
 * file to tesseract untouched rather than resample it for nothing.
 */
export function ocrScaleFactor(naturalWidth: number, naturalHeight: number): number {
  const longEdge = Math.max(naturalWidth, naturalHeight);

  if (!Number.isFinite(longEdge) || longEdge <= OCR_LONG_EDGE) {
    return 1;
  }

  return OCR_LONG_EDGE / longEdge;
}

/**
 * The parts of a tesseract recognize result this module reads.
 *
 * These shapes are structural and every member is optional, so the real
 * `Tesseract.Page` satisfies them and so does a hand-written object in a test.
 * The suite runs in a Node environment and cannot boot the worker, so the reader
 * below is tested against objects of this shape rather than against tesseract.
 */
export type OcrBbox = {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
};

export type OcrWordShape = {
  readonly text?: string | null;
  readonly bbox?: OcrBbox | null;
};

export type OcrLineShape = {
  readonly words?: readonly OcrWordShape[] | null;
};

export type OcrParagraphShape = {
  readonly lines?: readonly OcrLineShape[] | null;
  readonly words?: readonly OcrWordShape[] | null;
};

export type OcrBlockShape = {
  readonly paragraphs?: readonly OcrParagraphShape[] | null;
  readonly lines?: readonly OcrLineShape[] | null;
  readonly words?: readonly OcrWordShape[] | null;
};

export type OcrPageShape = {
  readonly blocks?: readonly OcrBlockShape[] | null;
  readonly words?: readonly OcrWordShape[] | null;
};

/**
 * Turns one reported word into a box, or returns null for a word nothing
 * downstream can use.
 *
 * Two words are dropped here. One whose text is empty or whitespace carries
 * nothing for the matcher to score, and one tesseract gave no bounding box for
 * has no place on the image. A box of zero width or height goes too, because the
 * overlay would render it as an invisible mark and the visitor would read the
 * absence as a failed match.
 */
function toWordBox(word: OcrWordShape): WordBox | null {
  const text = typeof word.text === "string" ? word.text.trim() : "";

  if (text.length === 0 || !word.bbox) {
    return null;
  }

  const { x0, y0, x1, y1 } = word.bbox;

  if (![x0, y0, x1, y1].every((value) => Number.isFinite(value))) {
    return null;
  }

  const rect: Rect = { left: x0, top: y0, width: x1 - x0, height: y1 - y0 };

  return rect.width > 0 && rect.height > 0 ? { text, rect } : null;
}

/** The usable boxes of one reported word list, dropping the rest. */
function usableWords(words: readonly OcrWordShape[] | null | undefined): WordBox[] {
  return (words ?? [])
    .map(toWordBox)
    .filter((word): word is WordBox => word !== null);
}

/**
 * Every holder in the block tree that can carry a line's worth of words.
 *
 * tesseract nests blocks, paragraphs and lines, and only the innermost level
 * normally carries words. A block or a paragraph that carries them directly is
 * read as one line too, because a holder whose words the result lists together
 * is the closest thing to a printed line the output offers.
 */
function* lineHolders(page: OcrPageShape): Generator<OcrLineShape> {
  for (const block of page.blocks ?? []) {
    yield block;

    for (const paragraph of block.paragraphs ?? []) {
      yield paragraph;

      for (const line of paragraph.lines ?? []) {
        yield line;
      }
    }

    for (const line of block.lines ?? []) {
      yield line;
    }
  }
}

/**
 * Reads text lines out of a recognize result, in the measured copy's own pixels.
 *
 * tesseract reports its own line grouping and the matcher wants it, because a
 * receipt prints a label at the left margin and its amount at the right and a
 * grouping of the app's own devising pulls in the line above. The reader walks
 * the block tree and takes each line that still carries usable words.
 *
 * Where the output carries no line structure, the words it does carry go through
 * `groupWordsIntoLines`, so a missing structure degrades to a worse grouping
 * rather than to no highlights at all. That is the whole fallback: the reader
 * decides it here, and the browser pass never sees the difference.
 *
 * The rectangles come back exactly as tesseract measured them. The pass that
 * downscaled the image is what multiplies them into natural pixels.
 */
export function readTextLines(page: OcrPageShape): TextLine[] {
  const lines: TextLine[] = [];

  for (const holder of lineHolders(page)) {
    const words = usableWords(holder.words);

    if (words.length > 0) {
      lines.push({ words });
    }
  }

  if (lines.length > 0) {
    return lines;
  }

  return groupWordsIntoLines(usableWords(page.words));
}

/** What one finished pass hands the workspace. */
export type Measurement = {
  /** The text lines, every rectangle in the image's natural pixels. */
  lines: TextLine[];
  /** The image's own pixel size, which is the basis every rectangle is expressed in. */
  naturalWidth: number;
  naturalHeight: number;
};

/**
 * A measuring pass holding one tesseract worker.
 *
 * The caller creates a pass once, measures each file it chooses through the same
 * pass so the worker and its language data are paid for once, and terminates it
 * when the workspace unmounts.
 */
export type OcrPass = {
  measure(file: File): Promise<Measurement>;
  terminate(): Promise<void>;
};

/**
 * The one tesseract.js entry point this module calls.
 *
 * Naming it as a type lets `bootWorker` take the real `createWorker` in the
 * browser and a stand-in in the suite, which is what puts the boot-failure
 * wiring below under test in a Node environment.
 */
export type TesseractWorkerFactory = (
  langs: string,
  oem: OEM,
  options: Partial<WorkerOptions>,
) => Promise<TesseractWorker>;

/**
 * The options that point the worker at the files this repo serves from
 * `public/tesseract/`.
 *
 * `createWorker` otherwise fetches its worker script, its core and its language
 * data from a public CDN, which makes a portfolio demo depend at runtime on a
 * host nobody here controls. `corePath` names the directory rather than one file
 * because the worker picks one of the six cores by name against what the
 * visitor's browser supports, and `langPath` is the directory the worker appends
 * `eng.traineddata.gz` to.
 *
 * `cacheMethod: "none"` keeps the language data out of IndexedDB, because this
 * app stores nothing in the visitor's browser and 1.5 MB of model data is no
 * exception.
 */
const WORKER_OPTIONS: Partial<WorkerOptions> = {
  workerPath: "/tesseract/worker.min.js",
  corePath: "/tesseract",
  langPath: "/tesseract",
  gzip: true,
  cacheMethod: "none",
  workerBlobURL: false,
};

/**
 * Boots a worker and rejects when the boot fails, rather than waiting forever.
 *
 * tesseract.js hands back a promise that settles only two ways on its own: the
 * worker script itself fails to load, or the wasm core does. It runs the
 * language load in a chain it ends with an empty `catch`, so a browser that
 * cannot fetch `eng.traineddata.gz` leaves that promise pending for the life of
 * the page, the worker reports `Failed to fetch` to the console alone, and the
 * workspace reads "Measuring the image" until the visitor gives up.
 *
 * The library's own `errorHandler` option is the way out. tesseract calls it
 * with the message of every job it rejects, the language load included, so this
 * races the boot against a promise that handler rejects. That beats a boot
 * timeout, which would have to guess how long a slow phone is allowed to take
 * and would report a deadline rather than the failure the worker saw. A later
 * call for a failed recognition lands on an already-settled race and changes
 * nothing, and `recognize` rejects on its own anyway.
 *
 * The race abandons tesseract's own promise, so the thread of a half-booted
 * worker stays alive with no handle to stop it. One idle worker per failed boot
 * is the price of reporting the failure at all, and `claimWorker` boots at most
 * one per measure the visitor asks for.
 */
export function bootWorker(createWorker: TesseractWorkerFactory, oem: OEM): Promise<TesseractWorker> {
  let reportFailure: (reason: Error) => void = () => undefined;

  const bootFailed = new Promise<never>((_resolve, reject) => {
    reportFailure = reject;
  });

  const booting = createWorker("eng", oem, {
    ...WORKER_OPTIONS,
    errorHandler: (error: unknown) => {
      reportFailure(
        new Error(`tesseract.js could not start its worker: ${String(error)}`, { cause: error }),
      );
    },
  });

  return Promise.race([booting, bootFailed]);
}

/**
 * Boots a worker against the installed tesseract.js.
 *
 * The import sits inside this function so nothing server-rendered pulls
 * tesseract.js or its wasm into a bundle.
 */
async function startWorker(): Promise<TesseractWorker> {
  /*
   * tesseract.js ships CommonJS with no ESM build, so a bundler may hand the
   * dynamic import either the named exports or one `default` holding them. The
   * pass reads whichever arrived rather than betting on the interop.
   */
  const loaded = await import("tesseract.js");
  const { createWorker, OEM } = loaded.default ?? loaded;

  return bootWorker(createWorker, OEM.LSTM_ONLY);
}

/**
 * Creates the browser's OCR pass.
 *
 * Every browser global this uses, `createImageBitmap` and `OffscreenCanvas`
 * among them, is read inside `measure` rather than at module scope, so a server
 * render of the component that imports this module touches none of them.
 *
 * Two measures asked for at once are queued rather than raced. The pass holds
 * one worker and tesseract runs one recognition on it at a time, so running them
 * together would interleave two images on one engine. Abandoning the earlier
 * result was the alternative and it is wrong here: the visitor submits one file
 * at a time, so a second call means a second file that wants its own answer, and
 * a caller that no longer wants the first answer can drop the promise it holds.
 */
export function createOcrPass(): OcrPass {
  let worker: Promise<TesseractWorker> | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  /** Hands back the running worker, booting one on the first measure. */
  function claimWorker(): Promise<TesseractWorker> {
    const held = worker ?? startWorker();
    worker = held;

    /*
     * A boot that fails must not poison every later measure, so a rejected
     * promise is cleared and the next call boots again.
     */
    held.catch(() => {
      if (worker === held) {
        worker = null;
      }
    });

    return held;
  }

  /** Runs one file through the worker, downscaling it first when it is large. */
  async function run(file: File): Promise<Measurement> {
    const bitmap = await createImageBitmap(file);
    const naturalWidth = bitmap.width;
    const naturalHeight = bitmap.height;
    const factor = ocrScaleFactor(naturalWidth, naturalHeight);

    let image: Blob = file;
    let measuredWidth = naturalWidth;

    try {
      if (factor < 1) {
        measuredWidth = Math.max(1, Math.round(naturalWidth * factor));
        const measuredHeight = Math.max(1, Math.round(naturalHeight * factor));
        const canvas = new OffscreenCanvas(measuredWidth, measuredHeight);
        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("the browser gave no 2d context to downscale the image into");
        }

        context.drawImage(bitmap, 0, 0, measuredWidth, measuredHeight);
        image = await canvas.convertToBlob({ type: "image/png" });
      }
    } finally {
      bitmap.close();
    }

    const engine = await claimWorker();
    const { data } = await engine.recognize(image, {}, { blocks: true, text: false });

    /*
     * The canvas holds whole pixels, so the size it got is a rounding of the
     * requested one and the way back is the ratio of the two sizes rather than
     * `1 / factor`. On an image inside the cap both are 1 and no box is touched.
     */
    const back = naturalWidth / measuredWidth;
    const lines = readTextLines(data);

    return {
      lines:
        back === 1 ? lines : lines.map((line) => ({ words: scaleWordBoxes(line.words, back) })),
      naturalWidth,
      naturalHeight,
    };
  }

  return {
    measure(file) {
      const next = queue.then(
        () => run(file),
        () => run(file),
      );

      /* The chain carries the turn rather than the outcome, so one failed measure
       * does not reject the measure queued behind it. */
      queue = next.catch(() => undefined);

      return next;
    },

    async terminate() {
      const held = worker;
      worker = null;

      if (!held) {
        return;
      }

      /*
       * The handle is dropped before the worker is asked to stop, so a measure
       * that arrives during the teardown boots a fresh worker rather than
       * queueing behind a dying one. A measure already in flight loses its
       * engine and rejects, which is what the caller asked for by terminating.
       */
      const running = await held.catch(() => null);
      await running?.terminate();
    },
  };
}
