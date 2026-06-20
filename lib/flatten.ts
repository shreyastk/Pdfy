import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  PDFRef,
  PDFStream,
  PDFNumber,
} from "pdf-lib";

/**
 * Flatten a PDF: render AcroForm field values and annotation appearances into
 * static page content and remove the interactive objects, so the output PDF
 * contains zero interactive AcroForm fields and zero interactive annotations
 * while preserving the original page count and page order.
 *
 * Returns `{ error: "nothing-to-flatten" }` when the source has no AcroForm
 * fields and no annotations (Req 9.5) without producing a modified file.
 *
 * Limitations: AcroForm field values are baked via pdf-lib's `form.flatten()`,
 * which renders the current appearance of each field. For non-widget
 * annotations, the visible normal appearance stream (`/AP /N`) is drawn into
 * the page content at the annotation's rectangle using the PDF appearance-box
 * transform; annotations without a usable appearance stream (e.g. Link/Popup)
 * are simply removed. Annotation appearances that depend on blend modes or
 * external resources beyond their own appearance stream may not reproduce with
 * full fidelity.
 */
export async function flattenPdf(
  file: File
): Promise<{ data: Uint8Array } | { error: "nothing-to-flatten" }> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);

  const fieldCount = countFormFields(pdf);
  const annotationCount = countAnnotations(pdf);

  // Nothing to flatten: no interactive fields and no annotations (Req 9.5).
  if (fieldCount === 0 && annotationCount === 0) {
    return { error: "nothing-to-flatten" };
  }

  // Render AcroForm field values into static content and remove the fields
  // (Req 9.1). pdf-lib's flatten draws each widget appearance at its existing
  // coordinates and removes the interactive field + widget annotations.
  if (fieldCount > 0) {
    const form = pdf.getForm();
    form.flatten();
  }

  // Merge remaining (non-widget) annotation appearances into page content and
  // remove the interactive annotations (Req 9.2), preserving page count/order
  // (Req 9.3) since we never add, remove, or reorder pages.
  for (const page of pdf.getPages()) {
    flattenPageAnnotations(page.node, pdf);
  }

  const data = await pdf.save();
  return { data };
}

/** Count interactive AcroForm fields in the document. */
export function countFormFields(pdf: PDFDocument): number {
  try {
    return pdf.getForm().getFields().length;
  } catch {
    return 0;
  }
}

/** Count interactive annotations across all pages in the document. */
export function countAnnotations(pdf: PDFDocument): number {
  let total = 0;
  for (const page of pdf.getPages()) {
    const annots = page.node.Annots();
    if (annots) total += annots.size();
  }
  return total;
}

type PageNode = ReturnType<PDFDocument["getPages"]>[number]["node"];

/**
 * Bake each annotation's normal appearance into the page content stream, then
 * remove every annotation from the page so the output has zero interactive
 * annotations.
 */
function flattenPageAnnotations(node: PageNode, pdf: PDFDocument): void {
  const annots = node.Annots();
  if (!annots || annots.size() === 0) return;

  const context = pdf.context;

  for (let i = 0; i < annots.size(); i++) {
    try {
      const annotRefOrDict = annots.get(i);
      const annotDict =
        annotRefOrDict instanceof PDFRef
          ? context.lookup(annotRefOrDict, PDFDict)
          : (annotRefOrDict as PDFDict);
      if (!(annotDict instanceof PDFDict)) continue;

      bakeAnnotationAppearance(node, annotDict, pdf);
    } catch {
      // Best-effort: if an individual annotation cannot be baked, fall through
      // and rely on the removal below so the output is still non-interactive.
    }
  }

  // Remove all annotations from the page (Req 9.2). Clearing the array leaves
  // page count/order untouched (Req 9.3).
  node.set(PDFName.of("Annots"), context.obj([]));
}

/**
 * Draw an annotation's normal appearance stream into the page content using
 * the PDF appearance-box transform (PDF 32000-1, 12.5.5).
 */
function bakeAnnotationAppearance(
  node: PageNode,
  annotDict: PDFDict,
  pdf: PDFDocument
): void {
  const context = pdf.context;

  const rect = readRect(annotDict.lookup(PDFName.of("Rect"), PDFArray));
  if (!rect) return;

  const apStreamRef = resolveAppearanceStreamRef(annotDict, pdf);
  if (!apStreamRef) return;

  const apStream = context.lookup(apStreamRef, PDFStream);
  if (!(apStream instanceof PDFStream)) return;

  const bbox = readRect(apStream.dict.lookup(PDFName.of("BBox"), PDFArray));
  if (!bbox) return;
  const matrix = readMatrix(apStream.dict.lookup(PDFName.of("Matrix"), PDFArray));

  // Transform the BBox by the appearance Matrix and take the smallest
  // enclosing axis-aligned rectangle (the "transformed appearance box").
  const corners: Array<[number, number]> = [
    [bbox.x1, bbox.y1],
    [bbox.x2, bbox.y1],
    [bbox.x2, bbox.y2],
    [bbox.x1, bbox.y2],
  ].map(([x, y]) => applyMatrix(matrix, x, y));

  const txs = corners.map((c) => c[0]);
  const tys = corners.map((c) => c[1]);
  const tx1 = Math.min(...txs);
  const ty1 = Math.min(...tys);
  const tx2 = Math.max(...txs);
  const ty2 = Math.max(...tys);

  const transW = tx2 - tx1;
  const transH = ty2 - ty1;
  if (transW === 0 || transH === 0) return;

  const rectW = rect.x2 - rect.x1;
  const rectH = rect.y2 - rect.y1;

  // Matrix A maps the transformed appearance box onto the annotation Rect.
  const sx = rectW / transW;
  const sy = rectH / transH;
  const e = rect.x1 - sx * tx1;
  const f = rect.y1 - sy * ty1;

  const xObjectName = node.newXObject("FlatAnnot", apStreamRef);

  const ops = `q ${fmt(sx)} 0 0 ${fmt(sy)} ${fmt(e)} ${fmt(f)} cm ${xObjectName.asString()} Do Q`;
  const contentRef = context.register(context.stream(ops));
  node.addContentStream(contentRef);
}

/** Resolve the normal appearance (`/AP /N`) stream ref, honoring `/AS`. */
function resolveAppearanceStreamRef(
  annotDict: PDFDict,
  pdf: PDFDocument
): PDFRef | undefined {
  const context = pdf.context;
  const ap = annotDict.lookupMaybe(PDFName.of("AP"), PDFDict);
  if (!ap) return undefined;

  const nValue = ap.get(PDFName.of("N"));
  if (!nValue) return undefined;

  // Case 1: N is a direct/indirect appearance stream.
  const nResolved =
    nValue instanceof PDFRef ? context.lookup(nValue) : nValue;
  if (nResolved instanceof PDFStream) {
    return nValue instanceof PDFRef ? nValue : context.register(nResolved);
  }

  // Case 2: N is a subdictionary of appearance states; pick via /AS.
  if (nResolved instanceof PDFDict) {
    const as = annotDict.lookupMaybe(PDFName.of("AS"), PDFName);
    if (!as) return undefined;
    const stateValue = nResolved.get(as);
    if (!stateValue) return undefined;
    const stateResolved =
      stateValue instanceof PDFRef ? context.lookup(stateValue) : stateValue;
    if (stateResolved instanceof PDFStream) {
      return stateValue instanceof PDFRef
        ? stateValue
        : context.register(stateResolved);
    }
  }

  return undefined;
}

interface RectLike {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function readRect(arr: PDFArray | undefined): RectLike | undefined {
  if (!arr || arr.size() < 4) return undefined;
  const nums = [0, 1, 2, 3].map((i) => numberAt(arr, i));
  if (nums.some((n) => n === undefined)) return undefined;
  const [a, b, c, d] = nums as number[];
  return {
    x1: Math.min(a, c),
    y1: Math.min(b, d),
    x2: Math.max(a, c),
    y2: Math.max(b, d),
  };
}

type Matrix6 = [number, number, number, number, number, number];

function readMatrix(arr: PDFArray | undefined): Matrix6 {
  if (!arr || arr.size() < 6) return [1, 0, 0, 1, 0, 0];
  const nums = [0, 1, 2, 3, 4, 5].map((i) => numberAt(arr, i));
  if (nums.some((n) => n === undefined)) return [1, 0, 0, 1, 0, 0];
  return nums as Matrix6;
}

function numberAt(arr: PDFArray, index: number): number | undefined {
  const obj = arr.get(index);
  if (obj instanceof PDFNumber) return obj.asNumber();
  return undefined;
}

function applyMatrix(m: Matrix6, x: number, y: number): [number, number] {
  const [a, b, c, d, e, f] = m;
  return [a * x + c * y + e, b * x + d * y + f];
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Number(n.toFixed(6)).toString();
}
