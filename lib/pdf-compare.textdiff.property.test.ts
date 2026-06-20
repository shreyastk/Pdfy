// Feature: pdfy-feature-expansion, Property 17: Text diff reconstructs the per-page changes
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { diffPageText } from "./pdf-compare";

/**
 * Property 17: Text diff reconstructs the per-page changes.
 * Validates: Requirements 5.2
 *
 * Reconstruction contract (see diffPageText docs): `removed` is exactly the
 * tokens of aText not in the LCS (in a-order) and `added` is exactly the tokens
 * of bText not in the LCS (in b-order). Deleting `removed` from aText's tokens
 * yields the LCS, and deleting `added` from bText's tokens yields the same LCS;
 * the LCS interleaved with `added` in b-order reproduces bText's tokens.
 *
 * NOTE on robustness: `removed`/`added` are defined *positionally* (by the LCS
 * mask). Deleting them from the token list by *value* is ambiguous when tokens
 * repeat — e.g. a=[c,b], b=[c,b,c] gives added=[c] for the *third* token, but a
 * greedy value-match would wrongly remove the first `c` (which is in the LCS).
 * So this test does not perform a value-based subsequence deletion. Instead it
 * asserts the contract in a form that is robust under repeated tokens:
 *   (1) `removed` is an (order-preserving) subsequence of aTokens,
 *   (2) `added`   is an (order-preserving) subsequence of bTokens,
 *   (3) deleting `removed` from a and `added` from b leaves the *same* common
 *       token multiset (the LCS), and
 *   (4) that common length equals the LCS length computed independently — i.e.
 *       the diff removes/adds exactly the minimal (LCS-based) set of tokens.
 *
 * A small token alphabet exercises the LCS with repeats and partial overlaps.
 */
describe("Property 17: text diff reconstructs the per-page changes", () => {
  // tokenize the same way pdf-compare does: collapse whitespace runs, drop empties.
  const tokenize = (text: string): string[] => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return [];
    return trimmed.split(/\s+/);
  };

  /** True iff `sub` appears in `seq` as an order-preserving subsequence. */
  const isSubsequence = (sub: string[], seq: string[]): boolean => {
    let s = 0;
    for (const tok of seq) {
      if (s < sub.length && tok === sub[s]) s++;
    }
    return s === sub.length;
  };

  /** Multiset of token -> count. */
  const counts = (tokens: string[]): Map<string, number> => {
    const m = new Map<string, number>();
    for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1);
    return m;
  };

  /** counts(tokens) minus counts(remove), assuming remove's counts <= tokens'. */
  const subtractCounts = (tokens: string[], remove: string[]): Map<string, number> => {
    const m = counts(tokens);
    for (const [t, c] of counts(remove)) {
      m.set(t, (m.get(t) ?? 0) - c);
    }
    // Drop zero/negative entries so two empty-residue maps compare equal.
    for (const [t, c] of [...m]) {
      if (c <= 0) m.delete(t);
    }
    return m;
  };

  const mapsEqual = (x: Map<string, number>, y: Map<string, number>): boolean => {
    if (x.size !== y.size) return false;
    for (const [k, v] of x) {
      if (y.get(k) !== v) return false;
    }
    return true;
  };

  /** Independent standard LCS length over token sequences (length is unique). */
  const lcsLength = (a: string[], b: string[]): number => {
    const n = a.length;
    const m = b.length;
    const dp: number[][] = Array.from({ length: n + 1 }, () =>
      new Array<number>(m + 1).fill(0),
    );
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] =
          a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    return dp[0][0];
  };

  const wordArb = fc.array(fc.constantFrom("a", "b", "c", "d"), {
    minLength: 0,
    maxLength: 12,
  });

  it("removed/added are subsequences and deleting them reconciles a and b to the LCS", () => {
    fc.assert(
      fc.property(wordArb, wordArb, (aTokens, bTokens) => {
        const aText = aTokens.join(" ");
        const bText = bTokens.join(" ");

        const { added, removed } = diffPageText(aText, bText);

        // Re-tokenize via the same path the implementation uses.
        const aTok = tokenize(aText);
        const bTok = tokenize(bText);

        // (1) & (2): removed/added are genuine order-preserving subsequences.
        expect(isSubsequence(removed, aTok)).toBe(true);
        expect(isSubsequence(added, bTok)).toBe(true);

        // (3): deleting removed from a and added from b leaves the same LCS multiset.
        const lcsFromA = subtractCounts(aTok, removed);
        const lcsFromB = subtractCounts(bTok, added);
        expect(mapsEqual(lcsFromA, lcsFromB)).toBe(true);

        // (4): the surviving length is exactly the LCS length (minimal changes).
        const lcsLen = lcsLength(aTok, bTok);
        expect(aTok.length - removed.length).toBe(lcsLen);
        expect(bTok.length - added.length).toBe(lcsLen);
      }),
      { numRuns: 200 },
    );
  });
});
