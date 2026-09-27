import { loadPdfjs } from "@/lib/pdfjs";
/**
 * Page thumbnail support for the PDFy feature expansion.
 *
 * This module holds two concerns kept deliberately separate:
 *
 *  1. {@link moveItem} — a pure, DOM-free array reorder helper. It is the single
 *     reorder primitive used by `ThumbnailGrid` and the page executors, and it is
 *     property-tested directly (Property 22). It never mutates its input and always
 *     returns a permutation that preserves the multiset of elements.
 *
 *  2. {@link renderPageThumbnail} — a pdf.js-backed per-page rasterizer that returns
 *     a data URL. All DOM/canvas access lives here so the reorder logic stays pure
 *     and testable without a browser. The pdf.js usage mirrors the existing pattern
 *     in `lib/pdf-operations.ts` (dynamic import, CDN worker, getDocument/getPage/
 *     getViewport/render → canvas.toDataURL).
 *
 * All rendering happens client-side; no bytes ever leave the browser (Req 11.7).
 */

// ---------------------------------------------------------------------------
// Pure reorder helper (no DOM, property-tested — Property 22)
// ---------------------------------------------------------------------------

/**
 * Move the element at index `from` to index `to`, returning a NEW array.
 *
 * The result preserves the multiset of elements (it is always a permutation of the
 * input) and keeps the relative order of every non-moved element. The input array is
 * never mutated.
 *
 * Out-of-range indices are handled gracefully: if either `from` or `to` falls outside
 * `[0, arr.length)`, or they are equal, a shallow copy of the input is returned
 * unchanged. This keeps callers (e.g. drag-and-drop drop handlers) free of bounds
 * checks while guaranteeing the permutation invariant.
 *
 * @typeParam T - element type.
 * @param arr  - source array (not mutated).
 * @param from - index of the element to move.
 * @param to   - destination index for the moved element.
 * @returns a new array reflecting the move (or an unchanged copy for no-op/invalid moves).
 */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const copy = arr.slice();
  const len = copy.length;

  // Out-of-range or no-op: return an unchanged copy (never mutate the input).
  if (
    from === to ||
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= len ||
    to >= len
  ) {
    return copy;
  }

  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved);
  return copy;
}

// ---------------------------------------------------------------------------
// pdf.js per-page render helper (DOM/canvas isolated here)
// ---------------------------------------------------------------------------

/** A minimal structural type for a loaded pdf.js document. */
export interface PdfDocumentLike {
  numPages: number;
  getPage(pageNumber: number): Promise<unknown>;
}

/**
 * Load a PDF source into a pdf.js document, configuring the CDN worker exactly as the
 * existing operations in `lib/pdf-operations.ts` do.
 *
 * @param source - a `File`, `ArrayBuffer`, or `Uint8Array` containing PDF bytes.
 * @returns the loaded pdf.js document (cast to {@link PdfDocumentLike}).
 */
export async function loadPdfDocument(
  source: File | ArrayBuffer | Uint8Array
): Promise<PdfDocumentLike> {
  const data =
    source instanceof File
      ? await source.arrayBuffer()
      : source instanceof Uint8Array
        ? source
        : source;

  const pdfjsLib = await loadPdfjs();

  // pdf.js accepts ArrayBuffer or typed array as `data`.
  const pdf = await pdfjsLib.getDocument({ data: data as ArrayBuffer }).promise;
  return pdf as unknown as PdfDocumentLike;
}

/**
 * Render a single page of a loaded pdf.js document to a PNG data URL.
 *
 * DOM-touching code (canvas creation + render) is isolated here so the rest of the
 * thumbnail logic stays pure. Throws if a 2D canvas context cannot be obtained or if
 * pdf.js fails to render the page — callers (e.g. `ThumbnailGrid`) catch per page and
 * show a placeholder without aborting the remaining pages (Req 11.3).
 *
 * @param pdfDoc     - a document returned by {@link loadPdfDocument}.
 * @param pageNumber - 1-based page number to render.
 * @param scale      - viewport scale (smaller = faster/cheaper thumbnails). Default 0.5.
 * @returns a PNG `data:` URL string for the rendered page.
 */
export async function renderPageThumbnail(
  pdfDoc: PdfDocumentLike,
  pageNumber: number,
  scale = 0.5
): Promise<string> {
  if (typeof document === "undefined") {
    throw new Error("Thumbnail rendering must run in a browser environment");
  }

  // pdf.js page typing is loose across versions; treat as any for viewport/render.
  const page = (await pdfDoc.getPage(pageNumber)) as any;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to acquire 2D canvas context for thumbnail");
  }

  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));

  await page.render({ canvasContext: context, viewport }).promise;

  return canvas.toDataURL("image/png");
}

/**
 * Convenience helper: load a PDF source and render every page to a thumbnail data URL,
 * invoking `onPage` as each thumbnail completes (or fails).
 *
 * A failure on one page is reported via `onPage` with `dataUrl: null` and does not abort
 * the remaining pages (Req 11.3). Returns the total page count once all pages have been
 * attempted.
 *
 * @param source - PDF bytes as `File`/`ArrayBuffer`/`Uint8Array`.
 * @param onPage - callback invoked per page with the 1-based page number and its data URL
 *                 (or `null` on render failure).
 * @param scale  - viewport scale passed to {@link renderPageThumbnail}.
 * @returns the number of pages in the document.
 */
export async function renderAllThumbnails(
  source: File | ArrayBuffer | Uint8Array,
  onPage: (pageNumber: number, dataUrl: string | null) => void,
  scale = 0.5
): Promise<number> {
  const pdfDoc = await loadPdfDocument(source);
  const total = pdfDoc.numPages;

  for (let pageNumber = 1; pageNumber <= total; pageNumber++) {
    try {
      const dataUrl = await renderPageThumbnail(pdfDoc, pageNumber, scale);
      onPage(pageNumber, dataUrl);
    } catch {
      // Render failure for this page: report a placeholder and keep going.
      onPage(pageNumber, null);
    }
  }

  return total;
}
