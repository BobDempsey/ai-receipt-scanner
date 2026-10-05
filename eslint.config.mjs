import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The tesseract.js worker script and wasm cores that
    // scripts/copy-tesseract-assets.mjs copies out of node_modules. They are
    // minified vendor files, so linting them reports thousands of problems about
    // code this repo does not own.
    "public/tesseract/**",
  ]),
]);

export default eslintConfig;
