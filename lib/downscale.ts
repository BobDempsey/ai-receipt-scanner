/**
 * Fitting an image into the request body the platform will actually carry.
 *
 * The file cap the app tells a visitor about is 8 MB, and Vercel caps a
 * serverless request body well below that, so an ordinary phone photograph is
 * inside the cap the page names and outside the one the host enforces. Rather
 * than refuse it, the browser re-encodes it smaller and sends that, keeping the
 * long edge as large as the budget allows: one fixed target would throw away
 * detail on receipts that never needed it.
 *
 * The shape here follows `lib/pdf-page.ts` and `lib/word-boxes.ts`. The browser
 * path reaches `createImageBitmap` and `OffscreenCanvas` inside the call rather
 * than at module scope, and every decision it makes is an exported pure function
 * above it, because `vitest.config.mts` sets `environment: "node"` and the suite
 * cannot drive a canvas. `firstFittingLongEdge` is the loop itself, taking the
 * encoder as an argument, so the rule the browser follows is the rule the tests
 * exercise.
 *
 * A PDF reaches this path as the rasterized PNG `lib/pdf-page.ts` already
 * produces, so it is an image like any other and gets no special case. A PNG
 * that only needed the JPEG re-encode is the common outcome there, because the
 * first attempt re-encodes at the natural size before anything halves.
 */

/**
 * The largest body the app will send, named below the platform's 4.5 MB ceiling.
 *
 * The arithmetic, so the number is checkable rather than magic. Vercel carries
 * 4,500,000 bytes. The route reads the uploaded bytes and hands the model a
 * base64 data URL, and base64 of N bytes is `ceil(N / 3) * 4`, about 1.34 N, so
 * N may not exceed 4,500,000 * 3 / 4 = 3,375,000. The multipart wrapper around
 * the file and the `data:image/jpeg;base64,` prefix take a little more, so
 * 75,000 bytes stay in reserve and the budget lands on 3,300,000.
 */
export const BODY_BUDGET_BYTES = 3_300_000;

/**
 * The JPEG quality every re-encode uses.
 *
 * A receipt is thin dark strokes on near-white paper, which is where JPEG's
 * ringing shows worst, and both the model and the tesseract pass have to read
 * that print. At 0.82 a 12-megapixel photograph of a receipt lands around a
 * megabyte, so most files fit on the first attempt at their natural size and
 * never lose a pixel. Dropping the quality instead of the size was the
 * alternative: it blurs exactly the small print the app exists to read, while a
 * halved long edge keeps the strokes crisp at a size the model still handles.
 */
export const JPEG_QUALITY = 0.82;

/**
 * The smallest long edge this module will try.
 *
 * Below roughly 640 pixels a receipt's body text stops being legible at all, so
 * an attempt under it would spend a model call on an image nobody can read. A
 * file that still does not fit at 640 is refused instead, which is a truthful
 * answer rather than a wasted request.
 */
export const MIN_LONG_EDGE = 640;

/** True when a body of this many bytes is one the app will send. */
export function fitsBodyBudget(bytes: number): boolean {
  return Number.isFinite(bytes) && bytes <= BODY_BUDGET_BYTES;
}

/** The next long edge to try: half the current one, in whole pixels. */
export function nextLongEdge(longEdge: number): number {
  return Math.floor(longEdge / 2);
}

/**
 * The long edges to try, largest first.
 *
 * The natural size is always the first attempt, even when it sits under
 * `MIN_LONG_EDGE`, because a small image deserves its one re-encode: a PNG of a
 * rasterized page often fits as a JPEG at full size. Each later attempt halves
 * the one before it, and the list stops once halving would go under the floor.
 */
export function longEdgeAttempts(naturalLongEdge: number): number[] {
  if (!Number.isFinite(naturalLongEdge) || naturalLongEdge < 1) {
    return [];
  }

  const attempts = [Math.floor(naturalLongEdge)];

  for (;;) {
    const next = nextLongEdge(attempts[attempts.length - 1]);

    if (next < MIN_LONG_EDGE) {
      return attempts;
    }

    attempts.push(next);
  }
}

/**
 * Walks the attempts largest first and answers with the first long edge whose
 * encoded size fits the budget, or null when none of them does.
 *
 * The encoder is an argument, which is what makes the rule testable in a Node
 * environment: the browser path passes a canvas encode and the suite passes a
 * function returning the byte counts the case is about. Largest first is what
 * "as large as still fits" means, and it stops on the first success, so a file
 * needing one halving pays for two encodes rather than for every size.
 */
export async function firstFittingLongEdge(
  naturalLongEdge: number,
  encodedBytesAt: (longEdge: number) => number | Promise<number>,
): Promise<number | null> {
  for (const longEdge of longEdgeAttempts(naturalLongEdge)) {
    if (fitsBodyBudget(await encodedBytesAt(longEdge))) {
      return longEdge;
    }
  }

  return null;
}

export type FitOutcome =
  | { status: "unchanged"; file: File }
  | { status: "reduced"; file: File; from: number; to: number }
  /** Even at the smallest size this module will try, the body does not fit. */
  | { status: "too_large" };

/**
 * The filename the reduced file carries.
 *
 * The bytes are JPEG now, so a name still ending `.png` would lie to anything
 * that reads the extension. The stem is kept, because a visitor who sees the
 * name in a network log should recognize their own file.
 */
function jpegName(name: string): string {
  const stem = name.replace(/\.[^./\\]+$/, "");
  return `${stem.length > 0 ? stem : "receipt"}.jpg`;
}

/** Logged once per page, because a visitor can pick one file after another. */
let reported = false;

function reportOnce(what: string, cause?: unknown): void {
  if (reported) {
    return;
  }
  reported = true;
  console.warn(
    `downscale: ${what}. The app reports the image as too large to send rather than posting a body the platform will drop.`,
    cause === undefined ? "" : cause,
  );
}

/**
 * Returns the file to send, downscaling an image only when it must.
 *
 * `from` and `to` on a reduced outcome are byte counts, not pixels, because the
 * budget is in bytes and a PNG re-encoded as a JPEG at its natural size has a
 * smaller body and the same long edge. A caller that wants pixels can read the
 * bitmap it renders.
 *
 * A file this module cannot decode comes back `too_large` rather than throwing.
 * It is over the budget, nothing here can make it smaller, and that is the same
 * answer the visitor needs; the cause is logged so the real reason stays
 * diagnosable.
 */
export async function fitForUpload(file: File): Promise<FitOutcome> {
  if (fitsBodyBudget(file.size)) {
    return { status: "unchanged", file };
  }

  /*
   * One bitmap serves every attempt. Decoding a 6 MB photograph again for each
   * halving would multiply the work for nothing, and the canvas resamples from
   * the full-size bitmap every time, so no attempt inherits the softness of the
   * one before it.
   */
  let bitmap: ImageBitmap;

  try {
    bitmap = await createImageBitmap(file);
  } catch (error) {
    reportOnce("the browser could not decode that file as an image", error);
    return { status: "too_large" };
  }

  const naturalLongEdge = Math.max(bitmap.width, bitmap.height);
  const encoded = new Map<number, Blob>();

  try {
    const encodeAt = async (longEdge: number): Promise<number> => {
      const scale = longEdge / naturalLongEdge;
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));

      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("the browser gave no 2d context to downscale the image into");
      }

      context.drawImage(bitmap, 0, 0, width, height);
      const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: JPEG_QUALITY });

      encoded.set(longEdge, blob);
      return blob.size;
    };

    const chosen = await firstFittingLongEdge(naturalLongEdge, encodeAt);
    const blob = chosen === null ? undefined : encoded.get(chosen);

    if (!blob) {
      return { status: "too_large" };
    }

    return {
      status: "reduced",
      file: new File([blob], jpegName(file.name), { type: "image/jpeg" }),
      from: file.size,
      to: blob.size,
    };
  } catch (error) {
    reportOnce("the browser refused to re-encode that image", error);
    return { status: "too_large" };
  } finally {
    bitmap.close();
  }
}
