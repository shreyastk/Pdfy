/**
 * Convert a PDF to grayscale.
 *
 * Default ("vector") mode keeps the document intact: colour operators in page
 * and form-XObject content streams are rewritten to their gray equivalents,
 * and raster images are re-encoded in grayscale. Text stays selectable.
 *
 * Colours defined through named/ICC colour spaces, patterns and shadings are
 * left as-is, so a few elements may keep some colour. The opt-in "rasterize"
 * mode renders each page to a grayscale image, which is guaranteed to remove
 * all colour at the cost of selectable text.
 */
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import {
  bytesToLatin1,
  getContentRawStreams,
  latin1ToBytes,
  readPageContent,
  tokenize,
  type Token,
} from "@/lib/content-stream";
import {
  canvasToJpeg,
  drawImageStream,
  listImageStreams,
  nameOf,
  planImage,
  rasterizePages,
  readImageInfo,
  replaceWithJpeg,
} from "@/lib/compress";

/** Luminance (0..1) of an RGB colour with components in 0..1. */
export function rgbToGray(r: number, g: number, b: number): number {
  return clamp01(0.299 * r + 0.587 * g + 0.114 * b);
}

/** Luminance (0..1) of a CMYK colour with components in 0..1. */
export function cmykToGray(c: number, m: number, y: number, k: number): number {
  return clamp01(1 - Math.min(1, 0.299 * c + 0.587 * m + 0.114 * y + k));
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function fmt(v: number): string {
  return String(Math.round(v * 1000) / 1000);
}

type Space = "gray" | "rgb" | "cmyk" | "other";

/**
 * Rewrite DeviceRGB/DeviceCMYK colour operators in a content stream to their
 * DeviceGray equivalents. Strings, dictionaries and inline image data are
 * never touched (the tokenizer skips them), so the rest of the stream is
 * preserved byte-for-byte.
 */
export function convertColorOperators(content: string): string {
  const tokens = tokenize(content);
  const edits: { start: number; end: number; text: string }[] = [];
  let state = { fill: "gray" as Space, stroke: "gray" as Space };
  const stack: (typeof state)[] = [];

  const operands = (i: number, n: number): number[] | null => {
    if (i - n < 0) return null;
    const ops: Token[] = tokens.slice(i - n, i);
    if (!ops.every((t) => t.type === "num")) return null;
    return ops.map((t) => t.val ?? 0);
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== "op") continue;
    const stroke = t.raw === t.raw.toUpperCase();

    switch (t.raw) {
      case "q":
        stack.push({ ...state });
        break;
      case "Q":
        state = stack.pop() ?? { fill: "gray", stroke: "gray" };
        break;
      case "rg":
      case "RG": {
        const v = operands(i, 3);
        if (v) {
          edits.push({
            start: tokens[i - 3].start,
            end: t.end,
            text: `${fmt(rgbToGray(v[0], v[1], v[2]))} ${stroke ? "G" : "g"}`,
          });
        }
        state[stroke ? "stroke" : "fill"] = "gray";
        break;
      }
      case "k":
      case "K": {
        const v = operands(i, 4);
        if (v) {
          edits.push({
            start: tokens[i - 4].start,
            end: t.end,
            text: `${fmt(cmykToGray(v[0], v[1], v[2], v[3]))} ${stroke ? "G" : "g"}`,
          });
        }
        state[stroke ? "stroke" : "fill"] = "gray";
        break;
      }
      case "cs":
      case "CS": {
        const prev = tokens[i - 1];
        const name = prev?.type === "name" ? prev.raw : "";
        const space: Space =
          name === "/DeviceRGB" ? "rgb" : name === "/DeviceCMYK" ? "cmyk" : name === "/DeviceGray" ? "gray" : "other";
        if (space === "rgb" || space === "cmyk") {
          edits.push({ start: prev.start, end: prev.end, text: "/DeviceGray" });
        }
        if (stroke) state.stroke = space;
        else state.fill = space;
        break;
      }
      case "sc":
      case "scn":
      case "SC":
      case "SCN": {
        const space = stroke ? state.stroke : state.fill;
        const n = space === "rgb" ? 3 : space === "cmyk" ? 4 : 0;
        const v = n ? operands(i, n) : null;
        if (v) {
          const gray = n === 3 ? rgbToGray(v[0], v[1], v[2]) : cmykToGray(v[0], v[1], v[2], v[3]);
          edits.push({ start: tokens[i - n].start, end: t.end, text: `${fmt(gray)} ${t.raw}` });
        }
        break;
      }
      case "g":
        state.fill = "gray";
        break;
      case "G":
        state.stroke = "gray";
        break;
    }
  }

  let out = content;
  for (let e = edits.length - 1; e >= 0; e--) {
    const { start, end, text } = edits[e];
    out = out.slice(0, start) + text + out.slice(end);
  }
  return out;
}

export interface GrayscaleOptions {
  rasterize?: boolean;
  onProgress?: (label: string, current: number, total: number) => void;
}

export interface GrayscaleResult {
  bytes: Uint8Array;
  imagesConverted: number;
  imagesSkipped: number;
}

export async function convertToGrayscale(file: File, options: GrayscaleOptions = {}): Promise<GrayscaleResult> {
  const input = new Uint8Array(await file.arrayBuffer());

  if (options.rasterize) {
    const bytes = await rasterizePages(
      input,
      { quality: 0.85, rasterScale: 2 },
      (c, t) => options.onProgress?.("Rendering pages", c, t),
      true,
    );
    return { bytes, imagesConverted: 0, imagesSkipped: 0 };
  }

  const doc = await PDFDocument.load(input, { updateMetadata: false });

  // 1. Page content streams.
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    options.onProgress?.("Converting pages", i + 1, pages.length);
    const streams = getContentRawStreams(page);
    if (streams.length === 0) return;
    const content = readPageContent(streams);
    const converted = convertColorOperators(content);
    if (converted === content) return;
    page.node.set(PDFName.of("Contents"), doc.context.register(doc.context.flateStream(latin1ToBytes(converted))));
  });

  // 2. Form XObjects (including annotation appearances).
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream) || nameOf(obj.dict.get(PDFName.of("Subtype"))) !== "Form") continue;
    let content: string;
    try {
      content = bytesToLatin1(decodePDFRawStream(obj).decode());
    } catch {
      continue;
    }
    const converted = convertColorOperators(content);
    if (converted === content) continue;
    const dict = obj.dict.clone(doc.context);
    dict.delete(PDFName.of("Filter"));
    dict.delete(PDFName.of("DecodeParms"));
    const fresh = doc.context.flateStream(latin1ToBytes(converted));
    fresh.dict.entries().forEach(([k, v]) => dict.set(k, v));
    doc.context.assign(ref, PDFRawStream.of(dict, fresh.getContents()));
  }

  // 3. Raster images.
  const images = listImageStreams(doc);
  let converted = 0;
  let skipped = 0;
  for (let i = 0; i < images.length; i++) {
    options.onProgress?.("Converting images", i + 1, images.length);
    const [ref, stream] = images[i];
    const info = readImageInfo(stream.dict);
    if (info.colorSpace === "DeviceGray" || info.isImageMask) continue;
    const plan = planImage({ ...info, width: Math.max(info.width, 64), height: Math.max(info.height, 64) });
    if (plan.action === "skip") {
      skipped++;
      continue;
    }
    try {
      const canvas = await drawImageStream(stream, info, plan, Math.max(info.width, info.height), true);
      replaceWithJpeg(doc, ref, stream, await canvasToJpeg(canvas, 0.9), canvas.width, canvas.height);
      converted++;
    } catch {
      skipped++;
    }
  }

  return { bytes: await doc.save({ useObjectStreams: true }), imagesConverted: converted, imagesSkipped: skipped };
}
