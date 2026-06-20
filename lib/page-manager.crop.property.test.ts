// Feature: pdfy-feature-expansion, Property 4: Crop region is always clamped within page bounds or rejected
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { clampCropRect } from "./page-manager";
import type { Rect } from "./types";

/**
 * Property 4: Crop region is always clamped within page bounds or rejected.
 *
 * Validates: Requirements 7.5, 7.6
 *
 * For any crop rectangle (allowing negative widths/heights and out-of-range
 * values) and any page dimensions (pageW > 0, pageH > 0), `clampCropRect`
 * returns EITHER:
 *  - a rectangle lying entirely within [0, 0, pageW, pageH] with strictly
 *    positive width and height (Req 7.5: clamp to page boundaries), OR
 *  - { error: "degenerate" } when the clamped width or height is <= 0
 *    (Req 7.6: reject zero/negative regions).
 *
 * The result is NEVER an out-of-bounds rectangle.
 */

// Coordinates spanning well outside, on, and inside typical page bounds —
// including negatives so we exercise fully-outside and partial-overlap rects.
const coordArb = fc.double({
  min: -2000,
  max: 2000,
  noNaN: true,
});

// Rects allow negative width/height (caller may draw from any corner) and
// arbitrary out-of-range positions.
const rectArb: fc.Arbitrary<Rect> = fc.record({
  x: coordArb,
  y: coordArb,
  width: coordArb,
  height: coordArb,
});

// Positive, finite page dimensions.
const pageDimArb = fc.double({ min: 0.5, max: 2000, noNaN: true });

describe("Property 4: Crop region is always clamped within page bounds or rejected", () => {
  it("returns an in-bounds positive-area rect or the degenerate error — never out of bounds", () => {
    fc.assert(
      fc.property(rectArb, pageDimArb, pageDimArb, (rect, pageW, pageH) => {
        const result = clampCropRect(rect, pageW, pageH);

        if ("error" in result) {
          // Req 7.6: the only allowed error is "degenerate".
          expect(result.error).toBe("degenerate");
          return;
        }

        const { x, y, width, height } = result.rect;

        // Req 7.6: a returned rect must have strictly positive area.
        expect(width).toBeGreaterThan(0);
        expect(height).toBeGreaterThan(0);

        // Req 7.5: the rect lies entirely within [0, 0, pageW, pageH].
        // Use a tiny epsilon to absorb floating-point rounding.
        const eps = 1e-9;
        expect(x).toBeGreaterThanOrEqual(-eps);
        expect(y).toBeGreaterThanOrEqual(-eps);
        expect(x + width).toBeLessThanOrEqual(pageW + eps);
        expect(y + height).toBeLessThanOrEqual(pageH + eps);
      }),
      { numRuns: 300 },
    );
  });

  it("exercises BOTH outcomes: clamped in-bounds rects and degenerate rejections", () => {
    let sawClamped = false;
    let sawDegenerate = false;

    fc.assert(
      fc.property(rectArb, pageDimArb, pageDimArb, (rect, pageW, pageH) => {
        const result = clampCropRect(rect, pageW, pageH);
        if ("error" in result) {
          sawDegenerate = true;
        } else {
          sawClamped = true;
        }
        return true;
      }),
      { numRuns: 500 },
    );

    expect(sawClamped).toBe(true);
    expect(sawDegenerate).toBe(true);
  });

  it("clamps an oversized/out-of-page rect down to the full page (concrete edge case)", () => {
    // A rect far larger than the page clamps to exactly the page bounds.
    const result = clampCropRect({ x: -100, y: -100, width: 5000, height: 5000 }, 600, 800);
    expect(result).toEqual({ rect: { x: 0, y: 0, width: 600, height: 800 } });
  });

  it("rejects a rect entirely outside the page as degenerate (concrete edge case)", () => {
    // Wholly to the right of the page: nothing valid remains after clamping.
    const result = clampCropRect({ x: 700, y: 10, width: 50, height: 50 }, 600, 800);
    expect(result).toEqual({ error: "degenerate" });
  });

  it("rejects a zero-size rect as degenerate (concrete edge case)", () => {
    const result = clampCropRect({ x: 100, y: 100, width: 0, height: 0 }, 600, 800);
    expect(result).toEqual({ error: "degenerate" });
  });
});
