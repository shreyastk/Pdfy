// Feature: pdfy-feature-expansion, Property 7: N-up preserves source order and pads to a full multiple
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { planNup, type Cell, type NupCount } from "./layout-tool";

/**
 * Property 7: N-up preserves source order and pads to a full multiple.
 *
 * For any pageCount >= 1 and n in {2,4,6,8,9,16}:
 *  - Concatenating all cells across all sheets in reading order and dropping
 *    the "blank" cells reproduces [0, 1, ..., pageCount-1] exactly.
 *  - The total number of cells (sheets.length * n) is the SMALLEST multiple of
 *    n that is >= pageCount.
 *  - Each sheet has exactly n cells.
 *  - Extra cells (beyond pageCount) are "blank".
 *
 * Generator: pageCount in [1, 100] and n via fc.constantFrom(2,4,6,8,9,16).
 */
const NUP_COUNTS: readonly NupCount[] = [2, 4, 6, 8, 9, 16];

const inputArb = fc.record({
  pageCount: fc.integer({ min: 1, max: 100 }),
  n: fc.constantFrom<NupCount>(...NUP_COUNTS),
});

describe("Property 7: N-up preserves source order and pads to a full multiple", () => {
  // Validates: Requirements 8.1, 8.5
  it("preserves source order, fills full sheets, and pads extra cells with blanks", () => {
    fc.assert(
      fc.property(inputArb, ({ pageCount, n }) => {
        const { sheets } = planNup(pageCount, n);

        // Each sheet has exactly n cells.
        for (const sheet of sheets) {
          expect(sheet.length).toBe(n);
        }

        // Total cells is the smallest multiple of n that is >= pageCount.
        const expectedTotalCells = Math.ceil(pageCount / n) * n;
        expect(sheets.length * n).toBe(expectedTotalCells);

        // Flatten all cells across all sheets in reading order.
        const allCells: Cell[] = sheets.flat();
        expect(allCells.length).toBe(expectedTotalCells);

        // Dropping "blank" reproduces [0, 1, ..., pageCount-1] exactly.
        const nonBlank = allCells.filter((c): c is number => c !== "blank");
        const expectedSequence = Array.from({ length: pageCount }, (_, i) => i);
        expect(nonBlank).toEqual(expectedSequence);

        // Extra cells (beyond pageCount) are "blank"; the first pageCount cells
        // in reading order are the source pages in order.
        allCells.forEach((cell, index) => {
          if (index < pageCount) {
            expect(cell).toBe(index);
          } else {
            expect(cell).toBe("blank");
          }
        });
      }),
      { numRuns: 200 },
    );
  });
});
