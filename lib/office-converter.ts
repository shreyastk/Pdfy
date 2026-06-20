/**
 * Office Converter — best-effort, 100% client-side conversion between PDF and the
 * Office document formats Word (.docx), Excel (.xlsx), and PowerPoint (.pptx).
 *
 * Design context (see design.md "Office Converter" and Requirements 1.1–1.8):
 *
 *  - All conversion runs in the browser; no file bytes or metadata ever leave the
 *    device (Req 1.3).
 *  - Exact layout reproduction is NOT achievable purely client-side, so every
 *    conversion returns `fidelityNotices` listing the affected formatting categories.
 *    The UI surfaces these before download (Req 1.5); a failure to display them does
 *    not block the download (Req 1.8, handled at the UI layer).
 *  - Inputs are gated BEFORE any processing (Req 1.6, 1.7):
 *      * source format must match the requested conversion (else unsupported-format),
 *      * size must be ≤ 100 MB (else too-large),
 *      * unparseable / corrupt / password-protected files raise a clear error.
 *
 * Per-leg implementation:
 *  - PDF → docx/pptx : pdf.js text extraction → `docx` / `pptxgenjs`.
 *  - PDF → xlsx       : pdf.js text + tabular heuristics → SheetJS.
 *  - docx → PDF       : `mammoth` → HTML → existing `htmlToPDF`.
 *  - xlsx → PDF       : SheetJS → HTML table → `htmlToPDF`.
 *  - pptx → PDF       : slide XML text extraction (jszip) → HTML → `htmlToPDF`.
 *
 * ---------------------------------------------------------------------------
 * Testability
 * ---------------------------------------------------------------------------
 * `detectSourceFormat`, `gateInput`, and `MAX_OFFICE_SIZE` are pure/synchronous and
 * operate on a name + size only, so the gating property test (Property 33) can
 * exercise the unsupported-format and too-large guards cheaply without any bytes,
 * libraries, or a browser.
 */

import { htmlToPDF } from "./pdf-operations";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** The Office document formats this converter can read and write. */
export type OfficeFormat = "docx" | "xlsx" | "pptx";

/** The set of formats this converter understands as a source. */
export type SourceFormat = "pdf" | OfficeFormat | "unknown";

/** The result of a successful conversion. */
export interface ConversionResult {
  /** The converted file bytes. */
  data: Uint8Array;
  /** A suggested download filename (extension matches the target format). */
  filename: string;
  /** Formatting categories that could not be reproduced exactly (Req 1.5). */
  fidelityNotices: string[];
}

// ---------------------------------------------------------------------------
// Limits, gating, and error messages
// ---------------------------------------------------------------------------

/** Maximum accepted input size: 100 MB (Req 1.7). */
export const MAX_OFFICE_SIZE = 100 * 1024 * 1024;

/** Human-readable list of accepted Office source extensions (Req 1.6). */
export const ACCEPTED_OFFICE_FORMATS = ".docx, .xlsx, .pptx";

/** Error thrown when the input exceeds {@link MAX_OFFICE_SIZE} (Req 1.7). */
export const ERR_TOO_LARGE =
  "The file exceeds the 100 MB limit. Please choose a smaller file.";

/** Error thrown when a PDF source is required but not provided (Req 1.6). */
export const ERR_EXPECTED_PDF =
  "Unsupported file format. This conversion accepts a PDF (.pdf) source.";

/** Error thrown when an Office source is required but not provided (Req 1.6). */
export const ERR_EXPECTED_OFFICE =
  `Unsupported file format. This conversion accepts the following formats: ${ACCEPTED_OFFICE_FORMATS}.`;

/** Error thrown when the source file cannot be parsed (corrupt / protected) (Req 1.7). */
export const ERR_CORRUPT =
  "The file could not be read. It may be corrupted or password-protected.";

/** What kind of source a particular conversion expects. */
export type ExpectedSource = "pdf" | "office";

/** The reason an input failed the pre-processing gate. */
export type GateReason = "unsupported-format" | "too-large";

// ---------------------------------------------------------------------------
// Pure format detection (synchronous — property-tested in 16.2)
// ---------------------------------------------------------------------------

/** Map a lower-cased file extension to a known source format. */
const EXTENSION_FORMATS: Record<string, SourceFormat> = {
  pdf: "pdf",
  docx: "docx",
  xlsx: "xlsx",
  pptx: "pptx",
};

/** Map a known MIME type to a source format (used only as a fallback). */
const MIME_FORMATS: Record<string, SourceFormat> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

/**
 * Extract the lower-cased file extension (without the dot) from a filename.
 * Returns an empty string when there is no extension.
 */
function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

/**
 * Determine the source format of a filename, by extension only.
 *
 * This is the pure core shared by {@link detectSourceFormat} and {@link gateInput};
 * it never touches the file bytes so it is cheap to property-test.
 *
 * @param name - the filename (case-insensitive).
 * @returns the detected {@link SourceFormat}, or `"unknown"`.
 */
export function formatFromName(name: string): SourceFormat {
  return EXTENSION_FORMATS[extensionOf(name)] ?? "unknown";
}

/**
 * Detect whether a file is a PDF or one of the supported Office formats.
 *
 * Detection is driven primarily by the (case-insensitive) filename extension, with
 * the MIME type used only as a fallback when the extension is missing or unknown
 * (Req 1.6). This function is pure and synchronous.
 *
 * @param file - the file to classify (only `name` and `type` are read).
 * @returns `"pdf" | "docx" | "xlsx" | "pptx" | "unknown"`.
 */
export function detectSourceFormat(file: { name: string; type?: string }): SourceFormat {
  const byName = formatFromName(file.name);
  if (byName !== "unknown") return byName;

  const mime = (file.type ?? "").toLowerCase();
  return MIME_FORMATS[mime] ?? "unknown";
}

/**
 * Gate an input before conversion (Req 1.6, 1.7).
 *
 * Pure and synchronous: it inspects only the filename and size so the gating
 * property test (Property 33) can run cheaply over generated inputs. Format is
 * checked first so an unsupported source is always reported as such; size is
 * checked second.
 *
 * @param file - an object exposing `name` and `size` (bytes).
 * @param expected - whether the conversion needs a `"pdf"` or `"office"` source.
 * @returns `{ ok: true }` when accepted, otherwise `{ ok: false; reason }`.
 */
export function gateInput(
  file: { name: string; size: number },
  expected: ExpectedSource,
): { ok: true } | { ok: false; reason: GateReason } {
  const format = formatFromName(file.name);

  const formatOk =
    expected === "pdf"
      ? format === "pdf"
      : format === "docx" || format === "xlsx" || format === "pptx";

  if (!formatOk) {
    return { ok: false, reason: "unsupported-format" };
  }

  if (file.size > MAX_OFFICE_SIZE) {
    return { ok: false, reason: "too-large" };
  }

  return { ok: true };
}

/** Translate a {@link GateReason} into the user-facing error for a given expectation. */
function gateError(reason: GateReason, expected: ExpectedSource): string {
  if (reason === "too-large") return ERR_TOO_LARGE;
  return expected === "pdf" ? ERR_EXPECTED_PDF : ERR_EXPECTED_OFFICE;
}

// ---------------------------------------------------------------------------
// Fidelity notices (Req 1.5)
// ---------------------------------------------------------------------------

/** Notices shared by every PDF → Office leg. */
const NOTICE_FONTS = "Exact fonts and layout positioning are approximated.";
const NOTICE_IMAGES = "Images may be repositioned or omitted.";
const NOTICE_TABLES = "Tables are reconstructed heuristically and may be imprecise.";
const NOTICE_OFFICE_TO_PDF =
  "Complex Office layouts, embedded objects, and exact pagination are approximated.";

/** The fidelity notices reported for a PDF → Office conversion to `target`. */
function pdfToOfficeNotices(target: OfficeFormat): string[] {
  switch (target) {
    case "xlsx":
      return [NOTICE_FONTS, NOTICE_TABLES, NOTICE_IMAGES];
    case "pptx":
      return [NOTICE_FONTS, NOTICE_IMAGES];
    case "docx":
    default:
      return [NOTICE_FONTS, NOTICE_IMAGES];
  }
}

// ---------------------------------------------------------------------------
// Injectable seams (defaults do the real, library-backed work)
// ---------------------------------------------------------------------------

/** Optional dependency-injection seams (primarily for tests). */
export interface OfficeInjectables {
  /** Extract per-page plain text from a PDF. Default: pdf.js. */
  extractPdfText?: (file: File) => Promise<string[]>;
  /** Convert HTML to PDF bytes. Default: the shared {@link htmlToPDF}. */
  htmlToPdf?: (html: string) => Promise<Uint8Array>;
}

// ---------------------------------------------------------------------------
// Filename helpers
// ---------------------------------------------------------------------------

/** Replace (or add) a file's extension. */
function withExtension(name: string, ext: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}.${ext}`;
}

// ---------------------------------------------------------------------------
// Small text utilities used by the heuristics
// ---------------------------------------------------------------------------

/** Split a page's text into non-empty lines. */
function toLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
}

/** Heuristically split a line into table cells on runs of 2+ spaces or tabs. */
function toCells(line: string): string[] {
  return line.split(/\t|\s{2,}/).map((c) => c.trim());
}

/** Escape text for safe interpolation into HTML. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ===========================================================================
// PDF → Office
// ===========================================================================

/**
 * Convert a PDF into an editable Office file (.docx, .xlsx, or .pptx), entirely
 * in the browser (Req 1.1, 1.3).
 *
 * The PDF is gated for format/size first (Req 1.6, 1.7); text is then extracted with
 * pdf.js (parse failures surface as {@link ERR_CORRUPT}) and assembled into the target
 * format using `docx` / SheetJS / `pptxgenjs`. The result carries fidelity notices
 * describing what could not be reproduced exactly (Req 1.5).
 *
 * @param file - the source PDF.
 * @param target - the desired Office format.
 * @param onProgress - reports completion as a percentage in `[0, 100]` (Req 1.4).
 * @param opts - optional injectable seams (for tests).
 * @returns the converted bytes, a suggested filename, and fidelity notices.
 * @throws Error when the input is rejected by the gate or cannot be parsed.
 *
 * Validates: Requirements 1.1, 1.3, 1.5, 1.6, 1.7.
 */
export async function pdfToOffice(
  file: File,
  target: OfficeFormat,
  onProgress: (pct: number) => void,
  opts?: OfficeInjectables,
): Promise<ConversionResult> {
  const gate = gateInput(file, "pdf");
  if (!gate.ok) throw new Error(gateError(gate.reason, "pdf"));

  onProgress(0);

  const extract = opts?.extractPdfText ?? defaultExtractPdfText;
  let pages: string[];
  try {
    pages = await extract(file);
  } catch {
    throw new Error(ERR_CORRUPT);
  }

  onProgress(50);

  let data: Uint8Array;
  switch (target) {
    case "docx":
      data = await buildDocx(pages);
      break;
    case "xlsx":
      data = await buildXlsx(pages);
      break;
    case "pptx":
      data = await buildPptx(pages);
      break;
    default:
      throw new Error(ERR_EXPECTED_PDF);
  }

  onProgress(100);

  return {
    data,
    filename: withExtension(file.name, target),
    fidelityNotices: pdfToOfficeNotices(target),
  };
}

/** Default per-page PDF text extraction via pdf.js. */
async function defaultExtractPdfText(file: File): Promise<string[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const pdf = await pdfjsLib.getDocument({ data: bytes.slice() as Uint8Array }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Reconstruct rough line breaks from item end-of-line markers when present.
    const text = (content.items as any[])
      .map((item) => (typeof item.str === "string" ? item.str + (item.hasEOL ? "\n" : " ") : ""))
      .join("");
    pages.push(text);
  }

  return pages;
}

/** Build a .docx from per-page text using the `docx` library. */
async function buildDocx(pages: string[]): Promise<Uint8Array> {
  const { Document, Packer, Paragraph, TextRun, PageBreak } = await import("docx");

  const children: InstanceType<typeof Paragraph>[] = [];

  pages.forEach((pageText, pageIndex) => {
    const lines = toLines(pageText);
    if (lines.length === 0) {
      children.push(new Paragraph({ children: [new TextRun("")] }));
    } else {
      for (const line of lines) {
        children.push(new Paragraph({ children: [new TextRun(line)] }));
      }
    }
    // Page break between source pages (not after the last).
    if (pageIndex < pages.length - 1) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
  });

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}

/** Build a .xlsx from per-page text using SheetJS, one sheet per page. */
async function buildXlsx(pages: string[]): Promise<Uint8Array> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  pages.forEach((pageText, pageIndex) => {
    const rows = toLines(pageText).map(toCells);
    const aoa = rows.length > 0 ? rows : [[""]];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, `Page ${pageIndex + 1}`.slice(0, 31));
  });

  // Always have at least one sheet.
  if (pages.length === 0) {
    const ws = XLSX.utils.aoa_to_sheet([[""]]);
    XLSX.utils.book_append_sheet(wb, ws, "Page 1");
  }

  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Uint8Array(out);
}

/** Build a .pptx from per-page text using pptxgenjs, one slide per page. */
async function buildPptx(pages: string[]): Promise<Uint8Array> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();

  const source = pages.length > 0 ? pages : [""];
  for (const pageText of source) {
    const slide = pptx.addSlide();
    const lines = toLines(pageText);
    slide.addText(lines.length > 0 ? lines.join("\n") : "", {
      x: 0.5,
      y: 0.5,
      w: "90%",
      h: "90%",
      fontSize: 12,
      valign: "top",
    });
  }

  const out = (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer;
  return new Uint8Array(out);
}

// ===========================================================================
// Office → PDF
// ===========================================================================

/**
 * Convert an Office file (.docx, .xlsx, or .pptx) into a PDF, entirely in the
 * browser (Req 1.2, 1.3).
 *
 * The source is gated for format/size first (Req 1.6, 1.7), then converted to HTML
 * per leg and rendered to PDF by the shared {@link htmlToPDF}. Parse failures surface
 * as {@link ERR_CORRUPT}. The result carries fidelity notices (Req 1.5).
 *
 * @param file - the source Office document.
 * @param onProgress - reports completion as a percentage in `[0, 100]` (Req 1.4).
 * @param opts - optional injectable seams (for tests).
 * @returns the PDF bytes, a suggested filename, and fidelity notices.
 * @throws Error when the input is rejected by the gate or cannot be parsed.
 *
 * Validates: Requirements 1.2, 1.3, 1.5, 1.6, 1.7.
 */
export async function officeToPdf(
  file: File,
  onProgress: (pct: number) => void,
  opts?: OfficeInjectables,
): Promise<ConversionResult> {
  const gate = gateInput(file, "office");
  if (!gate.ok) throw new Error(gateError(gate.reason, "office"));

  onProgress(0);

  const format = detectSourceFormat(file) as OfficeFormat;
  const toPdf = opts?.htmlToPdf ?? ((html: string) => htmlToPDF(html));

  let html: string;
  try {
    switch (format) {
      case "docx":
        html = await docxToHtml(file);
        break;
      case "xlsx":
        html = await xlsxToHtml(file);
        break;
      case "pptx":
        html = await pptxToHtml(file);
        break;
      default:
        throw new Error(ERR_EXPECTED_OFFICE);
    }
  } catch (error) {
    // Preserve an explicit unsupported-format error; everything else is a parse failure.
    if (error instanceof Error && error.message === ERR_EXPECTED_OFFICE) throw error;
    throw new Error(ERR_CORRUPT);
  }

  onProgress(60);

  const data = await toPdf(html);

  onProgress(100);

  return {
    data,
    filename: withExtension(file.name, "pdf"),
    fidelityNotices: [NOTICE_OFFICE_TO_PDF],
  };
}

/** Convert a .docx to HTML using mammoth. */
async function docxToHtml(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return result.value || "<p></p>";
}

/** Convert a .xlsx to an HTML table (one block per sheet) using SheetJS. */
async function xlsxToHtml(file: File): Promise<string> {
  const XLSX = await import("xlsx");
  const arrayBuffer = await file.arrayBuffer();
  const wb = XLSX.read(arrayBuffer, { type: "array" });

  const blocks: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const table = XLSX.utils.sheet_to_html(ws);
    blocks.push(`<h2>${escapeHtml(sheetName)}</h2>${table}`);
  }

  return blocks.join("<hr/>") || "<p></p>";
}

/**
 * Convert a .pptx to HTML by extracting each slide's text runs from its raw OOXML
 * with jszip. Layout, images, and styling are not reproduced (see fidelity notice).
 */
async function pptxToHtml(file: File): Promise<string> {
  const { default: JSZip } = await import("jszip");
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  // Slide parts live at ppt/slides/slideN.xml — order them by N.
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  const slides: string[] = [];
  for (let i = 0; i < slidePaths.length; i++) {
    const xml = await zip.files[slidePaths[i]].async("string");
    const texts = extractDrawingTextRuns(xml);
    const body = texts.length > 0
      ? texts.map((t) => `<p>${escapeHtml(t)}</p>`).join("")
      : "<p></p>";
    slides.push(`<section><h2>Slide ${i + 1}</h2>${body}</section>`);
  }

  return slides.join("<hr/>") || "<p></p>";
}

/** Parse the slide index N out of a `ppt/slides/slideN.xml` path. */
function slideNumber(path: string): number {
  const match = path.match(/slide(\d+)\.xml$/);
  return match ? parseInt(match[1], 10) : 0;
}

/** Extract the text inside every `<a:t>...</a:t>` run from a slide's OOXML. */
function extractDrawingTextRuns(xml: string): string[] {
  const runs: string[] = [];
  const regex = /<a:t>([\s\S]*?)<\/a:t>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    const decoded = decodeXmlEntities(match[1]);
    if (decoded.trim().length > 0) runs.push(decoded);
  }
  return runs;
}

/** Decode the basic XML entities that appear in OOXML text runs. */
function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
