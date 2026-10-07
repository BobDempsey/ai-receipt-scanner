import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { SAMPLE_RECEIPTS, SAMPLES_PATH_PREFIX } from "./samples";

describe("SAMPLE_RECEIPTS", () => {
  it("names exactly the three the workspace renders", () => {
    expect(SAMPLE_RECEIPTS).toHaveLength(3);
  });

  it("puts every path under the samples directory", () => {
    for (const sample of SAMPLE_RECEIPTS) {
      expect(sample.path.startsWith(SAMPLES_PATH_PREFIX)).toBe(true);
    }
  });

  it("gives every sample its own id", () => {
    const ids = SAMPLE_RECEIPTS.map((sample) => sample.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("writes a name and a description a visitor can read", () => {
    for (const sample of SAMPLE_RECEIPTS) {
      expect(sample.name.length).toBeGreaterThan(0);
      expect(sample.description.length).toBeGreaterThan(0);
    }
  });

  /**
   * A path is only useful if the file is there. The list is the one place that
   * spells these names, so a rename in `public/samples/` that misses this module
   * would otherwise show up as a sample control that fetches a 404.
   */
  it("points at a file that exists", () => {
    for (const sample of SAMPLE_RECEIPTS) {
      expect(existsSync(`public${sample.path}`)).toBe(true);
    }
  });

  /** The three cover the formats between them, which is why there are three. */
  it("covers an image pair and the PDF path", () => {
    const types = SAMPLE_RECEIPTS.map((sample) => sample.mediaType);
    expect(types.filter((type) => type === "image/jpeg")).toHaveLength(2);
    expect(types.filter((type) => type === "application/pdf")).toHaveLength(1);
  });
});
