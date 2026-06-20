// Feature: pdfy-feature-expansion, Property 33: Office conversion gates unsupported and oversized inputs
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  gateInput,
  formatFromName,
  MAX_OFFICE_SIZE,
  type ExpectedSource,
} from "./office-converter";

/**
 * Property 33: Office conversion gates unsupported and oversized inputs.
 *
 * Validates: Requirements 1.6, 1.7
 *
 * For any generated filename + size and either expected source ("pdf" | "office"):
 *  - if the file's format (by extension) does not match the expected source set,
 *    gateInput rejects with reason "unsupported-format" (Req 1.6);
 *  - if the format matches but size > MAX_OFFICE_SIZE, it rejects with
 *    reason "too-large" (Req 1.7);
 *  - if the format matches and size <= MAX_OFFICE_SIZE, it accepts ({ ok: true }).
 */

/** The Office source extensions accepted when expected === "office". */
const OFFICE_EXTS = new Set(["docx", "xlsx", "pptx"]);

/** Whether a detected format is acceptable for the given expectation (the spec). */
function formatMatchesExpectation(name: string, expected: ExpectedSource): boolean {
  const format = formatFromName(name);
  return expected === "pdf"
    ? format === "pdf"
    : format === "docx" || format === "xlsx" || format === "pptx";
}

// A mix of matching, mismatching, empty, and unknown extensions.
const extensionArb = fc.constantFrom(
  "pdf",
  "docx",
  "xlsx",
  "pptx",
  "txt",
  "",
  "png",
  "jpg",
  "PDF", // case-insensitivity check
  "DOCX",
  "doc", // legacy / unsupported
  "zip",
);

// Base names that may themselves contain dots.
const baseNameArb = fc.stringMatching(/^[A-Za-z0-9 ._-]{0,20}$/);

// Build a filename from a base + extension (empty extension => no trailing dot).
const fileNameArb = fc
  .tuple(baseNameArb, extensionArb)
  .map(([base, ext]) => (ext === "" ? base : `${base}.${ext}`));

// Sizes spanning both below/at and above the 100 MB threshold.
const sizeArb = fc.oneof(
  // Below or at the limit (accepted region).
  fc.integer({ min: 0, max: MAX_OFFICE_SIZE }),
  // Above the limit (too-large region).
  fc.integer({ min: MAX_OFFICE_SIZE + 1, max: MAX_OFFICE_SIZE * 4 }),
);

const expectedArb = fc.constantFrom<ExpectedSource>("pdf", "office");

describe("Property 33: Office conversion gates unsupported and oversized inputs", () => {
  it("gateInput matches the spec across random filenames, sizes, and expectations", () => {
    fc.assert(
      fc.property(fileNameArb, sizeArb, expectedArb, (name, size, expected) => {
        const result = gateInput({ name, size }, expected);
        const matches = formatMatchesExpectation(name, expected);

        if (!matches) {
          // Req 1.6: unsupported source is rejected as unsupported-format,
          // regardless of size.
          expect(result).toEqual({ ok: false, reason: "unsupported-format" });
          return;
        }

        if (size > MAX_OFFICE_SIZE) {
          // Req 1.7: matching format but oversized is rejected as too-large.
          expect(result).toEqual({ ok: false, reason: "too-large" });
          return;
        }

        // Matching format and within the size limit is accepted.
        expect(result).toEqual({ ok: true });
      }),
      { numRuns: 300 },
    );
  });

  it("exercises BOTH rejection reasons across the generated input space", () => {
    let sawUnsupported = false;
    let sawTooLarge = false;
    let sawOk = false;

    fc.assert(
      fc.property(fileNameArb, sizeArb, expectedArb, (name, size, expected) => {
        const result = gateInput({ name, size }, expected);
        if (result.ok) {
          sawOk = true;
        } else if (result.reason === "unsupported-format") {
          sawUnsupported = true;
        } else if (result.reason === "too-large") {
          sawTooLarge = true;
        }
        return true;
      }),
      { numRuns: 500 },
    );

    expect(sawUnsupported).toBe(true);
    expect(sawTooLarge).toBe(true);
    expect(sawOk).toBe(true);
  });

  it("format is checked before size (oversized unsupported file is unsupported-format)", () => {
    // A concrete edge case complementing the property: a .txt file far over the
    // limit is reported as unsupported-format, not too-large (Req 1.6 precedence).
    expect(gateInput({ name: "huge.txt", size: MAX_OFFICE_SIZE * 2 }, "pdf")).toEqual({
      ok: false,
      reason: "unsupported-format",
    });
  });
});
