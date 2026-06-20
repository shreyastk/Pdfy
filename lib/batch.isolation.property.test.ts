// Feature: pdfy-feature-expansion, Property 25: A failing file does not halt the batch
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { runBatch, type BatchItem } from "./batch";

/**
 * Property 25: A failing file does not halt the batch.
 * Validates: Requirements 12.5
 *
 * For any list of files, with an injected `op` mocked to FAIL for an arbitrary
 * subset (including the first file failing, a middle file failing, multiple
 * failures, alternating, or every file failing), `runBatch`:
 *   - invokes `op` for EVERY file regardless of earlier failures (no halt),
 *   - resolves without throwing,
 *   - leaves every item in a terminal status (`completed` or `failed`),
 *   - marks success-files `completed` with their output and no error — even
 *     when other files failed before or after them,
 *   - marks failure-files `failed` with an error message and no output.
 *
 * `runBatch` only reads `file.name` (indirectly) and passes the file object to
 * `op`, so we use lightweight File stand-ins identified by a unique index and
 * drive success/failure from a per-file boolean array.
 */

/** Lightweight File stand-in carrying only an identifying index + name. */
interface FakeFile {
  readonly index: number;
  readonly name: string;
}

function fakeFile(index: number): File {
  return { index, name: `file-${index}.pdf` } as unknown as File;
}

/**
 * Build an injected op that succeeds or fails per the `shouldFail` array
 * (indexed by the file's `index`), recording every invocation into `invoked`.
 */
function makeOp(shouldFail: boolean[], invoked: Set<number>) {
  return async (f: File): Promise<Uint8Array> => {
    const index = (f as unknown as FakeFile).index;
    invoked.add(index);
    if (shouldFail[index]) {
      throw new Error(`boom-${index}`);
    }
    // Deterministic, index-derived output so we can assert it survives.
    return new Uint8Array([index & 0xff, (index >> 8) & 0xff]);
  };
}

/** Assert the terminal invariants of a finished batch. */
function assertTerminal(items: BatchItem[], shouldFail: boolean[], invoked: Set<number>) {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const index = (item.file as unknown as FakeFile).index;

    // Every file's op must have been invoked (the batch never halted early).
    expect(invoked.has(index)).toBe(true);

    // Every item reached a terminal status.
    expect(item.status === "completed" || item.status === "failed").toBe(true);

    if (shouldFail[index]) {
      expect(item.status).toBe("failed");
      expect(typeof item.error).toBe("string");
      expect((item.error ?? "").length).toBeGreaterThan(0);
      expect(item.output).toBeUndefined();
    } else {
      expect(item.status).toBe("completed");
      expect(item.error).toBeUndefined();
      expect(item.output).toBeInstanceOf(Uint8Array);
      // Output is the success sentinel derived from the file index.
      expect(Array.from(item.output ?? [])).toEqual([
        index & 0xff,
        (index >> 8) & 0xff,
      ]);
    }
  }
}

/**
 * A batch generator: 1..15 files paired with a per-file failure flag. The
 * boolean array naturally covers first-fails, all-fail, none-fail, and
 * alternating subsets across runs; explicit example tests below pin the
 * notable corners.
 */
const batchArb = fc
  .integer({ min: 1, max: 15 })
  .chain((count) =>
    fc.record({
      count: fc.constant(count),
      shouldFail: fc.array(fc.boolean(), { minLength: count, maxLength: count }),
    }),
  );

describe("Property 25: a failing file does not halt the batch", () => {
  it("processes every file to a terminal state regardless of which ones fail", async () => {
    await fc.assert(
      fc.asyncProperty(batchArb, async ({ count, shouldFail }) => {
        const files = Array.from({ length: count }, (_, i) => fakeFile(i));
        const invoked = new Set<number>();
        const op = makeOp(shouldFail, invoked);

        const items = await runBatch(files, op, () => {});

        // The batch resolved (no throw) and touched every file.
        expect(items).toHaveLength(count);
        expect(invoked.size).toBe(count);
        assertTerminal(items, shouldFail, invoked);
      }),
      { numRuns: 200 },
    );
  });

  it("covers first-fails, all-fail, none-fail, and alternating across the generated space", async () => {
    const seen = { firstFails: false, allFail: false, noneFail: false, mixed: false };

    await fc.assert(
      fc.asyncProperty(batchArb, async ({ count, shouldFail }) => {
        const files = Array.from({ length: count }, (_, i) => fakeFile(i));
        const invoked = new Set<number>();
        const items = await runBatch(files, makeOp(shouldFail, invoked), () => {});

        const failedCount = shouldFail.filter(Boolean).length;
        if (shouldFail[0]) seen.firstFails = true;
        if (failedCount === count) seen.allFail = true;
        if (failedCount === 0) seen.noneFail = true;
        if (failedCount > 0 && failedCount < count) seen.mixed = true;

        assertTerminal(items, shouldFail, invoked);
      }),
      { numRuns: 300 },
    );

    expect(seen.firstFails).toBe(true);
    expect(seen.allFail).toBe(true);
    expect(seen.noneFail).toBe(true);
    expect(seen.mixed).toBe(true);
  });

  it("example: the FIRST file failing does not stop later files from completing", async () => {
    const shouldFail = [true, false, false, false];
    const files = shouldFail.map((_, i) => fakeFile(i));
    const invoked = new Set<number>();

    const items = await runBatch(files, makeOp(shouldFail, invoked), () => {});

    expect(invoked.size).toBe(4);
    expect(items[0].status).toBe("failed");
    expect(items.slice(1).every((it) => it.status === "completed")).toBe(true);
    assertTerminal(items, shouldFail, invoked);
  });

  it("example: ALL files failing still resolves with every item failed and invoked", async () => {
    const shouldFail = [true, true, true];
    const files = shouldFail.map((_, i) => fakeFile(i));
    const invoked = new Set<number>();

    const items = await runBatch(files, makeOp(shouldFail, invoked), () => {});

    expect(invoked.size).toBe(3);
    expect(items.every((it) => it.status === "failed")).toBe(true);
    expect(items.every((it) => it.output === undefined)).toBe(true);
    assertTerminal(items, shouldFail, invoked);
  });

  it("example: alternating failures keep successes completed with output", async () => {
    const shouldFail = [false, true, false, true, false];
    const files = shouldFail.map((_, i) => fakeFile(i));
    const invoked = new Set<number>();

    const items = await runBatch(files, makeOp(shouldFail, invoked), () => {});

    expect(invoked.size).toBe(5);
    assertTerminal(items, shouldFail, invoked);
  });
});
