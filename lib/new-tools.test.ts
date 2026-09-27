import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { PDFDocument, PDFName, PDFDict, PDFString } from "pdf-lib";
import { planInterleave, interleavePdfs } from "./interleave";
import { removeAnnotations, shouldKeep } from "./remove-annotations";
import { extractImages, stencilToRgba, toRgba } from "./extract-images";

async function pdfWithPages(sizes: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const w of sizes) doc.addPage([w, 500]);
  return doc.save();
}

describe("planInterleave", () => {
  it("alternates pages and appends the leftovers", () => {
    expect(planInterleave(3, 2)).toEqual([[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]]);
    expect(planInterleave(2, 2, true)).toEqual([[0, 0], [1, 1], [0, 1], [1, 0]]);
    expect(planInterleave(0, 2)).toEqual([[1, 0], [1, 1]]);
  });

  it("uses every page of both documents exactly once", () => {
    fc.assert(
      fc.property(fc.nat(50), fc.nat(50), fc.boolean(), (a, b, rev) => {
        const plan = planInterleave(a, b, rev);
        expect(plan.length).toBe(a + b);
        const keys = new Set(plan.map(([s, i]) => `${s}:${i}`));
        expect(keys.size).toBe(a + b);
        for (const [s, i] of plan) expect(i).toBeLessThan(s === 0 ? a : b);
      }),
    );
  });

  it("builds the interleaved PDF", async () => {
    const a = await pdfWithPages([100, 101]);
    const b = await pdfWithPages([200, 201]);
    const { bytes } = await interleavePdfs(a, b, true);
    const out = await PDFDocument.load(bytes);
    expect(out.getPages().map((p) => p.getWidth())).toEqual([100, 201, 101, 200]);
  });
});

describe("removeAnnotations", () => {
  async function annotated(): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const annot = (subtype: string) =>
      doc.context.register(
        doc.context.obj({ Type: "Annot", Subtype: subtype, Rect: [0, 0, 10, 10], Contents: PDFString.of("x") }),
      );
    page.node.set(PDFName.of("Annots"), doc.context.obj([annot("Highlight"), annot("Text"), annot("Link"), annot("Widget")]));
    return doc.save();
  }

  const subtypes = async (bytes: Uint8Array) => {
    const doc = await PDFDocument.load(bytes);
    const annots = doc.getPage(0).node.Annots();
    if (!annots) return [];
    return annots.asArray().map((a) => String(doc.context.lookup(a, PDFDict).get(PDFName.of("Subtype"))));
  };

  it("keeps links and form fields by default", async () => {
    const result = await removeAnnotations(await annotated());
    expect(result.total).toBe(2);
    expect(result.removed).toEqual({ Highlight: 1, Text: 1 });
    expect(await subtypes(result.bytes)).toEqual(["/Link", "/Widget"]);
  });

  it("can remove everything", async () => {
    const result = await removeAnnotations(await annotated(), { keepLinks: false, keepFormFields: false });
    expect(result.total).toBe(4);
    expect(await subtypes(result.bytes)).toEqual([]);
  });

  it("shouldKeep only spares links and widgets", () => {
    expect(shouldKeep("Link")).toBe(true);
    expect(shouldKeep("Widget", { keepFormFields: false })).toBe(false);
    expect(shouldKeep("Popup")).toBe(false);
  });
});

describe("image decoding", () => {
  it("expands 1-bit gray and 8-bit RGB samples", () => {
    // 3 px wide 1-bit row: 1 0 1 -> padded to one byte 0b10100000
    expect(Array.from(toRgba(new Uint8Array([0b10100000]), 3, 1, 1, { kind: "gray" }))).toEqual([
      255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255,
    ]);
    expect(Array.from(toRgba(new Uint8Array([10, 20, 30]), 1, 1, 8, { kind: "rgb" }))).toEqual([10, 20, 30, 255]);
  });

  it("resolves indexed palettes and CMYK", () => {
    const lookup = new Uint8Array([255, 0, 0, 0, 0, 255]);
    const px = toRgba(new Uint8Array([1, 0]), 2, 1, 8, { kind: "indexed", base: "rgb", hival: 1, lookup });
    expect(Array.from(px)).toEqual([0, 0, 255, 255, 255, 0, 0, 255]);
    expect(Array.from(toRgba(new Uint8Array([0, 0, 0, 255]), 1, 1, 8, { kind: "cmyk" }))).toEqual([0, 0, 0, 255]);
  });

  it("paints stencil masks black on transparent", () => {
    const px = stencilToRgba(new Uint8Array([0b01000000]), 2, 1, false);
    expect(Array.from(px)).toEqual([0, 0, 0, 255, 0, 0, 0, 0]);
  });
});

describe("extractImages", () => {
  it("exports raw RGB images with their page and skips tiny ones", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const img = (w: number) =>
      doc.context.register(
        doc.context.stream(new Uint8Array(w * w * 3).fill(128), {
          Type: "XObject",
          Subtype: "Image",
          Width: w,
          Height: w,
          ColorSpace: "DeviceRGB",
          BitsPerComponent: 8,
        }),
      );
    const xobjects = doc.context.obj({ Big: img(40), Tiny: img(4) });
    page.node.set(PDFName.of("Resources"), doc.context.obj({ XObject: xobjects }));
    const result = await extractImages(await doc.save());
    expect(result.tooSmall).toBe(1);
    expect(result.images).toHaveLength(1);
    expect(result.images[0].filename).toBe("page-1-image-1.png");
    const data = result.images[0].data as { rgba: Uint8ClampedArray };
    expect(Array.from(data.rgba.slice(0, 4))).toEqual([128, 128, 128, 255]);
  });
});
