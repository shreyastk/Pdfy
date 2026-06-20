// Feature: pdfy-feature-expansion, Property 27: Theme resolution and persistence round-trip
import { describe, it, expect, beforeEach } from "vitest";
import fc from "fast-check";
import {
  resolveTheme,
  readStoredTheme,
  writeStoredTheme,
  THEME_STORAGE_KEY,
  type Theme,
} from "./theme";

/** The persisted/stored theme domain: a concrete theme or "unset" (null). */
const storedArb: fc.Arbitrary<Theme | null> = fc.constantFrom<(Theme | null)[]>(
  "light",
  "dark",
  null,
);

/** OS preference is a small boolean domain. */
const osPrefersDarkArb: fc.Arbitrary<boolean> = fc.boolean();

/** A concrete (non-null) theme for round-trip tests. */
const themeArb: fc.Arbitrary<Theme> = fc.constantFrom<Theme[]>("light", "dark");

describe("Property 27: Theme resolution and persistence round-trip", () => {
  beforeEach(() => {
    // Ensure a clean localStorage between cases (jsdom environment).
    window.localStorage.clear();
  });

  // Validates: Requirements 16.1, 16.2, 16.4
  it("resolves a persisted theme to itself and a null theme to the OS preference", () => {
    fc.assert(
      fc.property(storedArb, osPrefersDarkArb, (stored, prefersDark) => {
        const resolved = resolveTheme(stored, prefersDark);

        if (stored !== null) {
          // Req 16.1 / 16.2: a persisted value always wins.
          expect(resolved).toBe(stored);
        } else {
          // Req 16.4: with nothing persisted, fall back to OS preference.
          expect(resolved).toBe(prefersDark ? "dark" : "light");
        }

        // The result is always a valid theme.
        expect(["light", "dark"]).toContain(resolved);
      }),
      { numRuns: 200 },
    );
  });

  // Validates: Requirements 16.1, 16.2, 16.4
  it("writes then reads back the same theme (persistence round-trip), and that value wins resolution for any OS preference", () => {
    fc.assert(
      fc.property(themeArb, osPrefersDarkArb, (theme, prefersDark) => {
        window.localStorage.clear();

        // Round-trip: writing then reading returns the same theme.
        const wrote = writeStoredTheme(theme);
        expect(wrote).toBe(true);

        const readBack = readStoredTheme();
        expect(readBack).toBe(theme);

        // The persisted value also lands in the underlying storage key.
        expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe(theme);

        // Req 16.1 / 16.2: a persisted value wins resolution regardless of OS.
        expect(resolveTheme(readBack, prefersDark)).toBe(theme);
      }),
      { numRuns: 200 },
    );
  });

  it("reads back null when nothing has been persisted (OS-preference fallback applies)", () => {
    fc.assert(
      fc.property(osPrefersDarkArb, (prefersDark) => {
        window.localStorage.clear();

        const readBack = readStoredTheme();
        expect(readBack).toBeNull();

        // Req 16.4: null -> OS preference.
        expect(resolveTheme(readBack, prefersDark)).toBe(
          prefersDark ? "dark" : "light",
        );
      }),
      { numRuns: 100 },
    );
  });
});
