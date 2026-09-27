import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { PDFDocument, degrees } from "pdf-lib";
import { addHeaderFooter, batesNumber, formatTemplate, visualToUser } from "./header-footer";

describe("batesNumber", () => {
  it("zero-pads and applies prefix/suffix", () => {
    expect(batesNumber({ prefix: "ABC", start: 7, digits: 6, suffix: "-X" }, 0)).toBe("ABC000007-X");
    expect(batesNumber({ prefix: "", start: 1, digits: 3, suffix: "" }, 1000)).toBe("1001");
  });

  it("increases by exactly one per page", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000 }), fc.integer({ min: 1, max: 8 }), (start, digits) => {
        const spec = { prefix: "P", start, digits, suffix: "" };
        const a = Number(batesNumber(spec, 0).slice(1));
        const b = Number(batesNumber(spec, 1).slice(1));
        expect(b).toBe(a + 1);
      }),
    );
  });
});

describe("formatTemplate", () => {
  it("replaces every known token and leaves unknown ones", () => {
    const ctx = { page: 3, total: 9, date: "1/2/2026", filename: "a.pdf", bates: "B01" };
    expect(formatTemplate("Page {page} of {total} {x} {bates}", ctx)).toBe("Page 3 of 9 {x} B01");
  });
});

describe("visualToUser", () => {
  const box = { x: 10, y: 20, width: 600, height: 800 };

  it("only offsets by the box origin at 0°", () => {
    expect(visualToUser(5, 6, box, 0)).toEqual({ x: 15, y: 26, angle: 0 });
  });

  it("maps the visual bottom-left corner to the matching user corner for each rotation", () => {
    expect(visualToUser(0, 0, box, 90)).toMatchObject({ x: 610, y: 20, angle: 90 });
    expect(visualToUser(0, 0, box, 180)).toMatchObject({ x: 610, y: 820, angle: 180 });
    expect(visualToUser(0, 0, box, 270)).toMatchObject({ x: 10, y: 820, angle: 270 });
  });
});

describe("addHeaderFooter", () => {
  it("stamps pages (including rotated ones and non-Latin text) and keeps the page count", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 400]);
    doc.addPage([300, 400]).setRotation(degrees(90));
    const file = new File([(await doc.save()) as BlobPart], "in.pdf", { type: "application/pdf" });
    const out = await addHeaderFooter(file, {
      slots: { "footer-center": "Page {page} of {total} ✓", "header-right": "{bates}" },
      fontSize: 10,
      margin: 20,
      color: { r: 0, g: 0, b: 0 },
      bates: { prefix: "X", start: 1, digits: 4, suffix: "" },
      firstPage: 1,
    });
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  });
});
