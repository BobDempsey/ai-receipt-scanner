/**
 * Copies the tesseract.js worker script and its wasm cores out of `node_modules`
 * into `public/tesseract/`, where the browser fetches them as static files.
 *
 * `createWorker` otherwise pulls its worker script and its core from a public CDN
 * at runtime, which makes a portfolio demo depend on a host nobody here controls.
 * Serving the files ourselves removes that dependency, and copying them on every
 * build rather than committing them keeps binaries out of git and keeps the copy
 * from drifting away from the installed version. Only `eng.traineddata.gz` is
 * committed, because the language data comes from the tessdata_fast release
 * rather than from a package.
 *
 * This runs as `prebuild` and `predev` on Windows and on Vercel's Linux builders,
 * so it is a Node script rather than a `cp` one-liner.
 *
 * The script creates `public/tesseract/` when it is absent and writes the files it
 * names. It never empties the directory: `eng.traineddata.gz` lives there and is
 * part of the repo, and nothing in this repo gets deleted to make room for
 * generated files.
 */

import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = join(repoRoot, "public", "tesseract");

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

await mkdir(destination, { recursive: true });

for (const asset of assets) {
  const source = join(repoRoot, "node_modules", asset);
  const name = asset.slice(asset.lastIndexOf("/") + 1);
  const target = join(destination, name);

  try {
    await copyFile(source, target);
  } catch (cause) {
    throw new Error(
      `could not copy ${asset} out of node_modules. Run npm install and try again.`,
      { cause },
    );
  }

  const { size } = await stat(target);
  console.log(`tesseract assets: ${name} (${(size / 1024).toFixed(0)} KB)`);
}

console.log(`tesseract assets: ${assets.length} files in public/tesseract/`);
