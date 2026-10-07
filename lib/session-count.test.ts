import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SESSION_EXTRACTION_CAP,
  countExtraction,
  sessionCapReached,
  sessionExtractionCount,
} from "./session-count";

/**
 * The suite runs in a Node environment with no browser, so `sessionStorage` is
 * stubbed on `globalThis`, which is the same seam `lib/session-store.test.ts`
 * uses. Each test names its own session id, because the key carries it and two
 * tests sharing one id would share a count.
 *
 * A reload is modelled by keeping the stubbed Map and installing a second
 * storage object over it, which is exactly what survives a reload in a browser:
 * the stored bytes, not the object the page held.
 */

const SESSION_KEY = "ai-receipt-scanner.session-id";

/** Installs a Map-backed `sessionStorage` and answers with the Map behind it. */
function installStorage(
  sessionId: string,
  held: Map<string, string> = new Map(),
): Map<string, string> {
  held.set(SESSION_KEY, sessionId);

  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => held.get(key) ?? null,
    setItem: (key: string, value: string) => void held.set(key, value),
    removeItem: (key: string) => void held.delete(key),
  } as unknown as Storage);

  return held;
}

/** Installs a `sessionStorage` that throws the way a blocked browser's does. */
function installBlockedStorage(): void {
  vi.stubGlobal("sessionStorage", {
    getItem: () => {
      throw new Error("the browser blocks site data");
    },
    setItem: () => {
      throw new Error("the browser blocks site data");
    },
  } as unknown as Storage);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sessionExtractionCount and countExtraction", () => {
  it("starts a fresh session at zero", () => {
    installStorage("session-fresh");

    expect(sessionExtractionCount()).toBe(0);
    expect(sessionCapReached()).toBe(false);
  });

  it("records the first extraction as one", () => {
    installStorage("session-first");

    expect(countExtraction()).toBe(1);
    expect(sessionExtractionCount()).toBe(1);
    expect(sessionCapReached()).toBe(false);
  });

  it("keys the count to the tab session, so a second tab starts again", () => {
    const first = installStorage("session-tab-one");
    countExtraction();
    countExtraction();
    expect(sessionExtractionCount()).toBe(2);

    /* A second tab gets a second id and, with it, a second key. */
    installStorage("session-tab-two", new Map(first));
    expect(sessionExtractionCount()).toBe(0);
  });

  it("allows the fortieth extraction and refuses the forty-first", () => {
    installStorage("session-to-the-cap");

    for (let spent = 1; spent < SESSION_EXTRACTION_CAP; spent += 1) {
      expect(countExtraction()).toBe(spent);
      expect(sessionCapReached()).toBe(false);
    }

    expect(countExtraction()).toBe(SESSION_EXTRACTION_CAP);
    expect(sessionCapReached()).toBe(true);
  });

  it("keeps the count across a reload", () => {
    const held = installStorage("session-reloading");

    for (let spent = 0; spent < 12; spent += 1) {
      countExtraction();
    }

    /* The page goes away and the stored bytes do not. */
    installStorage("session-reloading", held);

    expect(sessionExtractionCount()).toBe(12);
  });

  it("spends nothing when the app only asks whether the cap is reached", () => {
    installStorage("session-asking");

    countExtraction();
    sessionCapReached();
    sessionCapReached();
    sessionExtractionCount();

    expect(sessionExtractionCount()).toBe(1);
  });

  it("counts an extraction whose model call failed", () => {
    installStorage("session-failing-call");

    /* The caller counts when the request leaves, so a thrown answer changes nothing. */
    const spent = countExtraction();
    try {
      throw new Error("the model call failed");
    } catch {
      /* the workspace reports this to the visitor and keeps the count */
    }

    expect(spent).toBe(1);
    expect(sessionExtractionCount()).toBe(1);
  });

  it("treats a stored value it did not write as no extractions spent", () => {
    const held = installStorage("session-corrupted");
    held.set("ai-receipt-scanner.extraction-count.session-corrupted", "not a number");

    expect(sessionExtractionCount()).toBe(0);
    expect(sessionCapReached()).toBe(false);
  });

  it("counts in memory rather than throwing when sessionStorage throws", () => {
    installBlockedStorage();

    expect(() => sessionExtractionCount()).not.toThrow();

    const before = sessionExtractionCount();
    expect(countExtraction()).toBe(before + 1);
    expect(sessionExtractionCount()).toBe(before + 1);
    expect(() => sessionCapReached()).not.toThrow();
  });

  it("does not throw when the browser offers no sessionStorage at all", () => {
    vi.stubGlobal("sessionStorage", undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(() => sessionExtractionCount()).not.toThrow();
    expect(() => sessionCapReached()).not.toThrow();
    expect(() => countExtraction()).not.toThrow();
  });
});
