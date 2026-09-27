/**
 * Read and write the PDF outline (bookmarks / table of contents).
 *
 * The UI edits a flat list of `{ title, page, level }` entries; indentation
 * (`level`) encodes nesting. {@link buildOutlineTree} turns that into a tree,
 * and {@link writeOutline} serializes it as the /Outlines dictionary chain
 * defined in the PDF spec (First/Last/Next/Prev/Parent/Count).
 */
import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFNull, PDFNumber, PDFRef, type PDFObject } from "pdf-lib";
import { loadPdfjs } from "@/lib/pdfjs";

export interface OutlineEntry {
  title: string;
  /** 0-based page index. */
  page: number;
  /** Nesting depth; 0 = top level. */
  level: number;
}

export interface OutlineNode {
  title: string;
  page: number;
  children: OutlineNode[];
}

export type OutlineValidation =
  | { ok: true }
  | { ok: false; index: number; reason: "empty-title" | "bad-page" | "bad-level" };

/**
 * A flat outline is valid when every title is non-empty, every page exists,
 * the first entry is top-level, and each entry is at most one level deeper
 * than the one before it.
 */
export function validateOutline(entries: OutlineEntry[], pageCount: number): OutlineValidation {
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e.title.trim()) return { ok: false, index: i, reason: "empty-title" };
    if (!Number.isInteger(e.page) || e.page < 0 || e.page >= pageCount) {
      return { ok: false, index: i, reason: "bad-page" };
    }
    const prevLevel = i === 0 ? -1 : entries[i - 1].level;
    if (!Number.isInteger(e.level) || e.level < 0 || e.level > prevLevel + 1) {
      return { ok: false, index: i, reason: "bad-level" };
    }
  }
  return { ok: true };
}

/** Convert a (valid) flat list into a tree. */
export function buildOutlineTree(entries: OutlineEntry[]): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const stack: { level: number; node: OutlineNode }[] = [];
  for (const e of entries) {
    const node: OutlineNode = { title: e.title.trim(), page: e.page, children: [] };
    while (stack.length && stack[stack.length - 1].level >= e.level) stack.pop();
    if (stack.length) stack[stack.length - 1].node.children.push(node);
    else roots.push(node);
    stack.push({ level: e.level, node });
  }
  return roots;
}

/** Flatten a tree back into `{ title, page, level }` entries (depth-first). */
export function flattenOutline(nodes: OutlineNode[], level = 0): OutlineEntry[] {
  return nodes.flatMap((n) => [
    { title: n.title, page: n.page, level },
    ...flattenOutline(n.children, level + 1),
  ]);
}

/** Read the existing outline using pdf.js (which resolves named destinations). */
export async function readOutline(file: File): Promise<{ entries: OutlineEntry[]; pageCount: number }> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const outline = (await doc.getOutline()) ?? [];

  type Item = { title: string; dest: unknown; items: Item[] };
  const resolvePage = async (dest: unknown): Promise<number> => {
    try {
      const explicit = typeof dest === "string" ? await doc.getDestination(dest) : dest;
      if (!Array.isArray(explicit) || explicit.length === 0) return 0;
      const target = explicit[0];
      if (typeof target === "number") return target;
      return await doc.getPageIndex(target);
    } catch {
      return 0;
    }
  };

  const walk = async (items: Item[], level: number): Promise<OutlineEntry[]> => {
    const out: OutlineEntry[] = [];
    for (const item of items) {
      out.push({ title: item.title, page: await resolvePage(item.dest), level });
      out.push(...(await walk(item.items ?? [], level + 1)));
    }
    return out;
  };

  const entries = await walk(outline as Item[], 0);
  const pageCount = doc.numPages;
  await doc.destroy();
  return { entries, pageCount };
}

/** Replace the document outline with `entries` (an empty list removes it). */
export async function writeOutline(file: File, entries: OutlineEntry[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(await file.arrayBuffer());
  const check = validateOutline(entries, doc.getPageCount());
  if (!check.ok) throw new Error(`Bookmark ${check.index + 1} is invalid (${check.reason}).`);

  const ctx = doc.context;
  const pageRefs = doc.getPages().map((p) => p.ref);
  doc.catalog.delete(PDFName.of("Outlines"));

  if (entries.length === 0) return doc.save();

  const rootRef = ctx.nextRef();

  /** Write sibling `nodes` under `parent`; returns [firstRef, lastRef, visibleCount]. */
  const writeLevel = (nodes: OutlineNode[], parent: PDFRef): [PDFRef, PDFRef, number] => {
    const refs = nodes.map(() => ctx.nextRef());
    let visible = 0;
    nodes.forEach((node, i) => {
      const dict = PDFDict.withContext(ctx);
      const put = (key: string, value: PDFObject) => dict.set(PDFName.of(key), value);
      put("Title", PDFHexString.fromText(node.title));
      put("Parent", parent);
      put("Dest", ctx.obj([pageRefs[node.page], PDFName.of("XYZ"), PDFNull, PDFNull, PDFNull]));
      if (i > 0) put("Prev", refs[i - 1]);
      if (i < nodes.length - 1) put("Next", refs[i + 1]);
      visible++;
      if (node.children.length) {
        const [first, last, childCount] = writeLevel(node.children, refs[i]);
        put("First", first);
        put("Last", last);
        // Positive count = expanded, showing its visible descendants.
        put("Count", PDFNumber.of(childCount));
        visible += childCount;
      }
      ctx.assign(refs[i], dict);
    });
    return [refs[0], refs[refs.length - 1], visible];
  };

  const [first, last, count] = writeLevel(buildOutlineTree(entries), rootRef);
  ctx.assign(
    rootRef,
    ctx.obj({ Type: "Outlines", First: first, Last: last, Count: PDFNumber.of(count) }),
  );
  doc.catalog.set(PDFName.of("Outlines"), rootRef);
  doc.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));
  return doc.save();
}
