import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BODY_BUDGET_BYTES,
  JPEG_QUALITY,
  MIN_LONG_EDGE,
  firstFittingLongEdge,
  fitForUpload,
  fitsBodyBudget,
  longEdgeAttempts,
  nextLongEdge,
} from "./downscale";

/**
 * The pure functions carry the rules, so most of what follows drives them
 * directly with the byte counts a case is about.
 *
 * `fitForUpload` itself needs `createImageBitmap` and `OffscreenCanvas`, which a
 * Node environment has neither of, so the two are stubbed on `globalThis` the
 * way `lib/session-store.test.ts` stubs its stores. The stand-in encoder sizes a
 * blob from the pixel area it was handed, which is the one property of a real
 * JPEG encode the loop depends on: fewer pixels means fewer bytes.
 */

/**
 * A file reporting the size the case names.
 *
 * Allocating six megabytes of real bytes per test would make the suite slow for
 * no gain, so `size` is overridden on the instance instead.
 */
function sizedFile(bytes: number, name = "receipt.jpg", type = "image/jpeg"): File {
  const file = new File([new Uint8Array(0)], name, { type });
  Object.defineProperty(file, "size", { value: bytes });
  return file;
}

/**
 * Stubs the two browser globals `fitForUpload` reaches for.
 *
 * `bytesPerPixel` is what decides which attempt fits, so a case picks a number
 * that lands the fit where the case wants it.
 */
function installCanvas(
  naturalWidth: number,
  naturalHeight: number,
  bytesPerPixel: number,
): { encodedAt: number[]; quality: number[]; closed: () => number } {
  const encodedAt: number[] = [];
  const quality: number[] = [];
  let closes = 0;

  vi.stubGlobal("createImageBitmap", async () => ({
    width: naturalWidth,
    height: naturalHeight,
    close: () => {
      closes += 1;
    },
  }));

  class FakeOffscreenCanvas {
    constructor(
      readonly width: number,
      readonly height: number,
    ) {}

    getContext(): { drawImage: () => void } {
      return { drawImage: () => undefined };
    }

    async convertToBlob(options: { type: string; quality: number }): Promise<Blob> {
      encodedAt.push(Math.max(this.width, this.height));
      quality.push(options.quality);
      const size = Math.round(this.width * this.height * bytesPerPixel);
      const blob = new Blob([new Uint8Array(0)], { type: options.type });
      Object.defineProperty(blob, "size", { value: size });
      return blob;
    }
  }

  vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);

  return { encodedAt, quality, closed: () => closes };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("BODY_BUDGET_BYTES", () => {
  it("leaves room for the base64 expansion inside the platform's 4.5 MB body", () => {
    const base64Bytes = Math.ceil(BODY_BUDGET_BYTES / 3) * 4;

    expect(base64Bytes).toBeLessThan(4_500_000);
    /* And the reserve is the 75,000 bytes the comment claims, not more. */
    expect(4_500_000 - base64Bytes).toBeLessThan(200_000);
  });
});

describe("fitsBodyBudget", () => {
  it("takes a body at the budget and refuses one byte more", () => {
    expect(fitsBodyBudget(BODY_BUDGET_BYTES)).toBe(true);
    expect(fitsBodyBudget(BODY_BUDGET_BYTES + 1)).toBe(false);
  });

  it("refuses a size it cannot read as a number", () => {
    expect(fitsBodyBudget(Number.NaN)).toBe(false);
    expect(fitsBodyBudget(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("nextLongEdge and longEdgeAttempts", () => {
  it("halves in whole pixels", () => {
    expect(nextLongEdge(4032)).toBe(2016);
    expect(nextLongEdge(2001)).toBe(1000);
  });

  it("starts at the natural size and stops at the floor", () => {
    const attempts = longEdgeAttempts(4032);

    expect(attempts[0]).toBe(4032);
    expect(attempts).toEqual([4032, 2016, 1008]);
    expect(attempts[attempts.length - 1]).toBeGreaterThanOrEqual(MIN_LONG_EDGE);
  });

  it("gives a small image its one re-encode at its natural size", () => {
    expect(longEdgeAttempts(400)).toEqual([400]);
  });

  it("stops rather than halving under the floor", () => {
    /* 1200 halves to 600, which is under 640, so 1200 is the last attempt. */
    expect(longEdgeAttempts(1200)).toEqual([1200]);
    expect(longEdgeAttempts(1280)).toEqual([1280, 640]);
  });

  it("has nothing to try for a size it cannot read", () => {
    expect(longEdgeAttempts(0)).toEqual([]);
    expect(longEdgeAttempts(Number.NaN)).toEqual([]);
  });
});

describe("firstFittingLongEdge", () => {
  it("keeps the natural size when the re-encode alone fits", async () => {
    const asked: number[] = [];
    const chosen = await firstFittingLongEdge(4032, (longEdge) => {
      asked.push(longEdge);
      return 1_000_000;
    });

    expect(chosen).toBe(4032);
    expect(asked).toEqual([4032]);
  });

  it("takes one halving when the natural size is over the budget", async () => {
    const asked: number[] = [];
    const chosen = await firstFittingLongEdge(4032, (longEdge) => {
      asked.push(longEdge);
      return longEdge > 2016 ? BODY_BUDGET_BYTES + 1 : BODY_BUDGET_BYTES;
    });

    expect(chosen).toBe(2016);
    expect(asked).toEqual([4032, 2016]);
  });

  it("takes several halvings and keeps the largest size that fits", async () => {
    const asked: number[] = [];
    const chosen = await firstFittingLongEdge(8000, (longEdge) => {
      asked.push(longEdge);
      return longEdge > 1000 ? BODY_BUDGET_BYTES + 1 : 500_000;
    });

    expect(chosen).toBe(1000);
    expect(asked).toEqual([8000, 4000, 2000, 1000]);
  });

  it("answers null when nothing down to the floor fits", async () => {
    const asked: number[] = [];
    const chosen = await firstFittingLongEdge(4032, (longEdge) => {
      asked.push(longEdge);
      return BODY_BUDGET_BYTES + 1;
    });

    expect(chosen).toBeNull();
    expect(asked).toEqual([4032, 2016, 1008]);
  });
});

describe("fitForUpload", () => {
  it("hands back a file already inside the budget untouched", async () => {
    const file = sizedFile(900_000);
    const outcome = await fitForUpload(file);

    expect(outcome.status).toBe("unchanged");
    expect(outcome.status === "unchanged" && outcome.file).toBe(file);
  });

  it("takes the budget exactly as inside it", async () => {
    const outcome = await fitForUpload(sizedFile(BODY_BUDGET_BYTES));
    expect(outcome.status).toBe("unchanged");
  });

  it("re-encodes at the natural size when that alone fits", async () => {
    /* 2000 by 1500 at 0.3 bytes a pixel encodes to 900,000. */
    const canvas = installCanvas(2000, 1500, 0.3);
    const outcome = await fitForUpload(sizedFile(6_000_000, "page.png", "image/png"));

    expect(outcome.status).toBe("reduced");
    if (outcome.status !== "reduced") {
      return;
    }
    expect(outcome.from).toBe(6_000_000);
    expect(outcome.to).toBe(900_000);
    expect(outcome.file.type).toBe("image/jpeg");
    expect(outcome.file.name).toBe("page.jpg");
    expect(canvas.encodedAt).toEqual([2000]);
    expect(canvas.quality).toEqual([JPEG_QUALITY]);
    expect(canvas.closed()).toBe(1);
  });

  it("halves until the body fits and sends the largest size that did", async () => {
    /* 4032 by 3024 at 0.5 is over the budget; halved once it is under it. */
    const canvas = installCanvas(4032, 3024, 0.5);
    const outcome = await fitForUpload(sizedFile(6_000_000, "photo.jpeg"));

    expect(outcome.status).toBe("reduced");
    if (outcome.status !== "reduced") {
      return;
    }
    expect(canvas.encodedAt).toEqual([4032, 2016]);
    expect(outcome.to).toBeLessThanOrEqual(BODY_BUDGET_BYTES);
    expect(outcome.file.size).toBe(outcome.to);
  });

  it("refuses a file it cannot make fit, as its own outcome", async () => {
    const canvas = installCanvas(4032, 3024, 8);
    const outcome = await fitForUpload(sizedFile(7_900_000));

    expect(outcome).toEqual({ status: "too_large" });
    expect(canvas.encodedAt).toEqual([4032, 2016, 1008]);
    expect(canvas.closed()).toBe(1);
  });

  it("refuses rather than throwing when the browser cannot decode the file", async () => {
    vi.stubGlobal("createImageBitmap", async () => {
      throw new Error("the browser could not decode that");
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(fitForUpload(sizedFile(6_000_000))).resolves.toEqual({ status: "too_large" });
  });

  it("refuses rather than throwing when the browser gives no 2d context", async () => {
    vi.stubGlobal("createImageBitmap", async () => ({
      width: 2000,
      height: 1500,
      close: () => undefined,
    }));
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        getContext(): null {
          return null;
        }
      },
    );
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(fitForUpload(sizedFile(6_000_000))).resolves.toEqual({ status: "too_large" });
  });
});
