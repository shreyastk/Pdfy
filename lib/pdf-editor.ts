/**
 * PDF Editor — adds text boxes, shapes (rectangle/line), and redactions to a PDF.
 *
 * This module concentrates the editing logic for the "Edit PDF" tool (Requirement 3)
 * in the `lib/` layer so it can be tested independently of React/DOM.
 *
 * Coordinate system: all positions are expressed in PDF user-space points using
 * pdf-lib's convention (origin at the bottom-left of each page, Y increasing
 * upward). The `page` field on every {@link Edit} is a **0-based page index** that
 * matches `PDFDocument.getPages()` indexing.
 *
 * Colors ({@link RGB}) use 0..1-normalized channels, matching pdf-lib's `rgb()`.
 *
 * See design.md "PDF Editor (`lib/pdf-editor.ts`)" and Requirements 3.1, 3.2, 3.3,
 * 3.6, 3.7.
 *
 * Redaction (Req 3.4, 3.5) is implemented by {@link applyEdits}: for every page
 * that has a `redact` edit, the intersecting text is **removed from the page's
 * content stream** (so it cannot be recovered through text extraction or copy)
 * and an opaque mark is drawn over the region. The text-removal strategy is a
 * self-contained content-stream rewrite (no DOM/canvas, no pdf.js) so it runs
 * identically in the browser and in tests. See {@link removeIntersectingText}
 * for the algorithm and its fidelity limitations.
 */

import {
  PDFDocument,
  PDFPage,
  StandardFonts,
  rgb,
  PDFName,
} from "pdf-lib";
import type { Point, Rect, RGB } from "./types";
import {
  getContentRawStreams,
  isWhitespace,
  latin1ToBytes,
  readPageContent,
  scanHexString,
  scanLiteralString,
  tokenize,
  type Token,
} from "./content-stream";

/** Minimum number of characters allowed in a text edit (inclusive). */
export const MIN_TEXT_LENGTH = 1;
/** Maximum number of characters allowed in a text edit (inclusive). */
export const MAX_TEXT_LENGTH = 5000;

/**
 * A single edit operation applied to a page of a PDF.
 *
 * - `text`  — draw `text` at `(x, y)` with the given font `size`.
 * - `rect`  — draw a rectangle described by `rect` (optionally filled with `color`).
 * - `line`  — draw a line from `from` to `to` (optionally stroked with `color`).
 * - `redact`— cover `rect` with an opaque mark (text-removal added in a later task).
 *
 * `page` is a 0-based page index (matches `PDFDocument.getPages()`).
 */
export type Edit =
  | { kind: "text"; page: number; x: number; y: number; text: string; size: number }
  | { kind: "rect"; page: number; rect: Rect; color?: RGB }
  | { kind: "line"; page: number; from: Point; to: Point; color?: RGB }
  | { kind: "redact"; page: number; rect: Rect };

/** The result of validating a single edit against its page dimensions. */
export type EditValidation =
  | { ok: true }
  | { ok: false; reason: "out-of-bounds" | "too-long" };

/** True when `(x, y)` lies within the closed page rectangle `[0,pageW] x [0,pageH]`. */
function pointInBounds(x: number, y: number, pageW: number, pageH: number): boolean {
  return x >= 0 && x <= pageW && y >= 0 && y <= pageH;
}

/** True when every corner of `rect` lies within the page bounds. */
function rectInBounds(rect: Rect, pageW: number, pageH: number): boolean {
  const x0 = rect.x;
  const y0 = rect.y;
  const x1 = rect.x + rect.width;
  const y1 = rect.y + rect.height;
  return (
    pointInBounds(x0, y0, pageW, pageH) && pointInBounds(x1, y1, pageW, pageH)
  );
}

/**
 * Validate a single {@link Edit} against the dimensions of the page it targets.
 *
 * - text: rejected as `too-long` when the text length is outside `[1, 5000]`, and
 *   as `out-of-bounds` when the insertion point falls outside the page.
 * - rect / redact: rejected as `out-of-bounds` when the rectangle is not fully
 *   within the page bounds.
 * - line: rejected as `out-of-bounds` when either endpoint is outside the page.
 *
 * Returns `{ ok: true }` when the edit is valid.
 *
 * Validates: Requirements 3.1, 3.2, 3.3
 */
export function validateEdit(edit: Edit, pageW: number, pageH: number): EditValidation {
  switch (edit.kind) {
    case "text": {
      if (edit.text.length < MIN_TEXT_LENGTH || edit.text.length > MAX_TEXT_LENGTH) {
        return { ok: false, reason: "too-long" };
      }
      if (!pointInBounds(edit.x, edit.y, pageW, pageH)) {
        return { ok: false, reason: "out-of-bounds" };
      }
      return { ok: true };
    }
    case "rect":
    case "redact": {
      if (!rectInBounds(edit.rect, pageW, pageH)) {
        return { ok: false, reason: "out-of-bounds" };
      }
      return { ok: true };
    }
    case "line": {
      if (
        !pointInBounds(edit.from.x, edit.from.y, pageW, pageH) ||
        !pointInBounds(edit.to.x, edit.to.y, pageW, pageH)
      ) {
        return { ok: false, reason: "out-of-bounds" };
      }
      return { ok: true };
    }
  }
}

/** Convert an {@link RGB} (0..1 channels) to a pdf-lib color, defaulting to black. */
function toColor(color?: RGB) {
  if (!color) return rgb(0, 0, 0);
  return rgb(color.r, color.g, color.b);
}

/** Build a human-readable error message for a rejected edit. */
function describeRejection(edit: Edit, reason: "out-of-bounds" | "too-long"): string {
  if (reason === "too-long") {
    return `Invalid edit on page ${edit.page + 1}: text length must be between ${MIN_TEXT_LENGTH} and ${MAX_TEXT_LENGTH} characters.`;
  }
  return `Invalid edit on page ${edit.page + 1}: ${edit.kind} position is outside the page boundaries.`;
}

/**
 * Apply a list of {@link Edit}s to a PDF and return the resulting bytes.
 *
 * Behavior:
 * - **Empty edit list is the identity (Req 3.7):** when `edits` is empty, the
 *   original document bytes are returned **unchanged**. The bytes are read
 *   directly from the input file and are NOT re-serialized through pdf-lib, so
 *   the output is byte-for-byte identical to the input.
 * - **All-or-nothing validation (Req 3.2):** every edit is validated against its
 *   target page's dimensions before any drawing occurs. If any edit is invalid
 *   (out-of-bounds position or out-of-range text length) the function throws an
 *   `Error` describing the offending edit and the page content is left unchanged
 *   (nothing is drawn or saved).
 * - **Drawing (Req 3.1, 3.3):** valid `text`, `rect`, and `line` edits are drawn
 *   with pdf-lib (`drawText` using an embedded Helvetica font, `drawRectangle`,
 *   `drawLine`). `redact` edits draw an opaque black rectangle over the region;
 *   content-stream text removal is added in a later task.
 *
 * All processing is performed in-memory (Req 3.6); no network access occurs.
 *
 * @param file - the source PDF.
 * @param edits - the edits to apply; `page` is a 0-based page index.
 * @returns the edited PDF bytes (or the original bytes when `edits` is empty).
 * @throws Error when any edit is invalid or targets a non-existent page.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.6, 3.7
 */
export async function applyEdits(file: File, edits: Edit[]): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();

  // Req 3.7: with no edits, return the original document bytes unchanged.
  // Do NOT round-trip through pdf-lib so the output is byte-identical.
  if (edits.length === 0) {
    return new Uint8Array(arrayBuffer);
  }

  const pdf = await PDFDocument.load(arrayBuffer);
  const pages = pdf.getPages();

  // Validate every edit first so an invalid edit leaves content unchanged (Req 3.2).
  for (const edit of edits) {
    if (edit.page < 0 || edit.page >= pages.length) {
      throw new Error(
        `Invalid edit: page index ${edit.page} is out of range (document has ${pages.length} page(s)).`
      );
    }
    const page = pages[edit.page];
    const { width, height } = page.getSize();
    const result = validateEdit(edit, width, height);
    if (!result.ok) {
      throw new Error(describeRejection(edit, result.reason));
    }
  }

  // --- Redaction text removal (Req 3.4) -----------------------------------
  // Must run BEFORE any drawing, because removing intersecting text rewrites
  // the page's content stream wholesale; anything drawn first would be lost.
  // Group redaction rectangles by their target page, then strip intersecting
  // text-showing operators from each affected page's content stream so the
  // covered text is unrecoverable via extraction/copy.
  const redactionsByPage = new Map<number, Rect[]>();
  for (const edit of edits) {
    if (edit.kind === "redact") {
      const list = redactionsByPage.get(edit.page) ?? [];
      list.push(normalizeRect(edit.rect));
      redactionsByPage.set(edit.page, list);
    }
  }
  for (const [pageIndex, rects] of redactionsByPage) {
    removeIntersectingText(pdf, pages[pageIndex], rects);
  }

  // Embed the standard font once; only needed for text edits.
  const helvetica = await pdf.embedFont(StandardFonts.Helvetica);

  // Apply the edits (Req 3.1, 3.3, 3.5). Drawing happens after text removal so
  // redaction marks (and any other drawn content) sit on top of the page.
  for (const edit of edits) {
    const page = pages[edit.page];
    switch (edit.kind) {
      case "text": {
        page.drawText(edit.text, {
          x: edit.x,
          y: edit.y,
          size: edit.size,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        break;
      }
      case "rect": {
        page.drawRectangle({
          x: edit.rect.x,
          y: edit.rect.y,
          width: edit.rect.width,
          height: edit.rect.height,
          color: toColor(edit.color),
        });
        break;
      }
      case "line": {
        page.drawLine({
          start: { x: edit.from.x, y: edit.from.y },
          end: { x: edit.to.x, y: edit.to.y },
          color: toColor(edit.color),
        });
        break;
      }
      case "redact": {
        // Draw the opaque mark covering the region (Req 3.5). The intersecting
        // text was already removed from the content stream above (Req 3.4).
        const r = normalizeRect(edit.rect);
        page.drawRectangle({
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          color: rgb(0, 0, 0),
          opacity: 1,
        });
        break;
      }
    }
  }

  return await pdf.save();
}

// ===========================================================================
// Redaction: content-stream text removal (Req 3.4)
// ===========================================================================
//
// pdf-lib does not expose a high-level "remove text in a region" operation, so
// redaction is implemented here by rewriting the affected page's content
// stream directly:
//
//   1. Decode and concatenate the page's content stream(s) into a single byte
//      buffer (handling FlateDecode etc. via pdf-lib's `decodePDFRawStream`).
//   2. Tokenize the content stream and walk the text/graphics operators,
//      tracking the current transformation matrix (CTM) and the text matrices
//      (Tm/Tlm) exactly as a PDF interpreter would, so the device-space origin
//      of every text-showing operator (Tj, TJ, ', ") is known.
//   3. For each text-showing operator, compute a generous axis-aligned bounding
//      box around the run. If that box intersects any redaction rectangle on
//      the page, the operator (and its string operand) is deleted from the
//      stream — while preserving line-advance side effects of ' and " so the
//      remaining text keeps its position.
//   4. Replace the page's `Contents` with the rewritten stream.
//
// The opaque mark (Req 3.5) is drawn separately by `applyEdits` after this
// removal step, so the underlying region is both visually covered and textually
// empty.
//
// Bounding boxes are intentionally generous (over-estimated glyph widths and
// asc/descent). Over-removal is safe for the redaction contract — the
// guarantee is that *intersecting* text is gone (Req 3.4); non-intersecting
// text may or may not remain. The generous box guarantees no intersecting run
// is ever missed.
//
// Fidelity limitations (documented intentionally):
//   - Glyph advances are estimated (no embedded font metrics are parsed), so on
//     a line built from many incrementally-positioned runs the *kept* text may
//     reflow slightly. Text produced by pdf-lib (each run absolutely positioned
//     in its own BT/ET block) is unaffected.
//   - Type 3 fonts, vertical writing modes, and text drawn inside form
//     XObjects are not traversed; such text is covered by the opaque mark but
//     not removed from nested streams. The common case (page-level text) is
//     fully handled.

/** A 2-D affine transform in PDF order: [a, b, c, d, e, f]. */
type Mat = [number, number, number, number, number, number];

const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

/** Multiply two PDF matrices (apply `a` first, then `b`). */
function matMul(a: Mat, b: Mat): Mat {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

/** Apply a matrix to a point. */
function applyMat(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Normalize a rectangle to have non-negative width/height. */
function normalizeRect(r: Rect): Rect {
  const x = r.width < 0 ? r.x + r.width : r.x;
  const y = r.height < 0 ? r.y + r.height : r.y;
  return { x, y, width: Math.abs(r.width), height: Math.abs(r.height) };
}

/** True when two axis-aligned boxes overlap (touching edges count as overlap). */
function boxesIntersect(
  ax0: number,
  ay0: number,
  ax1: number,
  ay1: number,
  bx0: number,
  by0: number,
  bx1: number,
  by1: number
): boolean {
  return !(ax1 < bx0 || ax0 > bx1 || ay1 < by0 || ay0 > by1);
}

// --- String length helpers (character counts for width estimation) ---------

function literalStringLength(raw: string): number {
  let cnt = 0;
  let i = 1; // skip "("
  const end = raw.length - 1; // skip ")"
  while (i < end) {
    const c = raw[i];
    if (c === "\\") {
      const next = raw[i + 1];
      if (next >= "0" && next <= "7") {
        let j = i + 1;
        let k = 0;
        while (j < end && k < 3 && raw[j] >= "0" && raw[j] <= "7") {
          j++;
          k++;
        }
        i = j;
        // "\\\n" line continuations produce no character.
        cnt++;
        continue;
      }
      if (next === "\n" || next === "\r") {
        i += 2;
        continue; // line continuation, no char
      }
      i += 2;
      cnt++;
      continue;
    }
    i++;
    cnt++;
  }
  return cnt;
}

function hexStringLength(raw: string): number {
  let digits = 0;
  for (let i = 1; i < raw.length - 1; i++) {
    const c = raw[i];
    if (
      (c >= "0" && c <= "9") ||
      (c >= "a" && c <= "f") ||
      (c >= "A" && c <= "F")
    ) {
      digits++;
    }
  }
  return Math.ceil(digits / 2);
}

/** Total character count and total positioning adjustment for a `TJ` array. */
function tjArrayInfo(raw: string): { chars: number; adjust: number } {
  let chars = 0;
  let adjust = 0;
  let i = 1; // skip "["
  const end = raw.length - 1; // skip "]"
  while (i < end) {
    const c = raw[i];
    if (isWhitespace(c)) {
      i++;
      continue;
    }
    if (c === "(") {
      const st = i;
      i = scanLiteralString(raw, i);
      chars += literalStringLength(raw.slice(st, i));
      continue;
    }
    if (c === "<") {
      const st = i;
      i = scanHexString(raw, i);
      chars += hexStringLength(raw.slice(st, i));
      continue;
    }
    // Number (positioning adjustment, in thousandths of text space).
    const st = i;
    while (i < end && !isWhitespace(raw[i]) && raw[i] !== "(" && raw[i] !== "<") {
      i++;
    }
    const num = parseFloat(raw.slice(st, i));
    if (!Number.isNaN(num)) adjust += num;
  }
  return { chars, adjust };
}

// --- Per-show-operator bounding box + intersection -------------------------

// Generous glyph-advance factor for the bounding box width (em fraction).
// Larger than the widest standard-font glyph so the box never under-covers.
const BBOX_WIDTH_FACTOR = 1.05;
// Realistic average advance used only to move the text cursor forward so later
// runs on the same line are positioned reasonably.
const ADVANCE_FACTOR = 0.5;
// Generous vertical extents above/below the baseline (em fractions).
const ASCENT_FACTOR = 0.95;
const DESCENT_FACTOR = 0.35;

interface TextState {
  tm: Mat;
  tlm: Mat;
  fontSize: number;
  leading: number;
  rise: number;
  hScale: number; // Tz / 100
}

/**
 * Compute the axis-aligned device-space bounding box of a text run of
 * `charCount` characters drawn under the given text state and CTM. The box is
 * intentionally generous so it always encloses the real glyph extents.
 */
function showBoundingBox(
  ts: TextState,
  ctm: Mat,
  charCount: number
): { x0: number; y0: number; x1: number; y1: number } {
  const trm = matMul(ts.tm, ctm);
  const wText = charCount * ts.fontSize * BBOX_WIDTH_FACTOR * ts.hScale;
  const ascent = ts.fontSize * ASCENT_FACTOR;
  const descent = ts.fontSize * DESCENT_FACTOR;
  const yLo = ts.rise - descent;
  const yHi = ts.rise + ascent;
  const corners: [number, number][] = [
    applyMat(trm, 0, yLo),
    applyMat(trm, wText, yLo),
    applyMat(trm, wText, yHi),
    applyMat(trm, 0, yHi),
  ];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [px, py] of corners) {
    if (px < x0) x0 = px;
    if (px > x1) x1 = px;
    if (py < y0) y0 = py;
    if (py > y1) y1 = py;
  }
  return { x0, y0, x1, y1 };
}

/** Advance the text matrix horizontally to approximate showing `charCount` glyphs. */
function advanceTextMatrix(
  ts: TextState,
  charCount: number,
  tjAdjust: number
): void {
  const tx =
    (charCount * ts.fontSize * ADVANCE_FACTOR - (tjAdjust / 1000) * ts.fontSize) *
    ts.hScale;
  ts.tm = matMul([1, 0, 0, 1, tx, 0], ts.tm);
}

interface Removal {
  start: number;
  end: number;
  replacement: string;
}

/**
 * Walk the content stream `content`, removing every text-showing operator whose
 * generous bounding box intersects any of the redaction `rects`. Returns the
 * rewritten content string. The walk tracks q/Q, cm, BT/ET, Tf, Td/TD/Tm/T*,
 * TL, Ts, Tz and the text-showing operators (Tj, TJ, ', ").
 */
function stripIntersectingText(content: string, rects: Rect[]): string {
  const tokens = tokenize(content);
  const removals: Removal[] = [];

  let ctm: Mat = [...IDENTITY];
  const gsStack: { ctm: Mat; fontSize: number; leading: number; rise: number; hScale: number }[] = [];

  const ts: TextState = {
    tm: [...IDENTITY],
    tlm: [...IDENTITY],
    fontSize: 0,
    leading: 0,
    rise: 0,
    hScale: 1,
  };

  // Operand tokens accumulated since the last operator.
  let operands: Token[] = [];

  const numAt = (idx: number): number => {
    const t = operands[idx];
    return t && t.type === "num" ? (t.val as number) : 0;
  };

  const intersectsAny = (charCount: number): boolean => {
    const box = showBoundingBox(ts, ctm, charCount);
    for (const r of rects) {
      if (
        boxesIntersect(
          box.x0,
          box.y0,
          box.x1,
          box.y1,
          r.x,
          r.y,
          r.x + r.width,
          r.y + r.height
        )
      ) {
        return true;
      }
    }
    return false;
  };

  for (const tok of tokens) {
    if (tok.type !== "op") {
      operands.push(tok);
      continue;
    }

    switch (tok.raw) {
      case "q":
        gsStack.push({
          ctm: [...ctm],
          fontSize: ts.fontSize,
          leading: ts.leading,
          rise: ts.rise,
          hScale: ts.hScale,
        });
        break;
      case "Q": {
        const saved = gsStack.pop();
        if (saved) {
          ctm = saved.ctm;
          ts.fontSize = saved.fontSize;
          ts.leading = saved.leading;
          ts.rise = saved.rise;
          ts.hScale = saved.hScale;
        }
        break;
      }
      case "cm": {
        if (operands.length >= 6) {
          const m: Mat = [
            numAt(operands.length - 6),
            numAt(operands.length - 5),
            numAt(operands.length - 4),
            numAt(operands.length - 3),
            numAt(operands.length - 2),
            numAt(operands.length - 1),
          ];
          ctm = matMul(m, ctm);
        }
        break;
      }
      case "BT":
        ts.tm = [...IDENTITY];
        ts.tlm = [...IDENTITY];
        break;
      case "ET":
        break;
      case "Tf":
        // /Font size Tf  -> size is the last operand.
        if (operands.length >= 1) ts.fontSize = numAt(operands.length - 1);
        break;
      case "Td":
      case "TD": {
        if (operands.length >= 2) {
          const tx = numAt(operands.length - 2);
          const tyv = numAt(operands.length - 1);
          if (tok.raw === "TD") ts.leading = -tyv;
          ts.tlm = matMul([1, 0, 0, 1, tx, tyv], ts.tlm);
          ts.tm = [...ts.tlm];
        }
        break;
      }
      case "Tm": {
        if (operands.length >= 6) {
          const m: Mat = [
            numAt(operands.length - 6),
            numAt(operands.length - 5),
            numAt(operands.length - 4),
            numAt(operands.length - 3),
            numAt(operands.length - 2),
            numAt(operands.length - 1),
          ];
          ts.tlm = [...m];
          ts.tm = [...m];
        }
        break;
      }
      case "T*":
        ts.tlm = matMul([1, 0, 0, 1, 0, -ts.leading], ts.tlm);
        ts.tm = [...ts.tlm];
        break;
      case "TL":
        if (operands.length >= 1) ts.leading = numAt(operands.length - 1);
        break;
      case "Ts":
        if (operands.length >= 1) ts.rise = numAt(operands.length - 1);
        break;
      case "Tz":
        if (operands.length >= 1) ts.hScale = numAt(operands.length - 1) / 100;
        break;
      case "Tj": {
        const strTok = operands[operands.length - 1];
        if (strTok && strTok.type === "str") {
          const chars = strTok.raw.startsWith("<")
            ? hexStringLength(strTok.raw)
            : literalStringLength(strTok.raw);
          if (intersectsAny(chars)) {
            removals.push({ start: strTok.start, end: tok.end, replacement: "" });
          }
          advanceTextMatrix(ts, chars, 0);
        }
        break;
      }
      case "TJ": {
        const arrTok = operands[operands.length - 1];
        if (arrTok && arrTok.type === "array") {
          const info = tjArrayInfo(arrTok.raw);
          if (intersectsAny(info.chars)) {
            removals.push({ start: arrTok.start, end: tok.end, replacement: "" });
          }
          advanceTextMatrix(ts, info.chars, info.adjust);
        }
        break;
      }
      case "'": {
        // Move to next line, then show. Preserve the line advance with T*.
        ts.tlm = matMul([1, 0, 0, 1, 0, -ts.leading], ts.tlm);
        ts.tm = [...ts.tlm];
        const strTok = operands[operands.length - 1];
        if (strTok && strTok.type === "str") {
          const chars = strTok.raw.startsWith("<")
            ? hexStringLength(strTok.raw)
            : literalStringLength(strTok.raw);
          if (intersectsAny(chars)) {
            removals.push({ start: strTok.start, end: tok.end, replacement: "T*" });
          }
          advanceTextMatrix(ts, chars, 0);
        }
        break;
      }
      case '"': {
        // aw ac string "  -> set word/char spacing, next line, show.
        const strTok = operands[operands.length - 1];
        const awTok = operands[operands.length - 3];
        ts.tlm = matMul([1, 0, 0, 1, 0, -ts.leading], ts.tlm);
        ts.tm = [...ts.tlm];
        if (strTok && strTok.type === "str" && awTok) {
          const chars = strTok.raw.startsWith("<")
            ? hexStringLength(strTok.raw)
            : literalStringLength(strTok.raw);
          if (intersectsAny(chars)) {
            const aw = operands[operands.length - 3]?.raw ?? "0";
            const ac = operands[operands.length - 2]?.raw ?? "0";
            removals.push({
              start: awTok.start,
              end: tok.end,
              replacement: `${aw} Tw ${ac} Tc T*`,
            });
          }
          advanceTextMatrix(ts, chars, 0);
        }
        break;
      }
      default:
        break;
    }

    operands = [];
  }

  if (removals.length === 0) return content;

  // Apply removals from the end so earlier offsets stay valid.
  removals.sort((a, b) => b.start - a.start);
  let out = content;
  for (const r of removals) {
    out = out.slice(0, r.start) + r.replacement + out.slice(r.end);
  }
  return out;
}

/**
 * Remove every text run that intersects any of `rects` from a page's content
 * stream(s), making that text unrecoverable through extraction/copy (Req 3.4).
 *
 * The page's `Contents` is replaced with a single rewritten (flate-compressed)
 * stream. Pages whose content cannot be decoded are left untouched (the opaque
 * mark drawn by {@link applyEdits} still covers the region visually).
 */
function removeIntersectingText(
  pdf: PDFDocument,
  page: PDFPage,
  rects: Rect[]
): void {
  const streams = getContentRawStreams(page);
  if (streams.length === 0) return;

  const content = readPageContent(streams);
  const rewritten = stripIntersectingText(content, rects);
  if (rewritten === content) return; // nothing intersected

  const newStream = pdf.context.flateStream(latin1ToBytes(rewritten));
  const ref = pdf.context.register(newStream);
  page.node.set(PDFName.of("Contents"), ref);
}
