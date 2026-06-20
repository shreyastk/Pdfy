// Feature: pdfy-feature-expansion, Property 6: Proportional resize scales both dimensions equally
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { computeProportionalResize } from "./page-manager";

/**
 * Property 6: Proportional resize scales both dimensions equally.
 * Validates: Requirements 7.2, 7.3
 *
 * For any page dimensions (width > 0, height > 0) and any valid scale factor in
 * [0.1, 10.0], `computeProportionalResize(width, height, scale)` returns
 * `{ width: width * scale, height: height * scale }` — both dimensions are
 * scaled by the SAME factor, which preserves the original aspect ratio.
 *
 * The generator spans realistic page dimensions in [1, 5000] points and scale
 * factors across the full supported range [0.1, 10.0].
 */
describe("Property 6: proportional resize scales both dimensions equally", () => {
  const dimensionArb = fc.double({
    min: 1,
    max: 5000,
    noNaN: true,
    noDefaultInfinity: true,
  });
  const scaleArb = fc.double({
    min: 0.1,
    max: 10.0,
    noNaN: true,
    noDefaultInfinity: true,
  });

  it("scales both dimensions by the same factor, preserving aspect ratio", () => {
    fc.assert(
      fc.property(dimensionArb, dimensionArb, scaleArb, (width, height, scale) => {
        const result = computeProportionalResize(width, height, scale);

        // Both dimensions scaled by the same factor.
        expect(result.width).toBeCloseTo(width * scale, 6);
        expect(result.height).toBeCloseTo(height * scale, 6);

        // Aspect ratio preserved (height > 0 by construction).
        expect(result.width / result.height).toBeCloseTo(width / height, 6);
      }),
      { numRuns: 200 },
    );
  });
});
