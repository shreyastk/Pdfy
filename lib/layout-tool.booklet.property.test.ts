// Feature: pdfy-feature-expansion, Property 8: Booklet imposition is a valid padded permutation
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { planBooklet, type Cell } from "./layout-tool";

/**
 * Property 8: Booklet imposition is a valid padded permutation.
 * Validates: Requirements 8.3, 8.6
 *
 * For any pageCount >= 1, planBooklet(pageCount) returns { paddedCount, sequence }
 * where:
 *  - paddedCount is the smallest multiple of 4 that is >= pageCount (Req 8.6).
 *  - sequence has length paddedCount.
 *  - The numeric (real-page) entries of sequence are exactly the set
 *    {0, 1, ..., pageCount-1}, each appearing once and only once (no duplicates,
 *    none missing, none out of range).
 *  - The number of "blank" entries equals paddedCount - pageCount.
 *
 * Together these establish that the fold-ordered sequence is a permutation of
 * [0..paddedCount) in which the padded positions (>= pageCount) are surfaced as
 * "blank" — i.e. a valid padded permutation (Req 8.3, 8.6).
 *
 * Generator strategy: pageCount in [1, 100] with >= 100 runs.
 */
describe("Property 8: booklet imposition is a valid padded permutation", () => {
  it("pads to the next multiple of 4 and uses each real page exactly once", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (pageCount) => {
        const { paddedCount, sequence } = planBooklet(pageCount);

        // paddedCount === smallest multiple of 4 that is >= pageCount.
        const expectedPadded = Math.ceil(pageCount / 4) * 4;
        expect(paddedCount).toBe(expectedPadded);
        expect(paddedCount % 4).toBe(0);
        expect(paddedCount).toBeGreaterThanOrEqual(pageCount);

        // Length matches paddedCount.
        expect(sequence.length).toBe(paddedCount);

        // Partition the sequence into numeric entries and "blank" entries.
        const numbers: number[] = [];
        let blanks = 0;
        for (const cell of sequence as Cell[]) {
          if (cell === "blank") {
            blanks++;
          } else {
            numbers.push(cell);
          }
        }

        // Blank count === paddedCount - pageCount.
        expect(blanks).toBe(paddedCount - pageCount);

        // Numeric entries are exactly {0..pageCount-1}, once each.
        expect(numbers.length).toBe(pageCount);
        const seen = new Set(numbers);
        expect(seen.size).toBe(pageCount); // no duplicates
        for (let i = 0; i < pageCount; i++) {
          expect(seen.has(i)).toBe(true); // every real page present and in range
        }
      }),
      { numRuns: 200 },
    );
  });
});
