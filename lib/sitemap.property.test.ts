// Feature: pdfy-feature-expansion, Property 30: Sitemap contains exactly one absolute URL per public page
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { listSitemapUrls } from "../app/sitemap";
import { TOOLS } from "./tool-registry";

/**
 * Property 30: Sitemap contains exactly one absolute URL per public page.
 * Validates: Requirements 17.5, 17.6
 *
 * For any valid absolute base URL, listSitemapUrls(baseUrl) must return a list
 * where:
 *  - every entry is an ABSOLUTE URL beginning with the base origin (17.5),
 *  - there are NO duplicate URLs (17.5),
 *  - it contains exactly one entry per public page: the known static pages
 *    (/, /tools, /contact, /privacy, /terms) plus one per registry tool
 *    (/tools/<slug>), and nothing else — so the count equals
 *    staticPages + TOOLS.length and every tool slug appears exactly once (17.6).
 *
 * The base URL is generated over a small set of realistic origins plus a
 * generated valid-origin arbitrary, exercising the helper across many inputs.
 */
describe("Property 30: sitemap contains exactly one absolute URL per public page", () => {
  // Static, public, non-redirected pages enumerated by the sitemap helper.
  const STATIC_PUBLIC_PATHS = ["/", "/tools", "/contact", "/privacy", "/terms"];
  const EXPECTED_COUNT = STATIC_PUBLIC_PATHS.length + TOOLS.length;

  // A generated valid absolute origin: scheme + host (+ optional port), no
  // trailing slash. Combined with realistic fixed origins via fc.constantFrom.
  const generatedOrigin = fc
    .record({
      scheme: fc.constantFrom("http", "https"),
      host: fc
        .array(
          fc
            .string({ minLength: 1, maxLength: 8 })
            .map((s) => s.replace(/[^a-z0-9]/gi, "").toLowerCase())
            .filter((s) => s.length > 0),
          { minLength: 2, maxLength: 3 },
        )
        .filter((labels) => labels.every((l) => l.length > 0))
        .map((labels) => labels.join(".")),
      port: fc.option(fc.integer({ min: 1, max: 65535 }), { nil: null }),
    })
    .filter((r) => r.host.length > 0)
    .map(({ scheme, host, port }) =>
      port === null ? `${scheme}://${host}` : `${scheme}://${host}:${port}`,
    );

  const baseUrlArb = fc.oneof(
    fc.constantFrom("https://x.test", "https://pdfy.app", "http://localhost:3000"),
    generatedOrigin,
  );

  it("returns exactly one absolute, de-duplicated URL per public page", () => {
    fc.assert(
      fc.property(baseUrlArb, (baseUrl) => {
        const urls = listSitemapUrls(baseUrl);

        // Absolute: every entry begins with the base origin.
        for (const url of urls) {
          expect(url.startsWith(baseUrl)).toBe(true);
        }

        // No duplicates.
        expect(new Set(urls).size).toBe(urls.length);

        // Exact coverage: static pages + one per registry tool, nothing else.
        expect(urls.length).toBe(EXPECTED_COUNT);

        // Every static public page is present exactly once.
        for (const path of STATIC_PUBLIC_PATHS) {
          const expectedUrl =
            path === "/" ? `${baseUrl}/` : `${baseUrl}${path}`;
          expect(urls.filter((u) => u === expectedUrl).length).toBe(1);
        }

        // Every tool slug is present exactly once as /tools/<slug>.
        for (const tool of TOOLS) {
          const expectedUrl = `${baseUrl}/tools/${tool.slug}`;
          expect(urls.filter((u) => u === expectedUrl).length).toBe(1);
        }
      }),
      { numRuns: 100 },
    );
  });
});
