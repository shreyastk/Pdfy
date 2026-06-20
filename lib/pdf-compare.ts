/**
 * PDF Comparator — compare two PDF documents and report their differences.
 *
 * The module is split into two layers so the diff logic can be property-tested
 * without a browser or pdf.js (see design.md "PDF Comparator" and Correctness
 * Properties 15, 16, 17):
 *
 *  - **Pure helpers** (`computePageStatuses`, `diffPageText`, `buildCompareResult`)
 *    operate purely on extracted page-text arrays / plain data. They never touch
 *    pdf.js, canvas, or the DOM, so they are cheap to exercise across many inputs.
 *  - **The orchestrator** (`comparePdfs`) handles all the impure work: parsing the
 *    two files with pdf.js, rejecting invalid/corrupt and password-protected
 *    inputs with distinct messages, extracting per-page text, optionally running a
 *    canvas-based visual diff, and finally assembling the result via the pure
 *    helpers.
 *
 * Requirements covered: 5.1, 5.2, 5.3, 5.4, 5.5, 5.7, 5.8.
 */

import type { Rect } from "./types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Per-page comparison status. */
export type PageStatus = "unchanged" | "modified" | "added" | "removed";

/** The full result of comparing two PDFs. */
export interface CompareResult {
  /** Per-page status; every page index 1..max(aLen,bLen) appears exactly once. */
  pages: { page: number; status: PageStatus }[];
  /** Word-level text differences, by 1-based page number. */
  textDiffs: { page: number; added: string[]; removed: string[] }[];
  /** Optional per-page rendered regions that differ (visual mode only). */
  visualDiffs?: { page: number; regions: Rect[] }[];
  /** True iff the two documents have no per-page, text, or visual differences. */
  identical: boolean;
}

/** Comparison mode: text-only, visual-only, or both. */
export type CompareMode = "text" | "visual" | "both";

/** Distinct, user-facing error messages for the two rejection cases. */
export const COMPARE_ERRORS = {
  /** Req 5.8 — a file is password-protected and cannot be opened. */
  passwordProtected: (which: "first" | "second") =>
    `The ${which} file is password-protected and cannot be compared. ` +
    `Please provide an unprotected PDF.`,
  /** Req 5.7 — a file is invalid, corrupt, or otherwise unreadable. */
  invalid: (which: "first" | "second") =>
    `The ${which} file is not a valid PDF or is corrupt and could not be processed.`,
} as const;

// ---------------------------------------------------------------------------
// Pure helper: per-page status (Property 15 — Req 5.1, 5.4)
// ---------------------------------------------------------------------------

/**
 * Compute the per-page status list for two documents from their extracted page
 * texts.
 *
 * Contract (Property 15):
 *  - Every page index `1..max(aLen, bLen)` appears **exactly once** in the
 *    result, in ascending order.
 *  - A page present in **both** documents is `"unchanged"` when its text is equal
 *    and `"modified"` otherwise.
 *  - A page present in **only `a`** (i.e. `a` is longer) is `"removed"`.
 *  - A page present in **only `b`** (i.e. `b` is longer) is `"added"`.
 *
 * @param aPageTexts - per-page text of the first document (index 0 = page 1).
 * @param bPageTexts - per-page text of the second document.
 * @returns one `{ page, status }` entry per page index, ascending.
 *
 * Validates: Requirements 5.1, 5.4.
 */
export function computePageStatuses(
  aPageTexts: string[],
  bPageTexts: string[],
): { page: number; status: PageStatus }[] {
  const aLen = aPageTexts.length;
  const bLen = bPageTexts.length;
  const max = Math.max(aLen, bLen);

  const result: { page: number; status: PageStatus }[] = [];
  for (let i = 0; i < max; i++) {
    const page = i + 1;
    const inA = i < aLen;
    const inB = i < bLen;

    let status: PageStatus;
    if (inA && inB) {
      status = aPageTexts[i] === bPageTexts[i] ? "unchanged" : "modified";
    } else if (inA) {
      // Present only in the first document -> it was removed in the second.
      status = "removed";
    } else {
      // Present only in the second document -> it was added in the second.
      status = "added";
    }
    result.push({ page, status });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Pure helper: word-level text diff (Property 17 — Req 5.2)
// ---------------------------------------------------------------------------

/**
 * Tokenize page text into words. Whitespace runs are collapsed and dropped, so
 * the token sequence is a clean list of words. This is the unit both the diff
 * and its reconstruction contract operate on.
 */
function tokenize(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  return trimmed.split(/\s+/);
}

/**
 * Compute the longest-common-subsequence (LCS) of two token arrays and return,
 * for each side, the boolean mask of which tokens belong to the LCS (i.e. are
 * "matched" / common).
 *
 * Standard dynamic-programming LCS over the token sequences.
 */
function lcsMasks(a: string[], b: string[]): { aMatched: boolean[]; bMatched: boolean[] } {
  const n = a.length;
  const m = b.length;

  // dp[i][j] = LCS length of a[i..] and b[j..].
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const aMatched = new Array<boolean>(n).fill(false);
  const bMatched = new Array<boolean>(m).fill(false);

  // Walk the dp table to recover one LCS alignment, marking matched tokens.
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      aMatched[i] = true;
      bMatched[j] = true;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }

  return { aMatched, bMatched };
}

/**
 * Compute a word-level diff between two page texts.
 *
 * Implementation: tokenize both texts, compute their LCS, then:
 *  - `removed` = the tokens of `aText` that are **not** part of the LCS, in
 *    their original `a` order.
 *  - `added`   = the tokens of `bText` that are **not** part of the LCS, in
 *    their original `b` order.
 *
 * **Reconstruction contract (Property 17):** the LCS tokens are exactly the
 * tokens of `aText` with `removed` taken out, and they are also exactly the
 * tokens of `bText` with `added` taken out. Therefore, interleaving the LCS
 * tokens with the `added` tokens following `bText`'s original token order
 * reproduces `bText`'s token sequence exactly. Equivalently: starting from
 * `aText`'s tokens, deleting the `removed` tokens yields the LCS, and then
 * inserting the `added` tokens at their `bText` positions yields `bText`'s
 * tokens. The property test in task 14.4 relies on this contract.
 *
 * @param aText - first document's page text.
 * @param bText - second document's page text.
 * @returns `{ added, removed }` word lists (each in source order).
 *
 * Validates: Requirements 5.2.
 */
export function diffPageText(
  aText: string,
  bText: string,
): { added: string[]; removed: string[] } {
  const aTokens = tokenize(aText);
  const bTokens = tokenize(bText);
  const { aMatched, bMatched } = lcsMasks(aTokens, bTokens);

  const removed: string[] = [];
  for (let i = 0; i < aTokens.length; i++) {
    if (!aMatched[i]) removed.push(aTokens[i]);
  }

  const added: string[] = [];
  for (let j = 0; j < bTokens.length; j++) {
    if (!bMatched[j]) added.push(bTokens[j]);
  }

  return { added, removed };
}

// ---------------------------------------------------------------------------
// Pure helper: assemble the final CompareResult
// ---------------------------------------------------------------------------

/**
 * Assemble a {@link CompareResult} from the per-page texts and (optionally)
 * pre-computed visual diffs.
 *
 * Steps:
 *  1. Compute per-page statuses via {@link computePageStatuses}.
 *  2. For every page present in **both** documents, compute its word diff via
 *     {@link diffPageText} and keep it only when something actually changed.
 *  3. `identical` is true iff every page is `"unchanged"` AND there are no text
 *     diffs AND there are no (non-empty) visual diffs.
 *
 * @param aPageTexts - per-page text of the first document.
 * @param bPageTexts - per-page text of the second document.
 * @param visualDiffs - optional per-page differing regions from the visual pass.
 * @returns the assembled comparison result.
 *
 * Validates: Requirements 5.1, 5.2, 5.4, 5.6.
 */
export function buildCompareResult(
  aPageTexts: string[],
  bPageTexts: string[],
  visualDiffs?: { page: number; regions: Rect[] }[],
): CompareResult {
  const pages = computePageStatuses(aPageTexts, bPageTexts);

  const commonCount = Math.min(aPageTexts.length, bPageTexts.length);
  const textDiffs: { page: number; added: string[]; removed: string[] }[] = [];
  for (let i = 0; i < commonCount; i++) {
    const { added, removed } = diffPageText(aPageTexts[i], bPageTexts[i]);
    if (added.length > 0 || removed.length > 0) {
      textDiffs.push({ page: i + 1, added, removed });
    }
  }

  // Only count visual diffs that actually contain differing regions.
  const meaningfulVisualDiffs = (visualDiffs ?? []).filter((d) => d.regions.length > 0);

  const allUnchanged = pages.every((p) => p.status === "unchanged");
  const identical =
    allUnchanged && textDiffs.length === 0 && meaningfulVisualDiffs.length === 0;

  const result: CompareResult = { pages, textDiffs, identical };
  if (visualDiffs !== undefined) {
    result.visualDiffs = visualDiffs;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Orchestrator: comparePdfs (impure — pdf.js parsing + rendering)
// ---------------------------------------------------------------------------

/** Internal: typed view of the parts of a pdf.js document we use. */
interface PdfJsDocument {
  numPages: number;
  getPage: (n: number) => Promise<PdfJsPage>;
}

interface PdfJsPage {
  getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => {
    promise: Promise<void>;
  };
}

/**
 * Load a PDF with pdf.js, classifying failures into the two distinct rejection
 * cases required by Req 5.7 (invalid/corrupt) and Req 5.8 (password-protected).
 *
 * pdf.js throws a `PasswordException` (with `name === "PasswordException"`) when
 * a document needs a password; any other failure is treated as invalid/corrupt.
 */
async function loadDocument(
  file: File,
  which: "first" | "second",
): Promise<PdfJsDocument> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  try {
    const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    return doc as unknown as PdfJsDocument;
  } catch (error: unknown) {
    if (isPasswordException(error)) {
      throw new Error(COMPARE_ERRORS.passwordProtected(which));
    }
    throw new Error(COMPARE_ERRORS.invalid(which));
  }
}

/**
 * Detect a pdf.js password exception across the shapes it can take (a thrown
 * `PasswordException` instance, or any error whose name/message indicates a
 * password is required).
 */
function isPasswordException(error: unknown): boolean {
  if (error == null) return false;
  const name = (error as { name?: unknown }).name;
  if (typeof name === "string" && name === "PasswordException") return true;
  const message = (error as { message?: unknown }).message;
  if (typeof message === "string") {
    const lower = message.toLowerCase();
    return lower.includes("password");
  }
  return false;
}

/** Extract the concatenated text of a single pdf.js page. */
async function extractPageText(page: PdfJsPage): Promise<string> {
  const content = await page.getTextContent();
  return content.items
    .map((item) => (typeof item.str === "string" ? item.str : ""))
    .join(" ")
    .trim();
}

/** Extract per-page text for an entire document (index 0 = page 1). */
async function extractAllPageTexts(doc: PdfJsDocument): Promise<string[]> {
  const texts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    texts.push(await extractPageText(page));
  }
  return texts;
}

/**
 * Render a page to a freshly created canvas at the given scale and return its
 * pixel data. Browser-only: relies on the DOM `document` and 2D canvas context.
 */
async function renderPageToImageData(
  page: PdfJsPage,
  scale: number,
): Promise<{ data: Uint8ClampedArray; width: number; height: number } | null> {
  if (typeof document === "undefined") return null;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return null;
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  await page.render({ canvasContext: context, viewport }).promise;
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  return { data: imageData.data, width: canvas.width, height: canvas.height };
}

/**
 * Compare two rendered pages pixel-by-pixel over a coarse grid and return the
 * differing regions (cells whose average channel difference exceeds a small
 * threshold). The grid keeps the region count bounded and the output stable.
 *
 * This is intentionally a straightforward block comparison rather than a
 * connected-component analysis; it is sufficient to highlight where the pages
 * differ (Req 5.3) and is isolated here so the pure layer stays browser-free.
 */
function diffRenderedPages(
  a: { data: Uint8ClampedArray; width: number; height: number },
  b: { data: Uint8ClampedArray; width: number; height: number },
): Rect[] {
  const width = Math.min(a.width, b.width);
  const height = Math.min(a.height, b.height);
  if (width === 0 || height === 0) return [];

  const GRID = 16; // number of cells per axis
  const cellW = Math.max(1, Math.floor(width / GRID));
  const cellH = Math.max(1, Math.floor(height / GRID));
  const THRESHOLD = 24; // per-channel average difference that counts as "differs"

  const regions: Rect[] = [];

  for (let cy = 0; cy < height; cy += cellH) {
    for (let cx = 0; cx < width; cx += cellW) {
      const w = Math.min(cellW, width - cx);
      const h = Math.min(cellH, height - cy);
      let diffAccum = 0;
      let samples = 0;

      for (let y = cy; y < cy + h; y++) {
        for (let x = cx; x < cx + w; x++) {
          const ai = (y * a.width + x) * 4;
          const bi = (y * b.width + x) * 4;
          diffAccum +=
            Math.abs(a.data[ai] - b.data[bi]) +
            Math.abs(a.data[ai + 1] - b.data[bi + 1]) +
            Math.abs(a.data[ai + 2] - b.data[bi + 2]);
          samples += 3;
        }
      }

      if (samples > 0 && diffAccum / samples > THRESHOLD) {
        regions.push({ x: cx, y: cy, width: w, height: h });
      }
    }
  }

  return regions;
}

/**
 * Build the per-page visual diffs for the pages present in both documents by
 * rendering and pixel-comparing each common page.
 */
async function computeVisualDiffs(
  aDoc: PdfJsDocument,
  bDoc: PdfJsDocument,
): Promise<{ page: number; regions: Rect[] }[]> {
  const common = Math.min(aDoc.numPages, bDoc.numPages);
  const SCALE = 1.0;
  const diffs: { page: number; regions: Rect[] }[] = [];

  for (let i = 1; i <= common; i++) {
    const aPage = await aDoc.getPage(i);
    const bPage = await bDoc.getPage(i);
    const aImg = await renderPageToImageData(aPage, SCALE);
    const bImg = await renderPageToImageData(bPage, SCALE);
    if (aImg && bImg) {
      diffs.push({ page: i, regions: diffRenderedPages(aImg, bImg) });
    } else {
      diffs.push({ page: i, regions: [] });
    }
  }

  return diffs;
}

/**
 * Compare two PDF documents and report their differences.
 *
 * Behavior:
 *  - Parses both files with pdf.js. A password-protected file is rejected with a
 *    message distinct from the invalid/corrupt message, identifying which file
 *    failed (Req 5.7, 5.8).
 *  - Produces a per-page status list that accounts for unequal page counts
 *    (extra pages become `added`/`removed`; common pages are compared — Req 5.1,
 *    5.4).
 *  - In `text`/`both` modes, reports per-page added/removed word segments
 *    (Req 5.2).
 *  - In `visual`/`both` modes, renders each common page and highlights differing
 *    regions (Req 5.3). Visual diffing requires a browser canvas; outside a
 *    browser it yields empty regions.
 *  - Reports `identical = true` when there are no per-page, text, or visual
 *    differences (Req 5.6).
 *  - All work happens in the browser; no bytes leave the device (Req 5.5).
 *
 * @param a - the first PDF file.
 * @param b - the second PDF file.
 * @param mode - which comparison(s) to run: `"text"`, `"visual"`, or `"both"`.
 * @returns the assembled {@link CompareResult}.
 * @throws Error with a distinct message when either input is invalid/corrupt
 *   (Req 5.7) or password-protected (Req 5.8).
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.7, 5.8.
 */
export async function comparePdfs(
  a: File,
  b: File,
  mode: CompareMode,
): Promise<CompareResult> {
  // Parse both inputs first so rejection happens before any comparison work.
  const aDoc = await loadDocument(a, "first");
  const bDoc = await loadDocument(b, "second");

  const wantText = mode === "text" || mode === "both";
  const wantVisual = mode === "visual" || mode === "both";

  // Text extraction is also needed to classify per-page status (unchanged vs
  // modified) for the common pages, so we always extract page text.
  const aPageTexts = await extractAllPageTexts(aDoc);
  const bPageTexts = await extractAllPageTexts(bDoc);

  let visualDiffs: { page: number; regions: Rect[] }[] | undefined;
  if (wantVisual) {
    visualDiffs = await computeVisualDiffs(aDoc, bDoc);
  }

  const result = buildCompareResult(aPageTexts, bPageTexts, visualDiffs);

  // In visual-only mode the caller did not request text segments, so omit the
  // detailed added/removed word lists. Per-page status (unchanged vs modified)
  // is still derived from text equality — that is required for Req 5.1/5.4 — and
  // a "modified" status keeps `identical` false, so the flag stays correct.
  if (!wantText) {
    result.textDiffs = [];
  }

  return result;
}
