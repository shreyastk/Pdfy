import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { inkRatio } from "./blank-pages";
import { findHeaderOffset } from "./repair";
import { checkByteRange, parsePdfDate, signedBytes } from "./signature-verify";
import { acceptsFile, currentToolSlug } from "./handoff";
import { isExternal, summarizeExternal } from "./network-monitor";
import { fitWithin, planImage, type ImageInfo } from "./compress";

describe("inkRatio", () => {
  it("is 0 for white/transparent pages and counts dark pixels", () => {
    const white = new Uint8ClampedArray([255, 255, 255, 255, 250, 250, 250, 255]);
    expect(inkRatio(white)).toBe(0);
    const transparent = new Uint8ClampedArray([0, 0, 0, 0]);
    expect(inkRatio(transparent)).toBe(0);
    const half = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
    expect(inkRatio(half)).toBe(0.5);
  });
});

describe("findHeaderOffset", () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  it("finds the header after leading junk", () => {
    expect(findHeaderOffset(enc("%PDF-1.7\n"))).toBe(0);
    expect(findHeaderOffset(enc("garbage\r\n%PDF-1.4"))).toBe(9);
    expect(findHeaderOffset(enc("not a pdf"))).toBe(-1);
  });
});

describe("signature helpers", () => {
  it("parses PDF dates with timezone offsets", () => {
    expect(parsePdfDate("D:20240131120000+05'30'")?.toISOString()).toBe("2024-01-31T06:30:00.000Z");
    expect(parsePdfDate("D:20240131120000Z")?.toISOString()).toBe("2024-01-31T12:00:00.000Z");
    expect(parsePdfDate("D:2024")?.getUTCFullYear()).toBe(2024);
    expect(parsePdfDate("garbage")).toBeNull();
  });

  it("validates byte ranges", () => {
    expect(checkByteRange([0, 10, 20, 5], 25)).toEqual({ ok: true, ranges: [0, 10, 20, 5] });
    expect(checkByteRange([0, 10, 20, 6], 25).ok).toBe(false);
    expect(checkByteRange([1, 10, 20, 5], 25).ok).toBe(false);
    expect(checkByteRange([0, 10, 5, 5], 25).ok).toBe(false);
    expect(checkByteRange([0, 10, 20], 25).ok).toBe(false);
  });

  it("signedBytes concatenates exactly the two ranges", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 4, maxLength: 64 }), fc.nat(), fc.nat(), (bytes, a, b) => {
        const l1 = a % (bytes.length - 1);
        const s2 = l1 + (b % (bytes.length - l1));
        const l2 = bytes.length - s2;
        const out = signedBytes(bytes, [0, l1, s2, l2]);
        expect(Array.from(out)).toEqual([...bytes.subarray(0, l1), ...bytes.subarray(s2)]);
      }),
    );
  });
});

describe("handoff helpers", () => {
  it("extracts tool slugs from paths", () => {
    expect(currentToolSlug("/tools/compress")).toBe("compress");
    expect(currentToolSlug("/tools/compress/")).toBe("compress");
    expect(currentToolSlug("/tools")).toBeNull();
  });

  it("matches files against accept strings", () => {
    const pdf = { name: "A.PDF", type: "application/pdf" };
    const png = { name: "a.png", type: "image/png" };
    expect(acceptsFile(".pdf", pdf)).toBe(true);
    expect(acceptsFile(".pdf", png)).toBe(false);
    expect(acceptsFile("image/*", png)).toBe(true);
    expect(acceptsFile(".docx,.xlsx,.pptx,.pdf", pdf)).toBe(true);
    expect(acceptsFile("", png)).toBe(true);
  });
});

describe("network monitor", () => {
  it("counts only other origins", () => {
    const own = "https://pdfy.app";
    expect(isExternal("/vendor/pdfjs/pdf.worker.min.mjs", own)).toBe(false);
    expect(isExternal("blob:https://pdfy.app/123", own)).toBe(false);
    expect(isExternal("https://unpkg.com/x.js", own)).toBe(true);
    expect(summarizeExternal(["https://a.com/1", "https://a.com/2", "/x"], own)).toEqual({
      count: 2,
      origins: ["https://a.com"],
    });
  });
});

describe("compression planning", () => {
  const base: ImageInfo = {
    filters: ["DCTDecode"],
    colorSpace: "DeviceRGB",
    bitsPerComponent: 8,
    width: 1000,
    height: 800,
    hasDecodeArray: false,
    hasColorKeyMask: false,
    isImageMask: false,
  };

  it("re-encodes plain JPEG and 8-bit Flate RGB/gray images", () => {
    expect(planImage(base)).toEqual({ action: "jpeg", source: "dct", channels: 3 });
    expect(planImage({ ...base, filters: ["FlateDecode"], colorSpace: "DeviceGray" })).toEqual({
      action: "jpeg",
      source: "raw",
      channels: 1,
    });
  });

  it("leaves anything exotic untouched", () => {
    expect(planImage({ ...base, colorSpace: "DeviceCMYK" }).action).toBe("skip");
    expect(planImage({ ...base, colorSpace: null }).action).toBe("skip");
    expect(planImage({ ...base, filters: ["FlateDecode"], bitsPerComponent: 1 }).action).toBe("skip");
    expect(planImage({ ...base, filters: ["JBIG2Decode"] }).action).toBe("skip");
    expect(planImage({ ...base, hasDecodeArray: true }).action).toBe("skip");
    expect(planImage({ ...base, isImageMask: true }).action).toBe("skip");
    expect(planImage({ ...base, width: 10, height: 10 }).action).toBe("skip");
  });

  it("fitWithin never upscales and respects the limit", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10000 }), fc.integer({ min: 1, max: 10000 }), fc.integer({ min: 16, max: 4000 }), (w, h, max) => {
        const r = fitWithin(w, h, max);
        expect(r.width).toBeLessThanOrEqual(w);
        expect(r.height).toBeLessThanOrEqual(h);
        expect(Math.max(r.width, r.height)).toBeLessThanOrEqual(Math.max(max, 1) + 1);
      }),
    );
  });
});

describe("watermark placement", () => {
  it("originForCenter puts the rotated box's centre on the target", async () => {
    const { originForCenter } = await import("./watermark");
    fc.assert(
      fc.property(
        fc.double({ min: -500, max: 500, noNaN: true }),
        fc.double({ min: -500, max: 500, noNaN: true }),
        fc.double({ min: 1, max: 300, noNaN: true }),
        fc.double({ min: 1, max: 300, noNaN: true }),
        fc.double({ min: -360, max: 360, noNaN: true }),
        (cx, cy, w, h, angle) => {
          const o = originForCenter(cx, cy, w, h, angle);
          const r = (angle * Math.PI) / 180;
          // Centre of the box = origin + R(angle) * (w/2, h/2).
          const x = o.x + (w / 2) * Math.cos(r) - (h / 2) * Math.sin(r);
          const y = o.y + (w / 2) * Math.sin(r) + (h / 2) * Math.cos(r);
          expect(x).toBeCloseTo(cx, 6);
          expect(y).toBeCloseTo(cy, 6);
        },
      ),
    );
  });

  it("tiles cover the page and single placements stay inside it", async () => {
    const { placementCenters } = await import("./watermark");
    expect(placementCenters("tile", 600, 800, 100, 20, 36).length).toBeGreaterThan(4);
    const [c] = placementCenters("bottom-right", 600, 800, 100, 20, 36);
    expect(c).toEqual({ x: 600 - 36 - 50, y: 36 + 10 });
  });
});
