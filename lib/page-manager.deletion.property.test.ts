// Feature: pdfy-feature-expansion, Property 1: Deletion keeps the ascending complement
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { planDeletion } from "./page-manager";

/**
 * Property 1: Deletion keeps the ascending complement.
 * Validates: Requirements 6.1
 *
 * For any totalPages >= 1 and any selected subset (1-based page numbers) that is
 * neither empty nor the full set, planDeletion returns `keepIndices` equal to the
 * sorted ascending 0-based complement of the unique, in-range selection. The
 * result satisfies:
 *  - |keepIndices| === totalPages - |uniqueSelected|
 *  - keepIndices is exactly the ascending complement (every 0-based index not selected)
 *  - keepIndices is strictly increasing
 *
 * Generator strategy: pick totalPages in [1, 50], then build a proper non-empty
 * subset of the 1-based pages [1..totalPages]. We pick a non-empty selection of
 * distinct page numbers and guarantee it is proper (leaves at least one page) by
 * requiring totalPages >= 2 and selecting a subset whose unique size is in
 * [1, totalPages - 1].
 */
describe("Property 1: deletion keeps the ascending complement", () => {
  it("returns the strictly-increasing 0-based complement of the unique in-range selection", () => {
    fc.assert(
      fc.property(
        // totalPages >= 2 so a proper non-empty subset can exist.
        fc.integer({ min: 2, max: 50 }).chain((totalPages) => {
          const allPages = Array.from({ length: totalPages }, (_, i) => i + 1);
          // A proper non-empty subset: at least 1, at most totalPages - 1 pages.
          return fc
            .uniqueArray(fc.constantFrom(...allPages), {
              minLength: 1,
              maxLength: totalPages - 1,
            })
            .map((selected) => ({ totalPages, selected }));
        }),
        ({ totalPages, selected }) => {
          const result = planDeletion(totalPages, selected);

          // A proper non-empty selection must never hit a guard error.
          expect("keepIndices" in result).toBe(true);
          if (!("keepIndices" in result)) return;

          const keepIndices = result.keepIndices;

          // Expected: ascending 0-based complement of the unique selection.
          const selectedZeroBased = new Set(selected.map((p) => p - 1));
          const expected: number[] = [];
          for (let i = 0; i < totalPages; i++) {
            if (!selectedZeroBased.has(i)) expected.push(i);
          }

          // Cardinality: |keepIndices| === totalPages - |uniqueSelected|.
          expect(keepIndices.length).toBe(totalPages - selectedZeroBased.size);

          // Exactly the ascending complement.
          expect(keepIndices).toEqual(expected);

          // Strictly increasing.
          for (let i = 1; i < keepIndices.length; i++) {
            expect(keepIndices[i]).toBeGreaterThan(keepIndices[i - 1]);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
