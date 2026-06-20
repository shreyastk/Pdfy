// Feature: pdfy-feature-expansion, Property 24: Batch produces one result per success and reaches terminal status for all
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { runBatch, type BatchItem, type FileStatus } from "./batch";

/**
 * Property 24: Batch produces one result per success and reaches terminal status for all.
 * Validates: Requirements 12.1, 12.3
 *
 * `runBatch(files, op, onUpdate)` processes each file INDEPENDENTLY through an
 * injected operation `op`. We exploit the injection point: for each generated
 * file we decide ahead of time (via a generated boolean) whether `op` should
 * succeed (resolve with a Uint8Array) or fail (throw). This lets us assert the
 * exact terminal-status and result-count invariants without any real PDF work.
 *
 * The invariants checked on the resolved batch:
 *   - TERMINAL: every item ends `completed` or `failed` — none left
 *     `queued`/`processing` (Req 12.1, 12.3).
 *   - RESULT COUNT: the number of `completed` items equals the number of files
 *     for which `op` succeeded; total items equals the number of files.
 *   - OUTPUT SHAPE: each `completed` item carries a defined `output` and no
 *     error; each `failed` item carries an error message and no `output`.
 *   - UPDATES: `onUpdate` is invoked, and its final snapshot matches the
 *     resolved result.
 *
 * `runBatch` only uses each File for identity (it passes it straight to `op`),
 * so we use lightweight stand-ins (`{ name, size } as unknown as File`).
 */

/** Build a lightweight File stand-in carrying only fields the runner touches. */
function fakeFile(name: string, size: number): File {
  return { name, size } as unknown as File;
}

/** A terminal status is one of the two end states. */
function isTerminal(status: FileStatus): boolean {
  return status === "completed" || status === "failed";
}

/**
 * Generate a batch of 0..20 files each paired with a success/failure flag.
 * Names are not required unique; sizes are arbitrary non-negative integers.
 */
const batchArb = fc.array(
  fc.record({
    name: fc.string({ maxLength: 12 }),
    size: fc.nat({ max: 5_000_000 }),
    succeeds: fc.boolean(),
  }),
  { minLength: 0, maxLength: 20 },
);

describe("Property 24: batch reaches terminal status for all and yields one result per success", () => {
  it("ends every item terminal with exactly one output per successful file", async () => {
    await fc.assert(
      fc.asyncProperty(batchArb, async (specs) => {
        const files = specs.map((s, i) => fakeFile(s.name || `f${i}.pdf`, s.size));

        // Per-file success is keyed off File identity via a Map aligned to files.
        const successMap = new Map<File, boolean>();
        files.forEach((file, i) => successMap.set(file, specs[i].succeeds));

        const expectedSuccesses = specs.filter((s) => s.succeeds).length;
        const expectedFailures = specs.length - expectedSuccesses;

        // Injected op: resolve with a Uint8Array for successes, throw otherwise.
        const op = async (f: File): Promise<Uint8Array> => {
          if (successMap.get(f)) {
            return new Uint8Array([1, 2, 3]);
          }
          throw new Error("injected failure");
        };

        // Capture every emitted snapshot.
        const snapshots: BatchItem[][] = [];
        const onUpdate = (items: BatchItem[]) => {
          snapshots.push(items);
        };

        const result = await runBatch(files, op, onUpdate);

        // Total items === number of files.
        expect(result).toHaveLength(files.length);

        // Every item is in a terminal status.
        expect(result.every((item) => isTerminal(item.status))).toBe(true);

        const completed = result.filter((item) => item.status === "completed");
        const failed = result.filter((item) => item.status === "failed");

        // Result-count invariants.
        expect(completed).toHaveLength(expectedSuccesses);
        expect(failed).toHaveLength(expectedFailures);
        expect(completed.length + failed.length).toBe(files.length);

        // Output shape: completed carry output and no error.
        for (const item of completed) {
          expect(item.output).toBeInstanceOf(Uint8Array);
          expect(item.error).toBeUndefined();
        }
        // Output shape: failed carry an error message and no output.
        for (const item of failed) {
          expect(item.output).toBeUndefined();
          expect(typeof item.error).toBe("string");
          expect((item.error ?? "").length).toBeGreaterThan(0);
        }

        // onUpdate was called and the final emitted snapshot matches the result.
        expect(snapshots.length).toBeGreaterThan(0);
        const last = snapshots[snapshots.length - 1];
        expect(last).toHaveLength(result.length);
        last.forEach((item, i) => {
          expect(item.status).toBe(result[i].status);
          expect(item.output).toEqual(result[i].output);
          expect(item.error).toEqual(result[i].error);
        });
      }),
      { numRuns: 150 },
    );
  });
});
