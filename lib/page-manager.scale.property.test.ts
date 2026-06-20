// Feature: pdfy-feature-expansion, Property 5: Scale validation accepts exactly the supported range
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { validateScale, MIN_SCALE, MAX_SCALE } from "./page-manager";

/**
 * Property 5: Scale validation accepts exactly the supported range.
 * Validates: Requirements 7.7
 *
 * For any number `scale`, `validateScale` returns `{ ok: true }` IF AND ONLY IF
 * `scale` is finite and within `[MIN_SCALE, MAX_SCALE]` (i.e. [0.1, 10.0])
 * inclusive; otherwise it returns `{ ok: false, value: scale }` echoing the
 * offending input.
 *
 * The generator spans values below 0.1, within range, above 10.0, the exact
 * boundary values (0.1, 10.0), and non-finite values (NaN, +/-Infinity) so both
 * directions of the iff are exercised. `fc.double()` is configured with
 * `noNaN: false` and `noDefaultInfinity: false` to include non-finite inputs.
 */
describe("Property 5: scale validation accepts exactly the supported range", () => {
  const scaleArb = fc.oneof(
    // Arbitrary doubles including NaN and +/-Infinity.
    fc.double({ noNaN: false, noDefaultInfinity: false }),
    // Below the lower bound.
    fc.double({ min: -1000, max: MIN_SCALE - Number.EPSILON, noNaN: true, noDefaultInfinity: true }),
    // Within range.
    fc.double({ min: MIN_SCALE, max: MAX_SCALE, noNaN: true, noDefaultInfinity: true }),
    // Above the upper bound.
    fc.double({ min: MAX_SCALE + Number.EPSILON, max: 1000, noNaN: true, noDefaultInfinity: true }),
    // Explicit boundary and non-finite cases.
    fc.constantFrom(MIN_SCALE, MAX_SCALE, 0, -0, NaN, Infinity, -Infinity),
  );

  it("returns ok iff scale is finite and within [MIN_SCALE, MAX_SCALE]", () => {
    fc.assert(
      fc.property(scaleArb, (scale) => {
        const expectedOk =
          Number.isFinite(scale) && scale >= MIN_SCALE && scale <= MAX_SCALE;
        const result = validateScale(scale);

        expect(result.ok).toBe(expectedOk);

        if (!result.ok) {
          // On failure the offending value is echoed back. Use Object.is so
          // NaN compares equal to NaN.
          expect(Object.is(result.value, scale)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });
});
