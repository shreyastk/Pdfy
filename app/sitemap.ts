import type { MetadataRoute } from "next";

import { TOOLS } from "@/lib/tool-registry";

/**
 * Static-export sitemap for PDFy.
 *
 * Next.js emits this `app/sitemap.ts` default export as `sitemap.xml` during the
 * static export build (`output: "export"`). The route enumerates every public
 * page — the static marketing/legal pages plus one entry per registry tool — as
 * absolute URLs, and excludes any non-public or redirected page.
 *
 * Requirements:
 * - 17.5: the static export build produces a sitemap listing every public page
 *   (including each Tool_Page) with absolute URLs, excluding non-public/redirected pages.
 * - 17.6: adding a new Tool_Page yields exactly one new sitemap entry with its absolute URL.
 *
 * Property 30 (task 5.4) asserts on {@link listSitemapUrls}: exactly one absolute
 * URL per public page, with no duplicates.
 */

/**
 * Site base URL used to build absolute sitemap entries.
 *
 * This mirrors the `baseUrl` field of the site defaults consumed by the SEO
 * metadata builder (`lib/seo.ts`); both should resolve to the same origin so
 * canonical URLs and sitemap URLs agree.
 */
export const SITEMAP_BASE_URL = "https://pdfy.app";

/**
 * Force static generation so the sitemap route can be emitted during the
 * static export build (`output: "export"`). Without this, Next.js fails page
 * data collection for `/sitemap.xml`.
 */
export const dynamic = "force-static";

/**
 * Static, public, non-redirected pages that exist under `app/`.
 *
 * Excludes any non-public or redirected route. Tool pages are added separately
 * from the registry so the catalog stays the single source of truth.
 */
const STATIC_PUBLIC_PATHS: readonly string[] = [
  "/", // home
  "/tools", // catalog
  "/contact",
  "/privacy",
  "/terms",
] as const;

/** Join a base URL and a root-relative path into a single absolute URL. */
function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  if (path === "/") {
    return `${base}/`;
  }
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}

/**
 * Produce the de-duplicated list of absolute public-page URLs for the sitemap.
 *
 * Pure helper (no Next/runtime dependencies) so it can be exercised directly by
 * the Property 30 test. Returns exactly one absolute URL per public page — the
 * static pages followed by one entry per registry tool — with duplicates removed.
 *
 * @param baseUrl - absolute site origin (e.g. `https://pdfy.app`).
 */
export function listSitemapUrls(baseUrl: string): string[] {
  const toolPaths = TOOLS.map((tool) => `/tools/${tool.slug}`);
  const allPaths = [...STATIC_PUBLIC_PATHS, ...toolPaths];

  const seen = new Set<string>();
  const urls: string[] = [];
  for (const path of allPaths) {
    const url = joinUrl(baseUrl, path);
    if (!seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }
  return urls;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return listSitemapUrls(SITEMAP_BASE_URL).map((url) => ({
    url,
    lastModified,
  }));
}
