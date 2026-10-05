/**
 * Copies the tesseract.js worker script and its wasm cores out of `node_modules`
 * into `public/tesseract/`, where the browser fetches them as static files.
 *
 * `createWorker` otherwise pulls its worker script and its core from a public CDN
 * at runtime. `scripts/copy-vendor-assets.mjs` carries the rest of that argument
 * and does the copying, and this script names the files tesseract.js needs. Only
 * `eng.traineddata.gz` is committed, because the language data comes from the
 * tessdata_fast release rather than from a package.
 */

import { copyVendorAssets } from "./copy-vendor-assets.mjs";

/**
 * The worker boots from `worker.min.js` and then picks one core by name out of the
 * directory `corePath` points at, choosing between relaxed SIMD, SIMD and plain
 * wasm against what the visitor's browser supports, and between the full core and
 * the LSTM-only one against the `legacy` flag the caller passed. Any of the six can
 * be the one it asks for, so all six are copied. Each `.wasm.js` carries its wasm
 * inline, so the sibling `.wasm` files are never fetched and are not copied.
 */
const assets = [
  "tesseract.js/dist/worker.min.js",
  "tesseract.js-core/tesseract-core.wasm.js",
  "tesseract.js-core/tesseract-core-lstm.wasm.js",
  "tesseract.js-core/tesseract-core-simd.wasm.js",
  "tesseract.js-core/tesseract-core-simd-lstm.wasm.js",
  "tesseract.js-core/tesseract-core-relaxedsimd.wasm.js",
  "tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js",
];

await copyVendorAssets({ label: "tesseract assets", directory: "tesseract", assets });
