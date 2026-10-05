/**
 * Copies a named list of files out of `node_modules` into a directory under
 * `public/`, where the browser fetches them as static files.
 *
 * tesseract.js and pdf.js both pull a worker script from a public CDN at runtime
 * unless the app points them somewhere else, which makes a portfolio demo depend
 * on a host nobody here controls. Serving the files ourselves removes that
 * dependency, and copying them on every build rather than committing them keeps
 * binaries out of git and keeps the copy from drifting away from the installed
 * version.
 *
 * Both callers run as `prebuild` and `predev` on Windows and on Vercel's Linux
 * builders, so this is a Node module rather than a `cp` one-liner, and the copy
 * lives here once rather than once per caller.
 *
 * The copy creates its destination when it is absent and writes the files the
 * caller names. It never empties the directory: `public/tesseract/` holds the
 * committed `eng.traineddata.gz`, and nothing in this repo gets deleted to make
 * room for generated files.
 */

import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * @param {object} options
 * @param {string} options.label Names the caller in the log lines, such as `tesseract assets`.
 * @param {string} options.directory Directory under `public/`, such as `tesseract`.
 * @param {readonly string[]} options.assets Paths under `node_modules`. Each file lands in the
 *   destination under its own basename.
 */
export async function copyVendorAssets({ label, directory, assets }) {
  const destination = join(repoRoot, "public", directory);

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
    console.log(`${label}: ${name} (${(size / 1024).toFixed(0)} KB)`);
  }

  const count = assets.length === 1 ? "1 file" : `${assets.length} files`;
  console.log(`${label}: ${count} in public/${directory}/`);
}
