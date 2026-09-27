/**
 * PDF → Markdown.
 *
 * PDFs store positioned glyph runs, not structure, so structure is inferred:
 *  - runs are grouped into lines by baseline, then ordered left-to-right;
 *  - the most common text size is taken as body text, and noticeably larger
 *    lines become `#`/`##`/`###` headings;
 *  - bullet glyphs become `-` list items, numbered items are kept;
 *  - consecutive body lines separated by a normal line gap are merged into a
 *    paragraph (re-joining words hyphenated across lines).
 *
 * The layout logic is pure and unit-tested; only {@link pdfToMarkdown} touches
 * pdf.js.
 */
import { loadPdfjs } from "@/lib/pdfjs";

export interface TextRun {
  str: string;
  /** Baseline origin, PDF user space (y grows upward). */
  x: number;
  y: number;
  /** Approximate font size in points. */
  size: number;
  width: number;
}

export interface Line {
  text: string;
  y: number;
  size: number;
  /** Left edge of the line, for indentation-insensitive merging. */
  x: number;
}

/** Group runs sharing a baseline into lines, top of the page first. */
export function runsToLines(runs: TextRun[]): Line[] {
  const sorted = runs
    .filter((r) => r.str.trim() !== "" || r.str === " ")
    .slice()
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const groups: TextRun[][] = [];
  for (const run of sorted) {
    const current = groups[groups.length - 1];
    const tolerance = Math.max(1, run.size * 0.4);
    if (current && Math.abs(current[0].y - run.y) <= tolerance) current.push(run);
    else groups.push([run]);
  }

  return groups
    .map((group) => {
      group.sort((a, b) => a.x - b.x);
      let text = "";
      let prevEnd: number | null = null;
      for (const r of group) {
        if (prevEnd !== null && r.x - prevEnd > r.size * 0.2 && !text.endsWith(" ") && !r.str.startsWith(" ")) {
          text += " ";
        }
        text += r.str;
        prevEnd = r.x + r.width;
      }
      const size = Math.max(...group.map((r) => r.size));
      return { text: text.replace(/\s+/g, " ").trim(), y: group[0].y, size, x: group[0].x };
    })
    .filter((l) => l.text !== "");
}

/** The most common line size, weighted by character count. */
export function bodySize(lines: Line[]): number {
  const weights = new Map<number, number>();
  for (const l of lines) {
    const key = Math.round(l.size * 2) / 2;
    weights.set(key, (weights.get(key) ?? 0) + l.text.length);
  }
  let best = 12;
  let bestWeight = -1;
  for (const [size, w] of weights) {
    if (w > bestWeight) {
      best = size;
      bestWeight = w;
    }
  }
  return best;
}

export function headingLevel(size: number, body: number): 0 | 1 | 2 | 3 {
  const ratio = size / body;
  if (ratio >= 1.8) return 1;
  if (ratio >= 1.4) return 2;
  if (ratio >= 1.15) return 3;
  return 0;
}

// Dedicated bullet glyphs, or ASCII dashes/asterisks followed by a space (so "-5°C" is not a bullet).
const BULLET_RE = /^(?:[•◦▪▫●○■□‣⁃∙·]\s*|[-–*]\s+)/;
const NUMBERED_RE = /^(\d+|[a-zA-Z])[.)]\s+/;

/** Escape characters that would otherwise be read as Markdown syntax at line start. */
function escapeLineStart(text: string): string {
  return text.replace(/^([#>+]|\d+\.(?=\s))/, "\\$1");
}

/** Convert per-page lines into a Markdown document. */
export function linesToMarkdown(pages: Line[][]): string {
  const body = bodySize(pages.flat());
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let prev: Line | null = null;

  const flush = () => {
    if (paragraph.length) blocks.push(paragraph.join(" "));
    paragraph = [];
  };

  for (const lines of pages) {
    prev = null;
    for (const line of lines) {
      const level = headingLevel(line.size, body);
      if (level > 0) {
        flush();
        // Headings that wrap onto a second line of the same size are merged.
        const last = blocks[blocks.length - 1];
        const hashes = "#".repeat(level);
        if (prev && headingLevel(prev.size, body) === level && last?.startsWith(hashes + " ") &&
            prev.y - line.y <= line.size * 1.6) {
          blocks[blocks.length - 1] = `${last} ${line.text}`;
        } else {
          blocks.push(`${hashes} ${line.text}`);
        }
        prev = line;
        continue;
      }

      if (BULLET_RE.test(line.text) && line.text.length > 1) {
        flush();
        blocks.push(`- ${line.text.replace(BULLET_RE, "")}`);
        prev = line;
        continue;
      }
      if (NUMBERED_RE.test(line.text)) {
        flush();
        blocks.push(line.text.replace(NUMBERED_RE, (m, n) => `${n}. `));
        prev = line;
        continue;
      }

      const gap = prev ? prev.y - line.y : Infinity;
      const continues = prev !== null && headingLevel(prev.size, body) === 0 && gap > 0 && gap <= line.size * 1.8;
      if (continues && blocks.length && !paragraph.length && /^(- |\d+\. )/.test(blocks[blocks.length - 1])) {
        // Wrapped continuation of a list item.
        blocks[blocks.length - 1] += ` ${line.text}`;
      } else if (continues && paragraph.length) {
        const lastIdx = paragraph.length - 1;
        if (/[A-Za-z]-$/.test(paragraph[lastIdx])) {
          paragraph[lastIdx] = paragraph[lastIdx].slice(0, -1) + line.text;
        } else {
          paragraph.push(line.text);
        }
      } else {
        flush();
        paragraph.push(escapeLineStart(line.text));
      }
      prev = line;
    }
    flush();
  }
  flush();

  return blocks.join("\n\n").trim() + "\n";
}

export async function pdfToMarkdown(
  file: File,
  onProgress?: (current: number, total: number) => void,
): Promise<{ markdown: string; pageCount: number; hasText: boolean }> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: Line[][] = [];

  for (let n = 1; n <= doc.numPages; n++) {
    onProgress?.(n, doc.numPages);
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const runs: TextRun[] = [];
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const [a, b, , , e, f] = item.transform as number[];
      runs.push({
        str: item.str,
        x: e,
        y: f,
        size: Math.hypot(a, b) || item.height || 12,
        width: item.width,
      });
    }
    pages.push(runsToLines(runs));
  }

  const pageCount = doc.numPages;
  await doc.destroy();
  const hasText = pages.some((p) => p.length > 0);
  return { markdown: hasText ? linesToMarkdown(pages) : "", pageCount, hasText };
}
