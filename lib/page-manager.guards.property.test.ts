// Feature: pdfy-feature-expansion, Property 3: Page-operation guards reject empty and total-delete selections
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { planDeletion, planExtraction } from "./page-manager";

/**
 * Property 3: Page-operation guards reject empty and total-delete selections.
 *
 * For any totalPages >= 1:
 *  - planDeletion(totalPages, [])   -> { error: "none-selected" }
 *  - planExtraction(totalPages, []) -> { error: "none-selected" }
 *  - planDeletion(totalPages, full set in any order, with duplicates)
 *                                   -> { error: "all-selected" }
 *
 * In every guarded case there is no keepIndices (no output document is produced).
 *
 * Validates: Requirements 6.4, 6.5
 */

/** Arbitrary total page count (>= 1). */
const totalPagesArb = fc.integer({ min: 1, max: 500 });

/**
 * Build the full page set [1..totalPages], shuffled and possibly containing
 * duplicates, so the guard is exercised against tolerant/messy selections.
 */
function fullSetSelectionArb(totalPages: number): fc.Arbitrary<number[]> {
  const fullSet = Array.from({ length: totalPages }, (_, i) => i + 1);
  // Extra duplicate entries drawn from the same range.
  const dupesArb = fc.array(fc.integer({ min: 1, max: totalPages }), {
    maxLength: totalPages,
  });
  return dupesArb.chain((dupes) =>
    // Shuffle the union of the full set plus duplicates.
    fc.shuffledSubarray([...fullSet, ...dupes], {
      minLength: fullSet.length + dupes.length,
      maxLength: fullSet.length + dupes.length,
    }),
  );
}

describe("Property 3: Page-operation guards reject empty and total-delete selections", () => {
  // Validates: Requirements 6.4
  it("planDeletion and planExtraction reject an empty selection with none-selected (no keepIndices)", () => {
    fc.assert(
      fc.property(totalPagesArb, (totalPages) => {
        const del = planDeletion(totalPages, []);
        const ext = planExtraction(totalPages, []);

        // Both must report the none-selected guard error.
        expect(del).toEqual({ error: "none-selected" });
        expect(ext).toEqual({ error: "none-selected" });

        // No output document: keepIndices must be absent.
        expect("keepIndices" in del).toBe(false);
        expect("keepIndices" in ext).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  // Validates: Requirements 6.5
  it("planDeletion rejects deleting the full page set with all-selected (no keepIndices)", () => {
    fc.assert(
      fc.property(
        totalPagesArb.chain((totalPages) =>
          fullSetSelectionArb(totalPages).map((selected) => ({ totalPages, selected })),
        ),
        ({ totalPages, selected }) => {
          const del = planDeletion(totalPages, selected);

          // Deleting every page must be refused to keep >= 1 page remaining.
          expect(del).toEqual({ error: "all-selected" });

          // No output document: keepIndices must be absent.
          expect("keepIndices" in del).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });
});
