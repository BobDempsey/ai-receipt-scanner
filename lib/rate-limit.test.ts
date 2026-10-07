import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  callerAddress,
  checkRateLimit,
  FORWARDED_FOR_HEADER,
  IP_HOURLY_LIMIT,
  setRateLimitClient,
  SHARED_ADDRESS_KEY,
  windowKey,
  windowResetAt,
  type RateLimitClient,
} from "./rate-limit";

/**
 * A stand-in for the two commands the limiter runs, holding its counters in a
 * Map. No test in this file reaches the real Upstash endpoint, and the suite
 * runs with no credentials in the environment either way.
 */
function store(seed: Record<string, number> = {}) {
  const counters = new Map<string, number>(Object.entries(seed));
  const expiries: { key: string; seconds: number }[] = [];
  const increments: { key: string; increment: number }[] = [];

  const client: RateLimitClient = {
    async incrby(key, increment) {
      increments.push({ key, increment });
      const next = (counters.get(key) ?? 0) + increment;
      counters.set(key, next);
      return next;
    },
    async expire(key, seconds) {
      expiries.push({ key, seconds });
      return 1;
    },
  };

  return { client, counters, expiries, increments };
}

/** A client whose every command throws, which is the outage case. */
const refusing: RateLimitClient = {
  async incrby() {
    throw new Error("fetch failed against https://example.upstash.io with token tok-secret");
  },
  async expire() {
    throw new Error("fetch failed");
  },
};

function headers(address: string | null): Headers {
  const built = new Headers();
  if (address !== null) {
    built.set(FORWARDED_FOR_HEADER, address);
  }
  return built;
}

const ADDRESS = "203.0.113.7";

beforeEach(() => {
  // The limiter treats absent credentials as an unfinished deployment, so every
  // test states which it wants rather than inheriting the developer's shell.
  process.env.KV_REST_API_URL = "https://stand-in.example";
  process.env.KV_REST_API_TOKEN = "stand-in-token";
});

afterEach(() => {
  setRateLimitClient(null);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("allows the first request and reports nineteen left", async () => {
    const { client } = store();
    setRateLimitClient(client);

    const outcome = await checkRateLimit(headers(ADDRESS));

    expect(outcome).toMatchObject({ status: "allowed", remaining: IP_HOURLY_LIMIT - 1 });
  });

  it("allows the twentieth request with nothing left", async () => {
    const { client } = store();
    setRateLimitClient(client);

    for (let spent = 0; spent < IP_HOURLY_LIMIT - 1; spent += 1) {
      await checkRateLimit(headers(ADDRESS));
    }

    const twentieth = await checkRateLimit(headers(ADDRESS));

    expect(twentieth).toMatchObject({ status: "allowed", remaining: 0 });
  });

  it("refuses the twenty-first request and names when the window resets", async () => {
    const { client } = store();
    setRateLimitClient(client);

    for (let spent = 0; spent < IP_HOURLY_LIMIT; spent += 1) {
      await checkRateLimit(headers(ADDRESS));
    }

    const outcome = await checkRateLimit(headers(ADDRESS));

    expect(outcome.status).toBe("limited");
    if (outcome.status === "limited") {
      expect(outcome.resetAt).toBe(windowResetAt(Date.now()));
      expect(outcome.resetAt).toBeGreaterThan(Date.now());
    }
  });

  it("sets the expiry on the first write alone", async () => {
    const { client, expiries } = store();
    setRateLimitClient(client);

    await checkRateLimit(headers(ADDRESS));
    await checkRateLimit(headers(ADDRESS));
    await checkRateLimit(headers(ADDRESS));

    expect(expiries).toHaveLength(1);
    expect(expiries[0].key).toBe(windowKey(ADDRESS, Date.now()));
    expect(expiries[0].seconds).toBeGreaterThan(0);
  });

  it("keeps the reset time fixed across the window rather than pushing it forward", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T14:05:00.000Z"));
    const { client, expiries } = store();
    setRateLimitClient(client);

    const first = await checkRateLimit(headers(ADDRESS));
    vi.setSystemTime(new Date("2026-10-07T14:50:00.000Z"));
    const later = await checkRateLimit(headers(ADDRESS));

    expect(first).toMatchObject({ resetAt: Date.parse("2026-10-07T15:00:00.000Z") });
    expect(later).toMatchObject({ resetAt: Date.parse("2026-10-07T15:00:00.000Z") });
    expect(expiries).toHaveLength(1);
  });

  it("counts a later hour against a different key, so the allowance refills whole", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T14:30:00.000Z"));
    const { client } = store();
    setRateLimitClient(client);

    for (let spent = 0; spent < IP_HOURLY_LIMIT; spent += 1) {
      await checkRateLimit(headers(ADDRESS));
    }
    expect(await checkRateLimit(headers(ADDRESS))).toMatchObject({ status: "limited" });

    vi.setSystemTime(new Date("2026-10-07T15:00:01.000Z"));

    expect(await checkRateLimit(headers(ADDRESS))).toMatchObject({
      status: "allowed",
      remaining: IP_HOURLY_LIMIT - 1,
    });
  });

  it("spends one unit per model call, so five files cost five", async () => {
    const { client, increments } = store();
    setRateLimitClient(client);

    const outcome = await checkRateLimit(headers(ADDRESS), 5);

    expect(increments).toEqual([{ key: windowKey(ADDRESS, Date.now()), increment: 5 }]);
    expect(outcome).toMatchObject({ status: "allowed", remaining: IP_HOURLY_LIMIT - 5 });
  });

  it("refuses a five-file request that does not fit what the window has left", async () => {
    const { client } = store();
    setRateLimitClient(client);

    for (let spent = 0; spent < 18; spent += 1) {
      await checkRateLimit(headers(ADDRESS));
    }

    expect(await checkRateLimit(headers(ADDRESS), 5)).toMatchObject({ status: "limited" });
  });

  it("counts two addresses apart", async () => {
    const { client } = store();
    setRateLimitClient(client);

    for (let spent = 0; spent < IP_HOURLY_LIMIT; spent += 1) {
      await checkRateLimit(headers(ADDRESS));
    }

    expect(await checkRateLimit(headers("198.51.100.2"))).toMatchObject({
      status: "allowed",
      remaining: IP_HOURLY_LIMIT - 1,
    });
  });
});

describe("the address the counter is keyed to", () => {
  it("reads a plain forwarded header", () => {
    expect(callerAddress(headers(ADDRESS))).toBe(ADDRESS);
  });

  it("takes the first entry of a comma-separated chain", () => {
    expect(callerAddress(headers("203.0.113.7, 70.41.3.18, 150.172.238.178"))).toBe(ADDRESS);
  });

  it("falls back to one shared key when the header is missing", () => {
    expect(callerAddress(headers(null))).toBe(SHARED_ADDRESS_KEY);
  });

  it("falls back to the shared key when the header is present and empty", () => {
    expect(callerAddress(headers("  "))).toBe(SHARED_ADDRESS_KEY);
  });

  it("counts an addressless request rather than letting it through", async () => {
    const { client, increments } = store();
    setRateLimitClient(client);

    for (let spent = 0; spent < IP_HOURLY_LIMIT; spent += 1) {
      await checkRateLimit(headers(null));
    }

    expect(await checkRateLimit(headers(null))).toMatchObject({ status: "limited" });
    expect(increments.every((call) => call.key.includes(SHARED_ADDRESS_KEY))).toBe(true);
  });
});

describe("a store the limiter cannot use", () => {
  it("reports an unreachable store as unavailable, so the caller refuses", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    setRateLimitClient(refusing);

    expect(await checkRateLimit(headers(ADDRESS))).toEqual({ status: "unavailable" });
  });

  it("reports missing credentials as unconfigured, so the caller allows", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;

    expect(await checkRateLimit(headers(ADDRESS))).toEqual({ status: "unconfigured" });
  });

  it("does not report an outage and an unfinished deployment as the same thing", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    setRateLimitClient(refusing);
    await checkRateLimit(headers(ADDRESS));
    const outage = logged.mock.calls.map((call) => call.join(" ")).join("\n");

    logged.mockClear();
    setRateLimitClient(null);
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    await checkRateLimit(headers(ADDRESS));
    const unfinished = logged.mock.calls.map((call) => call.join(" ")).join("\n");

    expect(outage).not.toBe(unfinished);
    expect(outage).toContain("did not answer");
    expect(unfinished).toContain("no counter store is configured");
    expect(unfinished).not.toContain("did not answer");
  });

  it("logs neither the store URL nor the token when the store refuses", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    setRateLimitClient(refusing);

    await checkRateLimit(headers(ADDRESS));

    const line = logged.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(line).not.toContain("tok-secret");
    expect(line).not.toContain("upstash.io");
    expect(line).not.toContain("stand-in-token");
  });
});
