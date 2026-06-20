import { describe, it, expect } from "vitest";
import fc from "fast-check";

// Sample test to confirm the Vitest + fast-check runner is wired up correctly.
describe("test framework setup", () => {
  it("runs a basic unit test", () => {
    expect(1 + 1).toBe(2);
  });

  it("runs a property-based test with fast-check", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        return a + b === b + a;
      }),
      { numRuns: 100 }
    );
  });
});
