// Feature: pdfy-feature-expansion, Property 20: Flatten removes all interactive objects and preserves pagination
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { PDFDocument, PDFName, PDFArray } from "pdf-lib";
import { flattenPdf, countFormFields, countAnnotations } from "./flatten";

/**
 * Property 20: Flatten removes all interactive objects and preserves pagination.
 * Validates: Requirements 9.1, 9.2, 9.3
 *
 * For any PDF containing AcroForm fields and/or annotations, `flattenPdf`
 * returns `{ data }` whose reloaded output has:
 *  - ZERO interactive AcroForm fields              (Req 9.1)
 *  - ZERO interactive annotations across all pages (Req 9.2)
 *  - the SAME page count and order as the input     (Req 9.3)
 *
 * Inputs are constructed so they always contain at least one interactive
 * object (text field, checkbox, and/or link annotation), guaranteeing that
 * `flattenPdf` runs and does not return the `nothing-to-flatten` sentinel.
 */

/** Distinct page sizes (points) used to verify order preservation. */
interface Size {
  width: number;
  height: number;
}

const sizeGen: fc.Arbitrary<Size> = fc.record({
  width: fc.integer({ min: 200, max: 800 }),
  height: fc.integer({ min: 200, max: 800 }),
});

/**
 * Build a PDF with the given page sizes, distributing `textCount` text fields,
 * `checkboxCount` checkboxes, and `linkCount` link annotations across the pages
 * in round-robin order. Returns the saved File plus the input page sizes (in
 * order) so the caller can assert pagination is preserved.
 */
async function buildInteractivePdf(spec: {
  sizes: Size[];
  textCount: number;
  checkboxCount: number;
  linkCount: number;
}): Promise<{ file: File; sizes: Size[] }> {
  const { sizes, textCount, checkboxCount, linkCount } = spec;
  const pdf = await PDFDocument.create();
  const pages = sizes.map((s) => pdf.addPage([s.width, s.height]));
  const form = pdf.getForm();

  // Text fields, placed in-bounds and distributed across pages.
  for (let i = 0; i < textCount; i++) {
    const page = pages[i % pages.length];
    const tf = form.createTextField(`text${i}`);
    tf.setText(`value-${i}`);
    const y = 20 + (Math.floor(i / pages.length) % 5) * 30;
    tf.addToPage(page, { x: 20, y, width: 120, height: 18 });
  }

  // Checkboxes, distributed across pages; check half of them.
  for (let i = 0; i < checkboxCount; i++) {
    const page = pages[i % pages.length];
    const cb = form.createCheckBox(`check${i}`);
    if (i % 2 === 0) cb.check();
    const y = 160 + (Math.floor(i / pages.length) % 5) * 30;
    cb.addToPage(page, { x: 20, y, width: 16, height: 16 });
  }

  // Link annotations (no high-level pdf-lib API): build the annotation dict
  // directly and append it to the page's /Annots array.
  for (let i = 0; i < linkCount; i++) {
    const page = pages[i % pages.length];
    const annot = pdf.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [300, 20 + (i % 5) * 30, 420, 38 + (i % 5) * 30],
      Border: [0, 0, 0],
    });
    const ref = pdf.context.register(annot);
    const existing = page.node.Annots();
    if (existing instanceof PDFArray) {
      existing.push(ref);
    } else {
      page.node.set(PDFName.of("Annots"), pdf.context.obj([ref]));
    }
  }

  const bytes = await pdf.save();
  return {
    file: new File([bytes as BlobPart], "interactive.pdf", { type: "application/pdf" }),
    sizes,
  };
}

describe("Property 20: flatten removes all interactive objects and preserves pagination", () => {
  it("produces output with zero fields, zero annotations, and identical page order", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .record({
            sizes: fc.array(sizeGen, { minLength: 1, maxLength: 4 }),
            textCount: fc.integer({ min: 0, max: 3 }),
            checkboxCount: fc.integer({ min: 0, max: 3 }),
            linkCount: fc.integer({ min: 0, max: 3 }),
          })
          // Guarantee at least one interactive object so flatten runs.
          .filter((s) => s.textCount + s.checkboxCount + s.linkCount >= 1),
        async (spec) => {
          const { file, sizes } = await buildInteractivePdf(spec);

          const result = await flattenPdf(file);

          // Must have flattened (not the nothing-to-flatten sentinel).
          expect("data" in result).toBe(true);
          if (!("data" in result)) return;

          const reloaded = await PDFDocument.load(result.data);

          // Req 9.1: zero interactive AcroForm fields.
          expect(countFormFields(reloaded)).toBe(0);
          expect(reloaded.getForm().getFields().length).toBe(0);

          // Req 9.2: zero interactive annotations across all pages.
          expect(countAnnotations(reloaded)).toBe(0);

          // Req 9.3: same page count and order (page sizes match in order).
          const outPages = reloaded.getPages();
          expect(outPages.length).toBe(sizes.length);
          outPages.forEach((page, idx) => {
            const { width, height } = page.getSize();
            expect(width).toBeCloseTo(sizes[idx].width, 3);
            expect(height).toBeCloseTo(sizes[idx].height, 3);
          });
        },
      ),
      { numRuns: 50 },
    );
  });

  it("returns nothing-to-flatten for a PDF with no fields and no annotations", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([612, 792]);
    pdf.addPage([400, 300]);
    const bytes = await pdf.save();
    const file = new File([bytes as BlobPart], "plain.pdf", { type: "application/pdf" });

    const result = await flattenPdf(file);

    expect(result).toEqual({ error: "nothing-to-flatten" });
  });
});
