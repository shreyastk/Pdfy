import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { cmykToGray, convertColorOperators, rgbToGray } from "./grayscale";

describe("convertColorOperators", () => {
  it("rewrites DeviceRGB and DeviceCMYK fill/stroke operators to gray", () => {
    const out = convertColorOperators("1 0 0 rg 0 0 1 RG 0 0 0 1 k 0 0 0 0 K");
    expect(out).toBe("0.299 g 0.114 G 0 g 1 G");
  });

  it("never touches operator-like text inside strings", () => {
    const src = "BT (1 0 0 rg) Tj ET 0.5 0.5 0.5 rg";
    expect(convertColorOperators(src)).toBe("BT (1 0 0 rg) Tj ET 0.5 g");
  });

  it("converts sc operands only inside DeviceRGB/DeviceCMYK colour spaces", () => {
    expect(convertColorOperators("/DeviceRGB cs 0 1 0 sc")).toBe("/DeviceGray cs 0.587 sc");
    // A named colour space is left alone.
    expect(convertColorOperators("/CS0 cs 0 1 0 sc")).toBe("/CS0 cs 0 1 0 sc");
  });

  it("restores the colour-space state on Q", () => {
    const src = "q /DeviceCMYK cs Q 0 0 0 1 sc";
    // After Q the fill space is back to DeviceGray, so the 4 operands are not CMYK.
    expect(convertColorOperators(src)).toBe("q /DeviceGray cs Q 0 0 0 1 sc");
  });

  it("leaves inline image data untouched", () => {
    const src = "BI /W 1 /H 1 ID \x01rg\x02 EI 1 1 1 rg";
    expect(convertColorOperators(src)).toBe("BI /W 1 /H 1 ID \x01rg\x02 EI 1 g");
  });

  it("is idempotent and removes every rg operator", () => {
    const unit = fc.double({ min: 0, max: 1, noNaN: true });
    fc.assert(
      fc.property(fc.array(fc.tuple(unit, unit, unit), { maxLength: 10 }), (colors) => {
        const src = colors
          .map(([r, g, b]) => `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg 0 0 m`)
          .join("\n");
        const once = convertColorOperators(src);
        expect(convertColorOperators(once)).toBe(once);
        expect(once).not.toMatch(/\brg\b/);
      }),
    );
  });
});

describe("luminance helpers", () => {
  it("maps extremes correctly", () => {
    expect(rgbToGray(1, 1, 1)).toBeCloseTo(1);
    expect(rgbToGray(0, 0, 0)).toBe(0);
    expect(cmykToGray(0, 0, 0, 0)).toBe(1);
    expect(cmykToGray(0, 0, 0, 1)).toBe(0);
  });
});
