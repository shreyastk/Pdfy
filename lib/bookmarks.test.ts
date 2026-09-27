import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRef } from "pdf-lib";
import { buildOutlineTree, flattenOutline, validateOutline, writeOutline, type OutlineEntry } from "./bookmarks";

/** Valid flat outlines: each entry is at most one level deeper than the previous. */
const outlineArb = (pageCount: number) =>
  fc
    .array(
      fc.tuple(
        fc.string({ minLength: 1, maxLength: 12 }).filter((s) => s.trim() !== ""),
        fc.integer({ min: 0, max: pageCount - 1 }),
        fc.integer({ min: 0, max: 3 }),
      ),
      { maxLength: 25 },
    )
    .map((rows) => {
      let prev = -1;
      return rows.map(([title, page, want]): OutlineEntry => {
        const level = Math.min(want, prev + 1);
        prev = level;
        return { title: title.trim(), page, level };
      });
    });

describe("outline tree", () => {
  it("flatten(build(entries)) round-trips any valid outline", () => {
    fc.assert(
      fc.property(outlineArb(5), (entries) => {
        expect(validateOutline(entries, 5)).toEqual({ ok: true });
        expect(flattenOutline(buildOutlineTree(entries))).toEqual(entries);
      }),
    );
  });

  it("rejects skipped levels, bad pages and empty titles", () => {
    expect(validateOutline([{ title: "a", page: 0, level: 1 }], 1)).toMatchObject({ ok: false, reason: "bad-level" });
    expect(validateOutline([{ title: "a", page: 3, level: 0 }], 1)).toMatchObject({ ok: false, reason: "bad-page" });
    expect(validateOutline([{ title: " ", page: 0, level: 0 }], 1)).toMatchObject({ ok: false, reason: "empty-title" });
  });
});

describe("writeOutline", () => {
  it("writes a linked /Outlines structure pointing at the right pages", async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 3; i++) doc.addPage();
    const file = new File([(await doc.save()) as BlobPart], "in.pdf");
    const bytes = await writeOutline(file, [
      { title: "Intro", page: 0, level: 0 },
      { title: "Détails", page: 1, level: 1 },
      { title: "End", page: 2, level: 0 },
    ]);

    const out = await PDFDocument.load(bytes);
    const title = (d: PDFDict) => (d.lookup(PDFName.of("Title")) as PDFHexString).decodeText();
    const root = out.catalog.lookup(PDFName.of("Outlines"), PDFDict);
    const first = root.lookup(PDFName.of("First"), PDFDict);
    expect(title(first)).toBe("Intro");

    const child = first.lookup(PDFName.of("First"), PDFDict);
    expect(title(child)).toBe("Détails");
    const dest = child.lookup(PDFName.of("Dest"), PDFArray);
    expect(dest.get(0)).toBeInstanceOf(PDFRef);
    expect((dest.get(0) as PDFRef).toString()).toBe(out.getPage(1).ref.toString());

    expect(title(first.lookup(PDFName.of("Next"), PDFDict))).toBe("End");
    expect((root.lookup(PDFName.of("Count")) as PDFNumber).asNumber()).toBe(3);
  });
});
