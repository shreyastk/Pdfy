// Feature: pdfy-feature-expansion, Property 15: Comparison accounts for every page exactly once
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { computePageStatuses, type PageStatus } from "./pdf-compare";

/**
 * Property 15: Comparison accounts for every page exactly once.
 * Validates: Requirements 5.1, 5.4
 *
 * For any two arrays of page texts `aPageTexts` and `bPageTexts` (arbitrary
 * strings, varying lengths including unequal and zero), `computePageStatuses`
 * returns a list where:
 *  - The list length === max(aLen, bLen) and every page index 1..max(aLen,bLen)
 *    appears EXACTLY once, in strictly ascending order.
 *  - For i < min(aLen, bLen) (a page present in both documents): status is
 *    "unchanged" when aPageTexts[i] === bPageTexts[i], else "modified".
 *  - For a page present only in `a` (i in [bLen, aLen) when aLen > bLen): status
 *    is "removed".
 *  - For a page present only in `b` (i in [aLen, bLen) when bLen > aLen): status
 *    is "added".
 *
 * Generator strategy: generate two independent arrays of strings with
 * `fc.array(fc.string())` so lengths vary freely (including unequal and zero).
 * We deliberately allow `fc.string()` to occasionally collide so common pages
 * exercise both the "unchanged" and "modified" branches.
 */
describe("Property 15: comparison accounts for every page exactly once", () => {
  it("returns one valid status per page index 1..max, with the correct classification", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string()),
        fc.array(fc.string()),
        (aPageTexts, bPageTexts) => {
          const aLen = aPageTexts.length;
          const bLen = bPageTexts.length;
          const max = Math.max(aLen, bLen);
          const min = Math.min(aLen, bLen);

          const result = computePageStatuses(aPageTexts, bPageTexts);

          // List length === max(aLen, bLen).
          expect(result.length).toBe(max);

          // Every page index 1..max appears EXACTLY once, in ascending order.
          const seen = new Set<number>();
          for (let idx = 0; idx < result.length; idx++) {
            const entry = result[idx];
            // Pages are emitted in ascending order: entry at position idx is page idx+1.
            expect(entry.page).toBe(idx + 1);
            expect(seen.has(entry.page)).toBe(false);
            seen.add(entry.page);
          }
          // Exactly the set {1..max}.
          expect(seen.size).toBe(max);
          for (let page = 1; page <= max; page++) {
            expect(seen.has(page)).toBe(true);
          }

          const validStatuses: PageStatus[] = [
            "unchanged",
            "modified",
            "added",
            "removed",
          ];

          for (const entry of result) {
            const i = entry.page - 1;

            // Every status is one of the four valid values.
            expect(validStatuses).toContain(entry.status);

            if (i < min) {
              // Present in both documents -> unchanged iff equal, else modified.
              const expected: PageStatus =
                aPageTexts[i] === bPageTexts[i] ? "unchanged" : "modified";
              expect(entry.status).toBe(expected);
            } else if (i < aLen) {
              // Present only in `a` (aLen > bLen) -> removed.
              expect(entry.status).toBe("removed");
            } else {
              // Present only in `b` (bLen > aLen) -> added.
              expect(entry.status).toBe("added");
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
