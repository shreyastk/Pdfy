// Feature: pdfy-feature-expansion, Property 2: Extraction keeps exactly the selection in order
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { planExtraction } from "./page-manager";

/**
 * Property 2: For any totalPages >= 1 and any NON-EMPTY selected subset
 * (1-based, in range, possibly with duplicates and unordered), planExtraction
 * returns `keepIndices` equal to the unique selected pages as 0-based indices
 * sorted ascending (original relative order preserved).
 *
 * Generator: pick `totalPages`, then build a non-empty selection by sampling
 * page numbers from `[1, totalPages]` (allowing duplicates and arbitrary order).
 */
const inputArb = fc
  .integer({ min: 1, max: 200 })
  .chain((totalPages) =>
    fc.record({
      totalPages: fc.constant(totalPages),
      selected: fc.array(fc.integer({ min: 1, max: totalPages }), {
        minLength: 1,
        maxLength: 250,
      }),
    }),
  );

describe("Property 2: Extraction keeps exactly the selection in order", () => {
  // Validates: Requirements 6.2
  it("returns the unique selected pages as 0-based indices sorted ascending", () => {
    fc.assert(
      fc.property(inputArb, ({ totalPages, selected }) => {
        const result = planExtraction(totalPages, selected);

        // A non-empty, in-range selection must never be the none-selected guard.
        expect("keepIndices" in result).toBe(true);
        if (!("keepIndices" in result)) return;

        const expected = Array.from(new Set(selected.map((p) => p - 1))).sort(
          (a, b) => a - b,
        );

        expect(result.keepIndices).toEqual(expected);
      }),
      { numRuns: 200 },
    );
  });
});
