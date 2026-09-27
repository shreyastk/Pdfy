/**
 * Interleave (alternate & mix) two PDFs page by page.
 *
 * The classic use: a single-sided scanner produced one PDF of front sides and
 * another of back sides. Interleaving gives front 1, back 1, front 2, back 2…
 * The back-side scan is usually in reverse order (the stack was flipped), so
 * that can be corrected on the fly.
 */
import { PDFDocument } from "pdf-lib";

/** A page reference: which source document (0 = A, 1 = B) and 0-based index. */
export type PageRef = [source: 0 | 1, index: number];

/**
 * Order the pages of A and B alternately. When one document runs out, the
 * remaining pages of the other are appended in order.
 */
export function planInterleave(countA: number, countB: number, reverseB = false): PageRef[] {
  const plan: PageRef[] = [];
  for (let i = 0; i < Math.max(countA, countB); i++) {
    if (i < countA) plan.push([0, i]);
    if (i < countB) plan.push([1, reverseB ? countB - 1 - i : i]);
  }
  return plan;
}

export interface InterleaveResult {
  bytes: Uint8Array;
  countA: number;
  countB: number;
}

export async function interleavePdfs(
  a: File | Uint8Array,
  b: File | Uint8Array,
  reverseB = false,
): Promise<InterleaveResult> {
  const load = async (f: File | Uint8Array) =>
    PDFDocument.load(f instanceof Uint8Array ? f : await f.arrayBuffer());
  const [docA, docB] = await Promise.all([load(a), load(b)]);
  const countA = docA.getPageCount();
  const countB = docB.getPageCount();

  const out = await PDFDocument.create();
  const pagesA = await out.copyPages(docA, docA.getPageIndices());
  const pagesB = await out.copyPages(docB, docB.getPageIndices());
  for (const [source, index] of planInterleave(countA, countB, reverseB)) {
    out.addPage((source === 0 ? pagesA : pagesB)[index]);
  }

  return { bytes: await out.save({ useObjectStreams: true }), countA, countB };
}
