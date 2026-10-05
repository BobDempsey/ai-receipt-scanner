import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getReceipt,
  listSessionReceipts,
  newStoredReceipt,
  putReceipt,
  tabSessionId,
  type StoredReceipt,
} from "./session-store";
import type { ArithmeticWarning } from "./arithmetic";
import type { Receipt, ReceiptLineItem } from "./receipt-schema";

/**
 * The suite runs in a Node environment with no browser, so the two stores the
 * module reads off `globalThis` are stubbed here: a Map-backed `sessionStorage`
 * and a Map-backed IndexedDB that fires its callbacks on the microtask queue the
 * way the real one fires them on the event loop. The stand-in is deliberately
 * strict about the two things the module depends on, the `id` key path and the
 * `sessionId` index, so a store built without either fails the test rather than
 * passing on a filter the fake performed for free.
 */

type Row = Record<string, unknown> & { id: string };

class FakeRequest {
  result: unknown = undefined;
  error: Error | null = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
}

class FakeOpenRequest extends FakeRequest {
  onupgradeneeded: (() => void) | null = null;
  onblocked: (() => void) | null = null;
  transaction: FakeTransaction | null = null;
}

class FakeTransaction {
  error: Error | null = null;
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  private pending = 0;
  private failed = false;
  private settled = false;

  constructor(
    readonly database: FakeDatabase,
    readonly mode: string,
  ) {}

  objectStore(name: string): FakeStore {
    if (!this.database.stores.has(name)) {
      throw new Error(`no object store named ${name}`);
    }
    return new FakeStore(this.database, this);
  }

  /** Queues one request and completes the transaction once nothing is pending. */
  run(work: () => unknown): FakeRequest {
    const request = new FakeRequest();
    this.pending += 1;

    queueMicrotask(() => {
      try {
        request.result = work();
        request.onsuccess?.();
      } catch (error) {
        this.failed = true;
        this.error = error as Error;
        request.error = error as Error;
        request.onerror?.();
      }

      this.pending -= 1;
      if (this.pending === 0 && !this.settled) {
        this.settled = true;
        queueMicrotask(() => (this.failed ? this.onerror?.() : this.oncomplete?.()));
      }
    });

    return request;
  }
}

class FakeStore {
  constructor(
    private readonly database: FakeDatabase,
    private readonly transaction: FakeTransaction | null,
  ) {}

  get indexNames() {
    return { contains: (name: string) => this.database.indexes.has(name) };
  }

  createIndex(name: string, keyPath: string): void {
    this.database.indexes.set(name, keyPath);
  }

  put(value: Row): FakeRequest {
    const transaction = this.requireTransaction();
    if (transaction.mode !== "readwrite") {
      throw new Error("a readonly transaction may not write");
    }
    return transaction.run(() => {
      this.database.rows.set(value[this.database.keyPath] as string, structuredClone(value));
      return value.id;
    });
  }

  get(key: string): FakeRequest {
    const transaction = this.requireTransaction();
    return transaction.run(() => {
      const row = this.database.rows.get(key);
      return row === undefined ? undefined : structuredClone(row);
    });
  }

  index(name: string) {
    const keyPath = this.database.indexes.get(name);
    if (keyPath === undefined) {
      throw new Error(`no index named ${name}`);
    }
    const transaction = this.requireTransaction();
    return {
      getAll: (key: unknown) =>
        transaction.run(() =>
          [...this.database.rows.values()]
            .filter((row) => row[keyPath] === key)
            .map((row) => structuredClone(row)),
        ),
    };
  }

  private requireTransaction(): FakeTransaction {
    if (!this.transaction) {
      throw new Error("this store is not inside a transaction");
    }
    return this.transaction;
  }
}

class FakeDatabase {
  rows = new Map<string, Row>();
  stores = new Set<string>();
  indexes = new Map<string, string>();
  keyPath = "id";
  version = 0;

  get objectStoreNames() {
    return { contains: (name: string) => this.stores.has(name) };
  }

  createObjectStore(name: string, options: { keyPath: string }): FakeStore {
    this.stores.add(name);
    this.keyPath = options.keyPath;
    return new FakeStore(this, null);
  }

  transaction(name: string, mode: string): FakeTransaction {
    if (!this.stores.has(name)) {
      throw new Error(`no object store named ${name}`);
    }
    return new FakeTransaction(this, mode);
  }
}

class FakeFactory {
  readonly databases = new Map<string, FakeDatabase>();

  open(name: string, version: number): FakeOpenRequest {
    const request = new FakeOpenRequest();

    queueMicrotask(() => {
      let database = this.databases.get(name);
      const fresh = database === undefined;
      if (!database) {
        database = new FakeDatabase();
        this.databases.set(name, database);
      }
      request.result = database;

      if (fresh || version > database.version) {
        database.version = version;
        request.transaction = new FakeTransaction(database, "versionchange");
        request.onupgradeneeded?.();
      }

      request.onsuccess?.();
    });

    return request;
  }
}

/** Installs a stand-in IndexedDB and answers with the factory the module will read. */
function installStore(): FakeFactory {
  const factory = new FakeFactory();
  vi.stubGlobal("indexedDB", factory as unknown as IDBFactory);
  return factory;
}

/** Installs a `sessionStorage` already holding the session id the test names. */
function installSession(sessionId: string | null = "session-a"): Map<string, string> {
  const held = new Map<string, string>();
  if (sessionId !== null) {
    held.set("ai-receipt-scanner.session-id", sessionId);
  }
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => held.get(key) ?? null,
    setItem: (key: string, value: string) => void held.set(key, value),
    removeItem: (key: string) => void held.delete(key),
  } as unknown as Storage);
  return held;
}

function item(amount: string): ReceiptLineItem {
  return {
    description: "An item",
    descriptionConfidence: 0.9,
    descriptionSourceText: "AN ITEM",
    quantity: "1",
    quantityConfidence: 0.9,
    quantitySourceText: "1",
    unitPrice: amount,
    unitPriceConfidence: 0.9,
    unitPriceSourceText: amount,
    amount,
    amountConfidence: 0.9,
    amountSourceText: amount,
  };
}

function receipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    isReceipt: true,
    reason: null,
    merchant: "Harbour Street Grocers",
    merchantConfidence: 0.9,
    merchantSourceText: "HARBOUR STREET GROCERS",
    merchantAddress: null,
    merchantAddressConfidence: null,
    merchantAddressSourceText: null,
    date: "2026-10-05",
    dateConfidence: 0.9,
    dateSourceText: "2026-10-05",
    time: null,
    timeConfidence: null,
    timeSourceText: null,
    currency: "USD",
    currencyConfidence: 0.9,
    currencySourceText: "$",
    subtotal: "39.40",
    subtotalConfidence: 0.9,
    subtotalSourceText: "39.40",
    taxes: null,
    tip: null,
    tipConfidence: null,
    tipSourceText: null,
    total: "41.66",
    totalConfidence: 0.9,
    totalSourceText: "41.66",
    paymentMethod: null,
    paymentMethodConfidence: null,
    paymentMethodSourceText: null,
    cardLast4: null,
    cardLast4Confidence: null,
    cardLast4SourceText: null,
    lineItems: [item("4.99"), item("34.41")],
    ...overrides,
  };
}

function warning(): ArithmeticWarning {
  return {
    check: "total-sum",
    fields: ["subtotal", "total"],
    computed: "39.40",
    printed: "41.66",
    difference: "2.26",
    message: "The subtotal, taxes and tip add up to 39.40, and the receipt prints 41.66.",
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("newStoredReceipt", () => {
  it("builds a record carrying exactly the six keys the shape names", () => {
    installSession();
    const record = newStoredReceipt(receipt(), [warning()], ["total"]);

    expect(Object.keys(record).sort()).toEqual([
      "edited",
      "id",
      "receipt",
      "savedAt",
      "sessionId",
      "warnings",
    ]);
  });

  it("keeps the id, the session and the timestamp out of the receipt object", () => {
    installSession("session-a");
    const record = newStoredReceipt(receipt(), [], []);

    const receiptKeys = Object.keys(record.receipt);
    expect(receiptKeys).not.toContain("id");
    expect(receiptKeys).not.toContain("savedAt");
    expect(receiptKeys).not.toContain("sessionId");

    /* Nor anywhere deeper in it, such as on a line item. */
    const printed = JSON.stringify(record.receipt);
    expect(printed).not.toContain(record.id);
    expect(printed).not.toContain(record.sessionId);
    expect(printed).not.toContain(String(record.savedAt));
  });

  it("stamps the session the tab holds and a timestamp in milliseconds", () => {
    installSession("session-b");
    const before = Date.now();
    const record = newStoredReceipt(receipt(), [], []);

    expect(record.sessionId).toBe("session-b");
    expect(record.savedAt).toBeGreaterThanOrEqual(before);
    expect(record.id).not.toBe("");
  });

  it("gives two receipts two ids", () => {
    installSession();
    expect(newStoredReceipt(receipt(), [], []).id).not.toBe(
      newStoredReceipt(receipt(), [], []).id,
    );
  });

  it("copies the warnings and the edited list rather than holding the workspace's arrays", () => {
    installSession();
    const warnings = [warning()];
    const edited = ["total"];
    const record = newStoredReceipt(receipt(), warnings, edited);

    warnings.pop();
    edited.push("subtotal");

    expect(record.warnings).toHaveLength(1);
    expect(record.edited).toEqual(["total"]);
  });

  it("carries no Blob, no File and no data URL anywhere in the record", () => {
    installSession();
    const record = newStoredReceipt(receipt(), [warning()], ["total"]);

    const walk = (value: unknown): void => {
      if (typeof value === "string") {
        expect(value.startsWith("data:")).toBe(false);
        expect(value).not.toContain(";base64,");
        return;
      }
      if (typeof Blob !== "undefined") {
        expect(value instanceof Blob).toBe(false);
      }
      if (typeof File !== "undefined") {
        expect(value instanceof File).toBe(false);
      }
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      if (value !== null && typeof value === "object") {
        Object.values(value).forEach(walk);
      }
    };

    walk(record);
  });
});

describe("tabSessionId", () => {
  it("creates an id and keeps it when sessionStorage holds none", () => {
    const held = installSession(null);
    const created = tabSessionId();

    expect(created).not.toBe("");
    expect(held.get("ai-receipt-scanner.session-id")).toBe(created);
  });

  it("reuses the id a reload left in sessionStorage", () => {
    installSession("session-from-the-last-load");
    expect(tabSessionId()).toBe("session-from-the-last-load");
    expect(tabSessionId()).toBe("session-from-the-last-load");
  });

  it("answers with an id rather than throwing when sessionStorage throws on access", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("the browser blocks site data");
      },
      setItem: () => {
        throw new Error("the browser blocks site data");
      },
    } as unknown as Storage);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const first = tabSessionId();
    expect(first).not.toBe("");
    expect(tabSessionId()).toBe(first);
  });

  it("answers with an id when the browser offers no sessionStorage at all", () => {
    vi.stubGlobal("sessionStorage", undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(tabSessionId()).not.toBe("");
  });
});

describe("putReceipt and listSessionReceipts", () => {
  it("lists a receipt it just stored", async () => {
    installSession("session-a");
    installStore();

    const record = newStoredReceipt(receipt(), [warning()], ["total"]);
    expect(await putReceipt(record)).toBe(true);

    const listed = await listSessionReceipts();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(record.id);
    expect(listed[0].receipt.total).toBe("41.66");
    expect(listed[0].warnings).toHaveLength(1);
    expect(listed[0].edited).toEqual(["total"]);
  });

  it("creates the store with the id key path and the sessionId index", async () => {
    installSession("session-a");
    const factory = installStore();

    await putReceipt(newStoredReceipt(receipt(), [], []));

    const database = factory.databases.get("ai-receipt-scanner");
    expect(database?.stores.has("receipts")).toBe(true);
    expect(database?.keyPath).toBe("id");
    expect(database?.indexes.get("sessionId")).toBe("sessionId");
  });

  it("lists only the records of this tab's session", async () => {
    installSession("session-a");
    installStore();

    const mine = newStoredReceipt(receipt(), [], []);
    await putReceipt(mine);
    await putReceipt({ ...newStoredReceipt(receipt(), [], []), sessionId: "session-b" });

    const listed = await listSessionReceipts();
    expect(listed.map((row) => row.id)).toEqual([mine.id]);
  });

  it("lists the newest receipt first whatever order the writes went in", async () => {
    installSession("session-a");
    installStore();

    const stamped = (savedAt: number, id: string): StoredReceipt => ({
      ...newStoredReceipt(receipt(), [], []),
      id,
      savedAt,
    });

    await putReceipt(stamped(1_000, "middle"));
    await putReceipt(stamped(2_000, "newest"));
    await putReceipt(stamped(500, "oldest"));

    expect((await listSessionReceipts()).map((row) => row.id)).toEqual([
      "newest",
      "middle",
      "oldest",
    ]);
  });

  it("replaces the record under an id when the visitor corrects a field", async () => {
    installSession("session-a");
    installStore();

    const record = newStoredReceipt(receipt(), [], []);
    await putReceipt(record);
    await putReceipt({
      ...record,
      receipt: receipt({ total: "45.75" }),
      edited: ["total"],
    });

    const listed = await listSessionReceipts();
    expect(listed).toHaveLength(1);
    expect(listed[0].receipt.total).toBe("45.75");
    expect(listed[0].edited).toEqual(["total"]);
  });
});

describe("getReceipt", () => {
  it("reads one record back by its id", async () => {
    installSession("session-a");
    installStore();

    const record = newStoredReceipt(receipt(), [warning()], ["total"]);
    await putReceipt(record);

    const read = await getReceipt(record.id);
    expect(read?.id).toBe(record.id);
    expect(read?.receipt.merchant).toBe("Harbour Street Grocers");
  });

  it("answers null for an id the store does not hold", async () => {
    installSession("session-a");
    installStore();
    await putReceipt(newStoredReceipt(receipt(), [], []));

    expect(await getReceipt("an-id-nobody-wrote")).toBeNull();
  });
});

describe("an unavailable store", () => {
  it("resolves rather than throwing when the browser offers no IndexedDB", async () => {
    installSession("session-a");
    vi.stubGlobal("indexedDB", undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(await putReceipt(newStoredReceipt(receipt(), [], []))).toBe(false);
    expect(await listSessionReceipts()).toEqual([]);
    expect(await getReceipt("any-id")).toBeNull();
  });

  it("resolves rather than throwing when opening the database throws", async () => {
    installSession("session-a");
    vi.stubGlobal("indexedDB", {
      open: () => {
        throw new Error("the browser blocks site data");
      },
    } as unknown as IDBFactory);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(await putReceipt(newStoredReceipt(receipt(), [], []))).toBe(false);
    expect(await listSessionReceipts()).toEqual([]);
    expect(await getReceipt("any-id")).toBeNull();
  });

  it("resolves rather than throwing when the open request fails", async () => {
    installSession("session-a");
    vi.stubGlobal("indexedDB", {
      open: () => {
        const request = new FakeOpenRequest();
        request.error = new Error("a private window refused the database");
        queueMicrotask(() => request.onerror?.());
        return request;
      },
    } as unknown as IDBFactory);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(await putReceipt(newStoredReceipt(receipt(), [], []))).toBe(false);
    expect(await listSessionReceipts()).toEqual([]);
    expect(await getReceipt("any-id")).toBeNull();
  });

  it("resolves false when the write itself fails", async () => {
    installSession("session-a");
    const factory = installStore();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    /* Open the database, then take its only store away under the next write. */
    await putReceipt(newStoredReceipt(receipt(), [], []));
    factory.databases.get("ai-receipt-scanner")?.stores.clear();

    expect(await putReceipt(newStoredReceipt(receipt(), [], []))).toBe(false);
    expect(await listSessionReceipts()).toEqual([]);
  });

  it("logs the failure once rather than on every call", async () => {
    /*
     * A fresh module instance, because the log-once flag lives for the life of
     * the module the way it would live for the life of the page.
     */
    vi.resetModules();
    installSession("session-a");
    vi.stubGlobal("indexedDB", undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const store = await import("./session-store");
    await store.putReceipt(store.newStoredReceipt(receipt(), [], []));
    await store.putReceipt(store.newStoredReceipt(receipt(), [], []));
    await store.listSessionReceipts();
    await store.getReceipt("any-id");

    expect(warn).toHaveBeenCalledTimes(1);
  });
});
