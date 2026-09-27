/**
 * Copies third-party runtime assets from node_modules into public/vendor so
 * the app never fetches code or data from a CDN at runtime. Everything is
 * served from our own origin, which keeps the "nothing leaves your device"
 * promise honest and lets the service worker cache it for offline use.
 *
 * Runs automatically before `dev` and `build` (see package.json).
 */
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nm = (...p) => join(root, "node_modules", ...p);
const out = (...p) => join(root, "public", "vendor", ...p);

const ASSETS = [
  // PDF.js worker (must match the pdfjs-dist version the app imports).
  [nm("pdfjs-dist", "build", "pdf.worker.min.mjs"), out("pdfjs", "pdf.worker.min.mjs")],
  // Tesseract.js worker + LSTM WASM cores (the default OCR engine mode).
  [nm("tesseract.js", "dist", "worker.min.js"), out("tesseract", "worker.min.js")],
  ...["", "simd-", "relaxedsimd-"].map((v) => [
    nm("tesseract.js-core", `tesseract-core-${v}lstm.wasm.js`),
    out("tesseract", "core", `tesseract-core-${v}lstm.wasm.js`),
  ]),
  // English trained data (the only OCR language the UI offers).
  [nm("@tesseract.js-data", "eng", "4.0.0_best_int", "eng.traineddata.gz"), out("tesseract", "lang", "eng.traineddata.gz")],
];

let copied = 0;
for (const [src, dest] of ASSETS) {
  if (!existsSync(src)) {
    console.error(`[copy-assets] missing ${src} — run npm install`);
    process.exit(1);
  }
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  copied++;
}
console.log(`[copy-assets] copied ${copied} vendor assets to public/vendor`);
