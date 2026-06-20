// Feature: pdfy-feature-expansion, Property 11: Editing with no edits is the identity
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { PDFDocument } from "pdf-lib";
import { applyEdits } from "./pdf-editor";

/**
 * Property 11: Editing with no edits is the identity.
 *
 * Validates: Requirements 3.7
 *
 * For any generated PDF (varying page count and page sizes), calling
 * `applyEdits(file, [])` with an empty edit list returns bytes that are
 * byte-for-byte identical to the input file's bytes.
 *
 * The implementation reads the file's bytes directly and returns
 * `new Uint8Array(arrayBuffer)` without round-tripping through pdf-lib, so the
 * output must match the input exactly: same length and same byte values at
 * every index.
 */

// A single page's dimensions. Bounds span common page sizes (A-series, Letter,
// etc.) while staying small enough that PDF creation is cheap.
const pageSizeArb = fc.record({
  width: fc.integer({ min: 50, max: 1200 }),
  height: fc.integer({ min: 50, max: 1200 }),
});

// 1..5 pages, each with its own (possibly different) size.
const pagesArb = fc.array(pageSizeArb, { minLength: 1, maxLength: 5 });

/** Build a PDF with the given page sizes and return its serialized bytes. */
async function buildPdfBytes(
  pages: { width: number; height: number }[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const { width, height } of pages) {
    doc.addPage([width, height]);
  }
  return doc.save();
}

describe("Property 11: applyEdits with no edits is the identity", () => {
  it("returns the original bytes unchanged for an empty edit list", async () => {
    await fc.assert(
      fc.asyncProperty(pagesArb, async (pages) => {
        const originalBytes = await buildPdfBytes(pages);
        // Copy the bytes into the File so a later mutation of the source array
        // could never mask a real difference.
        const file = new File([originalBytes.slice()], "input.pdf", {
          type: "application/pdf",
        });

        const result = await applyEdits(file, []);

        // Byte-for-byte identity: same length and same value at every index.
        expect(result).toBeInstanceOf(Uint8Array);
        expect(result.length).toBe(originalBytes.length);
        expect(Array.from(result)).toEqual(Array.from(originalBytes));
      }),
      { numRuns: 100 }
    );
  });
});
