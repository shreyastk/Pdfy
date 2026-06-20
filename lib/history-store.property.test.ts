// Feature: pdfy-feature-expansion, Property 26: History store enforces truncation, cap, and ordering
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  applyEntry,
  MAX_FILENAME_LENGTH,
  MAX_ENTRIES,
  type HistoryEntry,
} from "./history-store";

/**
 * Arbitrary HistoryEntry. fileName intentionally biases toward long strings
 * (including ones well over MAX_FILENAME_LENGTH) so truncation is exercised.
 */
const historyEntryArb: fc.Arbitrary<HistoryEntry> = fc.record({
  fileName: fc.oneof(
    fc.string(),
    // Force frequent over-length names to exercise truncation.
    fc.string({ minLength: MAX_FILENAME_LENGTH + 1, maxLength: 600 }),
  ),
  tool: fc.string(),
  timestamp: fc.nat(),
});

describe("Property 26: History store enforces truncation, cap, and ordering", () => {
  // Validates: Requirements 14.1, 14.2, 14.3
  it("folds applyEntry preserving truncation (14.1), cap (14.2), and most-recent-first ordering (14.3)", () => {
    fc.assert(
      fc.property(fc.array(historyEntryArb, { maxLength: 120 }), (inputs) => {
        let list: HistoryEntry[] = [];

        for (const e of inputs) {
          const before = list;
          const beforeSnapshot = [...before];

          const next = applyEntry(before, e);

          // applyEntry must not mutate its input and must return a new array.
          expect(before).toEqual(beforeSnapshot);
          expect(next).not.toBe(before);

          // Req 14.1: every stored fileName is truncated to <= 255 chars.
          for (const stored of next) {
            expect(stored.fileName.length).toBeLessThanOrEqual(MAX_FILENAME_LENGTH);
          }

          // Req 14.2: length never exceeds the cap.
          expect(next.length).toBeLessThanOrEqual(MAX_ENTRIES);

          // Req 14.3: most recently applied entry is at index 0.
          expect(next[0].fileName).toBe(e.fileName.slice(0, MAX_FILENAME_LENGTH));
          expect(next[0].tool).toBe(e.tool);
          expect(next[0].timestamp).toBe(e.timestamp);

          list = next;
        }

        // After folding N entries, the list holds the last min(N, 50) applied
        // entries in reverse application order (most-recent first) (Req 14.3).
        const expected = inputs
          .map((e) => ({
            fileName: e.fileName.slice(0, MAX_FILENAME_LENGTH),
            tool: e.tool,
            timestamp: e.timestamp,
          }))
          .reverse()
          .slice(0, MAX_ENTRIES);

        expect(list).toEqual(expected);
        // Final cap invariant restated for the whole fold.
        expect(list.length).toBe(Math.min(inputs.length, MAX_ENTRIES));
      }),
      { numRuns: 200 },
    );
  });

  it("a single applyEntry call truncates a >255-char fileName to exactly 255 and prepends it", () => {
    const longName = "a".repeat(MAX_FILENAME_LENGTH + 100);
    const existing: HistoryEntry[] = [
      { fileName: "old.pdf", tool: "merge", timestamp: 1 },
    ];

    const result = applyEntry(existing, {
      fileName: longName,
      tool: "split",
      timestamp: 2,
    });

    // Truncated to exactly 255 characters (Req 14.1).
    expect(result[0].fileName.length).toBe(MAX_FILENAME_LENGTH);
    expect(result[0].fileName).toBe("a".repeat(MAX_FILENAME_LENGTH));
    // Prepended (most-recent first) (Req 14.3).
    expect(result[0].tool).toBe("split");
    expect(result[1]).toEqual(existing[0]);
    // Input untouched.
    expect(existing).toEqual([{ fileName: "old.pdf", tool: "merge", timestamp: 1 }]);
  });
});
