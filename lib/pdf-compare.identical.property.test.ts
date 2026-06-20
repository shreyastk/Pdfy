// Feature: pdfy-feature-expansion, Property 16: Identical documents report no differences
import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { buildCompareResult } from "./pdf-compare";
import type { Rect } from "./types";

/**
 * Property 16: Identical documents report no differences.
 *
 * For any array of page texts `texts`, comparing a document against an identical
 * copy (`buildCompareResult(texts, texts)`) must report:
 *  - identical === true
 *  - textDiffs is empty (no added/removed words on any page)
 *  - every page status is "unchanged".
 *
 * This holds whether or not visual diffs are supplied, as long as no supplied
 * region is non-empty (an identical document has no differing regions).
 *
 * Validates: Requirements 5.6
 */
describe("Property 16: Identical documents report no differences", () => {
  it("reports identical=true, no text diffs, all pages unchanged for any text array", () => {
    fc.assert(
      fc.property(fc.array(fc.string()), (texts) => {
        const result = buildCompareResult(texts, texts);

        expect(result.identical).toBe(true);
        expect(result.textDiffs).toHaveLength(0);
        expect(result.pages).toHaveLength(texts.length);
        for (const page of result.pages) {
          expect(page.status).toBe("unchanged");
        }
      }),
      { numRuns: 200 },
    );
  });

  it("stays identical=true when empty-region visual diffs are provided", () => {
    fc.assert(
      fc.property(fc.array(fc.string()), (texts) => {
        // One empty-region visual diff entry per common page (all pages here).
        const visualDiffs: { page: number; regions: Rect[] }[] = texts.map(
          (_t, i) => ({ page: i + 1, regions: [] }),
        );

        const result = buildCompareResult(texts, texts, visualDiffs);

        expect(result.identical).toBe(true);
        expect(result.textDiffs).toHaveLength(0);
        for (const page of result.pages) {
          expect(page.status).toBe("unchanged");
        }
        // The supplied (empty) visual diffs are echoed back unchanged.
        expect(result.visualDiffs).toEqual(visualDiffs);
      }),
      { numRuns: 200 },
    );
  });

  // Complementary check: when at least one page differs, identical becomes false.
  it("reports identical=false when any page differs", () => {
    fc.assert(
      fc.property(
        // A non-empty base document plus a guaranteed-different alternate page.
        fc.array(fc.string(), { minLength: 1 }),
        fc.string(),
        fc.nat(),
        (texts, replacement, rawIndex) => {
          const index = rawIndex % texts.length;
          // Ensure the chosen page genuinely differs from the original.
          fc.pre(texts[index] !== replacement);

          const modified = texts.slice();
          modified[index] = replacement;

          const result = buildCompareResult(texts, modified);
          expect(result.identical).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });
});
