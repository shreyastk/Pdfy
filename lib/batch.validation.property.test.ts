// Feature: pdfy-feature-expansion, Property 23: Batch validation enforces the documented limits
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  validateBatch,
  MAX_BATCH_FILES,
  MAX_FILE_SIZE,
} from "./batch";

/**
 * Property 23: Batch validation enforces the documented limits.
 * Validates: Requirements 12.2
 *
 * `validateBatch` is a pure, synchronous gate over the documented limits with a
 * FIXED precedence so the returned reason is deterministic:
 *   1. `none`      — when no files are provided.
 *   2. `too-many`  — when more than MAX_BATCH_FILES (100) files are provided.
 *   3. `too-large` — when any file exceeds MAX_FILE_SIZE (100 MB) bytes.
 *   otherwise      — `{ ok: true }`.
 *
 * `validateBatch` only reads `.length` and each file's `.size`, so we construct
 * cheap stand-ins (`{ size, name } as unknown as File`) rather than allocating
 * real multi-megabyte Blobs.
 *
 * The generators below intentionally span:
 *   - file counts of 0, 1..100, and >100 (so `none`, in-range, and `too-many`
 *     are all exercised),
 *   - per-file sizes both below/at and above MAX_FILE_SIZE (so `too-large` and
 *     the ok outcome are both exercised),
 * with the model re-deriving the expected result from the spec precedence and
 * asserting an exact match.
 */

/** Build a lightweight File stand-in with only the fields validateBatch reads. */
function fakeFile(size: number, name = "x.pdf"): File {
  return { size, name } as unknown as File;
}

/** Re-derivation of the documented precedence: none -> too-many -> too-large -> ok. */
function expected(
  files: File[],
):
  | { ok: true }
  | { ok: false; reason: "too-many" | "none" | "too-large" } {
  if (files.length === 0) return { ok: false, reason: "none" };
  if (files.length > MAX_BATCH_FILES) return { ok: false, reason: "too-many" };
  if (files.some((f) => f.size > MAX_FILE_SIZE))
    return { ok: false, reason: "too-large" };
  return { ok: true };
}

/** A size that spans below/at/above the per-file limit, with boundary emphasis. */
const sizeArb = fc.oneof(
  // Within limit (including 0 and the exact boundary).
  fc.integer({ min: 0, max: MAX_FILE_SIZE }),
  // Over the limit (1 byte over up to well beyond).
  fc.integer({ min: MAX_FILE_SIZE + 1, max: MAX_FILE_SIZE * 3 }),
  // Explicit boundary values.
  fc.constantFrom(0, 1, MAX_FILE_SIZE - 1, MAX_FILE_SIZE, MAX_FILE_SIZE + 1),
);

const fileArb = sizeArb.map((size) => fakeFile(size));

/**
 * File-count distribution covering all branches:
 *   - 0 files            -> none
 *   - 1..100 files       -> ok or too-large (depending on sizes)
 *   - 101..150 files     -> too-many (regardless of sizes)
 */
const batchArb = fc.oneof(
  // Empty batch.
  fc.constant<File[]>([]),
  // In-range counts (1..MAX_BATCH_FILES).
  fc.array(fileArb, { minLength: 1, maxLength: MAX_BATCH_FILES }),
  // Over the count limit.
  fc.array(fileArb, { minLength: MAX_BATCH_FILES + 1, maxLength: MAX_BATCH_FILES + 50 }),
);

describe("Property 23: batch validation enforces the documented limits", () => {
  it("matches the documented precedence (none, then too-many, then too-large, then ok)", () => {
    fc.assert(
      fc.property(batchArb, (files) => {
        expect(validateBatch(files)).toEqual(expected(files));
      }),
      { numRuns: 300 },
    );
  });

  it("exercises every outcome across the generated space (coverage guard)", () => {
    const seen = new Set<string>();
    fc.assert(
      fc.property(batchArb, (files) => {
        const result = validateBatch(files);
        seen.add(result.ok ? "ok" : result.reason);
        // Always also assert correctness on each sample.
        expect(result).toEqual(expected(files));
      }),
      { numRuns: 500 },
    );
    // Confirm the generators meaningfully cover all four outcomes.
    expect(seen.has("none")).toBe(true);
    expect(seen.has("too-many")).toBe(true);
    expect(seen.has("too-large")).toBe(true);
    expect(seen.has("ok")).toBe(true);
  });
});
