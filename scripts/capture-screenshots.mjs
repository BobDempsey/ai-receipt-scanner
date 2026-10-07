// @ts-check
/**
 * Retakes the two screenshots the landing page shows.
 *
 * The portfolio baseline rules out illustrations, so `public/screenshots/` holds
 * real captures of the running app. They go stale every time the workspace
 * changes, which is why the recipe lives here beside them rather than in a
 * person's memory: the viewport, the sample, the field to select and the region to
 * crop are all written down, so two captures taken months apart frame the same
 * thing.
 *
 * Run it against a dev server with a working `OPENAI_API_KEY`, because each
 * capture spends one real model call on one of the three fictional samples:
 *
 *   npm run dev
 *   node scripts/capture-screenshots.mjs
 *
 * Playwright is not a dependency of this project, so install it first if the
 * script says it is missing:
 *
 *   npm i -D playwright && npx playwright install chromium
 *
 * The captures are PNG rather than JPEG. Both files enter git, and a screenshot
 * exists to be read at full size, where JPEG's ringing around small type is worst.
 * Each one stays well under a megabyte at this viewport; the script prints the
 * byte size of what it wrote so a change that bloats them is visible immediately.
 */

import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";

/** The viewport every capture is taken at, so two of them frame the same thing. */
const VIEWPORT = { width: 1440, height: 900 };

/** One device pixel per CSS pixel. A 2x capture doubles the committed bytes for nothing. */
const DEVICE_SCALE_FACTOR = 1;

const BASE_URL = process.env.CAPTURE_BASE_URL ?? "http://localhost:3000";

const OUT_DIR = join(process.cwd(), "public", "screenshots");

/** How long an extraction may take: one model call, plus the OCR pass behind it. */
const EXTRACTION_TIMEOUT_MS = 120_000;

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    console.error(
      "playwright is not installed. Run: npm i -D playwright && npx playwright install chromium",
    );
    process.exit(1);
  }
}

async function report(name) {
  const path = join(OUT_DIR, name);
  const { size } = await stat(path);
  console.log(`wrote ${name}: ${(size / 1024).toFixed(0)} KB`);
  if (size > 900_000) {
    console.warn(`  ${name} is close to a megabyte. Narrow the crop before committing it.`);
  }
}

async function main() {
  const { chromium } = await loadPlaywright();
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
  });

  await page.goto(BASE_URL, { waitUntil: "networkidle" });

  // The dev server paints its own floating badge over the bottom left corner, and
  // a committed screenshot of the app should not carry the toolbar of the server
  // that happened to serve it. It lives in a custom element, so hiding that
  // element hides all of it.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });

  // The grocery sample is the one whose items fall 0.90 short of its printed
  // subtotal, so the first capture shows the arithmetic warning without staging
  // anything. Its control is the first "Scan this sample" in the sample row.
  await page.getByRole("button", { name: "Scan this sample" }).first().click();

  // The fields have landed when the total is on screen as a control. The field
  // panel labels every cell with `aria-label`, so this is the accessible name
  // rather than a class name that a restyle would break.
  const total = page.locator('input[aria-label="Total"]');
  await total.waitFor({ timeout: EXTRACTION_TIMEOUT_MS });

  // The OCR pass runs beside the model call, and the mark cannot be drawn until it
  // finishes, so the capture waits for the measuring message to clear.
  await page
    .getByText("Measuring the image")
    .waitFor({ state: "hidden", timeout: EXTRACTION_TIMEOUT_MS })
    .catch(() => {});

  // Focus is the selection, so focusing the total is what draws the mark over the
  // printed figure on the image. The first capture is pointless without it.
  await total.focus();

  // Frame the two panes from the top of the document pane rather than from the top
  // of the page, which would spend half the capture on the picker. The window is
  // scrolled rather than the heading scrolled into view, because the document pane
  // has a scroll container of its own and `scrollIntoViewIfNeeded` would move that
  // one instead, sliding the marked total out of the frame.
  await page.evaluate(() => {
    const heading = [...document.querySelectorAll("h2")].find(
      (node) => node.textContent?.trim() === "The receipt",
    );
    if (heading) {
      window.scrollTo({ top: heading.getBoundingClientRect().top + window.scrollY - 70 });
    }
  });
  await page.waitForTimeout(600);

  await page.screenshot({ path: join(OUT_DIR, "extraction.png") });
  await report("extraction.png");

  // The second capture is the line items and the exports, which sit below the fold
  // of the first one. The frame starts at the item table's own heading so every
  // item fits, and the window is scrolled rather than an element brought into view
  // for the same reason the first capture scrolls the window.
  await page.evaluate(() => {
    const heading = [...document.querySelectorAll("h3, h2")].find((node) =>
      node.textContent?.trim().toLowerCase().startsWith("line item"),
    );
    if (heading) {
      window.scrollTo({ top: heading.getBoundingClientRect().top + window.scrollY - 70 });
    }
  });
  await page.waitForTimeout(600);

  await page.screenshot({ path: join(OUT_DIR, "line-items-and-export.png") });
  await report("line-items-and-export.png");

  await browser.close();
}

await main();
