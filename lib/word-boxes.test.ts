import { describe, expect, it } from "vitest";
import {
  bootWorker,
  groupWordsIntoLines,
  OCR_LONG_EDGE,
  ocrScaleFactor,
  readTextLines,
  scaleRect,
  scaleWordBoxes,
  type OcrBbox,
  type TesseractWorkerFactory,
  type WordBox,
} from "./word-boxes";
import type { OEM, Worker as TesseractWorker } from "tesseract.js";

/** One measured word, in the order a rectangle reads. */
function word(text: string, left: number, top: number, width = 60, height = 20): WordBox {
  return { text, rect: { left, top, width, height } };
}

describe("scaleRect", () => {
  it("multiplies every edge by the factor the pass downscaled with", () => {
    expect(scaleRect({ left: 100, top: 50, width: 80, height: 20 }, 1.5)).toEqual({
      left: 150,
      top: 75,
      width: 120,
      height: 30,
    });
  });

  it("leaves a box measured at the image's own size where it is", () => {
    const rect = { left: 7, top: 9, width: 11, height: 13 };
    expect(scaleRect(rect, 1)).toEqual(rect);
  });

  it("keeps the fractional pixels rather than rounding an edge", () => {
    expect(scaleRect({ left: 10, top: 10, width: 10, height: 10 }, 1.355)).toEqual({
      left: 13.55,
      top: 13.55,
      width: 13.55,
      height: 13.55,
    });
  });
});

describe("scaleWordBoxes", () => {
  it("scales every box and keeps the text the pass read", () => {
    const measured = [word("TOTAL", 10, 100), word("42.00", 200, 100)];

    expect(scaleWordBoxes(measured, 2)).toEqual([
      { text: "TOTAL", rect: { left: 20, top: 200, width: 120, height: 40 } },
      { text: "42.00", rect: { left: 400, top: 200, width: 120, height: 40 } },
    ]);
  });

  it("writes nothing back into the set it was given", () => {
    const measured = [word("TOTAL", 10, 100)];
    const before = JSON.stringify(measured);

    scaleWordBoxes(measured, 3);

    expect(JSON.stringify(measured)).toBe(before);
  });
});

describe("groupWordsIntoLines", () => {
  it("keeps a label and a far-right amount on one line rather than merging with the line above", () => {
    const lines = groupWordsIntoLines([
      word("SUBTOTAL", 10, 100),
      word("38.40", 420, 101),
      word("TOTAL", 10, 140),
      word("42.00", 420, 141),
    ]);

    expect(lines).toHaveLength(2);
    expect(lines[0].words.map((held) => held.text)).toEqual(["SUBTOTAL", "38.40"]);
    expect(lines[1].words.map((held) => held.text)).toEqual(["TOTAL", "42.00"]);
  });

  it("orders the words of a line from left to right whatever order they arrived in", () => {
    const lines = groupWordsIntoLines([word("42.00", 420, 141), word("TOTAL", 10, 140)]);

    expect(lines[0].words.map((held) => held.text)).toEqual(["TOTAL", "42.00"]);
  });

  it("orders the lines down the page whatever order they arrived in", () => {
    const lines = groupWordsIntoLines([
      word("TOTAL", 10, 300),
      word("PIER", 10, 40),
      word("SUBTOTAL", 10, 170),
    ]);

    expect(lines.map((line) => line.words[0].text)).toEqual(["PIER", "SUBTOTAL", "TOTAL"]);
  });

  it("joins two words the pass measured a pixel apart", () => {
    const lines = groupWordsIntoLines([word("CARD", 10, 200), word("4417", 300, 202)]);

    expect(lines).toHaveLength(1);
  });

  it("answers an empty set with no lines", () => {
    expect(groupWordsIntoLines([])).toEqual([]);
  });

  it("writes nothing back into the set it was given", () => {
    const measured = [word("42.00", 420, 141), word("TOTAL", 10, 140)];

    groupWordsIntoLines(measured);

    expect(measured.map((held) => held.text)).toEqual(["42.00", "TOTAL"]);
  });
});

/** One word as a recognize result reports it, with the bbox corners tesseract uses. */
function reported(text: string, x0: number, y0: number, x1 = x0 + 60, y1 = y0 + 20) {
  return { text, bbox: { x0, y0, x1, y1 } };
}

/** A recognize result carrying one block of one paragraph with the lines given. */
function page(lines: { text: string; bbox: OcrBbox }[][]) {
  return { blocks: [{ paragraphs: [{ lines: lines.map((words) => ({ words })) }] }] };
}

describe("ocrScaleFactor", () => {
  it("shrinks a phone photograph until its long edge reaches the cap", () => {
    expect(ocrScaleFactor(3000, 4000)).toBe(0.5);
  });

  it("reads the long edge whichever way the image is turned", () => {
    expect(ocrScaleFactor(4000, 3000)).toBe(0.5);
  });

  it("leaves an image whose long edge is exactly the cap alone", () => {
    expect(ocrScaleFactor(1200, OCR_LONG_EDGE)).toBe(1);
  });

  it("leaves an image under the cap alone rather than enlarging it", () => {
    expect(ocrScaleFactor(640, 480)).toBe(1);
  });

  it("answers a size it cannot read with 1 rather than a factor of nothing", () => {
    expect(ocrScaleFactor(Number.NaN, Number.NaN)).toBe(1);
  });
});

describe("readTextLines", () => {
  it("takes tesseract's own line grouping when the result carries one", () => {
    const lines = readTextLines(
      page([
        [reported("SUBTOTAL", 10, 100), reported("38.40", 420, 100)],
        [reported("TOTAL", 10, 140), reported("42.00", 420, 140)],
      ]),
    );

    expect(lines.map((line) => line.words.map((held) => held.text))).toEqual([
      ["SUBTOTAL", "38.40"],
      ["TOTAL", "42.00"],
    ]);
  });

  it("reads a bbox as a rectangle in the measured copy's pixels", () => {
    const lines = readTextLines(page([[reported("TOTAL", 10, 100, 90, 124)]]));

    expect(lines[0].words[0].rect).toEqual({ left: 10, top: 100, width: 80, height: 24 });
  });

  it("falls back to grouping the flat word list when the result carries no line structure", () => {
    const words = [
      reported("SUBTOTAL", 10, 100),
      reported("38.40", 420, 101),
      reported("TOTAL", 10, 140),
      reported("42.00", 420, 141),
    ];

    const lines = readTextLines({ blocks: null, words });

    expect(lines).toEqual(
      groupWordsIntoLines([
        word("SUBTOTAL", 10, 100),
        word("38.40", 420, 101),
        word("TOTAL", 10, 140),
        word("42.00", 420, 141),
      ]),
    );
    expect(lines.map((line) => line.words.map((held) => held.text))).toEqual([
      ["SUBTOTAL", "38.40"],
      ["TOTAL", "42.00"],
    ]);
  });

  it("falls back when the blocks are there but every line inside them is empty", () => {
    const lines = readTextLines({
      blocks: [{ paragraphs: [{ lines: [{ words: [] }, { words: [] }] }] }],
      words: [reported("TOTAL", 10, 140), reported("42.00", 420, 141)],
    });

    expect(lines.map((line) => line.words.map((held) => held.text))).toEqual([
      ["TOTAL", "42.00"],
    ]);
  });

  it("drops a word whose text is empty or whitespace", () => {
    const lines = readTextLines(
      page([[reported("TOTAL", 10, 140), reported("  ", 200, 140), reported("", 300, 140)]]),
    );

    expect(lines.map((line) => line.words.map((held) => held.text))).toEqual([["TOTAL"]]);
  });

  it("drops a word the pass gave no bounding box for", () => {
    const lines = readTextLines({
      blocks: [
        {
          paragraphs: [
            { lines: [{ words: [{ text: "TOTAL" }, reported("42.00", 420, 140)] }] },
          ],
        },
      ],
    });

    expect(lines.map((line) => line.words.map((held) => held.text))).toEqual([["42.00"]]);
  });

  it("drops a word whose box has no area, which the overlay could not show", () => {
    const lines = readTextLines(
      page([[reported("TOTAL", 10, 140, 10, 160), reported("42.00", 420, 140)]]),
    );

    expect(lines.map((line) => line.words.map((held) => held.text))).toEqual([["42.00"]]);
  });

  it("answers a result with nothing in it with no lines", () => {
    expect(readTextLines({ blocks: null })).toEqual([]);
  });

  it("trims the text it keeps, so the matcher scores the characters alone", () => {
    const lines = readTextLines(page([[reported(" TOTAL ", 10, 140)]]));

    expect(lines[0].words[0].text).toBe("TOTAL");
  });
});

/**
 * The engine mode and the worker handle the pass asks tesseract for, as the
 * suite needs them.
 *
 * Nothing here boots a worker: a Node environment has no `Worker`, no wasm and
 * no `fetch` for the language data, so the stand-in below answers for the
 * library and the test watches what `bootWorker` does with the options it was
 * handed.
 */
const LSTM_ONLY = 1 as OEM;

const handle = { id: "Worker-0" } as unknown as TesseractWorker;

describe("bootWorker", () => {
  it("hands back the worker tesseract booted", async () => {
    const createWorker: TesseractWorkerFactory = async () => handle;

    await expect(bootWorker(createWorker, LSTM_ONLY)).resolves.toBe(handle);
  });

  it("rejects when a job fails while tesseract's own promise stays pending", async () => {
    /*
     * This is the shape of the failure the browser showed: the language data
     * does not arrive, tesseract reports it through `errorHandler`, and the
     * promise it returned never settles.
     */
    const createWorker: TesseractWorkerFactory = (_langs, _oem, options) => {
      options.errorHandler?.("TypeError: Failed to fetch");

      return new Promise(() => undefined);
    };

    await expect(bootWorker(createWorker, LSTM_ONLY)).rejects.toThrow(/Failed to fetch/);
  });

  it("carries the message tesseract reported rather than a deadline of its own", async () => {
    const createWorker: TesseractWorkerFactory = (_langs, _oem, options) => {
      options.errorHandler?.("Error: wasm core missing");

      return new Promise(() => undefined);
    };

    await expect(bootWorker(createWorker, LSTM_ONLY)).rejects.toThrow(
      "tesseract.js could not start its worker: Error: wasm core missing",
    );
  });

  it("keeps the booted worker when a later job fails", async () => {
    let report: ((error: unknown) => void) | undefined;

    const createWorker: TesseractWorkerFactory = async (_langs, _oem, options) => {
      report = options.errorHandler;

      return handle;
    };

    const booted = await bootWorker(createWorker, LSTM_ONLY);

    report?.("TypeError: Failed to fetch");

    expect(booted).toBe(handle);
  });

  it("points the worker at the files this repo serves rather than at a CDN", async () => {
    let seen: Record<string, unknown> = {};

    const createWorker: TesseractWorkerFactory = async (langs, oem, options) => {
      seen = { langs, oem, ...options };

      return handle;
    };

    await bootWorker(createWorker, LSTM_ONLY);

    expect(seen.langs).toBe("eng");
    expect(seen.oem).toBe(LSTM_ONLY);
    expect(seen.workerPath).toBe("/tesseract/worker.min.js");
    expect(seen.corePath).toBe("/tesseract");
    expect(seen.langPath).toBe("/tesseract");
    expect(seen.cacheMethod).toBe("none");
    expect(seen.workerBlobURL).toBe(false);
    expect(seen.gzip).toBe(true);
    expect(typeof seen.errorHandler).toBe("function");
  });
});
