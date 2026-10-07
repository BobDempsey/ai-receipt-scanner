/**
 * The three sample receipts the workspace offers under the file picker.
 *
 * A visitor who arrives with no receipt to hand still has to see the app work, so
 * the landing screen is never empty. Each entry names a static file under
 * `public/samples/`: the workspace fetches it, wraps the bytes as a `File` and
 * calls the same submit an upload calls, so nothing downstream of the picker
 * learns that a sample is different from a file the visitor chose.
 *
 * All three are invented. The merchants, the addresses and the card digits belong
 * to no real business and no real card, and each image says so in its own footer
 * as well as on the page beside it.
 *
 * `scripts/make-sample-receipts.mjs` writes the three files and holds the reason
 * behind every amount on them. Changing a figure here without rerunning that
 * script would leave this list describing a receipt that no longer exists.
 */

/** Where every sample file lives, which the test asserts each path begins with. */
export const SAMPLES_PATH_PREFIX = "/samples/";

export type SampleReceipt = {
  /** A stable key for the control that loads it. Never reaches the receipt object. */
  id: string;
  /** What the visitor reads on the control. */
  name: string;
  /** One line saying what this sample shows, printed under the name. */
  description: string;
  /** The public path the browser fetches. */
  path: string;
  /** The type the fetched bytes are wrapped as, which the route checks again. */
  mediaType: string;
};

export const SAMPLE_RECEIPTS: readonly SampleReceipt[] = [
  {
    id: "grocery-thermal",
    name: "Grocery till receipt",
    description:
      "Eleven items whose amounts fall 0.90 short of the printed subtotal, so the arithmetic warning appears without hunting for a flawed receipt.",
    path: "/samples/grocery-thermal.jpg",
    mediaType: "image/jpeg",
  },
  {
    id: "restaurant-tip",
    name: "Restaurant bill",
    description:
      "A meal with a tip and two separate tax lines, where every printed figure adds up.",
    path: "/samples/restaurant-tip.jpg",
    mediaType: "image/jpeg",
  },
  {
    id: "invoice-scanned",
    name: "Scanned invoice",
    description:
      "A PDF holding a photographed page and no text layer, so the app rasterizes it and reads the words with OCR.",
    path: "/samples/invoice-scanned.pdf",
    mediaType: "application/pdf",
  },
];
