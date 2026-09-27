/**
 * Low-level helpers for reading, tokenizing and rewriting PDF content streams.
 *
 * Shared by tools that perform content-stream surgery (redaction in
 * lib/pdf-editor.ts, colour conversion in lib/grayscale.ts). Content is
 * handled as a latin1 string so byte values round-trip losslessly.
 */
import {
  PDFArray,
  PDFPage,
  PDFRawStream,
  PDFStream,
  decodePDFRawStream,
} from "pdf-lib";

// --- Latin1 <-> bytes (lossless for content-stream surgery) ----------------

export function bytesToLatin1(bytes: Uint8Array): string {
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return s;
}

export function latin1ToBytes(s: string): Uint8Array {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  return b;
}

// --- Content-stream tokenizer ----------------------------------------------

export type TokenType =
  | "num"
  | "str"
  | "name"
  | "array"
  | "dict"
  | "op"
  | "bool"
  | "null";

export interface Token {
  type: TokenType;
  start: number;
  end: number;
  raw: string;
  val?: number; // for num
}

export function isWhitespace(c: string): boolean {
  return (
    c === " " ||
    c === "\n" ||
    c === "\r" ||
    c === "\t" ||
    c === "\f" ||
    c === "\0"
  );
}

export function isDelimiter(c: string): boolean {
  return (
    c === "(" ||
    c === ")" ||
    c === "<" ||
    c === ">" ||
    c === "[" ||
    c === "]" ||
    c === "{" ||
    c === "}" ||
    c === "/" ||
    c === "%"
  );
}

export function scanLiteralString(s: string, i: number): number {
  i++; // skip "("
  let depth = 1;
  while (i < s.length && depth > 0) {
    const c = s[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "(") {
      depth++;
      i++;
      continue;
    }
    if (c === ")") {
      depth--;
      i++;
      continue;
    }
    i++;
  }
  return i;
}

export function scanHexString(s: string, i: number): number {
  i++; // skip "<"
  while (i < s.length && s[i] !== ">") i++;
  return i + 1; // include ">"
}

export function scanDict(s: string, i: number): number {
  i += 2; // skip "<<"
  while (i < s.length) {
    if (s[i] === ">" && s[i + 1] === ">") return i + 2;
    const c = s[i];
    if (c === "(") {
      i = scanLiteralString(s, i);
      continue;
    }
    if (c === "<" && s[i + 1] === "<") {
      i = scanDict(s, i);
      continue;
    }
    if (c === "<") {
      i = scanHexString(s, i);
      continue;
    }
    i++;
  }
  return i;
}

export function scanArray(s: string, i: number): number {
  i++; // skip "["
  while (i < s.length) {
    const c = s[i];
    if (c === "]") return i + 1;
    if (c === "(") {
      i = scanLiteralString(s, i);
      continue;
    }
    if (c === "<" && s[i + 1] === "<") {
      i = scanDict(s, i);
      continue;
    }
    if (c === "<") {
      i = scanHexString(s, i);
      continue;
    }
    if (c === "%") {
      while (i < s.length && s[i] !== "\n" && s[i] !== "\r") i++;
      continue;
    }
    i++;
  }
  return i;
}

const NUMBER_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;

export function tokenize(s: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    if (isWhitespace(c)) {
      i++;
      continue;
    }
    if (c === "%") {
      while (i < n && s[i] !== "\n" && s[i] !== "\r") i++;
      continue;
    }
    if (c === "(") {
      const start = i;
      i = scanLiteralString(s, i);
      tokens.push({ type: "str", start, end: i, raw: s.slice(start, i) });
      continue;
    }
    if (c === "<") {
      const start = i;
      if (s[i + 1] === "<") {
        i = scanDict(s, i);
        tokens.push({ type: "dict", start, end: i, raw: s.slice(start, i) });
      } else {
        i = scanHexString(s, i);
        tokens.push({ type: "str", start, end: i, raw: s.slice(start, i) });
      }
      continue;
    }
    if (c === "[") {
      const start = i;
      i = scanArray(s, i);
      tokens.push({ type: "array", start, end: i, raw: s.slice(start, i) });
      continue;
    }
    if (c === "/") {
      const start = i;
      i++;
      while (i < n && !isWhitespace(s[i]) && !isDelimiter(s[i])) i++;
      tokens.push({ type: "name", start, end: i, raw: s.slice(start, i) });
      continue;
    }
    if (c === ")" || c === ">" || c === "]" || c === "{" || c === "}") {
      // Stray/unbalanced delimiter — treat as a standalone operator token.
      const start = i;
      i++;
      tokens.push({ type: "op", start, end: i, raw: c });
      continue;
    }
    // Number or operator keyword.
    const start = i;
    while (i < n && !isWhitespace(s[i]) && !isDelimiter(s[i])) i++;
    const raw = s.slice(start, i);
    if (NUMBER_RE.test(raw)) {
      tokens.push({ type: "num", start, end: i, raw, val: parseFloat(raw) });
    } else if (raw === "true" || raw === "false") {
      tokens.push({ type: "bool", start, end: i, raw });
    } else if (raw === "null") {
      tokens.push({ type: "null", start, end: i, raw });
    } else {
      tokens.push({ type: "op", start, end: i, raw });
      // Inline images carry raw binary between ID and EI that must not be
      // tokenized. Skip from after ID to the closing EI.
      if (raw === "ID") {
        i = skipInlineImageData(s, i);
      }
    }
  }
  return tokens;
}

/** Skip inline-image binary data following an `ID` operator up to `EI`. */
export function skipInlineImageData(s: string, i: number): number {
  // One whitespace byte separates ID from the data.
  if (i < s.length && isWhitespace(s[i])) i++;
  while (i < s.length) {
    if (
      s[i] === "E" &&
      s[i + 1] === "I" &&
      (i + 2 >= s.length || isWhitespace(s[i + 2])) &&
      (isWhitespace(s[i - 1]) || s[i - 1] === undefined)
    ) {
      return i + 2;
    }
    i++;
  }
  return i;
}

// --- Page content-stream read/write ----------------------------------------

/** Collect the page's content stream(s) as raw streams (resolving refs/arrays). */
export function getContentRawStreams(page: PDFPage): PDFRawStream[] {
  const contents = page.node.Contents();
  if (!contents) return [];
  const streams: PDFRawStream[] = [];
  if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i++) {
      const s = contents.lookup(i, PDFStream);
      if (s instanceof PDFRawStream) streams.push(s);
    }
  } else if (contents instanceof PDFRawStream) {
    streams.push(contents);
  }
  return streams;
}

/** Decode + concatenate a page's content streams into one latin1 string. */
export function readPageContent(streams: PDFRawStream[]): string {
  const parts: string[] = [];
  for (const s of streams) {
    let decoded: Uint8Array;
    try {
      decoded = decodePDFRawStream(s).decode();
    } catch {
      // Fall back to raw bytes if the filter chain can't be decoded.
      decoded = s.getContents();
    }
    parts.push(bytesToLatin1(decoded));
  }
  // A newline guarantees operators from adjacent streams stay separated.
  return parts.join("\n");
}
