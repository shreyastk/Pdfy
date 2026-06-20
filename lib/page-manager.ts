/**
 * Page Manager — pure page-level planners and validators.
 *
 * This module contains ONLY pure logic (no DOM, no pdf-lib): page-selection
 * planning for delete/extract, crop-rect clamping, scale validation, and
 * proportional-resize dimension computation. Keeping these helpers pure lets
 * them be property-tested independently of a browser or pdf-lib (see design.md
 * "Page Manager" and Correctness Properties 1–6).
 *
 * The pdf-lib executors (`buildSubsetPdf`, `applyCrop`, `applyResize`,
 * `reorderPdf`) are defined at the bottom of this file. They are the only
 * functions here that depend on pdf-lib / a document; the planners above stay
 * pure so they can be property-tested without loading a PDF.
 *
 * All planners/validators return typed discriminated results instead of
 * throwing, so guard cases are explicit and exhaustively checkable.
 */

import { PDFDocument } from "pdf-lib";
import type { PageCrop, Rect, ResizeSpec } from "./types";

// ---------------------------------------------------------------------------
// Result shapes
// ---------------------------------------------------------------------------

/** Result of {@link planDeletion}: the 0-based indices to keep, or a guard error. */
export type DeletionPlan =
  | { keepIndices: number[] }
  | { error: "none-selected" | "all-selected" };

/** Result of {@link planExtraction}: the 0-based indices to keep, or a guard error. */
export type ExtractionPlan =
  | { keepIndices: number[] }
  | { error: "none-selected" };

/** Result of {@link clampCropRect}: the clamped rect, or a degenerate-region error. */
export type CropClampResult =
  | { rect: Rect }
  | { error: "degenerate" };

/** Result of {@link validateScale}: ok, or the offending out-of-range value. */
export type ScaleValidation =
  | { ok: true }
  | { ok: false; value: number };

/** The lower and upper inclusive bounds of the supported scale factor range. */
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 10.0;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a list of 1-based page numbers into a sorted set of unique 0-based
 * indices that fall within `[1, totalPages]`. Out-of-range and duplicate page
 * numbers are dropped so callers can treat `selected` as a tolerant set.
 */
function selectedToZeroBasedSet(totalPages: number, selected: number[]): Set<number> {
  const result = new Set<number>();
  for (const page of selected) {
    if (Number.isInteger(page) && page >= 1 && page <= totalPages) {
      result.add(page - 1);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Delete / extract planners
// ---------------------------------------------------------------------------

/**
 * Plan a page-deletion operation.
 *
 * @param totalPages - total number of pages in the source document.
 * @param selected - 1-based page numbers the user chose to delete (duplicates
 *   and out-of-range values are tolerated and treated as a set).
 * @returns `{ keepIndices }` — the sorted ascending 0-based indices of the pages
 *   NOT selected (preserving relative order); or `{ error: "none-selected" }`
 *   when no valid page is selected; or `{ error: "all-selected" }` when the
 *   selection covers every page (which would leave an empty document).
 *
 * Validates: Requirements 6.1, 6.4, 6.5.
 */
export function planDeletion(totalPages: number, selected: number[]): DeletionPlan {
  const selectedSet = selectedToZeroBasedSet(totalPages, selected);

  if (selectedSet.size === 0) {
    return { error: "none-selected" };
  }
  if (selectedSet.size === totalPages) {
    return { error: "all-selected" };
  }

  const keepIndices: number[] = [];
  for (let i = 0; i < totalPages; i++) {
    if (!selectedSet.has(i)) {
      keepIndices.push(i);
    }
  }
  return { keepIndices };
}

/**
 * Plan a page-extraction operation.
 *
 * @param totalPages - total number of pages in the source document.
 * @param selected - 1-based page numbers the user chose to extract (duplicates
 *   and out-of-range values are tolerated and treated as a set).
 * @returns `{ keepIndices }` — the unique selected pages as 0-based indices,
 *   sorted ascending to preserve original relative order; or
 *   `{ error: "none-selected" }` when no valid page is selected.
 *
 * Validates: Requirements 6.2, 6.4.
 */
export function planExtraction(totalPages: number, selected: number[]): ExtractionPlan {
  const selectedSet = selectedToZeroBasedSet(totalPages, selected);

  if (selectedSet.size === 0) {
    return { error: "none-selected" };
  }

  const keepIndices = Array.from(selectedSet).sort((a, b) => a - b);
  return { keepIndices };
}

// ---------------------------------------------------------------------------
// Crop clamping
// ---------------------------------------------------------------------------

/**
 * Clamp a crop rectangle to the page bounds `[0, 0, pageW, pageH]`.
 *
 * The rectangle is first normalized (negative width/height are interpreted from
 * the opposite corner), then its edges are clamped so the result lies entirely
 * within the page. If the clamped width or height collapses to zero or less, the
 * region is rejected as degenerate.
 *
 * @param rect - the requested crop rectangle (PDF user-space points).
 * @param pageW - page width in points.
 * @param pageH - page height in points.
 * @returns `{ rect }` with a rectangle inside the page bounds, or
 *   `{ error: "degenerate" }` when nothing valid remains after clamping.
 *
 * Validates: Requirements 7.5, 7.6.
 */
export function clampCropRect(rect: Rect, pageW: number, pageH: number): CropClampResult {
  // Normalize so x/y are the lower corner and width/height are non-negative.
  const x0 = Math.min(rect.x, rect.x + rect.width);
  const y0 = Math.min(rect.y, rect.y + rect.height);
  const x1 = Math.max(rect.x, rect.x + rect.width);
  const y1 = Math.max(rect.y, rect.y + rect.height);

  // Clamp each edge to the page bounds.
  const clampedX0 = Math.max(0, Math.min(x0, pageW));
  const clampedY0 = Math.max(0, Math.min(y0, pageH));
  const clampedX1 = Math.max(0, Math.min(x1, pageW));
  const clampedY1 = Math.max(0, Math.min(y1, pageH));

  const width = clampedX1 - clampedX0;
  const height = clampedY1 - clampedY0;

  if (width <= 0 || height <= 0) {
    return { error: "degenerate" };
  }

  return { rect: { x: clampedX0, y: clampedY0, width, height } };
}

// ---------------------------------------------------------------------------
// Scale validation & proportional resize
// ---------------------------------------------------------------------------

/**
 * Validate a resize scale factor.
 *
 * @param scale - the requested scale factor.
 * @returns `{ ok: true }` if and only if `scale` is a finite number within
 *   `[0.1, 10.0]` inclusive; otherwise `{ ok: false, value: scale }` identifying
 *   the invalid value.
 *
 * Validates: Requirements 7.7.
 */
export function validateScale(scale: number): ScaleValidation {
  if (Number.isFinite(scale) && scale >= MIN_SCALE && scale <= MAX_SCALE) {
    return { ok: true };
  }
  return { ok: false, value: scale };
}

/**
 * Compute proportionally resized page dimensions.
 *
 * Multiplies both dimensions by `scale`, preserving the original aspect ratio.
 * This is the pure dimension math used by the `applyResize` executor.
 *
 * @param width - original page width in points.
 * @param height - original page height in points.
 * @param scale - the scale factor to apply to both dimensions.
 * @returns the scaled `{ width, height }`.
 *
 * Validates: Requirements 7.2, 7.3.
 */
export function computeProportionalResize(
  width: number,
  height: number,
  scale: number,
): { width: number; height: number } {
  return { width: width * scale, height: height * scale };
}

// ---------------------------------------------------------------------------
// pdf-lib executors
// ---------------------------------------------------------------------------
//
// These functions take a `File` and produce saved PDF bytes (`Uint8Array`).
// They are the only document-dependent code in this module; all of them run
// entirely in the browser via pdf-lib and never touch the network, satisfying
// the client-side processing requirements (Req 6.3, 7.4, 12.6 family).
//
// They build on the pure planners above: callers typically derive
// `keepIndices` from `planDeletion`/`planExtraction`, the crop rect is clamped
// with `clampCropRect`, and scale factors are guarded with `validateScale`.

/**
 * Build a new PDF containing only the pages at `keepIndices`, in the order
 * given.
 *
 * This is the shared executor behind both delete and extract: the caller
 * supplies the pages to keep (ascending complement for delete, ascending
 * selection for extract — see {@link planDeletion} / {@link planExtraction}),
 * and the pages are copied into a fresh document preserving the supplied order.
 *
 * @param file - the source PDF.
 * @param keepIndices - 0-based page indices to copy into the output, in output order.
 * @returns the saved bytes of the new document.
 * @throws if `keepIndices` is empty or references a page outside the source.
 *
 * Validates: Requirements 6.1, 6.2.
 */
export async function buildSubsetPdf(file: File, keepIndices: number[]): Promise<Uint8Array> {
  if (keepIndices.length === 0) {
    throw new Error("Cannot build a PDF with no pages: at least one page must be kept.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const srcPdf = await PDFDocument.load(arrayBuffer);
  const pageCount = srcPdf.getPageCount();

  for (const index of keepIndices) {
    if (!Number.isInteger(index) || index < 0 || index >= pageCount) {
      throw new Error(`Page index ${index} is out of range (document has ${pageCount} pages).`);
    }
  }

  const newPdf = await PDFDocument.create();
  // copyPages preserves the exact order of the requested indices.
  const copied = await newPdf.copyPages(srcPdf, keepIndices);
  copied.forEach((page) => newPdf.addPage(page));

  return await newPdf.save();
}

/**
 * Apply crop regions by setting each targeted page's CropBox.
 *
 * Cropping changes only the *visible* area of a page; content lying outside the
 * CropBox is left in the file unrendered rather than deleted, so the operation
 * is non-destructive (Req 7.1). Each region's rectangle is clamped to the page
 * bounds via {@link clampCropRect}; the CropBox is then offset by the page's
 * MediaBox origin so the crop is expressed in absolute PDF coordinates.
 *
 * Region `page` numbers are 1-based (see {@link PageCrop}). Out-of-range page
 * references are ignored. A region that collapses to zero/negative size after
 * clamping is rejected (Req 7.6) by throwing, leaving the caller to surface the
 * error and retain the original document.
 *
 * @param file - the source PDF.
 * @param regions - crop regions, each targeting a 1-based page.
 * @returns the saved bytes with updated CropBoxes.
 * @throws if any region is degenerate after clamping.
 *
 * Validates: Requirements 7.1, 7.4.
 */
export async function applyCrop(file: File, regions: PageCrop[]): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);
  const pages = pdf.getPages();

  for (const { page: pageNumber, rect } of regions) {
    const index = pageNumber - 1;
    if (!Number.isInteger(index) || index < 0 || index >= pages.length) {
      // Tolerate out-of-range page references rather than aborting the whole op.
      continue;
    }

    const page = pages[index];
    const { width, height } = page.getSize();

    const clamped = clampCropRect(rect, width, height);
    if ("error" in clamped) {
      throw new Error(
        `Invalid crop region for page ${pageNumber}: the region is degenerate after clamping to the page bounds.`,
      );
    }

    // setCropBox does not delete content — it only restricts the visible area.
    // Offset by the MediaBox origin so a non-zero page origin is respected.
    const mediaBox = page.getMediaBox();
    page.setCropBox(
      mediaBox.x + clamped.rect.x,
      mediaBox.y + clamped.rect.y,
      clamped.rect.width,
      clamped.rect.height,
    );
  }

  return await pdf.save();
}

/**
 * Resize pages according to a {@link ResizeSpec}.
 *
 * Two modes are supported:
 *
 * - `"scale"`: multiply each targeted page by `spec.scale` (validated to the
 *   `[0.1, 10.0]` range via {@link validateScale}). A single factor is applied
 *   to both axes, so this mode is inherently proportional.
 * - `"size"`: fit each page to `spec.target`. When `spec.proportional` is true
 *   (the default expectation), a single uniform factor `min(fx, fy)` is used so
 *   the original aspect ratio is preserved (Req 7.2); when `false`, independent
 *   per-axis factors are used to hit the target dimensions exactly.
 *
 * `page.scale(x, y)` is used because it scales BOTH the page box and the page
 * content together, keeping content aligned with the resized page (as opposed
 * to `setSize`, which would resize the box but leave content unscaled).
 *
 * Page targeting: when `spec.applyToAll` is true (or no explicit `selection` is
 * provided), every page is resized — including pages with differing original
 * dimensions (Req 7.3). When `spec.applyToAll` is false and a 1-based
 * `selection` is supplied, only those pages are resized.
 *
 * @param file - the source PDF.
 * @param spec - the resize specification.
 * @param selection - optional 1-based page numbers to resize when not applying to all.
 * @returns the saved bytes with resized pages.
 * @throws if the scale factor is out of range or the target size is non-positive.
 *
 * Validates: Requirements 7.2, 7.3, 7.4.
 */
export async function applyResize(
  file: File,
  spec: ResizeSpec,
  selection?: number[],
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);
  const pages = pdf.getPages();

  // Determine which 0-based page indices to resize.
  let targetIndices: number[];
  if (spec.applyToAll || !selection || selection.length === 0) {
    targetIndices = pages.map((_, i) => i);
  } else {
    targetIndices = [];
    for (const pageNumber of selection) {
      const index = pageNumber - 1;
      if (Number.isInteger(index) && index >= 0 && index < pages.length) {
        targetIndices.push(index);
      }
    }
  }

  for (const index of targetIndices) {
    const page = pages[index];
    const { width, height } = page.getSize();

    let xFactor: number;
    let yFactor: number;

    if (spec.mode === "scale") {
      const scale = spec.scale ?? 1;
      const validation = validateScale(scale);
      if (!validation.ok) {
        throw new Error(
          `Invalid scale factor ${validation.value}: must be between ${MIN_SCALE} and ${MAX_SCALE} inclusive.`,
        );
      }
      xFactor = scale;
      yFactor = scale;
    } else {
      // mode === "size"
      if (!spec.target || spec.target.width <= 0 || spec.target.height <= 0) {
        throw new Error("Invalid target size: width and height must be positive numbers.");
      }
      const fx = spec.target.width / width;
      const fy = spec.target.height / height;
      if (spec.proportional) {
        const uniform = Math.min(fx, fy);
        xFactor = uniform;
        yFactor = uniform;
      } else {
        xFactor = fx;
        yFactor = fy;
      }
    }

    // scale() resizes the page box AND its content together.
    page.scale(xFactor, yFactor);
  }

  return await pdf.save();
}

/**
 * Reorder a PDF's pages into the exact order given by `order`.
 *
 * The output document's page order equals `order` position-for-position: the
 * page at `order[0]` becomes the first output page, and so on. This is the
 * executor that consumes the displayed-order array from the thumbnail grid, so
 * the output order always matches what the user arranged (Req 11.6, Property 22).
 *
 * @param file - the source PDF.
 * @param order - the full 0-based page order for the output.
 * @returns the saved bytes of the reordered document.
 * @throws if `order` is empty or references a page outside the source.
 *
 * Validates: Requirements 11.6.
 */
export async function reorderPdf(file: File, order: number[]): Promise<Uint8Array> {
  if (order.length === 0) {
    throw new Error("Cannot reorder a PDF with an empty order array.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const srcPdf = await PDFDocument.load(arrayBuffer);
  const pageCount = srcPdf.getPageCount();

  for (const index of order) {
    if (!Number.isInteger(index) || index < 0 || index >= pageCount) {
      throw new Error(`Page index ${index} is out of range (document has ${pageCount} pages).`);
    }
  }

  const newPdf = await PDFDocument.create();
  // copyPages returns pages in the exact order of `order`.
  const copied = await newPdf.copyPages(srcPdf, order);
  copied.forEach((page) => newPdf.addPage(page));

  return await newPdf.save();
}
