// Feature: pdfy-feature-expansion, Property 19: OCR reports and preserves pages with no recognized text
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { PDFDocument } from "pdf-lib";
import { rebuildSearchablePdf, type PageRecognition } from "./ocr-engine";

/**
 * Property 19: OCR reports and preserves pages with no recognized text.
 *
 * Validates: Requirements 2.5
 *
 * For any input PDF (N pages, 1..6) and any subset S of pages that the
 * recognizer yields NO recognized text for (empty word list, or words made up
 * of only whitespace), while the remaining pages yield at least one real word,
 * calling `rebuildSearchablePdf(originalBytes, recognitions)` must:
 *
 *   - report `pagesWithNoText` (1-based) equal to exactly the sorted set S
 *     (pages with no recognized text are reported), and
 *   - produce an output whose page count equals the original page count (pages
 *     with no text are preserved, never dropped), and
 *   - produce output bytes that reload as a valid PDF.
 *
 * The recognizer is mocked entirely: we drive `rebuildSearchablePdf` directly
 * with a constructed `recognitions` array, so no browser/pdf.js/WASM is needed.
 */

/** Build a PDF with `pageCount` pages and return its serialized bytes. */
async function buildPdfBytes(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    // Vary page sizes a little so the test isn't accidentally uniform.
    doc.addPage([200 + i * 10, 300 + i * 10]);
  }
  return doc.save();
}

// A page with NO recognized text: either an empty word list, or words whose
// text is entirely whitespace (which must also count as "no text").
const noTextPageArb: fc.Arbitrary<PageRecognition> = fc.oneof(
  fc.constant<PageRecognition>({ words: [], scale: 1 }),
  fc.constant<PageRecognition>({
    words: [{ text: "   ", bbox: { x0: 10, y0: 10, x1: 40, y1: 30 } }],
    scale: 1,
  }),
  fc.constant<PageRecognition>({
    words: [
      { text: "", bbox: { x0: 5, y0: 5, x1: 20, y1: 20 } },
      { text: "\t\n ", bbox: { x0: 25, y0: 5, x1: 45, y1: 20 } },
    ],
    scale: 1,
  })
);

// A page WITH recognized text: at least one real (non-whitespace) word with a
// bbox that fits inside the page is constructed inline in the property below.

describe("Property 19: OCR reports and preserves pages with no recognized text", () => {
  it("reports exactly the no-text pages and preserves all pages", async () => {
    await fc.assert(
      fc.asyncProperty(
        // N pages in [1, 6].
        fc.integer({ min: 1, max: 6 }).chain((n) =>
          fc.record({
            n: fc.constant(n),
            // For each of the n pages, decide whether it is a "no text" page.
            // This subset S (including empty and full) is encoded by booleans.
            noText: fc.array(fc.boolean(), { minLength: n, maxLength: n }),
            // Independent generators per page to also exercise whitespace cases.
            noTextPages: fc.array(noTextPageArb, { minLength: n, maxLength: n }),
          })
        ),
        async ({ n, noText, noTextPages }) => {
          const originalBytes = await buildPdfBytes(n);

          const recognitions: PageRecognition[] = [];
          const expectedS: number[] = [];
          for (let i = 0; i < n; i++) {
            if (noText[i]) {
              recognitions.push(noTextPages[i]);
              expectedS.push(i + 1); // 1-based page number.
            } else {
              // A page that yields at least one real recognized word.
              recognitions.push({
                words: [{ text: "word", bbox: { x0: 10, y0: 10, x1: 60, y1: 30 } }],
                scale: 1,
              });
            }
          }

          const { pdf, pagesWithNoText } = await rebuildSearchablePdf(
            originalBytes.slice(),
            recognitions
          );

          // pagesWithNoText (1-based) equals exactly the sorted set S.
          expect([...pagesWithNoText].sort((a, b) => a - b)).toEqual(expectedS);

          // Output page count equals the original page count (preservation).
          const reloaded = await PDFDocument.load(pdf);
          expect(reloaded.getPageCount()).toBe(n);
        }
      ),
      { numRuns: 50 }
    );
  });
});
