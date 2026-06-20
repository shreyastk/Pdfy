// Feature: pdfy-feature-expansion, Property 10: Redaction makes covered text unrecoverable
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  PDFDocument,
  StandardFonts,
  PDFName,
  PDFArray,
  PDFRawStream,
  PDFStream,
  decodePDFRawStream,
} from "pdf-lib";
import { applyEdits } from "./pdf-editor";
import type { Edit } from "./pdf-editor";
import type { Rect } from "./types";

/**
 * Property 10: Redaction makes covered text unrecoverable.
 *
 * Validates: Requirements 3.4
 *
 * For any PDF page and redaction region, text extracted from the output excludes
 * every text segment whose bounding box intersected the redaction region — the
 * removed text must not be recoverable via extraction or copy.
 *
 * Strategy (robust in jsdom, no pdf.js worker required):
 *   1. Build a single-page PDF (pdf-lib) drawing a KNOWN distinctive "secret"
 *      token at a KNOWN position, plus a distinctive "public" token placed far
 *      away in a separate vertical band.
 *   2. Extract the text-show string operands from the page's content stream
 *      directly (decode via pdf-lib's PDFRawStream + decodePDFRawStream, then
 *      scan for literal `(...)` / hex `<...>` string operands and decode them).
 *      Confirm the secret IS recoverable before redaction (sanity baseline).
 *   3. Apply a `redact` edit whose rect generously covers the secret's bounding
 *      box (computed from the known position + font.widthOfTextAtSize using the
 *      same StandardFont Helvetica the editor uses, with a generous margin).
 *   4. Re-extract the text-show operands from the REDACTED output and assert:
 *        - the secret token is ABSENT (unrecoverable), and
 *        - the public token (far from the redaction) REMAINS (selective removal).
 *
 * Approach (b) — content-stream decode — is used because it directly checks the
 * stored bytes for any recoverable text-show operator, which is exactly what
 * "unrecoverable via extraction/copy" means.
 */

const PAGE_W = 600;
const PAGE_H = 800;

// --- latin1 byte helper (lossless for content-stream surgery) --------------
function bytesToLatin1(bytes: Uint8Array): string {
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return s;
}

/**
 * Scan a decoded content stream and return the concatenation of every
 * text-show string operand's decoded characters (both literal `(...)` and hex
 * `<...>` strings). pdf-lib only emits string operands for text-showing, so the
 * result is exactly what a text-extractor/copy would recover.
 */
function extractShownText(content: string): string {
  let out = "";
  let i = 0;
  const n = content.length;
  while (i < n) {
    const c = content[i];
    if (c === "(") {
      // Literal string with escapes + balanced nested parens.
      let depth = 1;
      i++;
      while (i < n && depth > 0) {
        const ch = content[i];
        if (ch === "\\") {
          const next = content[i + 1];
          if (next >= "0" && next <= "7") {
            let oct = "";
            let j = i + 1;
            while (j < n && oct.length < 3 && content[j] >= "0" && content[j] <= "7") {
              oct += content[j];
              j++;
            }
            out += String.fromCharCode(parseInt(oct, 8) & 0xff);
            i = j;
            continue;
          }
          if (next === "\n" || next === "\r") {
            i += 2; // line continuation — no char
            continue;
          }
          const map: Record<string, string> = {
            n: "\n",
            r: "\r",
            t: "\t",
            b: "\b",
            f: "\f",
            "(": "(",
            ")": ")",
            "\\": "\\",
          };
          out += map[next] ?? next;
          i += 2;
          continue;
        }
        if (ch === "(") {
          depth++;
          out += ch;
          i++;
          continue;
        }
        if (ch === ")") {
          depth--;
          if (depth > 0) out += ch;
          i++;
          continue;
        }
        out += ch;
        i++;
      }
      continue;
    }
    if (c === "<" && content[i + 1] === "<") {
      // Dictionary opener — not a string. Skip the "<<".
      i += 2;
      continue;
    }
    if (c === "<") {
      // Hex string.
      i++;
      let hex = "";
      while (i < n && content[i] !== ">") {
        const ch = content[i];
        if (/[0-9a-fA-F]/.test(ch)) hex += ch;
        i++;
      }
      i++; // skip ">"
      if (hex.length % 2 === 1) hex += "0";
      for (let k = 0; k < hex.length; k += 2) {
        out += String.fromCharCode(parseInt(hex.slice(k, k + 2), 16));
      }
      continue;
    }
    i++;
  }
  return out;
}

/** Decode page `pageIndex`'s content stream(s) and return the recoverable text. */
async function extractPageText(bytes: Uint8Array, pageIndex: number): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPages()[pageIndex];
  const contents = page.node.Contents();
  const streams: PDFRawStream[] = [];
  if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i++) {
      const s = contents.lookup(i, PDFStream);
      if (s instanceof PDFRawStream) streams.push(s);
    }
  } else if (contents instanceof PDFRawStream) {
    streams.push(contents);
  }
  let combined = "";
  for (const s of streams) {
    let decoded: Uint8Array;
    try {
      decoded = decodePDFRawStream(s).decode();
    } catch {
      decoded = s.getContents();
    }
    combined += bytesToLatin1(decoded) + "\n";
  }
  void PDFName; // (kept import explicit; pdf-lib type surface)
  return extractShownText(combined);
}

interface Built {
  file: File;
  inputBytes: Uint8Array;
  secret: string;
  pub: string;
  redactRect: Rect;
}

/** Build the single-page PDF with a secret + public token and compute a covering rect. */
async function buildDoc(params: {
  secret: string;
  pub: string;
  size: number;
  secretX: number;
  secretY: number;
  pubX: number;
  pubY: number;
}): Promise<Built> {
  const { secret, pub, size, secretX, secretY, pubX, pubY } = params;
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  page.drawText(secret, { x: secretX, y: secretY, size, font });
  page.drawText(pub, { x: pubX, y: pubY, size, font });

  const inputBytes = await doc.save();
  const file = new File([inputBytes.slice()], "in.pdf", { type: "application/pdf" });

  // Generous covering rect around the secret's baseline-anchored box, kept
  // fully within page bounds (validateEdit requires an in-bounds redact rect).
  const secretWidth = font.widthOfTextAtSize(secret, size);
  const margin = 14;
  const rx = Math.max(0, secretX - margin);
  const ry = Math.max(0, secretY - margin);
  const rw = Math.min(secretWidth + margin * 2, PAGE_W - rx);
  const rh = Math.min(size + margin * 2, PAGE_H - ry);
  const redactRect: Rect = { x: rx, y: ry, width: rw, height: rh };

  return { file, inputBytes, secret, pub, redactRect };
}

describe("Property 10: Redaction makes covered text unrecoverable", () => {
  // Distinctive ASCII tokens (letters/digits only — no escaping concerns, and
  // each prefix guarantees the tokens never contain one another).
  const suffixArb = fc.integer({ min: 0, max: 2_000_000 }).map((n) => n.toString(36).toUpperCase());
  const secretArb = suffixArb.map((s) => `SECRET${s}`);
  const publicArb = suffixArb.map((s) => `PUBLIC${s}`);

  const sizeArb = fc.integer({ min: 10, max: 20 });
  // Secret lives in the upper band; public in a lower band so the (generous)
  // redaction rect over the secret never reaches the public token.
  const secretXArb = fc.integer({ min: 50, max: 380 });
  const secretYArb = fc.integer({ min: 300, max: 760 });
  const pubXArb = fc.integer({ min: 50, max: 400 });
  const pubYArb = fc.integer({ min: 40, max: 120 });

  it("removes redacted (covered) text from the output content stream while preserving distant text", async () => {
    await fc.assert(
      fc.asyncProperty(
        secretArb,
        publicArb,
        sizeArb,
        secretXArb,
        secretYArb,
        pubXArb,
        pubYArb,
        async (secret, pub, size, secretX, secretY, pubX, pubY) => {
          const built = await buildDoc({ secret, pub, size, secretX, secretY, pubX, pubY });

          // Baseline: BEFORE redaction the secret IS recoverable (proves the
          // test would catch a no-op redaction).
          const before = await extractPageText(built.inputBytes, 0);
          expect(before).toContain(secret);
          expect(before).toContain(pub);

          // Apply the redaction covering the secret.
          const edit: Edit = { kind: "redact", page: 0, rect: built.redactRect };
          const out = await applyEdits(built.file, [edit]);

          // AFTER redaction the secret must be UNRECOVERABLE via extraction.
          const after = await extractPageText(out, 0);
          expect(after).not.toContain(secret);

          // Selective removal: the distant public token remains recoverable.
          expect(after).toContain(pub);
        }
      ),
      { numRuns: 30 }
    );
  });

  // --- Concrete example: fixed positions, explicit assertions --------------
  it("makes a concretely-placed secret word unrecoverable after redaction", async () => {
    const secret = "SECRETxyz";
    const pub = "PUBLICabc";
    const built = await buildDoc({
      secret,
      pub,
      size: 14,
      secretX: 100,
      secretY: 600,
      pubX: 100,
      pubY: 80,
    });

    const before = await extractPageText(built.inputBytes, 0);
    expect(before).toContain(secret);

    const out = await applyEdits(built.file, [
      { kind: "redact", page: 0, rect: built.redactRect },
    ]);

    const after = await extractPageText(out, 0);
    expect(after).not.toContain(secret);
    expect(after).toContain(pub);
  });
});
