// Feature: pdfy-feature-expansion, Property 22: Reordering is a multiset-preserving permutation honored by output
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { PDFDocument } from "pdf-lib";
import { moveItem } from "./thumbnails";
import { reorderPdf } from "./page-manager";

/**
 * Property 22: Reordering is a multiset-preserving permutation honored by output.
 * Validates: Requirements 11.6
 *
 * This property has two complementary parts:
 *
 *  Part 1 — the pure reorder primitive `moveItem(arr, from, to)`:
 *    For ANY array and ANY from/to indices (including out-of-range), the result
 *    is a NEW array that is a permutation of the input (same multiset of
 *    elements) and the input is never mutated. For valid in-range, distinct
 *    from/to, the element originally at `from` ends up at index `to` while the
 *    relative order of every other element is preserved.
 *
 *  Part 2 — the executor `reorderPdf(file, order)`:
 *    Given a PDF whose pages are individually identifiable (page i has a unique
 *    width 100 + i), reordering by an arbitrary permutation `order` produces an
 *    output whose page k carries the identity of original page `order[k]`. This
 *    proves the output order equals the supplied display order (Req 11.6).
 */
describe("Property 22: reordering is a multiset-preserving permutation honored by output", () => {
  // -------------------------------------------------------------------------
  // Part 1: moveItem is a multiset-preserving, non-mutating permutation
  // -------------------------------------------------------------------------

  /** Multiset signature: a sorted-key count map so order is ignored. */
  function multiset(arr: number[]): Map<number, number> {
    const m = new Map<number, number>();
    for (const x of arr) m.set(x, (m.get(x) ?? 0) + 1);
    return m;
  }

  function sameMultiset(a: number[], b: number[]): boolean {
    if (a.length !== b.length) return false;
    const ma = multiset(a);
    const mb = multiset(b);
    if (ma.size !== mb.size) return false;
    for (const [k, v] of ma) {
      if (mb.get(k) !== v) return false;
    }
    return true;
  }

  it("returns a non-mutating permutation for any from/to, including out-of-range", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -1000, max: 1000 }), { maxLength: 30 }),
        // Indices range well beyond the array bounds to exercise out-of-range.
        fc.integer({ min: -5, max: 35 }),
        fc.integer({ min: -5, max: 35 }),
        (arr, from, to) => {
          const original = arr.slice();
          const result = moveItem(arr, from, to);

          // Never mutates the input.
          expect(arr).toEqual(original);

          // Returns a fresh array (new reference).
          expect(result).not.toBe(arr);

          // Always a permutation of the input (same multiset).
          expect(sameMultiset(result, original)).toBe(true);

          const inRange =
            Number.isInteger(from) &&
            Number.isInteger(to) &&
            from >= 0 &&
            to >= 0 &&
            from < original.length &&
            to < original.length &&
            from !== to;

          if (inRange) {
            // The moved element lands exactly at index `to`.
            expect(result[to]).toBe(original[from]);

            // The remaining elements keep their original relative order:
            // removing the moved slot from both sequences yields the same list.
            const withoutMovedFromResult = result.slice();
            withoutMovedFromResult.splice(to, 1);
            const remainingOriginal = original.slice();
            remainingOriginal.splice(from, 1);
            expect(withoutMovedFromResult).toEqual(remainingOriginal);
          } else {
            // No-op / invalid move: result equals an unchanged copy.
            expect(result).toEqual(original);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  // -------------------------------------------------------------------------
  // Part 2: reorderPdf honors the displayed order in the output document
  // -------------------------------------------------------------------------

  /**
   * Build a PDF with `n` distinct, identifiable pages: page i has width 100 + i
   * (and a fixed height), so a page's width uniquely identifies its origin.
   */
  async function buildIdentifiablePdf(n: number): Promise<File> {
    const pdf = await PDFDocument.create();
    for (let i = 0; i < n; i++) {
      pdf.addPage([100 + i, 200]);
    }
    const bytes = await pdf.save();
    return new File([bytes as BlobPart], "ordered.pdf", { type: "application/pdf" });
  }

  it("produces output whose page k carries the identity of original page order[k]", async () => {
    await fc.assert(
      fc.asyncProperty(
        // N distinct pages (kept moderate due to pdf-lib cost), then a shuffle.
        fc.integer({ min: 1, max: 8 }).chain((n) =>
          fc
            .shuffledSubarray([...Array(n).keys()], { minLength: n, maxLength: n })
            .map((order) => ({ n, order })),
        ),
        async ({ n, order }) => {
          // Sanity: `order` is a genuine permutation of [0..n-1].
          expect(order.length).toBe(n);
          expect([...order].sort((a, b) => a - b)).toEqual([...Array(n).keys()]);

          const file = await buildIdentifiablePdf(n);
          const outBytes = await reorderPdf(file, order);

          // Reload the output and read each page's identifying width.
          const outPdf = await PDFDocument.load(outBytes);
          const outPages = outPdf.getPages();

          expect(outPages.length).toBe(n);

          for (let k = 0; k < n; k++) {
            const expectedWidth = 100 + order[k];
            // Output page k must be exactly original page order[k].
            expect(Math.round(outPages[k].getSize().width)).toBe(expectedWidth);
          }
        },
      ),
      { numRuns: 40 },
    );
  });
});
