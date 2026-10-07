/**
 * Regenerates the three sample receipts under `public/samples/`.
 *
 * The workspace fetches a sample and hands it to the same submit an upload goes
 * through, so each one has to be a real receipt bitmap rather than a fixture the
 * app knows about. Keeping the generator in the repo is what makes the three
 * committed binaries readable: every merchant, address, amount and card number
 * below is invented, and the arithmetic each one prints is deliberate.
 *
 * Run it with `node scripts/make-sample-receipts.mjs`. It writes the three files
 * and prints each one's size. Nothing in the build calls it, because the outputs
 * are committed.
 *
 * `sharp` renders the SVG. It already sits in `node_modules` as a Next dependency.
 * The renderer itself lives in `scripts/receipt-svg.mjs`, because the accuracy
 * fixtures draw their forty receipts on the same grid these three print on.
 */

import { writeFileSync, statSync, mkdirSync } from "node:fs";
import sharp from "sharp";
import { renderSvg, itemRows, sumAmounts } from "./receipt-svg.mjs";

const OUT = "public/samples";
mkdirSync(OUT, { recursive: true });

/* ------------------------------------------------------------------ *
 * Sample 1: the thermal grocery receipt whose items do not sum
 * ------------------------------------------------------------------ */

/**
 * Eleven items that add to 66.73 against a printed subtotal of 67.63.
 *
 * The gap is 0.90 and it reads as a transposed pair of digits, which is the kind
 * of misprint a till produces. The printed total agrees with the printed subtotal
 * plus the printed tax, so the checker raises the line item warning alone and
 * names it on the item total row and on `subtotal`. A total that disagreed too
 * would raise a second warning and muddle what the sample is here to show.
 */
const groceryItems = [
  { description: "BANANAS LOOSE", quantity: "1.5", unitPrice: "1.80", amount: "2.70" },
  { description: "OAT MILK 1L", quantity: "2", unitPrice: "3.45", amount: "6.90" },
  { description: "SOURDOUGH LOAF", quantity: "1", unitPrice: "4.25", amount: "4.25" },
  { description: "FREE RANGE EGGS 12", quantity: "1", unitPrice: "5.60", amount: "5.60" },
  { description: "CHEDDAR 250G", quantity: "1", unitPrice: "6.15", amount: "6.15" },
  { description: "TOMATOES ON VINE", quantity: "0.84", unitPrice: "4.50", amount: "3.78" },
  { description: "GROUND COFFEE 340G", quantity: "1", unitPrice: "8.95", amount: "8.95" },
  { description: "CHICKEN THIGHS", quantity: "0.92", unitPrice: "7.50", amount: "6.90" },
  { description: "OLIVE OIL 500ML", quantity: "1", unitPrice: "9.40", amount: "9.40" },
  { description: "PAPER TOWELS", quantity: "2", unitPrice: "2.75", amount: "5.50" },
  { description: "DARK CHOCOLATE 90G", quantity: "3", unitPrice: "2.20", amount: "6.60" },
];

const GROCERY_SUBTOTAL = "67.63";
const GROCERY_TOTAL = "71.01";

const groceryRows = [
  { center: "LANTERN ROW MARKET", weight: "bold" },
  { center: "412 Quillmore Lane" },
  { center: "Fairhaven Bay, OR 97000" },
  { center: "(000) 555-0142" },
  { gap: 0.6 },
  { rule: true },
  { split: ["10/02/2026", "14:37"] },
  { left: "TILL 04   CASHIER 18" },
  { rule: true },
  { gap: 0.4 },
  ...itemRows(groceryItems),
  { gap: 0.4 },
  { rule: true },
  { split: ["SUBTOTAL", `$${GROCERY_SUBTOTAL}`] },
  { split: ["SALES TAX 5.00%", "$3.38"] },
  { split: ["TOTAL", `$${GROCERY_TOTAL}`], weight: "bold" },
  { rule: true },
  { gap: 0.4 },
  { split: ["VISA DEBIT", `$${GROCERY_TOTAL}`] },
  { left: "CARD ************1234" },
  { left: "AUTH 004219   CHIP READ" },
  { gap: 0.6 },
  { rule: true },
  { center: "SAMPLE RECEIPT - FICTIONAL DATA" },
  { center: "NOT A REAL STORE OR CARD" },
  { center: "THANK YOU FOR SHOPPING" },
];

/* ------------------------------------------------------------------ *
 * Sample 2: the restaurant receipt with a tip and two tax lines
 * ------------------------------------------------------------------ */

/**
 * Six items that add to 79.00, which is what this receipt prints as its subtotal.
 *
 * Two tax lines and a tip sit under it, because the taxes array holds more than
 * one entry and the total check has to add every one of them plus the tip. The
 * arithmetic closes exactly: 79.00 + 4.94 + 1.19 + 16.00 is 101.13.
 */
const bistroItems = [
  { description: "SOUP OF THE DAY", quantity: "2", unitPrice: "7.50", amount: "15.00" },
  { description: "PAN SEARED TROUT", quantity: "1", unitPrice: "24.00", amount: "24.00" },
  { description: "MUSHROOM RISOTTO", quantity: "1", unitPrice: "19.50", amount: "19.50" },
  { description: "HOUSE SALAD", quantity: "1", unitPrice: "8.00", amount: "8.00" },
  { description: "SPARKLING WATER", quantity: "2", unitPrice: "3.25", amount: "6.50" },
  { description: "ESPRESSO", quantity: "2", unitPrice: "3.00", amount: "6.00" },
];

const bistroRows = [
  { center: "THE COPPER KETTLE BISTRO", weight: "bold" },
  { center: "87 Marlow Quay" },
  { center: "Fairhaven Bay, OR 97000" },
  { gap: 0.6 },
  { rule: true },
  { split: ["10/03/2026", "20:12"] },
  { left: "TABLE 9   SERVER ROWAN" },
  { rule: true },
  { gap: 0.4 },
  ...itemRows(bistroItems),
  { gap: 0.4 },
  { rule: true },
  { split: ["SUBTOTAL", "$79.00"] },
  { split: ["STATE SALES TAX 6.25%", "$4.94"] },
  { split: ["CITY MEALS TAX 1.50%", "$1.19"] },
  { split: ["TIP", "$16.00"] },
  { split: ["TOTAL", "$101.13"], weight: "bold" },
  { rule: true },
  { gap: 0.4 },
  { split: ["MASTERCARD", "$101.13"] },
  { left: "CARD ************5678" },
  { left: "AUTH 771640   CONTACTLESS" },
  { gap: 0.6 },
  { rule: true },
  { center: "SAMPLE RECEIPT - FICTIONAL DATA" },
  { center: "NOT A REAL RESTAURANT OR CARD" },
];

/* ------------------------------------------------------------------ *
 * Sample 3: the scanned PDF invoice
 * ------------------------------------------------------------------ */

/**
 * Five lines that add to 168.80, with one tax line taking the total to 182.73.
 *
 * The invoice pays by account transfer and prints no card, so this sample is also
 * the one that leaves `cardLast4` null and gives `paymentMethod` words rather than
 * a scheme name.
 */
const invoiceItems = [
  { description: "A4 COPY PAPER, BOX OF 5", quantity: "2", unitPrice: "23.50", amount: "47.00" },
  { description: "TONER CARTRIDGE, BLACK", quantity: "1", unitPrice: "68.00", amount: "68.00" },
  { description: "LEVER ARCH FILE, GREY", quantity: "10", unitPrice: "3.40", amount: "34.00" },
  { description: "WHITEBOARD MARKER", quantity: "4", unitPrice: "1.95", amount: "7.80" },
  { description: "DELIVERY, NEXT DAY", quantity: "1", unitPrice: "12.00", amount: "12.00" },
];

const invoiceRows = [
  { center: "ALDERWAY OFFICE SUPPLY CO.", weight: "bold" },
  { center: "19 Tanners Row, Fairhaven Bay, OR 97000" },
  { gap: 0.8 },
  { split: ["INVOICE SAMPLE-2048", "2026-09-28"] },
  { left: "BILL TO QUILLMORE DESIGN WORKS" },
  { left: "TERMS   NET 30" },
  { gap: 0.6 },
  { rule: true },
  { split: ["DESCRIPTION", "AMOUNT USD"] },
  { rule: true },
  { gap: 0.4 },
  ...itemRows(invoiceItems, { alwaysQuantity: true }),
  { gap: 0.4 },
  { rule: true },
  { split: ["SUBTOTAL", "$168.80"] },
  { split: ["SALES TAX 8.25%", "$13.93"] },
  { split: ["TOTAL DUE", "$182.73"], weight: "bold" },
  { rule: true },
  { gap: 0.6 },
  { left: "PAID BY ACCOUNT TRANSFER" },
  { left: "REFERENCE 2026-09-28-SAMPLE" },
  { gap: 0.8 },
  { center: "SAMPLE INVOICE - FICTIONAL DATA" },
  { center: "NOT A REAL COMPANY" },
];

/* ------------------------------------------------------------------ *
 * The PDF wrapper
 * ------------------------------------------------------------------ */

/** Wraps objects into the smallest PDF that holds them, the way the `.playwright-mcp/` fixture scripts did. */
function buildPdf(objects) {
  const header = "%PDF-1.7\n";
  const chunks = [Buffer.from(header, "latin1")];
  let offset = header.length;
  const offsets = [];
  objects.forEach((body, index) => {
    const buf = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`, "latin1"),
      Buffer.isBuffer(body) ? body : Buffer.from(body, "latin1"),
      Buffer.from("\nendobj\n", "latin1"),
    ]);
    offsets.push(offset);
    offset += buf.length;
    chunks.push(buf);
  });
  const startxref = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const at of offsets) xref += `${String(at).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(chunks);
}

/**
 * A scanned page is an image and nothing else.
 *
 * The page's whole content stream is one operator drawing the JPEG, so no
 * text-showing operator appears in it and the page carries no font resource at
 * all. That is what makes this sample exercise the slice 5 fallback: pdf.js finds
 * no text layer, so the workspace rasterizes the page and runs the tesseract pass
 * over the bitmap.
 */
function imageOnlyPdf({ jpeg, width, height, pageWidth, pageHeight }) {
  const content = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q`;
  return buildPdf([
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
        "latin1",
      ),
      jpeg,
      Buffer.from("\nendstream", "latin1"),
    ]),
  ]);
}

/* ------------------------------------------------------------------ *
 * Writing the three files
 * ------------------------------------------------------------------ */

function report(path) {
  const { size } = statSync(path);
  console.log(`${path}  ${size} bytes  ${(size / 1024).toFixed(1)} KiB`);
}

const thermal = { width: 640, margin: 26, size: 19, lineHeight: 26 };

await sharp(
  Buffer.from(
    renderSvg({ ...thermal, background: "#f4f2ec", ink: "#23201c", rows: groceryRows }),
  ),
)
  .jpeg({ quality: 78, chromaSubsampling: "4:2:0" })
  .toFile(`${OUT}/grocery-thermal.jpg`);

await sharp(
  Buffer.from(renderSvg({ ...thermal, background: "#f7f6f1", ink: "#1f1d1a", rows: bistroRows })),
)
  .jpeg({ quality: 78, chromaSubsampling: "4:2:0" })
  .toFile(`${OUT}/restaurant-tip.jpg`);

/**
 * The invoice goes through a grayscale, a small rotation and a light blur before it
 * is wrapped, because a scan of a paper invoice is never square to the glass and
 * never sharp. The rotation is also what keeps this sample honest about what the
 * OCR pass has to cope with.
 */
const scanned = await sharp(
  Buffer.from(
    renderSvg({
      width: 860,
      margin: 44,
      size: 20,
      lineHeight: 28,
      background: "#fbfaf6",
      ink: "#201e1b",
      rows: invoiceRows,
    }),
  ),
)
  .rotate(0.7, { background: "#efede7" })
  .grayscale()
  .blur(0.4)
  .jpeg({ quality: 70, chromaSubsampling: "4:4:4" })
  .toBuffer({ resolveWithObject: true });

writeFileSync(
  `${OUT}/invoice-scanned.pdf`,
  imageOnlyPdf({
    jpeg: scanned.data,
    width: scanned.info.width,
    height: scanned.info.height,
    // The bitmap is drawn at roughly 96 dots per inch and a PDF point is 72, so the
    // page box is three quarters of the pixel grid. That puts an A4-sized page under
    // the scan rather than a page as large as the image.
    pageWidth: Math.round((scanned.info.width * 72) / 96),
    pageHeight: Math.round((scanned.info.height * 72) / 96),
  }),
);

console.log(
  `grocery items sum to ${sumAmounts(groceryItems)} against a printed subtotal of ${GROCERY_SUBTOTAL}`,
);
console.log(`restaurant items sum to ${sumAmounts(bistroItems)}`);
console.log(`invoice items sum to ${sumAmounts(invoiceItems)}`);
report(`${OUT}/grocery-thermal.jpg`);
report(`${OUT}/restaurant-tip.jpg`);
report(`${OUT}/invoice-scanned.pdf`);
