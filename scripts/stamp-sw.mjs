/**
 * Stamps a unique cache version into the exported service worker so every
 * deploy invalidates the previous offline cache automatically.
 *
 * Runs after `next build` (static export to out/).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const swPath = join(root, "out", "sw.js");

if (!existsSync(swPath)) {
  console.error("[stamp-sw] out/sw.js not found — did the static export run?");
  process.exit(1);
}

const version = new Date().toISOString().replace(/[-:.TZ]/g, "");
const src = readFileSync(swPath, "utf8");
const stamped = src.replace(/const CACHE_VERSION = "[^"]*";/, `const CACHE_VERSION = "${version}";`);
if (stamped === src) {
  console.error("[stamp-sw] CACHE_VERSION declaration not found in sw.js");
  process.exit(1);
}
writeFileSync(swPath, stamped);
console.log(`[stamp-sw] cache version ${version}`);
