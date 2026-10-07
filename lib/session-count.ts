import { tabSessionId } from "./session-store";

/**
 * How many extractions this tab session has spent, and whether it has any left.
 *
 * The count is keyed to `tabSessionId()`, the same id `lib/session-store.ts`
 * writes on every stored receipt, so the cap and the session table cannot
 * disagree about what a session is. A reload keeps both, because that id lives
 * in `sessionStorage`, and a second tab starts a session of its own at zero.
 *
 * The count sits in `sessionStorage` beside the id rather than being derived by
 * counting the stored records. Two reasons. A visitor could lower a derived cap
 * by scanning receipts the app refused to store, and the count has to keep
 * working in a browser that offers no IndexedDB at all.
 *
 * This cap rests on a value the browser holds, so a visitor who clears
 * `sessionStorage` or opens a new tab starts again. That makes it an in-app
 * courtesy rather than a control, and the per-IP limit at the route is the
 * control. The app says so where a refused visitor reads it instead of
 * pretending otherwise.
 *
 * Nothing here throws. A private window or a browser set to block site data
 * makes `sessionStorage` throw on the plainest access, and a module that threw
 * would take down the render that asked whether the visitor may upload. Every
 * read and write is wrapped, and a page whose storage refuses falls back to a
 * count held in memory, which drops the lifetime from the tab to the page.
 */

/** Forty extractions per session, which is what the limits spec names. */
export const SESSION_EXTRACTION_CAP = 40;

/** The key prefix. The session id follows it, so two tabs never share a count. */
const COUNT_KEY_PREFIX = "ai-receipt-scanner.extraction-count.";

/**
 * The count for a page whose `sessionStorage` refused the write.
 *
 * Keyed by session id for the same reason the stored key is: a page that fell
 * back here can still only be one session, but keying it keeps the two paths
 * reading the same shape. A reload loses this, which is the honest consequence
 * of a browser that keeps nothing.
 */
const pageCounts = new Map<string, number>();

/** Logged once per page, because the count is read on every render that asks. */
let reported = false;

function reportOnce(cause?: unknown): void {
  if (reported) {
    return;
  }
  reported = true;
  console.warn(
    "session count: sessionStorage would not keep the extraction count, so this page counts in memory and a reload starts again.",
    cause === undefined ? "" : cause,
  );
}

/**
 * The tab's `sessionStorage`, or null when the browser will not hand it over.
 *
 * Reading the property itself throws in a browser set to block site data, which
 * is why the guard wraps the read rather than only the `getItem` that follows.
 */
function sessionStorageOrNull(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function countKey(): string {
  return `${COUNT_KEY_PREFIX}${tabSessionId()}`;
}

/**
 * Reads a stored count, treating anything it cannot trust as zero.
 *
 * A key holding "12.5", "-3" or a word is not a count this app wrote, so the
 * safest reading is that the session has spent nothing. The alternative, taking
 * such a value as the cap, would lock a visitor out over a corrupted string.
 */
function parseCount(raw: string | null): number {
  if (raw === null) {
    return 0;
  }

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

/** How many extractions this tab session has spent. */
export function sessionExtractionCount(): number {
  const key = countKey();

  try {
    const storage = sessionStorageOrNull();
    if (storage) {
      return parseCount(storage.getItem(key));
    }
  } catch (error) {
    reportOnce(error);
  }

  return pageCounts.get(key) ?? 0;
}

/**
 * True when the session has spent its allowance.
 *
 * This reads and counts nothing, which is what lets the workspace ask before
 * every upload. A refusal the app never sent costs the visitor no extraction,
 * so asking may not spend one.
 */
export function sessionCapReached(): boolean {
  return sessionExtractionCount() >= SESSION_EXTRACTION_CAP;
}

/**
 * Records one extraction and returns the new count.
 *
 * The caller spends a count once the request leaves the browser, not once an
 * answer comes back. An extraction whose model call failed still counts, because
 * the call was made and the cost was incurred; an upload the app refused before
 * sending counts nothing, because the caller never reaches here.
 */
export function countExtraction(): number {
  const key = countKey();
  const next = sessionExtractionCount() + 1;

  try {
    const storage = sessionStorageOrNull();
    if (storage) {
      storage.setItem(key, String(next));
      return next;
    }
  } catch (error) {
    reportOnce(error);
  }

  pageCounts.set(key, next);
  return next;
}
