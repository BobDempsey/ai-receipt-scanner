import { Redis } from "@upstash/redis";

/**
 * The per-IP hourly allowance, and the only server-side state this app keeps.
 *
 * A counter in process memory is per warm instance, so twenty would become
 * twenty times however many instances Vercel happens to be running, which is
 * not a cap. The count therefore lives in Upstash Redis, reached over its REST
 * API, which needs no connection pool to manage from a serverless function.
 *
 * The window is fixed and the key carries the hour, so a window needs no
 * scheduled cleanup and no sorted set: `INCRBY` creates the key, `EXPIRE` on
 * that first write alone retires it, and the next hour writes a different key.
 * A fixed window also lets the refusal name a wall-clock time the visitor can
 * read. The cost is the boundary burst, because a visitor can spend twenty at
 * 10:59 and twenty more at 11:00, and for a portfolio demo whose risk is a
 * bored stranger that is an acceptable worst case against an explanation a
 * visitor can act on.
 *
 * This module makes the opposite choice to `lib/session-store.ts`. A store that
 * refuses leaves the session table working there, because a lost list costs the
 * visitor nothing; here an uncounted model call costs Bob money, so a store
 * that cannot be reached refuses the extraction. The one exception is a store
 * with no credentials at all, which is a deployment nobody finished rather than
 * an outage, and taking the demo down over it would be the worse failure. The
 * caller gets those two apart as `unavailable` and `unconfigured`, and this
 * module logs them apart as well.
 *
 * The client is reached through `resolveClient`, which is the seam the suite
 * uses: `setRateLimitClient` puts a stand-in in front of it, so no test ever
 * reaches the real Upstash endpoint. `Redis.fromEnv()` is deliberately not used,
 * because the Vercel integration writes `KV_REST_API_URL` and
 * `KV_REST_API_TOKEN` while that helper looks for `UPSTASH_` names first.
 */

/** Twenty extractions an hour, per address. */
export const IP_HOURLY_LIMIT = 20;

const HOUR_MS = 60 * 60 * 1000;

/**
 * The header the platform sets with the caller's address.
 *
 * Read in one place, so moving off Vercel is one line. The value is a
 * comma-separated chain when a proxy sits in front, and the first entry is the
 * original caller.
 */
export const FORWARDED_FOR_HEADER = "x-forwarded-for";

/**
 * The bucket a request with no usable address counts against.
 *
 * Every such request shares one key rather than passing uncounted, because an
 * absent address must not become an unlimited lane. It does mean two visitors
 * the platform told us nothing about share an allowance, which is the right way
 * round for a cap that exists to bound a bill.
 */
export const SHARED_ADDRESS_KEY = "no-address";

/** Keys are versioned, so a later change of shape cannot read an old counter. */
const KEY_PREFIX = "rate-limit:v1";

export type RateLimitOutcome =
  | { status: "allowed"; remaining: number; resetAt: number }
  | { status: "limited"; resetAt: number }
  /** The store is configured but could not be reached. The caller refuses. */
  | { status: "unavailable" }
  /** No credentials in the environment. The caller allows and logs loudly. */
  | { status: "unconfigured" };

/**
 * The two commands this module runs, and nothing else.
 *
 * Narrowing the client to these two is what lets a test drive a stand-in object
 * instead of a Redis instance, and it states the whole store contract in four
 * lines, so moving the counter to another store is a question about two
 * commands rather than about a client library.
 */
export type RateLimitClient = {
  incrby(key: string, increment: number): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
};

/** Set by the suite. `null` puts the environment-built client back. */
let injectedClient: RateLimitClient | null = null;

/** The client built from the environment, cached against the credentials it used. */
let cachedClient: { url: string; client: RateLimitClient } | null = null;

/**
 * The test seam. Nothing in the app calls this.
 *
 * Passing a stand-in keeps every test off the network; passing `null` restores
 * the environment-built client, which is what an `afterEach` does.
 */
export function setRateLimitClient(client: RateLimitClient | null): void {
  injectedClient = client;
}

/**
 * The address the counter is keyed to, or the shared bucket.
 *
 * Exported because the route has no business reading the header itself and the
 * suite has every business reading this.
 */
export function callerAddress(headers: Headers): string {
  const chain = headers.get(FORWARDED_FOR_HEADER);
  const first = chain?.split(",")[0]?.trim();

  return first ? first : SHARED_ADDRESS_KEY;
}

/** When the hour holding `now` ends, in epoch milliseconds. */
export function windowResetAt(now: number): number {
  return (Math.floor(now / HOUR_MS) + 1) * HOUR_MS;
}

/** The counter key: the address plus the hour it is counting. */
export function windowKey(address: string, now: number): string {
  // The hour reads as `2026-10-07T14`, so anyone looking at the store can see
  // which window a key belongs to without arithmetic.
  const hour = new Date(Math.floor(now / HOUR_MS) * HOUR_MS).toISOString().slice(0, 13);

  return `${KEY_PREFIX}:${address}:${hour}`;
}

/**
 * Spends `cost` units of this address's hourly allowance and says what is left.
 *
 * `cost` is the number of model calls the request will make, so a request
 * carrying five files spends five. The increment happens before the comparison,
 * which means a request that asks for more than the window has left pushes the
 * counter past the limit and is refused; the overspend retires with the window
 * and no cleanup reads it.
 */
export async function checkRateLimit(headers: Headers, cost = 1): Promise<RateLimitOutcome> {
  const client = resolveClient();

  if (!client) {
    // Every request, not once per process. A deployment missing its credentials
    // should be impossible to miss in the log, and the names are safe to print
    // where the values never are.
    console.error(
      "rate-limit: no counter store is configured, so this extraction ran uncounted." +
        " Set KV_REST_API_URL and KV_REST_API_TOKEN to enforce the hourly limit.",
    );
    return { status: "unconfigured" };
  }

  const now = Date.now();
  const address = callerAddress(headers);
  const key = windowKey(address, now);
  const resetAt = windowResetAt(now);

  let count: number;
  try {
    count = await client.incrby(key, cost);

    // The first write for this window is the one that returns the cost itself,
    // because the key did not exist before it. Setting the expiry only there
    // keeps a window's end fixed, where an expiry on every call would push the
    // reset time forward with each request and the stated clock time would be a
    // lie.
    if (count === cost) {
      await client.expire(key, Math.max(1, Math.ceil((resetAt - now) / 1000)));
    }
  } catch (error) {
    // The URL and the token never reach this line, and neither does the store's
    // own wording.
    console.error(
      "rate-limit: the counter store did not answer, so the extraction is refused",
      describe(error),
    );
    return { status: "unavailable" };
  }

  if (count > IP_HOURLY_LIMIT) {
    return { status: "limited", resetAt };
  }

  return { status: "allowed", remaining: IP_HOURLY_LIMIT - count, resetAt };
}

/** The injected client, the cached one, or none because none is configured. */
function resolveClient(): RateLimitClient | null {
  if (injectedClient) {
    return injectedClient;
  }

  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    return null;
  }

  if (cachedClient?.url !== url) {
    cachedClient = { url, client: new Redis({ url, token }) };
  }

  return cachedClient.client;
}

/** A one-line description of a thrown value, with no credential text in it. */
function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.name;
  }
  return typeof error;
}
