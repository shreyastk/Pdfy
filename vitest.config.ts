import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    // Heavy property-based tests build and reload PDFs with pdf-lib at 100
    // fast-check runs. Under parallel load these can exceed Vitest's default
    // 5s per-test budget even though they pass in isolation. Raise the global
    // timeouts so the suite is stable without weakening any test (numRuns and
    // assertions are unchanged).
    testTimeout: 30000,
    hookTimeout: 30000,
    include: ["lib/**/*.{test,spec}.{ts,tsx}", "components/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["lib/**", "components/**"],
    },
  },
});
