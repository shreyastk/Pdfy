/**
 * PDF compression that preserves the document.
 *
 * The default strategy never rasterizes pages: text stays selectable, links,
 * bookmarks and form fields survive, and every page keeps its original size.
 * Instead it re-encodes the embedded raster images — the usual source of bloat
 * — at a lower resolution/quality, and rewrites the file with object streams.
 * An image is only replaced when the re-encoded version is actually smaller.
 *
 * An opt-in "rasterize" strategy renders each page to a JPEG (at the page's own
 * size), which shrinks scanned documents further at the cost of selectable
 * text. It is surfaced in the UI with a clear warning.
 *
 * The eligibility decision ({@link planImage}) is pure so it can be tested
 * without a browser; decoding/encoding uses canvas and only runs client-side.
 */
import {
  PDFDocument,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFArray,
  PDFRawStream,
  PDFRef,
  decodePDFRawStream,
} from "pdf-lib";
import { loadPdfjs } from "@/lib/pdfjs";

export type CompressionLevel = "low" | "medium" | "high";

export interface CompressionPreset {
  /** JPEG quality, 0..1. */
  quality: number;
  /** Longest image edge in pixels after downscaling. */
  maxDimension: number;
  /** Render scale (relative to 72 dpi) used by the rasterize strategy. */
  rasterScale: number;
}

export const PRESETS: Record<CompressionLevel, CompressionPreset> = {
  low: { quality: 0.85, maxDimension: 2400, rasterScale: 2 },
  medium: { quality: 0.7, maxDimension: 1600, rasterScale: 1.5 },
  high: { quality: 0.5, maxDimension: 1100, rasterScale: 1.1 },
};

export interface CompressOptions {
  level: CompressionLevel;
  /** Render whole pages to images (loses selectable text). */
  rasterize?: boolean;
  onProgress?: (current: number, total: number) => void;
}

export interface CompressResult {
  bytes: Uint8Array;
  originalSize: number;
  imagesRecompressed: number;
  /** True when no smaller output could be produced and the input was returned. */
  unchanged: boolean;
}

/** Facts about an image XObject needed to decide whether we can re-encode it. */
export interface ImageInfo {
  filters: string[];
  colorSpace: string | null;
  bitsPerComponent: number | null;
  width: number;
  height: number;
  hasDecodeArray: boolean;
  hasColorKeyMask: boolean;
  isImageMask: boolean;
}

export type ImagePlan =
  | { action: "skip"; reason: string }
  | { action: "jpeg"; source: "dct" | "raw"; channels: 1 | 3 };

/**
 * Decide whether an image can be safely re-encoded as JPEG.
 *
 * Only simple, common cases are touched: JPEG (DCT) images, and 8-bit
 * Flate/unfiltered images in DeviceRGB or DeviceGray. Anything exotic (CMYK,
 * indexed palettes, decode arrays, color-key masks, stencil masks, tiny images)
 * is left byte-for-byte untouched so fidelity is never compromised.
 */
export function planImage(info: ImageInfo): ImagePlan {
  if (info.isImageMask) return { action: "skip", reason: "stencil mask" };
  if (info.hasDecodeArray) return { action: "skip", reason: "decode array" };
  if (info.hasColorKeyMask) return { action: "skip", reason: "color-key mask" };
  if (info.width * info.height < 64 * 64) return { action: "skip", reason: "too small" };

  const channels =
    info.colorSpace === "DeviceRGB" ? 3 : info.colorSpace === "DeviceGray" ? 1 : null;
  if (channels === null) return { action: "skip", reason: "unsupported color space" };

  if (info.filters.length === 1 && info.filters[0] === "DCTDecode") {
    return { action: "jpeg", source: "dct", channels };
  }
  const rawFilters = info.filters.every((f) => f === "FlateDecode");
  if (rawFilters && info.filters.length <= 1 && info.bitsPerComponent === 8) {
    return { action: "jpeg", source: "raw", channels };
  }
  return { action: "skip", reason: "unsupported filter" };
}

/** Scale (w, h) down so the longest edge is at most `max`, never up. */
export function fitWithin(width: number, height: number, max: number) {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function nameOf(value: unknown): string | null {
  return value instanceof PDFName ? value.decodeText() : null;
}

export function readImageInfo(dict: PDFDict): ImageInfo {
  const filter = dict.get(PDFName.of("Filter"));
  const filters =
    filter instanceof PDFArray
      ? filter.asArray().map((f) => nameOf(f) ?? "?")
      : filter
        ? [nameOf(filter) ?? "?"]
        : [];
  const num = (key: string) => {
    const v = dict.get(PDFName.of(key));
    return v instanceof PDFNumber ? v.asNumber() : null;
  };
  const mask = dict.get(PDFName.of("Mask"));
  const imageMask = dict.get(PDFName.of("ImageMask"));
  return {
    filters,
    colorSpace: nameOf(dict.get(PDFName.of("ColorSpace"))),
    bitsPerComponent: num("BitsPerComponent"),
    width: num("Width") ?? 0,
    height: num("Height") ?? 0,
    hasDecodeArray: dict.has(PDFName.of("Decode")),
    hasColorKeyMask: mask instanceof PDFArray,
    isImageMask: imageMask !== undefined && String(imageMask) === "true",
  };
}

export async function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) throw new Error("JPEG encoding failed");
  return new Uint8Array(await blob.arrayBuffer());
}

/** Convert canvas pixels to luminance in place (Rec. 601 weights). */
export function toGrayscale(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const y = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] = d[i + 1] = d[i + 2] = y;
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Decode an image stream onto a canvas at its target (downscaled) size,
 * optionally converting it to grayscale.
 */
export async function drawImageStream(
  stream: PDFRawStream,
  info: ImageInfo,
  plan: Extract<ImagePlan, { action: "jpeg" }>,
  maxDimension: number,
  grayscale = false,
): Promise<HTMLCanvasElement> {
  const target = fitWithin(info.width, info.height, maxDimension);
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  let source: CanvasImageSource;
  if (plan.source === "dct") {
    source = await createImageBitmap(new Blob([stream.contents as BlobPart], { type: "image/jpeg" }));
  } else {
    const decoded = decodePDFRawStream(stream).decode();
    const pixels = info.width * info.height;
    if (decoded.length < pixels * plan.channels) throw new Error("Truncated image data");
    const rgba = new Uint8ClampedArray(pixels * 4);
    for (let i = 0; i < pixels; i++) {
      if (plan.channels === 3) {
        rgba[i * 4] = decoded[i * 3];
        rgba[i * 4 + 1] = decoded[i * 3 + 1];
        rgba[i * 4 + 2] = decoded[i * 3 + 2];
      } else {
        rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = decoded[i];
      }
      rgba[i * 4 + 3] = 255;
    }
    const full = document.createElement("canvas");
    full.width = info.width;
    full.height = info.height;
    full.getContext("2d")!.putImageData(new ImageData(rgba, info.width, info.height), 0, 0);
    source = full;
  }

  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, target.width, target.height);
  if ("close" in source && typeof source.close === "function") source.close();
  if (grayscale) toGrayscale(canvas);
  return canvas;
}

/** Swap an image XObject's data for a JPEG, keeping its other entries (e.g. SMask). */
export function replaceWithJpeg(
  doc: PDFDocument,
  ref: PDFRef,
  stream: PDFRawStream,
  jpeg: Uint8Array,
  width: number,
  height: number,
): void {
  const dict = stream.dict.clone(doc.context);
  dict.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
  dict.delete(PDFName.of("DecodeParms"));
  dict.set(PDFName.of("Width"), PDFNumber.of(width));
  dict.set(PDFName.of("Height"), PDFNumber.of(height));
  dict.set(PDFName.of("BitsPerComponent"), PDFNumber.of(8));
  // Canvas always emits 3-channel JPEGs.
  dict.set(PDFName.of("ColorSpace"), PDFName.of("DeviceRGB"));
  dict.set(PDFName.of("Length"), PDFNumber.of(jpeg.length));
  doc.context.assign(ref, PDFRawStream.of(dict, jpeg));
}

/** Every image XObject in the document, with its indirect reference. */
export function listImageStreams(doc: PDFDocument): [PDFRef, PDFRawStream][] {
  return doc.context
    .enumerateIndirectObjects()
    .filter(
      ([, obj]) =>
        obj instanceof PDFRawStream &&
        nameOf(obj.dict.get(PDFName.of("Subtype"))) === "Image",
    ) as [PDFRef, PDFRawStream][];
}

async function recompressImages(
  bytes: Uint8Array,
  preset: CompressionPreset,
  onProgress?: (current: number, total: number) => void,
): Promise<{ bytes: Uint8Array; count: number }> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const images = listImageStreams(doc);

  let count = 0;
  for (let i = 0; i < images.length; i++) {
    onProgress?.(i + 1, images.length);
    const [ref, stream] = images[i];
    const info = readImageInfo(stream.dict);
    const plan = planImage(info);
    if (plan.action === "skip") continue;

    try {
      const canvas = await drawImageStream(stream, info, plan, preset.maxDimension);
      const jpeg = await canvasToJpeg(canvas, preset.quality);
      if (jpeg.length >= stream.contents.length) continue;

      replaceWithJpeg(doc, ref, stream, jpeg, canvas.width, canvas.height);
      count++;
    } catch {
      // Leave any image we cannot decode exactly as it was.
    }
  }

  return { bytes: await doc.save({ useObjectStreams: true }), count };
}

/**
 * Render every page to a JPEG and rebuild the PDF from those images, keeping
 * each page's original size. Text stops being selectable.
 */
export async function rasterizePages(
  bytes: Uint8Array,
  preset: Pick<CompressionPreset, "quality" | "rasterScale">,
  onProgress?: (current: number, total: number) => void,
  grayscale = false,
): Promise<Uint8Array> {
  const pdfjsLib = await loadPdfjs();
  const src = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  const out = await PDFDocument.create();

  for (let n = 1; n <= src.numPages; n++) {
    onProgress?.(n, src.numPages);
    const page = await src.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: preset.rasterScale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    if (grayscale) toGrayscale(canvas);

    const jpeg = await out.embedJpg(await canvasToJpeg(canvas, preset.quality));
    // Keep each page at its original size (rotation is already baked into the viewport).
    const pdfPage = out.addPage([base.width, base.height]);
    pdfPage.drawImage(jpeg, { x: 0, y: 0, width: base.width, height: base.height });
  }

  return out.save({ useObjectStreams: true });
}

/** Compress a PDF according to `options`. Never returns a file larger than the input. */
export async function compressPdf(file: File, options: CompressOptions): Promise<CompressResult> {
  const input = new Uint8Array(await file.arrayBuffer());
  const preset = PRESETS[options.level];

  let bytes: Uint8Array;
  let imagesRecompressed = 0;
  if (options.rasterize) {
    bytes = await rasterizePages(input, preset, options.onProgress);
  } else {
    const r = await recompressImages(input, preset, options.onProgress);
    bytes = r.bytes;
    imagesRecompressed = r.count;
  }

  const unchanged = bytes.length >= input.length;
  return {
    bytes: unchanged ? input : bytes,
    originalSize: input.length,
    imagesRecompressed,
    unchanged,
  };
}
