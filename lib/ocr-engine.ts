/**
 * OCR Engine — turn a scanned (image-based) PDF into a Searchable PDF.
 *
 * Pipeline (see design.md "OCR Engine" and Requirements 2.1–2.7):
 *
 *  1. Validate/parse the input with pdf.js. If parsing fails the file is rejected
 *     BEFORE any recognition starts (Req 2.6).
 *  2. Initialize the in-browser WASM OCR engine (Tesseract.js). If the engine fails
 *     to load/initialize, recognition is aborted, the input is left unchanged, and a
 *     clear error is thrown (Req 2.7).
 *  3. For each page: render to a canvas with pdf.js and recognize the canvas with
 *     Tesseract.js, collecting recognized words + bounding boxes. Per-page progress is
 *     reported as `{ page, total, pct }` (Req 2.3).
 *  4. Rebuild the output with pdf-lib by COPYING each original page (preserving the
 *     page count, dimensions, and visual content — Req 2.2) and overlaying a selectable
 *     but transparent text layer positioned over the recognized text regions. Pages
 *     that yield no recognized text keep their original image unchanged and their
 *     1-based page number is reported in `pagesWithNoText` (Req 2.5).
 *
 * Everything runs client-side; no bytes ever leave the browser (Req 2.4).
 *
 * ---------------------------------------------------------------------------
 * Testability / mockability
 * ---------------------------------------------------------------------------
 * The three "heavy" seams are injectable through `opts` so property tests
 * (Properties 18 & 19) can exercise the real structure-preserving rebuild with a
 * MOCKED recognizer and without a real browser/pdf.js/WASM engine:
 *
 *   - `opts.openDocument`   — override pdf.js validation/loading.
 *   - `opts.createRecognizer` — override Tesseract.js worker creation.
 *   - `opts.recognizePage`  — override the per-page render+recognize step.
 *
 * Each seam defaults to its real implementation, which is also exported
 * (`defaultOpenDocument`, `defaultCreateRecognizer`, `defaultRecognizePage`,
 * `rebuildSearchablePdf`) so it can be unit-tested or `vi.mock`-ed directly.
 * The pure rebuild step (`rebuildSearchablePdf`) uses only pdf-lib and therefore
 * runs in Node/jsdom, which is what the structure-preservation tests rely on.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { loadPdfjs } from "@/lib/pdfjs";

// ---------------------------------------------------------------------------
// Public result shape
// ---------------------------------------------------------------------------

/** The result of an OCR run. */
export interface OcrResult {
  /** The generated Searchable PDF bytes. */
  pdf: Uint8Array;
  /** 1-based page numbers that yielded no recognized text (Req 2.5). */
  pagesWithNoText: number[];
}

// ---------------------------------------------------------------------------
// Recognition data model
// ---------------------------------------------------------------------------

/** A bounding box in image (canvas) pixel space, origin top-left. */
export interface OcrBbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A single recognized word and its pixel-space bounding box. */
export interface OcrWord {
  text: string;
  bbox: OcrBbox;
}

/**
 * The recognition result for one page.
 *
 * `scale` is the pixels-per-point factor used when the page was rendered to the
 * image handed to the recognizer (canvas pixels = PDF points × scale). The rebuild
 * step divides bounding boxes by `scale` to map them back to PDF user-space.
 */
export interface PageRecognition {
  words: OcrWord[];
  scale: number;
}

// ---------------------------------------------------------------------------
// Injectable seams
// ---------------------------------------------------------------------------

/** A parsed/validated document plus the original bytes used by the rebuild step. */
export interface OpenedPdf {
  /** Number of pages reported by the parser. */
  numPages: number;
  /** Original PDF bytes (kept intact for the pdf-lib rebuild). */
  bytes: Uint8Array;
  /** Underlying pdf.js document handle, when available (used by the real renderer). */
  doc?: unknown;
}

/** A minimal recognizer abstraction over a Tesseract.js worker. */
export interface Recognizer {
  /** Recognize an image (canvas/blob/etc.) into words with pixel-space bboxes. */
  recognize(image: unknown): Promise<{ words: OcrWord[] }>;
  /** Release any underlying worker/WASM resources. */
  terminate(): Promise<void>;
}

/** Optional dependency-injection seams (primarily for tests). */
export interface OcrInjectables {
  /** Parse/validate the input. Default: {@link defaultOpenDocument} (pdf.js). */
  openDocument?: (file: File) => Promise<OpenedPdf>;
  /** Create the OCR engine. Default: {@link defaultCreateRecognizer} (Tesseract.js). */
  createRecognizer?: (lang: string) => Promise<Recognizer>;
  /** Render + recognize one page. Default: {@link defaultRecognizePage} (pdf.js + worker). */
  recognizePage?: (
    opened: OpenedPdf,
    recognizer: Recognizer,
    pageNumber: number,
    lang: string,
  ) => Promise<PageRecognition>;
}

/** Options accepted by {@link runOcr}. */
export interface OcrOptions extends OcrInjectables {
  /** Tesseract language code(s). Defaults to `"eng"`. */
  lang?: string;
}

/** Progress callback payload reported once per completed page (Req 2.3). */
export interface OcrProgress {
  /** 1-based page number that just completed. */
  page: number;
  /** Total page count. */
  total: number;
  /** Completion percentage in `[0, 100]`. */
  pct: number;
}

// ---------------------------------------------------------------------------
// Error messages (kept as constants so callers/tests can assert on them)
// ---------------------------------------------------------------------------

/** Thrown when the input cannot be parsed as a valid PDF (Req 2.6). */
export const ERR_INVALID_PDF =
  "The file could not be parsed as a valid PDF or is unreadable.";

/** Thrown when the WASM OCR engine fails to load/initialize (Req 2.7). */
export const ERR_ENGINE_FAILED =
  "OCR could not be started: the recognition engine failed to load or initialize.";

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run OCR over `file` and produce a Searchable PDF.
 *
 * @param file - the source (image-based) PDF.
 * @param onProgress - invoked once per page with `{ page, total, pct }` (Req 2.3).
 * @param opts - language selection and optional injectable seams (for tests).
 * @returns the searchable PDF bytes and the list of pages with no recognized text.
 * @throws Error({@link ERR_INVALID_PDF}) if the file cannot be parsed (Req 2.6).
 * @throws Error({@link ERR_ENGINE_FAILED}) if the OCR engine cannot start (Req 2.7).
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7.
 */
export async function runOcr(
  file: File,
  onProgress: (p: OcrProgress) => void,
  opts?: OcrOptions,
): Promise<OcrResult> {
  const lang = opts?.lang ?? "eng";
  const openDocument = opts?.openDocument ?? defaultOpenDocument;
  const createRecognizer = opts?.createRecognizer ?? defaultCreateRecognizer;
  const recognizePage = opts?.recognizePage ?? defaultRecognizePage;

  // Phase 1 — validate/parse BEFORE any recognition (Req 2.6).
  let opened: OpenedPdf;
  try {
    opened = await openDocument(file);
  } catch {
    throw new Error(ERR_INVALID_PDF);
  }

  // Phase 2 — initialize the WASM engine; abort leaving input unchanged (Req 2.7).
  let recognizer: Recognizer;
  try {
    recognizer = await createRecognizer(lang);
  } catch {
    throw new Error(ERR_ENGINE_FAILED);
  }

  // Phase 3 — recognize each page, reporting progress (Req 2.1, 2.3).
  const total = opened.numPages;
  try {
    const recognitions: PageRecognition[] = [];
    for (let page = 1; page <= total; page++) {
      const recognition = await recognizePage(opened, recognizer, page, lang);
      recognitions.push(recognition);
      onProgress({
        page,
        total,
        pct: total > 0 ? Math.round((page / total) * 100) : 100,
      });
    }

    // Phase 4 — rebuild preserving structure + overlay text layer (Req 2.2, 2.5).
    return await rebuildSearchablePdf(opened.bytes, recognitions);
  } finally {
    // Always release engine resources, even on failure.
    try {
      await recognizer.terminate();
    } catch {
      /* ignore teardown errors */
    }
  }
}

// ---------------------------------------------------------------------------
// Rebuild step (pure pdf-lib — no DOM, runs in Node/jsdom for property tests)
// ---------------------------------------------------------------------------

/** A word is considered "real text" only if it has non-whitespace content. */
function hasRealText(words: OcrWord[]): boolean {
  return words.some((w) => w.text.trim().length > 0);
}

/**
 * Draw a single recognized word as a transparent (selectable) text overlay,
 * mapping its pixel-space bbox back to PDF user-space.
 *
 * The canvas/image origin is top-left while PDF user-space is bottom-left, so the
 * y-axis is flipped. Drawing uses `opacity: 0` so the text is invisible yet remains
 * selectable/searchable over the original page image. Words that the standard font
 * cannot encode are skipped rather than aborting the whole page.
 */
function drawWordOverlay(
  page: ReturnType<PDFDocument["getPages"]>[number],
  word: OcrWord,
  scale: number,
  font: PDFFont,
): void {
  const text = word.text;
  if (text.trim().length === 0) return;

  const s = scale > 0 ? scale : 1;
  const { height: pageHeight } = page.getSize();

  const x = word.bbox.x0 / s;
  const glyphHeightPx = Math.abs(word.bbox.y1 - word.bbox.y0);
  const size = Math.max(1, glyphHeightPx / s);
  // Flip Y: bbox.y1 is the bottom edge in top-left pixel space.
  const y = pageHeight - word.bbox.y1 / s;

  try {
    page.drawText(text, { x, y, size, font, color: rgb(0, 0, 0), opacity: 0 });
  } catch {
    // Unencodable characters for the standard font: skip this word.
  }
}

/**
 * Rebuild a Searchable PDF from the original bytes plus per-page recognitions.
 *
 * Each original page is COPIED verbatim (preserving page count, dimensions, and
 * visual content — Req 2.2). For pages that produced recognized text, a transparent
 * selectable text layer is overlaid; pages with no recognized text are left exactly
 * as-is and their 1-based number is collected into `pagesWithNoText` (Req 2.5).
 *
 * This function is intentionally free of any DOM/canvas/WASM dependency so it can be
 * property-tested directly (Properties 18 & 19).
 *
 * @param originalBytes - the original PDF bytes.
 * @param recognitions - per-page recognition results, indexed by 0-based page order.
 * @returns the searchable PDF bytes and the no-text page list.
 *
 * Validates: Requirements 2.2, 2.5.
 */
export async function rebuildSearchablePdf(
  originalBytes: Uint8Array,
  recognitions: PageRecognition[],
): Promise<OcrResult> {
  const src = await PDFDocument.load(originalBytes);
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);

  const indices = src.getPageIndices();
  const copied = await out.copyPages(src, indices);

  const pagesWithNoText: number[] = [];

  copied.forEach((page, i) => {
    out.addPage(page);

    const recognition = recognitions[i];
    const words = recognition?.words ?? [];

    if (!hasRealText(words)) {
      // No recognized text: keep the original page image unchanged (Req 2.5).
      pagesWithNoText.push(i + 1);
      return;
    }

    const scale = recognition.scale;
    for (const word of words) {
      drawWordOverlay(page, word, scale, font);
    }
  });

  const pdf = await out.save();
  return { pdf, pagesWithNoText };
}

// ---------------------------------------------------------------------------
// Default seam implementations (real pdf.js + Tesseract.js)
// ---------------------------------------------------------------------------

/**
 * Default document opener: validate/parse the input with pdf.js.
 *
 * The bytes handed to pdf.js are a COPY (`slice()`), because pdf.js may detach the
 * underlying buffer; the untouched original bytes are returned for the rebuild step.
 * Throws if pdf.js cannot parse the file (surfaced as {@link ERR_INVALID_PDF}).
 */
export async function defaultOpenDocument(file: File): Promise<OpenedPdf> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  const pdfjsLib = await loadPdfjs();

  const doc = await pdfjsLib.getDocument({ data: bytes.slice() as Uint8Array }).promise;

  return { numPages: doc.numPages, bytes, doc };
}

/**
 * Default recognizer factory: create and initialize a Tesseract.js worker.
 *
 * Uses the v5+ `createWorker(langs)` API, which loads the language and initializes
 * the engine in one call. Any failure here propagates and is surfaced by
 * {@link runOcr} as {@link ERR_ENGINE_FAILED} (Req 2.7).
 */
export async function defaultCreateRecognizer(lang: string): Promise<Recognizer> {
  const { createWorker } = await import("tesseract.js");
  // All engine assets are self-hosted (scripts/copy-assets.mjs) so OCR never
  // contacts a CDN and works offline once cached.
  const worker = await createWorker(lang, undefined, {
    workerPath: "/vendor/tesseract/worker.min.js",
    corePath: "/vendor/tesseract/core",
    langPath: "/vendor/tesseract/lang",
  });

  return {
    async recognize(image: unknown) {
      // Request `blocks` so word-level bounding boxes are populated.
      const result = await worker.recognize(
        image as Parameters<typeof worker.recognize>[0],
        {},
        { blocks: true },
      );
      return { words: extractWords(result.data.blocks) };
    },
    async terminate() {
      await worker.terminate();
    },
  };
}

/**
 * Flatten Tesseract.js `blocks → paragraphs → lines → words` into a flat word list
 * with pixel-space bounding boxes. Tolerant of `null`/missing levels.
 */
export function extractWords(blocks: unknown): OcrWord[] {
  const words: OcrWord[] = [];
  if (!Array.isArray(blocks)) return words;

  for (const block of blocks) {
    const paragraphs = block?.paragraphs;
    if (!Array.isArray(paragraphs)) continue;
    for (const paragraph of paragraphs) {
      const lines = paragraph?.lines;
      if (!Array.isArray(lines)) continue;
      for (const line of lines) {
        const lineWords = line?.words;
        if (!Array.isArray(lineWords)) continue;
        for (const w of lineWords) {
          if (!w || typeof w.text !== "string" || !w.bbox) continue;
          words.push({
            text: w.text,
            bbox: {
              x0: w.bbox.x0,
              y0: w.bbox.y0,
              x1: w.bbox.x1,
              y1: w.bbox.y1,
            },
          });
        }
      }
    }
  }

  return words;
}

/**
 * Default per-page render+recognize step.
 *
 * Renders the page to a canvas with pdf.js at a fixed oversampling `scale` (better
 * OCR accuracy), then recognizes the canvas with the provided {@link Recognizer}.
 * The render `scale` is returned so the rebuild step can map word bounding boxes back
 * to PDF user-space. DOM/canvas access is isolated here.
 */
export async function defaultRecognizePage(
  opened: OpenedPdf,
  recognizer: Recognizer,
  pageNumber: number,
  _lang: string,
): Promise<PageRecognition> {
  if (typeof document === "undefined") {
    throw new Error("OCR page rendering must run in a browser environment");
  }
  if (!opened.doc) {
    throw new Error("No pdf.js document available to render");
  }

  const scale = 2; // Oversample for better recognition accuracy.
  // pdf.js page typing is loose across versions; treat as any for viewport/render.
  const page = (await (opened.doc as any).getPage(pageNumber)) as any;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to acquire 2D canvas context for OCR rendering");
  }
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));

  await page.render({ canvasContext: context, viewport }).promise;

  const { words } = await recognizer.recognize(canvas);
  return { words, scale };
}
