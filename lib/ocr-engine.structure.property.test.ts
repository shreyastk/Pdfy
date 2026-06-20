// Feature: pdfy-feature-expansion, Property 18: OCR preserves page structure
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { PDFDocument } from "pdf-lib";
import {
  rebuildSearchablePdf,
  runOcr,
  type OpenedPdf,
  type PageRecognition,
  type Recognizer,
  type OcrProgress,
} from "./ocr-engine";

/**
 * Property 18: OCR preserves page structure.
 * Validates: Requirements 2.2
 *
 * Requirement 2.2 states the OCR_Engine SHALL produce a Searchable PDF that embeds
 * the recognized text as a selectable text layer over each original page, *preserving
 * the original page count, dimensions, and visual content*.
 *
 * The structure-preserving rebuild (`rebuildSearchablePdf`) is pure pdf-lib (no
 * DOM/canvas/WASM), and `runOcr` drives it through three injectable seams
 * (`openDocument`, `createRecognizer`, `recognizePage`). For Property 18 we exercise
 * both:
 *
 *  1. `rebuildSearchablePdf` directly: for any input PDF of 1..5 pages of varying
 *     sizes, and a MOCKED per-page recognition (some pages with words, some empty),
 *     the output PDF (a) is a valid, loadable, non-empty PDF, (b) has the same page
 *     count as the input, and (c) each output page's width/height equals the
 *     corresponding original page's width/height.
 *
 *  2. `runOcr` with all three seams mocked: the recognizer is fake, page rendering is
 *     mocked, and document opening returns pdf-lib-built bytes. The result preserves
 *     page count and dimensions, and `onProgress` fires once per page.
 *
 * Generator strategy: page count in [1, 5]; per-page dimensions in a realistic point
 * range. pdf-lib document construction + (re)loading dominates cost, so we use 100
 * runs (still fast) but cap at >= 50 as required.
 */

// A page's dimensions in PDF points.
interface PageDims {
  width: number;
  height: number;
}

// 1..5 pages, each of a varying realistic size (in points).
const pagesArb: fc.Arbitrary<PageDims[]> = fc.array(
  fc.record({
    width: fc.integer({ min: 72, max: 1224 }),
    height: fc.integer({ min: 72, max: 1584 }),
  }),
  { minLength: 1, maxLength: 5 },
);

/** Build an original PDF (no text layer) with the given page sizes. */
async function buildOriginal(pages: PageDims[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const { width, height } of pages) {
    doc.addPage([width, height]);
  }
  return doc.save();
}

/**
 * Construct a mocked per-page recognition. Every other page (even index) gets a
 * single mocked word with a bbox safely inside the page; the rest get no words.
 * `scale` is 1 so bbox pixel-space maps 1:1 to PDF user-space.
 */
function mockRecognitions(pages: PageDims[]): PageRecognition[] {
  return pages.map((dims, i) => {
    if (i % 2 === 0) {
      // Keep the bbox well inside the page so the mapped overlay stays on-page.
      const x0 = Math.min(10, dims.width / 4);
      const y0 = Math.min(10, dims.height / 4);
      const x1 = Math.min(x0 + 40, dims.width - 1);
      const y1 = Math.min(y0 + 12, dims.height - 1);
      return {
        words: [{ text: `word${i}`, bbox: { x0, y0, x1, y1 } }],
        scale: 1,
      };
    }
    return { words: [], scale: 1 };
  });
}

const EPS = 1e-3;

describe("Property 18: OCR preserves page structure", () => {
  it("rebuildSearchablePdf preserves page count and per-page dimensions", async () => {
    await fc.assert(
      fc.asyncProperty(pagesArb, async (pages) => {
        const originalBytes = await buildOriginal(pages);

        const { pdf } = await rebuildSearchablePdf(
          originalBytes,
          mockRecognitions(pages),
        );

        // Output is a valid, loadable, non-empty PDF.
        expect(pdf.length).toBeGreaterThan(0);
        const out = await PDFDocument.load(pdf);

        // Page count preserved.
        expect(out.getPageCount()).toBe(pages.length);

        // Each page's dimensions preserved (within a tiny epsilon).
        const outPages = out.getPages();
        for (let i = 0; i < pages.length; i++) {
          const { width, height } = outPages[i].getSize();
          expect(Math.abs(width - pages[i].width)).toBeLessThanOrEqual(EPS);
          expect(Math.abs(height - pages[i].height)).toBeLessThanOrEqual(EPS);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("runOcr (all seams mocked) preserves structure and reports per-page progress", async () => {
    await fc.assert(
      fc.asyncProperty(pagesArb, async (pages) => {
        const originalBytes = await buildOriginal(pages);
        const recognitions = mockRecognitions(pages);

        // Seam 1: openDocument returns the pdf-lib-built bytes + page count.
        const openDocument = async (_file: File): Promise<OpenedPdf> => ({
          numPages: pages.length,
          bytes: originalBytes,
        });

        // Seam 2: a fake recognizer (never actually invoked because recognizePage
        // is also mocked, but must satisfy the Recognizer contract + teardown).
        let terminated = false;
        const createRecognizer = async (_lang: string): Promise<Recognizer> => ({
          async recognize() {
            return { words: [] };
          },
          async terminate() {
            terminated = true;
          },
        });

        // Seam 3: recognizePage returns the mocked PageRecognition for each page.
        const recognizePage = async (
          _opened: OpenedPdf,
          _recognizer: Recognizer,
          pageNumber: number,
        ): Promise<PageRecognition> => recognitions[pageNumber - 1];

        const progress: OcrProgress[] = [];
        const onProgress = (p: OcrProgress) => progress.push(p);

        // A stand-in File; the mocked openDocument ignores its contents.
        const file = new File([originalBytes as BlobPart], "scan.pdf", {
          type: "application/pdf",
        });

        const result = await runOcr(file, onProgress, {
          openDocument,
          createRecognizer,
          recognizePage,
        });

        // Resolves with a valid, loadable, non-empty PDF.
        expect(result.pdf.length).toBeGreaterThan(0);
        const out = await PDFDocument.load(result.pdf);

        // Page count preserved.
        expect(out.getPageCount()).toBe(pages.length);

        // Per-page dimensions preserved.
        const outPages = out.getPages();
        for (let i = 0; i < pages.length; i++) {
          const { width, height } = outPages[i].getSize();
          expect(Math.abs(width - pages[i].width)).toBeLessThanOrEqual(EPS);
          expect(Math.abs(height - pages[i].height)).toBeLessThanOrEqual(EPS);
        }

        // onProgress fired exactly once per page, in order, with correct totals.
        expect(progress.length).toBe(pages.length);
        for (let i = 0; i < pages.length; i++) {
          expect(progress[i].page).toBe(i + 1);
          expect(progress[i].total).toBe(pages.length);
        }

        // Engine resources were released.
        expect(terminated).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
