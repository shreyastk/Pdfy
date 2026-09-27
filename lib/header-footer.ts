/**
 * Headers, footers and Bates numbering.
 *
 * Six text slots (left/center/right × header/footer) accept templates with
 * tokens such as `{page}`, `{total}`, `{date}`, `{filename}` and `{bates}`.
 * Placement respects each page's crop box and rotation so text always reads
 * upright in the viewer.
 */
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont } from "pdf-lib";

export const SLOTS = [
  "header-left",
  "header-center",
  "header-right",
  "footer-left",
  "footer-center",
  "footer-right",
] as const;
export type Slot = (typeof SLOTS)[number];

export interface BatesSpec {
  prefix: string;
  start: number;
  digits: number;
  suffix: string;
}

export interface HeaderFooterSpec {
  slots: Partial<Record<Slot, string>>;
  fontSize: number;
  /** Distance from the page edge, in points. */
  margin: number;
  color: { r: number; g: number; b: number };
  bates?: BatesSpec;
  /** 1-based page to start on (earlier pages are left untouched). */
  firstPage: number;
  /** Format for `{date}`; defaults to the viewer's locale. */
  date?: string;
}

export interface TemplateContext {
  page: number;
  total: number;
  date: string;
  filename: string;
  bates: string;
}

/** Bates number for the `index`-th stamped page (0-based). */
export function batesNumber(spec: BatesSpec, index: number): string {
  const n = Math.max(0, Math.floor(spec.start)) + index;
  return `${spec.prefix}${String(n).padStart(Math.max(1, spec.digits), "0")}${spec.suffix}`;
}

/** Replace `{page}`, `{total}`, `{date}`, `{filename}` and `{bates}` tokens. */
export function formatTemplate(template: string, ctx: TemplateContext): string {
  return template.replace(/\{(page|total|date|filename|bates)\}/g, (_, key: keyof TemplateContext) =>
    String(ctx[key]),
  );
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Map a point in *visual* page space (origin bottom-left of the page as the
 * viewer displays it, after /Rotate) back to PDF user space, and return the
 * text rotation needed for it to read upright.
 */
export function visualToUser(
  vx: number,
  vy: number,
  box: Box,
  rotation: number,
): { x: number; y: number; angle: number } {
  const r = ((rotation % 360) + 360) % 360;
  switch (r) {
    case 90:
      return { x: box.x + box.width - vy, y: box.y + vx, angle: 90 };
    case 180:
      return { x: box.x + box.width - vx, y: box.y + box.height - vy, angle: 180 };
    case 270:
      return { x: box.x + vy, y: box.y + box.height - vx, angle: 270 };
    default:
      return { x: box.x + vx, y: box.y + vy, angle: 0 };
  }
}

/** Standard fonts only cover WinAnsi; replace anything else so drawing never throws. */
export function toWinAnsi(text: string, font: Pick<PDFFont, "encodeText">): string {
  let out = "";
  for (const ch of text) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

export async function addHeaderFooter(file: File, spec: HeaderFooterSpec): Promise<Uint8Array> {
  const doc = await PDFDocument.load(await file.arrayBuffer());
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const date = spec.date ?? new Date().toLocaleDateString();
  const color = rgb(spec.color.r, spec.color.g, spec.color.b);
  const ascent = font.heightAtSize(spec.fontSize, { descender: false });

  pages.forEach((page, i) => {
    if (i + 1 < spec.firstPage) return;
    const stampIndex = i + 1 - spec.firstPage;
    const ctx: TemplateContext = {
      page: i + 1,
      total: pages.length,
      date,
      filename: file.name,
      bates: spec.bates ? batesNumber(spec.bates, stampIndex) : "",
    };

    const box = page.getCropBox();
    const rotation = page.getRotation().angle;
    const quarter = ((rotation % 180) + 180) % 180 === 90;
    const visualW = quarter ? box.height : box.width;
    const visualH = quarter ? box.width : box.height;

    for (const slot of SLOTS) {
      const template = spec.slots[slot];
      if (!template?.trim()) continue;
      const text = toWinAnsi(formatTemplate(template, ctx), font);
      const width = font.widthOfTextAtSize(text, spec.fontSize);
      const [row, col] = slot.split("-") as ["header" | "footer", "left" | "center" | "right"];

      const vx =
        col === "left" ? spec.margin : col === "right" ? visualW - spec.margin - width : (visualW - width) / 2;
      const vy = row === "header" ? visualH - spec.margin - ascent : spec.margin;
      const { x, y, angle } = visualToUser(vx, vy, box, rotation);
      page.drawText(text, { x, y, size: spec.fontSize, font, color, rotate: degrees(angle) });
    }
  });

  return doc.save();
}
