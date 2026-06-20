// Feature: pdfy-feature-expansion, Property 28: Tool metadata is complete and consistent
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { buildToolMetadata, SITE_DEFAULTS } from "./seo";
import { TOOLS, type ToolDefinition } from "./tool-registry";

/**
 * Property 28: Tool metadata is complete and consistent.
 * Validates: Requirements 17.2, 17.3, 17.4
 *
 * For any tool — sampled directly from TOOLS, or a variant whose
 * seoTitle/seoDescription/ogImage have been blanked to "" or undefined to
 * exercise the site-default fallback (Req 17.3) — buildToolMetadata(tool,
 * SITE_DEFAULTS) returns a Metadata object where:
 *  - title and description are non-empty strings (Req 17.2, 17.3).
 *  - openGraph.url and alternates.canonical are equal, ABSOLUTE
 *    (http(s)://...), and end with /tools/<slug> (Req 17.4).
 *  - openGraph.type === "website".
 *  - openGraph.images has exactly one entry whose url is an absolute URL
 *    (Req 17.4 single image).
 *
 * Next's Metadata typing is loose (title may be a string | object; canonical may
 * be a string | URL; images may be a single value or array), so we normalize
 * each field to a plain string / array before asserting.
 */
describe("Property 28: tool metadata is complete and consistent", () => {
  const ABSOLUTE_URL = /^https?:\/\//i;

  /** Coerce Next's `title`/canonical-ish fields to a plain string for assertions. */
  function asString(value: unknown): string {
    if (typeof value === "string") return value;
    if (value instanceof URL) return value.toString();
    if (value != null && typeof value === "object") {
      // e.g. { url } for canonical, or { absolute } / { default } for title.
      const obj = value as Record<string, unknown>;
      if (typeof obj.url === "string") return obj.url;
      if (obj.url instanceof URL) return obj.url.toString();
      if (typeof obj.absolute === "string") return obj.absolute;
      if (typeof obj.default === "string") return obj.default;
    }
    return String(value);
  }

  /** Normalize openGraph.images (single value | array) to an array. */
  function asArray<T>(value: T | T[] | undefined | null): T[] {
    if (value == null) return [];
    return Array.isArray(value) ? value : [value];
  }

  /** Extract the `url` string from an OG image entry of any supported shape. */
  function imageUrl(entry: unknown): string {
    if (typeof entry === "string") return entry;
    if (entry instanceof URL) return entry.toString();
    if (entry != null && typeof entry === "object") {
      const url = (entry as Record<string, unknown>).url;
      if (typeof url === "string") return url;
      if (url instanceof URL) return url.toString();
    }
    return String(entry);
  }

  /** Assertions shared by every (tool, expectedSlug) pair. */
  function checkMetadata(tool: ToolDefinition, expectedSlug: string): void {
    const meta = buildToolMetadata(tool, SITE_DEFAULTS);

    // title + description non-empty (Req 17.2, 17.3).
    const title = asString(meta.title);
    expect(typeof title).toBe("string");
    expect(title.length).toBeGreaterThan(0);

    expect(typeof meta.description).toBe("string");
    expect((meta.description ?? "").length).toBeGreaterThan(0);

    const og = meta.openGraph as Record<string, unknown> | undefined;
    expect(og).toBeTruthy();

    // openGraph.type === "website".
    expect(og!.type).toBe("website");

    // canonical === openGraph.url, both absolute and ending with /tools/<slug> (Req 17.4).
    const canonical = asString(
      (meta.alternates as Record<string, unknown> | undefined)?.canonical,
    );
    const ogUrl = asString(og!.url);
    const suffix = `/tools/${expectedSlug}`;

    expect(ogUrl).toBe(canonical);
    expect(ABSOLUTE_URL.test(canonical)).toBe(true);
    expect(canonical.endsWith(suffix)).toBe(true);

    // Exactly one OG image whose url is absolute (Req 17.4 single image).
    const images = asArray(og!.images as unknown);
    expect(images.length).toBe(1);
    expect(ABSOLUTE_URL.test(imageUrl(images[0]))).toBe(true);
  }

  it("holds for every tool sampled directly from TOOLS", () => {
    expect(TOOLS.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(fc.constantFrom<ToolDefinition>(...TOOLS), (tool) => {
        checkMetadata(tool, tool.slug);
      }),
      { numRuns: 100 },
    );
  });

  it("holds for variant tools with blanked SEO/OG fields (site-default fallback)", () => {
    // Each optional override is independently "" , undefined, or left untouched
    // (represented here as a sentinel that means "keep original").
    const KEEP = Symbol("keep");
    const blankArb = fc.constantFrom<string | undefined | typeof KEEP>(
      "",
      undefined,
      KEEP,
    );

    fc.assert(
      fc.property(
        fc.constantFrom<ToolDefinition>(...TOOLS),
        blankArb,
        blankArb,
        blankArb,
        (base, titleOverride, descOverride, ogOverride) => {
          const variant: ToolDefinition = {
            ...base,
            seoTitle:
              titleOverride === KEEP
                ? base.seoTitle
                : (titleOverride as unknown as string),
            seoDescription:
              descOverride === KEEP
                ? base.seoDescription
                : (descOverride as unknown as string),
            ogImage:
              ogOverride === KEEP
                ? base.ogImage
                : (ogOverride as unknown as string | undefined),
          };
          checkMetadata(variant, base.slug);
        },
      ),
      { numRuns: 200 },
    );
  });
});
