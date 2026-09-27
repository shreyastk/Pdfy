/**
 * Repair damaged PDFs.
 *
 * Strategy 1 — rebuild: pdf-lib parses a file by scanning every object in
 * order rather than trusting the cross-reference table, so it recovers files
 * with broken/missing xref tables, bad offsets or truncated trailers. The
 * pages it finds are copied into a fresh document with a clean xref.
 *
 * Strategy 2 — render: if the structure is too damaged for that, pdf.js (which
 * is very tolerant) renders each page it can read into a new PDF. Text stops
 * being selectable, but the content is recovered.
 *
 * Every rebuilt result is re-opened with pdf.js to confirm it actually works.
 */
import { PDFDocument } from "pdf-lib";
import { loadPdfjs } from "@/lib/pdfjs";
import { rasterizePages } from "@/lib/compress";

export type RepairMethod = "rebuilt" | "rendered";

export interface RepairResult {
  bytes: Uint8Array;
  method: RepairMethod;
  pageCount: number;
}

const HEADER = "%PDF-";

/** Offset of the `%PDF-` header, tolerating junk before it (common with e-mail/download damage). */
export function findHeaderOffset(bytes: Uint8Array): number {
  const limit = Math.min(bytes.length - HEADER.length, 1024 * 1024);
  outer: for (let i = 0; i <= limit; i++) {
    for (let j = 0; j < HEADER.length; j++) {
      if (bytes[i + j] !== HEADER.charCodeAt(j)) continue outer;
    }
    return i;
  }
  return -1;
}

async function opensCleanly(bytes: Uint8Array): Promise<number> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: bytes.slice(), stopAtErrors: true }).promise;
  const pages = doc.numPages;
  // Rendering is where hidden damage shows up; fetch every page's operator list cheaply.
  for (let n = 1; n <= pages; n++) {
    await (await doc.getPage(n)).getOperatorList();
  }
  await doc.destroy();
  return pages;
}

async function rebuild(bytes: Uint8Array): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes, {
    ignoreEncryption: false,
    throwOnInvalidObject: false,
    updateMetadata: false,
  });
  if (src.getPageCount() === 0) throw new Error("No pages recovered");
  const out = await PDFDocument.create({ updateMetadata: false });
  const pages = await out.copyPages(src, src.getPageIndices());
  pages.forEach((p) => out.addPage(p));
  const title = src.getTitle();
  if (title) out.setTitle(title);
  return out.save();
}

export async function repairPdf(
  file: File,
  onProgress?: (label: string) => void,
): Promise<RepairResult> {
  const raw = new Uint8Array(await file.arrayBuffer());
  const offset = findHeaderOffset(raw);
  if (offset < 0) throw new Error("This file does not contain PDF data, so it cannot be repaired.");
  const bytes = offset > 0 ? raw.subarray(offset) : raw;

  onProgress?.("Rebuilding document structure…");
  try {
    const rebuilt = await rebuild(bytes);
    const pageCount = await opensCleanly(rebuilt);
    return { bytes: rebuilt, method: "rebuilt", pageCount };
  } catch (e) {
    if (e instanceof Error && /encrypt/i.test(e.message)) {
      throw new Error("This PDF is password-protected. Unlock it first, then repair it.");
    }
  }

  onProgress?.("Recovering pages by rendering them…");
  try {
    const rendered = await rasterizePages(bytes, { quality: 0.9, rasterScale: 2 }, (c, t) =>
      onProgress?.(`Recovering page ${c} of ${t}…`),
    );
    const pageCount = (await PDFDocument.load(rendered)).getPageCount();
    return { bytes: rendered, method: "rendered", pageCount };
  } catch {
    throw new Error("This PDF is too badly damaged to recover any pages.");
  }
}
