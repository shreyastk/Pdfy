// Feature: pdfy-feature-expansion, Property 29: Tool titles and descriptions are well-formed and unique
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { TOOLS, type ToolDefinition } from "./tool-registry";

/**
 * Property 29: Tool titles and descriptions are well-formed and unique.
 * Validates: Requirements 17.1
 *
 * Well-formedness (per-tool length bounds):
 *  - seoTitle length is in [10, 60] inclusive.
 *  - seoDescription length is in [50, 160] inclusive.
 * Uniqueness (across the whole registry):
 *  - seoTitles, seoDescriptions, names, and slugs are each globally unique.
 *
 * TOOLS is a fixed registry rather than generated input, so the property-based
 * portion samples arbitrary tools from the registry (fc.constantFrom) and
 * asserts the per-tool length bounds, while global uniqueness is asserted
 * directly over the whole array via sets.
 */
describe("Property 29: tool titles and descriptions are well-formed and unique", () => {
  const SEO_TITLE_MIN = 10;
  const SEO_TITLE_MAX = 60;
  const SEO_DESC_MIN = 50;
  const SEO_DESC_MAX = 160;

  it("samples the registry: every tool has in-bounds seoTitle and seoDescription lengths", () => {
    // The registry must be non-empty for fc.constantFrom to have a domain.
    expect(TOOLS.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(fc.constantFrom<ToolDefinition>(...TOOLS), (tool) => {
        const titleLen = tool.seoTitle.length;
        const descLen = tool.seoDescription.length;
        return (
          titleLen >= SEO_TITLE_MIN &&
          titleLen <= SEO_TITLE_MAX &&
          descLen >= SEO_DESC_MIN &&
          descLen <= SEO_DESC_MAX
        );
      }),
      { numRuns: 100 },
    );
  });

  it("seoTitle is 10–60 chars for every tool (exhaustive)", () => {
    for (const tool of TOOLS) {
      expect(
        tool.seoTitle.length,
        `seoTitle out of bounds for "${tool.slug}": "${tool.seoTitle}" (${tool.seoTitle.length})`,
      ).toBeGreaterThanOrEqual(SEO_TITLE_MIN);
      expect(
        tool.seoTitle.length,
        `seoTitle out of bounds for "${tool.slug}": "${tool.seoTitle}" (${tool.seoTitle.length})`,
      ).toBeLessThanOrEqual(SEO_TITLE_MAX);
    }
  });

  it("seoDescription is 50–160 chars for every tool (exhaustive)", () => {
    for (const tool of TOOLS) {
      expect(
        tool.seoDescription.length,
        `seoDescription out of bounds for "${tool.slug}": "${tool.seoDescription}" (${tool.seoDescription.length})`,
      ).toBeGreaterThanOrEqual(SEO_DESC_MIN);
      expect(
        tool.seoDescription.length,
        `seoDescription out of bounds for "${tool.slug}": "${tool.seoDescription}" (${tool.seoDescription.length})`,
      ).toBeLessThanOrEqual(SEO_DESC_MAX);
    }
  });

  it("seoTitles are globally unique", () => {
    const titles = TOOLS.map((t) => t.seoTitle);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("seoDescriptions are globally unique", () => {
    const descriptions = TOOLS.map((t) => t.seoDescription);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it("names are globally unique", () => {
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("slugs are globally unique", () => {
    const slugs = TOOLS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
