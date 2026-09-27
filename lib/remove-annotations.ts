/**
 * Remove annotations from a PDF: comments, highlights, sticky notes, stamps,
 * ink drawings, and optionally links and form fields.
 *
 * Unlike Flatten, nothing is baked into the page — annotations simply
 * disappear. Links and form-field widgets are kept by default because they
 * are usually part of the document rather than review markup.
 */
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef } from "pdf-lib";

export interface RemoveAnnotationsOptions {
  /** Keep clickable links (/Link). Default true. */
  keepLinks?: boolean;
  /** Keep form-field widgets (/Widget) and the AcroForm. Default true. */
  keepFormFields?: boolean;
}

export interface RemoveAnnotationsResult {
  bytes: Uint8Array;
  /** Number of annotations removed, per subtype (e.g. { Highlight: 3 }). */
  removed: Record<string, number>;
  /** Total number removed. */
  total: number;
}

/** Decide whether an annotation of `subtype` should be kept. */
export function shouldKeep(subtype: string, options: RemoveAnnotationsOptions = {}): boolean {
  const { keepLinks = true, keepFormFields = true } = options;
  if (subtype === "Link") return keepLinks;
  if (subtype === "Widget") return keepFormFields;
  // A Popup belongs to a parent markup annotation; it goes with everything else.
  return false;
}

export async function removeAnnotations(
  file: File | Uint8Array,
  options: RemoveAnnotationsOptions = {},
): Promise<RemoveAnnotationsResult> {
  const bytes = file instanceof Uint8Array ? file : new Uint8Array(await file.arrayBuffer());
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const context = doc.context;
  const removed: Record<string, number> = {};
  let total = 0;

  for (const page of doc.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;

    const kept: (PDFRef | PDFDict)[] = [];
    for (let i = 0; i < annots.size(); i++) {
      const entry = annots.get(i);
      const dict = entry instanceof PDFRef ? context.lookupMaybe(entry, PDFDict) : entry;
      if (!(dict instanceof PDFDict)) continue; // dangling reference — drop it
      const subtypeObj = dict.get(PDFName.of("Subtype"));
      const subtype = subtypeObj instanceof PDFName ? subtypeObj.decodeText() : "Unknown";
      if (shouldKeep(subtype, options)) {
        kept.push(entry as PDFRef | PDFDict);
      } else {
        removed[subtype] = (removed[subtype] ?? 0) + 1;
        total++;
        if (entry instanceof PDFRef) context.delete(entry);
      }
    }

    if (kept.length === 0) {
      page.node.delete(PDFName.of("Annots"));
    } else {
      const arr = PDFArray.withContext(context);
      for (const k of kept) arr.push(k);
      page.node.set(PDFName.of("Annots"), arr);
    }
  }

  // Without widgets, the form has nothing to point at.
  if (options.keepFormFields === false) {
    doc.catalog.delete(PDFName.of("AcroForm"));
  }

  return { bytes: await doc.save({ useObjectStreams: true }), removed, total };
}
