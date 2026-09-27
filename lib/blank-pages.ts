/**
 * Detect and remove blank pages.
 *
 * Each page is rendered small and the share of "inked" (non-near-white)
 * pixels is measured. Scanned blanks are rarely perfectly white (dust,
 * bleed-through), so the threshold is adjustable.
 */
import { loadPdfjs } from "@/lib/pdfjs";
import { buildSubsetPdf } from "@/lib/page-manager";

/** Pixels with every channel at or above this value count as paper. */
export const WHITE_LEVEL = 235;

/** Fraction (0..1) of pixels that are visibly not white. Transparent pixels count as white. */
export function inkRatio(rgba: Uint8ClampedArray | Uint8Array, whiteLevel = WHITE_LEVEL): number {
  const pixels = rgba.length / 4;
  if (pixels === 0) return 0;
  let inked = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 16) continue;
    if (rgba[i] < whiteLevel || rgba[i + 1] < whiteLevel || rgba[i + 2] < whiteLevel) inked++;
  }
  return inked / pixels;
}

/**
 * Sensitivity presets: the maximum ink ratio still treated as blank.
 * "strict" only removes truly empty pages; "lenient" also catches noisy scans.
 */
export const SENSITIVITY = {
  strict: 0.0005,
  normal: 0.003,
  lenient: 0.01,
} as const;
export type Sensitivity = keyof typeof SENSITIVITY;

export interface BlankPageScan {
  pageCount: number;
  /** 0-based indices of pages considered blank. */
  blank: number[];
  ratios: number[];
}

export async function findBlankPages(
  file: File,
  sensitivity: Sensitivity,
  onProgress?: (current: number, total: number) => void,
): Promise<BlankPageScan> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const limit = SENSITIVITY[sensitivity];
  const ratios: number[] = [];
  const blank: number[] = [];

  for (let n = 1; n <= doc.numPages; n++) {
    onProgress?.(n, doc.numPages);
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    // ~300px on the long edge is plenty to see content.
    const viewport = page.getViewport({ scale: 300 / Math.max(base.width, base.height) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const ratio = inkRatio(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
    ratios.push(ratio);
    if (ratio <= limit) blank.push(n - 1);
  }

  const pageCount = doc.numPages;
  await doc.destroy();
  return { pageCount, blank, ratios };
}

/** Remove the given 0-based pages. Refuses to remove every page. */
export async function removePages(file: File, pageCount: number, remove: number[]): Promise<Uint8Array> {
  const drop = new Set(remove);
  const keep = Array.from({ length: pageCount }, (_, i) => i).filter((i) => !drop.has(i));
  if (keep.length === 0) throw new Error("Every page looks blank — nothing would be left, so no pages were removed.");
  return buildSubsetPdf(file, keep);
}
