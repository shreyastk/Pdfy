// Feature: pdfy-feature-expansion, Property 9: Editor embeds valid added content; rejects invalid
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { PDFDocument } from "pdf-lib";
import { validateEdit, applyEdits, MIN_TEXT_LENGTH, MAX_TEXT_LENGTH } from "./pdf-editor";
import type { Edit } from "./pdf-editor";

/**
 * Property 9: Editor embeds valid added content; rejects invalid.
 *
 * Validates: Requirements 3.1, 3.2, 3.3
 *
 * Two halves:
 *  - VALID: for any in-bounds text box (1..5,000 chars), rectangle, or line,
 *    `validateEdit` returns { ok: true } and `applyEdits` produces a valid PDF
 *    whose page count is unchanged and whose byte length is > 0 (Req 3.1, 3.3).
 *  - INVALID: for any position outside the page bounds OR text length outside
 *    [1, 5000], `validateEdit` returns { ok: false } with the appropriate
 *    reason and `applyEdits([thatEdit])` REJECTS, leaving content unchanged
 *    (Req 3.2).
 */

// Fixed page size for generation simplicity.
const PAGE_W = 600;
const PAGE_H = 800;

/** Build a single-page PDF of PAGE_W x PAGE_H and wrap the bytes in a File. */
async function makePdfFile(): Promise<File> {
  const pdf = await PDFDocument.create();
  pdf.addPage([PAGE_W, PAGE_H]);
  const bytes = await pdf.save();
  return new File([bytes as BlobPart], "in.pdf", { type: "application/pdf" });
}

// --- In-bounds coordinate generators (closed interval [0, dim]) ------------
const inX = fc.double({ min: 0, max: PAGE_W, noNaN: true });
const inY = fc.double({ min: 0, max: PAGE_H, noNaN: true });

// --- Out-of-bounds coordinate generators -----------------------------------
const outX = fc.oneof(
  fc.double({ min: -1000, max: -0.001, noNaN: true }),
  fc.double({ min: PAGE_W + 0.001, max: PAGE_W + 1000, noNaN: true }),
);
const outY = fc.oneof(
  fc.double({ min: -1000, max: -0.001, noNaN: true }),
  fc.double({ min: PAGE_H + 0.001, max: PAGE_H + 1000, noNaN: true }),
);

/** A point with at least one coordinate outside the page. */
const outPoint = fc.oneof(
  fc.record({ x: outX, y: inY }),
  fc.record({ x: inX, y: outY }),
  fc.record({ x: outX, y: outY }),
);

// ASCII text of an exact length (kept WinAnsi-safe so embedding never fails
// for reasons unrelated to the property under test).
const textOfLength = (lengthArb: fc.Arbitrary<number>): fc.Arbitrary<string> =>
  lengthArb.map((n) => "a".repeat(n));

const fontSizeArb = fc.double({ min: 1, max: 72, noNaN: true });

// ---------------------------------------------------------------------------
// VALID edit generators (all target page index 0, fully in-bounds).
// ---------------------------------------------------------------------------

// Build an in-bounds rectangle from two in-bounds corners so every corner
// satisfies [0, PAGE_W] x [0, PAGE_H].
const inBoundsRect = fc
  .tuple(inX, inX, inY, inY)
  .map(([xa, xb, ya, yb]) => ({
    x: Math.min(xa, xb),
    y: Math.min(ya, yb),
    width: Math.abs(xb - xa),
    height: Math.abs(yb - ya),
  }));

const validTextEdit = (maxLen: number): fc.Arbitrary<Edit> =>
  fc.record({
    kind: fc.constant<"text">("text"),
    page: fc.constant(0),
    x: inX,
    y: inY,
    text: textOfLength(fc.integer({ min: MIN_TEXT_LENGTH, max: maxLen })),
    size: fontSizeArb,
  });

const validRectEdit: fc.Arbitrary<Edit> = fc.record({
  kind: fc.constant<"rect">("rect"),
  page: fc.constant(0),
  rect: inBoundsRect,
});

const validLineEdit: fc.Arbitrary<Edit> = fc.record({
  kind: fc.constant<"line">("line"),
  page: fc.constant(0),
  from: fc.record({ x: inX, y: inY }),
  to: fc.record({ x: inX, y: inY }),
});

// ---------------------------------------------------------------------------
// INVALID edit generators (each is guaranteed to violate a single rule).
// ---------------------------------------------------------------------------

// Text whose length is outside [1, 5000]: empty (0) or too long (>5000).
const invalidTextLengthEdit: fc.Arbitrary<Edit> = fc.record({
  kind: fc.constant<"text">("text"),
  page: fc.constant(0),
  x: inX,
  y: inY,
  text: textOfLength(
    fc.oneof(
      fc.constant(0),
      fc.integer({ min: MAX_TEXT_LENGTH + 1, max: MAX_TEXT_LENGTH + 500 }),
    ),
  ),
  size: fontSizeArb,
});

// Valid-length text but an out-of-bounds insertion point.
const outOfBoundsTextEdit: fc.Arbitrary<Edit> = fc.record({
  kind: fc.constant<"text">("text"),
  page: fc.constant(0),
  text: textOfLength(fc.integer({ min: MIN_TEXT_LENGTH, max: 100 })),
  size: fontSizeArb,
  ...{ x: fc.constant(0), y: fc.constant(0) },
}).chain((base) =>
  outPoint.map((p) => ({ ...base, x: p.x, y: p.y }) as Edit),
);

// Rectangle with a corner outside the page (origin out, or extends past edge).
const outOfBoundsRectEdit: fc.Arbitrary<Edit> = fc
  .oneof(
    // Origin corner outside.
    fc.record({ x: outX, y: inY, width: fc.constant(10), height: fc.constant(10) }),
    fc.record({ x: inX, y: outY, width: fc.constant(10), height: fc.constant(10) }),
    // Extends beyond the right/top edge (x+width > PAGE_W).
    fc.record({
      x: inX,
      y: inY,
      width: fc.double({ min: PAGE_W + 1, max: PAGE_W + 500, noNaN: true }),
      height: fc.double({ min: PAGE_H + 1, max: PAGE_H + 500, noNaN: true }),
    }),
  )
  .map((rect) => ({ kind: "rect", page: 0, rect }) as Edit);

// Line with at least one endpoint outside the page.
const outOfBoundsLineEdit: fc.Arbitrary<Edit> = fc
  .oneof(
    fc.record({ from: outPoint, to: fc.record({ x: inX, y: inY }) }),
    fc.record({ from: fc.record({ x: inX, y: inY }), to: outPoint }),
  )
  .map(({ from, to }) => ({ kind: "line", page: 0, from, to }) as Edit);

const validEditArb = (maxLen: number): fc.Arbitrary<Edit> =>
  fc.oneof(validTextEdit(maxLen), validRectEdit, validLineEdit);

const invalidEditArb: fc.Arbitrary<{ edit: Edit; reason: "too-long" | "out-of-bounds" }> =
  fc.oneof(
    invalidTextLengthEdit.map((edit) => ({ edit, reason: "too-long" as const })),
    outOfBoundsTextEdit.map((edit) => ({ edit, reason: "out-of-bounds" as const })),
    outOfBoundsRectEdit.map((edit) => ({ edit, reason: "out-of-bounds" as const })),
    outOfBoundsLineEdit.map((edit) => ({ edit, reason: "out-of-bounds" as const })),
  );

describe("Property 9: Editor embeds valid added content; rejects invalid", () => {
  // --- VALID half: validateEdit accepts (Req 3.1, 3.3) ---------------------
  it("validateEdit returns { ok: true } for any in-bounds text/rect/line edit", () => {
    fc.assert(
      fc.property(validEditArb(MAX_TEXT_LENGTH), (edit) => {
        expect(validateEdit(edit, PAGE_W, PAGE_H)).toEqual({ ok: true });
      }),
      { numRuns: 200 },
    );
  });

  // --- VALID half: applyEdits embeds and preserves page count (Req 3.1, 3.3)
  it("applyEdits produces a valid PDF with unchanged page count and non-empty bytes for valid edits", async () => {
    await fc.assert(
      fc.asyncProperty(validEditArb(1000), async (edit) => {
        const file = await makePdfFile();
        const out = await applyEdits(file, [edit]);

        // Non-empty output.
        expect(out.byteLength).toBeGreaterThan(0);

        // Re-loads as a valid PDF with the original page count (1).
        const reloaded = await PDFDocument.load(out);
        expect(reloaded.getPageCount()).toBe(1);
      }),
      { numRuns: 40 },
    );
  });

  // --- INVALID half: validateEdit rejects with the right reason (Req 3.2) ---
  it("validateEdit returns { ok: false } with the appropriate reason for out-of-bounds or out-of-range edits", () => {
    fc.assert(
      fc.property(invalidEditArb, ({ edit, reason }) => {
        expect(validateEdit(edit, PAGE_W, PAGE_H)).toEqual({ ok: false, reason });
      }),
      { numRuns: 200 },
    );
  });

  // --- INVALID half: applyEdits rejects, content unchanged (Req 3.2) --------
  it("applyEdits rejects when given a single invalid edit", async () => {
    await fc.assert(
      fc.asyncProperty(invalidEditArb, async ({ edit }) => {
        const file = await makePdfFile();
        await expect(applyEdits(file, [edit])).rejects.toThrow();
      }),
      { numRuns: 40 },
    );
  });

  // --- Concrete boundary examples ------------------------------------------
  it("accepts and embeds a 1-character and a 5,000-character text box (length boundaries)", async () => {
    const file = await makePdfFile();
    const minEdit: Edit = { kind: "text", page: 0, x: 10, y: 10, text: "a", size: 12 };
    const maxEdit: Edit = {
      kind: "text",
      page: 0,
      x: 10,
      y: 20,
      text: "a".repeat(MAX_TEXT_LENGTH),
      size: 12,
    };
    expect(validateEdit(minEdit, PAGE_W, PAGE_H)).toEqual({ ok: true });
    expect(validateEdit(maxEdit, PAGE_W, PAGE_H)).toEqual({ ok: true });

    const out = await applyEdits(file, [minEdit, maxEdit]);
    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getPageCount()).toBe(1);
  });

  it("rejects a 5,001-character text box as too-long and refuses to apply it", async () => {
    const file = await makePdfFile();
    const edit: Edit = {
      kind: "text",
      page: 0,
      x: 10,
      y: 10,
      text: "a".repeat(MAX_TEXT_LENGTH + 1),
      size: 12,
    };
    expect(validateEdit(edit, PAGE_W, PAGE_H)).toEqual({ ok: false, reason: "too-long" });
    await expect(applyEdits(file, [edit])).rejects.toThrow();
  });

  it("rejects an out-of-bounds rectangle and refuses to apply it", async () => {
    const file = await makePdfFile();
    const edit: Edit = { kind: "rect", page: 0, rect: { x: 590, y: 10, width: 100, height: 10 } };
    expect(validateEdit(edit, PAGE_W, PAGE_H)).toEqual({ ok: false, reason: "out-of-bounds" });
    await expect(applyEdits(file, [edit])).rejects.toThrow();
  });
});
