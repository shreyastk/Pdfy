/**
 * Layout Tool — pure imposition planners for N-up and booklet layouts.
 *
 * This module holds the DOM-free, pdf-lib-free planning logic that decides how
 * source pages are arranged onto output sheets. Keeping the imposition math here
 * (separate from the pdf-lib executors) lets it be property-tested cheaply without
 * a browser.
 *
 * See design.md "Layout Tool (`lib/layout-tool.ts`)" and Requirements 8.1, 8.3,
 * 8.5, 8.6, 8.7. The pdf-lib executors (`buildNup`, `buildBooklet`) live alongside
 * these planners and are added in a later task.
 */

import { PDFDocument } from "pdf-lib";

/** Supported pages-per-sheet counts for N-up layouts. */
export type NupCount = 2 | 4 | 6 | 8 | 9 | 16;

/**
 * A single output cell: either a 0-based source page index or a `"blank"`
 * padding cell inserted to fill out a sheet.
 */
export type Cell = number | "blank";

/**
 * Plan an N-up imposition.
 *
 * Source pages (0-based indices `0..pageCount-1`) are laid into cells in reading
 * order (left-to-right, top-to-bottom) across one or more sheets, each sheet
 * holding exactly `n` cells. The total number of cells is the smallest multiple
 * of `n` that is `>= pageCount`; any trailing cells beyond the last source page
 * are `"blank"` (Req 8.1, 8.5).
 *
 * Concatenating every cell across all sheets in reading order and dropping the
 * `"blank"` cells reproduces `[0, 1, ..., pageCount-1]` exactly.
 *
 * Total function: never throws. A non-positive `pageCount` yields no sheets.
 *
 * @param pageCount - number of source pages (0-based indices `0..pageCount-1`).
 * @param n - pages per sheet; one of {@link NupCount}.
 * @returns the sheets, each an array of exactly `n` cells in reading order.
 */
export function planNup(pageCount: number, n: NupCount): { sheets: Cell[][] } {
  const pages = normalizeCount(pageCount);

  if (pages === 0) {
    return { sheets: [] };
  }

  const totalCells = Math.ceil(pages / n) * n;
  const sheets: Cell[][] = [];

  for (let start = 0; start < totalCells; start += n) {
    const sheet: Cell[] = [];
    for (let offset = 0; offset < n; offset++) {
      const cellIndex = start + offset;
      sheet.push(cellIndex < pages ? cellIndex : "blank");
    }
    sheets.push(sheet);
  }

  return { sheets };
}

/**
 * Plan a two-up center-fold booklet imposition.
 *
 * `paddedCount` is the smallest multiple of 4 that is `>= pageCount` (Req 8.6).
 * The returned `sequence` is the standard saddle-stitch fold order over positions
 * `0..paddedCount-1`, arranged so that folding the printed sheets yields an
 * ascending page order (Req 8.3). Any position `>= pageCount` (i.e. an inserted
 * padding page) is represented as `"blank"`.
 *
 * The sequence is a permutation of `[0..paddedCount)` with out-of-range positions
 * replaced by `"blank"`. The fold order pairs the outermost remaining pages,
 * alternating which side leads:
 *
 *   (N-1, 0), (1, N-2), (N-3, 2), (3, N-4), ...
 *
 * Total function: never throws. A non-positive `pageCount` yields an empty plan.
 *
 * @param pageCount - number of source pages.
 * @returns `paddedCount` and the fold-ordered `sequence` of cells.
 */
export function planBooklet(pageCount: number): {
  paddedCount: number;
  sequence: Cell[];
} {
  const pages = normalizeCount(pageCount);
  const paddedCount = Math.ceil(pages / 4) * 4;

  if (paddedCount === 0) {
    return { paddedCount: 0, sequence: [] };
  }

  const sequence: Cell[] = [];
  let lo = 0;
  let hi = paddedCount - 1;
  // Alternate the leading side: `true` => (hi, lo), `false` => (lo, hi).
  let highLeads = true;

  while (lo < hi) {
    if (highLeads) {
      sequence.push(toCell(hi, pages), toCell(lo, pages));
    } else {
      sequence.push(toCell(lo, pages), toCell(hi, pages));
    }
    lo++;
    hi--;
    highLeads = !highLeads;
  }

  return { paddedCount, sequence };
}

/**
 * Coerce an arbitrary numeric input into a non-negative integer page count so
 * the planners stay total for fractional, negative, or non-finite inputs.
 */
function normalizeCount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

/** Map a padded position to a source page index or `"blank"` when out of range. */
function toCell(position: number, pageCount: number): Cell {
  return position < pageCount ? position : "blank";
}

// ---------------------------------------------------------------------------
// pdf-lib executors
// ---------------------------------------------------------------------------
//
// These functions take a `File` and produce saved PDF bytes (`Uint8Array`).
// They consume the pure planners above and run entirely in the browser via
// pdf-lib — they never touch the network, satisfying the client-side
// processing requirement (Req 8.4). Pages are scaled UNIFORMLY (a single
// factor on both axes) and centered within each cell so the source aspect
// ratio is never distorted (Req 8.2).

/** Grid (rows × cols) used to lay out each N-up sheet, in reading order. */
function nupGrid(n: NupCount): { rows: number; cols: number } {
  switch (n) {
    case 2:
      return { rows: 1, cols: 2 };
    case 4:
      return { rows: 2, cols: 2 };
    case 6:
      return { rows: 2, cols: 3 };
    case 8:
      return { rows: 2, cols: 4 };
    case 9:
      return { rows: 3, cols: 3 };
    case 16:
      return { rows: 4, cols: 4 };
  }
}

/**
 * Compute the uniform (aspect-preserving) placement of a source page of size
 * `pageW × pageH` centered inside a cell whose lower-left corner is at
 * `(cellX, cellY)` and whose size is `cellW × cellH`.
 *
 * The scale is `min(cellW / pageW, cellH / pageH)` so the page fits entirely
 * within the cell on both axes without distortion (Req 8.2); the leftover space
 * is split evenly to center the page.
 */
function fitIntoCell(
  pageW: number,
  pageH: number,
  cellX: number,
  cellY: number,
  cellW: number,
  cellH: number,
): { x: number; y: number; width: number; height: number } {
  const scale = Math.min(cellW / pageW, cellH / pageH);
  const width = pageW * scale;
  const height = pageH * scale;
  return {
    x: cellX + (cellW - width) / 2,
    y: cellY + (cellH - height) / 2,
    width,
    height,
  };
}

/**
 * Build an N-up imposition PDF.
 *
 * Uses {@link planNup} to decide how the source pages (in reading order, padded
 * with `"blank"` cells) fill each output sheet. Each sheet becomes ONE output
 * page laid out as a `rows × cols` grid (2→1×2, 4→2×2, 6→2×3, 8→2×4, 9→3×3,
 * 16→4×4), ordered left-to-right then top-to-bottom (Req 8.1). The grid cell
 * size is taken from the first source page's dimensions, so for a document whose
 * pages share one size every page lands at scale 1; pages of other sizes are
 * scaled uniformly to fit their cell, preserving aspect ratio (Req 8.2). Blank
 * cells are left empty (they still occupy a cell, matching the source page
 * dimensions). All work is local to the browser (Req 8.4).
 *
 * @param file - the source PDF.
 * @param n - pages per sheet; one of {@link NupCount}.
 * @returns the saved bytes of the N-up document.
 * @throws if the source document has zero pages.
 *
 * Validates: Requirements 8.2, 8.4.
 */
export async function buildNup(file: File, n: NupCount): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const srcPdf = await PDFDocument.load(arrayBuffer);
  const srcPages = srcPdf.getPages();

  if (srcPages.length === 0) {
    throw new Error("Cannot build an N-up layout: the document has no pages.");
  }

  const { sheets } = planNup(srcPages.length, n);
  const { rows, cols } = nupGrid(n);

  // Cell size is the first source page's size; the output sheet is the grid of
  // such cells. Uniform-size documents therefore impose at scale 1.
  const { width: cellW, height: cellH } = srcPages[0].getSize();
  const sheetW = cellW * cols;
  const sheetH = cellH * rows;

  const outPdf = await PDFDocument.create();
  // Embed every source page once so a page used on multiple sheets is reused.
  const embedded = await outPdf.embedPages(srcPages);

  for (const sheet of sheets) {
    const outPage = outPdf.addPage([sheetW, sheetH]);

    sheet.forEach((cell, position) => {
      if (cell === "blank") {
        return; // Blank cells draw nothing.
      }

      const row = Math.floor(position / cols);
      const col = position % cols;
      // PDF y-axis is bottom-up; reading order places row 0 at the top.
      const cellX = col * cellW;
      const cellY = sheetH - (row + 1) * cellH;

      const src = srcPages[cell].getSize();
      const placement = fitIntoCell(src.width, src.height, cellX, cellY, cellW, cellH);
      outPage.drawPage(embedded[cell], placement);
    });
  }

  return await outPdf.save();
}

/**
 * Build a two-up, center-fold booklet PDF.
 *
 * Uses {@link planBooklet} to obtain the fold-ordered sequence (padded to a
 * multiple of 4). Consecutive pairs of the sequence become the two halves of
 * one output sheet, printed side-by-side for double-sided center-fold printing
 * (Req 8.3). Each half is a cell sized to the first source page; pages are
 * scaled uniformly and centered into their half, preserving aspect ratio
 * (Req 8.2). `"blank"` positions (padding pages) draw nothing. All processing is
 * local to the browser (Req 8.4).
 *
 * @param file - the source PDF.
 * @returns the saved bytes of the booklet document.
 * @throws if the source document has zero pages.
 *
 * Validates: Requirements 8.2, 8.4.
 */
export async function buildBooklet(file: File): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const srcPdf = await PDFDocument.load(arrayBuffer);
  const srcPages = srcPdf.getPages();

  if (srcPages.length === 0) {
    throw new Error("Cannot build a booklet layout: the document has no pages.");
  }

  const { sequence } = planBooklet(srcPages.length);

  // Each half-cell is the first source page's size; a sheet holds two halves
  // side-by-side, so the sheet is twice as wide as one page.
  const { width: cellW, height: cellH } = srcPages[0].getSize();
  const sheetW = cellW * 2;
  const sheetH = cellH;

  const outPdf = await PDFDocument.create();
  const embedded = await outPdf.embedPages(srcPages);

  for (let i = 0; i < sequence.length; i += 2) {
    const outPage = outPdf.addPage([sheetW, sheetH]);

    for (let half = 0; half < 2; half++) {
      const cell = sequence[i + half];
      if (cell === undefined || cell === "blank") {
        continue; // Blank/padding halves draw nothing.
      }

      const cellX = half * cellW; // left half then right half
      const cellY = 0;

      const src = srcPages[cell].getSize();
      const placement = fitIntoCell(src.width, src.height, cellX, cellY, cellW, cellH);
      outPage.drawPage(embedded[cell], placement);
    }
  }

  return await outPdf.save();
}
