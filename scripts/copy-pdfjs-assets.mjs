/**
 * Copies the pdf.js worker out of `node_modules` into `public/pdfjs/`, where the
 * browser fetches it as a static file.
 *
 * `pdfjs-dist` otherwise resolves its worker against a CDN, and bundling the worker
 * through Next would make a 1.2 MB vendor file part of the client graph for a file
 * the browser only ever loads as a separate script. `scripts/copy-vendor-assets.mjs`
 * carries the rest of that argument and does the copying. `lib/pdf-page.ts` points
 * `GlobalWorkerOptions.workerSrc` at the copy.
 */

import { copyVendorAssets } from "./copy-vendor-assets.mjs";

/**
 * The worker runs as one self-contained ES module: the minified build inlines
 * everything it needs, so nothing beside it is fetched. Its `.map` is a development
 * aid the browser never asks for unless devtools are open against this file, and
 * pdf.js's standard fonts and cmaps stay out, because reading a receipt's text layer
 * for positions needs neither.
 */
const assets = ["pdfjs-dist/build/pdf.worker.min.mjs"];

await copyVendorAssets({ label: "pdf.js assets", directory: "pdfjs", assets });
