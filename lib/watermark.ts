/**
 * Text watermarks, image watermarks/logos and rubber stamps.
 *
 * All placement is done in *visual* page space (what the viewer shows, after
 * /Rotate) and mapped back to PDF user space, so marks sit where the user
 * expects on rotated pages too. pdf-lib rotates drawn items around their
 * origin, so {@link originForCenter} works out the origin that puts the
 * rotated item's centre on the requested point.
 */
import { PDFDocument, StandardFonts, degrees, rgb, type PDFImage, type PDFPage } from "pdf-lib";
import { toWinAnsi, visualToUser } from "@/lib/header-footer";

export type Placement =
  | "center"
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"
  | "tile";

export type PageScope = "all" | "first" | "last";

/**
 * Origin (bottom-left, before rotation) such that a w×h box rotated by
 * `angle` degrees counter-clockwise about that origin is centred on (cx, cy).
 */
export function originForCenter(cx: number, cy: number, w: number, h: number, angle: number) {
  const r = (angle * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return {
    x: cx - (w / 2) * cos + (h / 2) * sin,
    y: cy - (w / 2) * sin - (h / 2) * cos,
  };
}

/** Centre points (visual space) for a placement on a W×H page. */
export function placementCenters(
  placement: Placement,
  pageW: number,
  pageH: number,
  itemW: number,
  itemH: number,
  margin: number,
): { x: number; y: number }[] {
  if (placement === "tile") {
    const stepX = Math.max(itemW * 1.6, 80);
    const stepY = Math.max(itemH * 3, 80);
    const points: { x: number; y: number }[] = [];
    let row = 0;
    for (let y = stepY / 2; y < pageH + stepY / 2; y += stepY, row++) {
      // Offset alternate rows for a brick pattern.
      for (let x = (row % 2 ? stepX : stepX / 2); x < pageW + stepX / 2; x += stepX) points.push({ x, y });
    }
    return points;
  }
  const [v, hz] = placement === "center" ? ["middle", "center"] : placement.split("-");
  const x = hz === "left" ? margin + itemW / 2 : hz === "right" ? pageW - margin - itemW / 2 : pageW / 2;
  const y = v === "top" ? pageH - margin - itemH / 2 : v === "bottom" ? margin + itemH / 2 : pageH / 2;
  return [{ x, y }];
}

function selectPages(pages: PDFPage[], scope: PageScope): PDFPage[] {
  if (scope === "first") return pages.slice(0, 1);
  if (scope === "last") return pages.slice(-1);
  return pages;
}

/** Visual size and a mapper from visual centre → user-space origin for a page. */
function pageFrame(page: PDFPage) {
  const box = page.getCropBox();
  const rotation = page.getRotation().angle;
  const quarter = ((rotation % 180) + 180) % 180 === 90;
  return {
    width: quarter ? box.height : box.width,
    height: quarter ? box.width : box.height,
    /** User-space origin + angle for an item of w×h centred at visual (cx, cy), tilted by `tilt`. */
    place(cx: number, cy: number, w: number, h: number, tilt: number) {
      const o = originForCenter(cx, cy, w, h, tilt);
      const mapped = visualToUser(o.x, o.y, box, rotation);
      return { x: mapped.x, y: mapped.y, angle: mapped.angle + tilt };
    },
  };
}

export interface TextWatermarkOptions {
  text: string;
  fontSize: number;
  opacity: number;
  rotation: number;
  color: { r: number; g: number; b: number };
  placement: Placement;
  pages: PageScope;
}

export async function addTextWatermark(file: File, o: TextWatermarkOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.load(await file.arrayBuffer());
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const text = toWinAnsi(o.text, font);
  const w = font.widthOfTextAtSize(text, o.fontSize);
  const h = font.heightAtSize(o.fontSize, { descender: false });

  for (const page of selectPages(doc.getPages(), o.pages)) {
    const frame = pageFrame(page);
    for (const c of placementCenters(o.placement, frame.width, frame.height, w, h, 36)) {
      const p = frame.place(c.x, c.y, w, h, o.rotation);
      page.drawText(text, {
        x: p.x,
        y: p.y,
        size: o.fontSize,
        font,
        color: rgb(o.color.r, o.color.g, o.color.b),
        opacity: o.opacity,
        rotate: degrees(p.angle),
      });
    }
  }
  return doc.save();
}

export interface ImageWatermarkOptions {
  /** Image width as a fraction of the page width (0..1). */
  scale: number;
  opacity: number;
  rotation: number;
  placement: Placement;
  pages: PageScope;
}

/** Embed PNG/JPEG directly; convert anything else the browser can decode (WebP, GIF…) to PNG. */
async function embedImage(doc: PDFDocument, image: File): Promise<PDFImage> {
  const bytes = new Uint8Array(await image.arrayBuffer());
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
  const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8;
  if (isPng) return doc.embedPng(bytes);
  if (isJpg) return doc.embedJpg(bytes);

  const bitmap = await createImageBitmap(image);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("Unsupported image format. Use PNG or JPG.");
  return doc.embedPng(new Uint8Array(await blob.arrayBuffer()));
}

export async function addImageWatermark(file: File, image: File, o: ImageWatermarkOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.load(await file.arrayBuffer());
  const img = await embedImage(doc, image);

  for (const page of selectPages(doc.getPages(), o.pages)) {
    const frame = pageFrame(page);
    const w = frame.width * Math.min(1, Math.max(0.02, o.scale));
    const h = (w / img.width) * img.height;
    for (const c of placementCenters(o.placement, frame.width, frame.height, w, h, 24)) {
      const p = frame.place(c.x, c.y, w, h, o.rotation);
      page.drawImage(img, { x: p.x, y: p.y, width: w, height: h, opacity: o.opacity, rotate: degrees(p.angle) });
    }
  }
  return doc.save();
}

export const STAMP_PRESETS = {
  APPROVED: { r: 0.06, g: 0.55, b: 0.27 },
  PAID: { r: 0.06, g: 0.55, b: 0.27 },
  DRAFT: { r: 0.35, g: 0.4, b: 0.5 },
  CONFIDENTIAL: { r: 0.8, g: 0.1, b: 0.12 },
  REJECTED: { r: 0.8, g: 0.1, b: 0.12 },
  "FOR REVIEW": { r: 0.85, g: 0.45, b: 0.05 },
} as const;

export interface StampOptions {
  text: string;
  color: { r: number; g: number; b: number };
  /** Adds the date under the main text. */
  date?: string;
  fontSize: number;
  rotation: number;
  placement: Exclude<Placement, "tile">;
  pages: PageScope;
}

export async function addStamp(file: File, o: StampOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.load(await file.arrayBuffer());
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const text = toWinAnsi(o.text.toUpperCase(), bold);
  const date = o.date ? toWinAnsi(o.date, regular) : "";
  const color = rgb(o.color.r, o.color.g, o.color.b);

  const dateSize = o.fontSize * 0.4;
  const pad = o.fontSize * 0.35;
  const textW = bold.widthOfTextAtSize(text, o.fontSize);
  const dateW = date ? regular.widthOfTextAtSize(date, dateSize) : 0;
  const capH = bold.heightAtSize(o.fontSize, { descender: false }) * 0.75;
  const w = Math.max(textW, dateW) + pad * 2;
  const h = capH + (date ? dateSize * 1.4 : 0) + pad * 2;

  const r = (deg: number) => (deg * Math.PI) / 180;
  // Offset (dx, dy) inside the stamp, rotated with it.
  const at = (p: { x: number; y: number; angle: number }, dx: number, dy: number) => ({
    x: p.x + dx * Math.cos(r(p.angle)) - dy * Math.sin(r(p.angle)),
    y: p.y + dx * Math.sin(r(p.angle)) + dy * Math.cos(r(p.angle)),
  });

  for (const page of selectPages(doc.getPages(), o.pages)) {
    const frame = pageFrame(page);
    const [c] = placementCenters(o.placement, frame.width, frame.height, w, h, 36);
    const p = frame.place(c.x, c.y, w, h, o.rotation);
    const rotate = degrees(p.angle);

    page.drawRectangle({ x: p.x, y: p.y, width: w, height: h, borderColor: color, borderWidth: o.fontSize / 12, opacity: 0, borderOpacity: 0.9, rotate });
    const inset = o.fontSize / 8;
    const inner = at(p, inset, inset);
    page.drawRectangle({ x: inner.x, y: inner.y, width: w - inset * 2, height: h - inset * 2, borderColor: color, borderWidth: o.fontSize / 30, opacity: 0, borderOpacity: 0.9, rotate });

    const t = at(p, (w - textW) / 2, h - pad - capH);
    page.drawText(text, { x: t.x, y: t.y, size: o.fontSize, font: bold, color, opacity: 0.9, rotate });
    if (date) {
      const d = at(p, (w - dateW) / 2, pad);
      page.drawText(date, { x: d.x, y: d.y, size: dateSize, font: regular, color, opacity: 0.9, rotate });
    }
  }
  return doc.save();
}
