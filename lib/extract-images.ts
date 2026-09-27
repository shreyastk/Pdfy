/**
 * Extract the embedded images from a PDF as standalone files.
 *
 * JPEG (DCT) and JPEG 2000 images are exported byte-for-byte, so there is no
 * quality loss. Other images are decoded (Flate/LZW/RunLength/ASCII filters)
 * and re-encoded as PNG, with soft-mask transparency applied when present.
 * Images using CCITT or JBIG2 fax compression, or exotic colour spaces, are
 * skipped and counted so the UI can say so.
 */
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream,
  PDFString,
  decodePDFRawStream,
} from "pdf-lib";
import { listImageStreams, nameOf, readImageInfo } from "@/lib/compress";

/** A colour space we know how to turn into RGB. */
export type ColorSpec =
  | { kind: "gray" }
  | { kind: "rgb" }
  | { kind: "cmyk" }
  | { kind: "indexed"; base: "gray" | "rgb" | "cmyk"; hival: number; lookup: Uint8Array };

const CHANNELS = { gray: 1, rgb: 3, cmyk: 4 } as const;

/** Read one `bpc`-bit sample at sample index `i` of a row starting at byte `rowStart`. */
function sample(data: Uint8Array, rowStart: number, i: number, bpc: number): number {
  if (bpc === 8) return data[rowStart + i];
  if (bpc === 16) return data[rowStart + i * 2]; // keep the high byte
  const bit = i * bpc;
  const byte = data[rowStart + (bit >> 3)] ?? 0;
  const shift = 8 - bpc - (bit & 7);
  return (byte >> shift) & ((1 << bpc) - 1);
}

function writeColor(
  out: Uint8ClampedArray,
  o: number,
  kind: "gray" | "rgb" | "cmyk",
  c: ArrayLike<number>,
  scale: number,
): void {
  if (kind === "gray") {
    out[o] = out[o + 1] = out[o + 2] = c[0] * scale;
  } else if (kind === "rgb") {
    out[o] = c[0] * scale;
    out[o + 1] = c[1] * scale;
    out[o + 2] = c[2] * scale;
  } else {
    const k = c[3] * scale;
    out[o] = 255 - Math.min(255, c[0] * scale + k);
    out[o + 1] = 255 - Math.min(255, c[1] * scale + k);
    out[o + 2] = 255 - Math.min(255, c[2] * scale + k);
  }
  out[o + 3] = 255;
}

/**
 * Convert decoded image samples to RGBA pixels. Rows are padded to a whole
 * byte, as the PDF spec requires for bit depths below 8.
 */
export function toRgba(
  data: Uint8Array,
  width: number,
  height: number,
  bpc: number,
  cs: ColorSpec,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  const n = cs.kind === "indexed" ? 1 : CHANNELS[cs.kind];
  const rowBytes = Math.ceil((width * n * (bpc === 16 ? 8 : bpc)) / 8) * (bpc === 16 ? 2 : 1);
  // Scale samples up to 0..255 (indexed samples are palette indices, not intensities).
  const scale = cs.kind === "indexed" || bpc >= 8 ? 1 : 255 / ((1 << bpc) - 1);
  const px = new Array<number>(4);

  for (let y = 0; y < height; y++) {
    const rowStart = y * rowBytes;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (cs.kind === "indexed") {
        const idx = Math.min(sample(data, rowStart, x, bpc), cs.hival);
        const bn = CHANNELS[cs.base];
        for (let c = 0; c < bn; c++) px[c] = cs.lookup[idx * bn + c] ?? 0;
        writeColor(out, o, cs.base, px, 1);
      } else {
        for (let c = 0; c < n; c++) px[c] = sample(data, rowStart, x * n + c, bpc);
        writeColor(out, o, cs.kind, px, scale);
      }
    }
  }
  return out;
}

/** Convert a 1-bit stencil mask to RGBA: painted samples are black, the rest transparent. */
export function stencilToRgba(data: Uint8Array, width: number, height: number, inverted: boolean) {
  const out = new Uint8ClampedArray(width * height * 4);
  const rowBytes = Math.ceil(width / 8);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const bit = sample(data, y * rowBytes, x, 1);
      // With the default Decode [0 1], a 0 sample is painted.
      const painted = inverted ? bit === 1 : bit === 0;
      out[(y * width + x) * 4 + 3] = painted ? 255 : 0;
    }
  }
  return out;
}

function baseKind(name: string | null): "gray" | "rgb" | "cmyk" | null {
  if (name === "DeviceGray" || name === "CalGray" || name === "G") return "gray";
  if (name === "DeviceRGB" || name === "CalRGB" || name === "RGB") return "rgb";
  if (name === "DeviceCMYK" || name === "CMYK") return "cmyk";
  return null;
}

function bytesOf(doc: PDFDocument, obj: unknown): Uint8Array | null {
  const v = obj instanceof PDFRef ? doc.context.lookup(obj) : obj;
  if (v instanceof PDFHexString || v instanceof PDFString) return v.asBytes();
  if (v instanceof PDFRawStream) return decodePDFRawStream(v).decode();
  return null;
}

/** Resolve an image's /ColorSpace entry, or null when unsupported. */
export function resolveColorSpace(doc: PDFDocument, obj: unknown): ColorSpec | null {
  const v = obj instanceof PDFRef ? doc.context.lookup(obj) : obj;
  const simple = baseKind(nameOf(v));
  if (simple) return { kind: simple };
  if (!(v instanceof PDFArray) || v.size() === 0) return null;

  const family = nameOf(v.get(0));
  if (family === "ICCBased") {
    const stream = doc.context.lookup(v.get(1));
    const n = stream instanceof PDFStream ? stream.dict.get(PDFName.of("N")) : undefined;
    const count = n instanceof PDFNumber ? n.asNumber() : 0;
    return count === 1 ? { kind: "gray" } : count === 3 ? { kind: "rgb" } : count === 4 ? { kind: "cmyk" } : null;
  }
  if (family === "CalGray" || family === "CalRGB") return { kind: baseKind(family)! };
  if (family === "Indexed" || family === "I") {
    const base = resolveColorSpace(doc, v.get(1));
    const hival = v.get(2);
    const lookup = bytesOf(doc, v.get(3));
    if (!base || base.kind === "indexed" || !(hival instanceof PDFNumber) || !lookup) return null;
    return { kind: "indexed", base: base.kind, hival: hival.asNumber(), lookup };
  }
  return null;
}

export interface ExtractedImage {
  filename: string;
  /** PNG images are returned as RGBA pixels for the caller to encode; others as raw bytes. */
  data: Uint8Array | { rgba: Uint8ClampedArray; width: number; height: number };
  width: number;
  height: number;
}

export interface ExtractImagesOptions {
  /** Skip images whose width or height is below this many pixels. Default 32. */
  minSize?: number;
  onProgress?: (current: number, total: number) => void;
}

export interface ExtractImagesResult {
  images: ExtractedImage[];
  /** Images skipped for being too small. */
  tooSmall: number;
  /** Images in a format we can't decode (CCITT, JBIG2, exotic colour spaces). */
  unsupported: number;
}

/** Map each image XObject to the first page (1-based) that draws it, following nested forms. */
function firstPageOfImages(doc: PDFDocument): Map<string, number> {
  const pages = new Map<string, number>();
  const visit = (resources: PDFDict | undefined, page: number, seen: Set<string>) => {
    const xobjects = resources?.lookupMaybe(PDFName.of("XObject"), PDFDict);
    if (!xobjects) return;
    for (const [, value] of xobjects.entries()) {
      if (!(value instanceof PDFRef)) continue;
      const key = value.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      const obj = doc.context.lookup(value);
      if (!(obj instanceof PDFStream)) continue;
      const subtype = nameOf(obj.dict.get(PDFName.of("Subtype")));
      if (subtype === "Image" && !pages.has(key)) pages.set(key, page);
      if (subtype === "Form") visit(obj.dict.lookupMaybe(PDFName.of("Resources"), PDFDict), page, seen);
    }
  };
  doc.getPages().forEach((p, i) => visit(p.node.Resources(), i + 1, new Set()));
  return pages;
}

/** Decode a soft mask (/SMask) into one alpha byte per pixel, or null if it doesn't fit. */
function decodeSoftMask(doc: PDFDocument, ref: unknown, width: number, height: number): Uint8Array | null {
  const mask = ref instanceof PDFRef ? doc.context.lookup(ref) : ref;
  if (!(mask instanceof PDFRawStream)) return null;
  const info = readImageInfo(mask.dict);
  if (info.width !== width || info.height !== height || info.bitsPerComponent !== 8) return null;
  if (info.filters.some((f) => f === "DCTDecode" || f === "JPXDecode")) return null;
  const data = decodePDFRawStream(mask).decode();
  return data.length >= width * height ? data : null;
}

const UNDECODABLE = new Set(["CCITTFaxDecode", "JBIG2Decode", "DCTDecode", "JPXDecode", "Crypt"]);

export async function extractImages(
  file: File | Uint8Array,
  options: ExtractImagesOptions = {},
): Promise<ExtractImagesResult> {
  const { minSize = 32, onProgress } = options;
  const bytes = file instanceof Uint8Array ? file : new Uint8Array(await file.arrayBuffer());
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const all = listImageStreams(doc);

  // Soft masks are image XObjects too, but they only make sense as alpha for their parent.
  const maskRefs = new Set<string>();
  for (const [, stream] of all) {
    const smask = stream.dict.get(PDFName.of("SMask"));
    if (smask instanceof PDFRef) maskRefs.add(smask.toString());
  }
  const candidates = all.filter(([ref]) => !maskRefs.has(ref.toString()));
  const pageOf = firstPageOfImages(doc);
  const perPage = new Map<number, number>();

  const result: ExtractImagesResult = { images: [], tooSmall: 0, unsupported: 0 };
  for (let i = 0; i < candidates.length; i++) {
    onProgress?.(i + 1, candidates.length);
    const [ref, stream] = candidates[i];
    const info = readImageInfo(stream.dict);
    const { width, height } = info;
    if (width < minSize || height < minSize) {
      result.tooSmall++;
      continue;
    }

    const page = pageOf.get(ref.toString());
    const seq = (perPage.get(page ?? 0) ?? 0) + 1;
    perPage.set(page ?? 0, seq);
    const base = page ? `page-${page}-image-${seq}` : `image-${seq}`;
    const last = info.filters[info.filters.length - 1];

    try {
      // JPEG / JPEG 2000: export the original bytes untouched.
      if ((last === "DCTDecode" || last === "JPXDecode") && info.filters.length === 1) {
        const ext = last === "DCTDecode" ? "jpg" : "jp2";
        result.images.push({ filename: `${base}.${ext}`, data: stream.contents, width, height });
        continue;
      }
      if (info.filters.some((f) => UNDECODABLE.has(f))) {
        result.unsupported++;
        continue;
      }

      const decoded = decodePDFRawStream(stream).decode();
      let rgba: Uint8ClampedArray;
      if (info.isImageMask) {
        const decode = stream.dict.lookupMaybe(PDFName.of("Decode"), PDFArray);
        const inverted = decode?.get(0) instanceof PDFNumber && (decode.get(0) as PDFNumber).asNumber() === 1;
        rgba = stencilToRgba(decoded, width, height, inverted);
      } else {
        const cs = resolveColorSpace(doc, stream.dict.get(PDFName.of("ColorSpace")));
        const bpc = info.bitsPerComponent ?? 8;
        if (!cs || ![1, 2, 4, 8, 16].includes(bpc)) {
          result.unsupported++;
          continue;
        }
        rgba = toRgba(decoded, width, height, bpc, cs);
        const alpha = decodeSoftMask(doc, stream.dict.get(PDFName.of("SMask")), width, height);
        if (alpha) for (let p = 0; p < width * height; p++) rgba[p * 4 + 3] = alpha[p];
      }
      result.images.push({ filename: `${base}.png`, data: { rgba, width, height }, width, height });
    } catch {
      result.unsupported++;
    }
  }
  return result;
}

/** Encode RGBA pixels as a PNG using a canvas (browser only). */
export async function encodePng(rgba: Uint8ClampedArray, width: number, height: number): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("PNG encoding failed");
  return new Uint8Array(await blob.arrayBuffer());
}
