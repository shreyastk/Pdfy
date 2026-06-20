/**
 * SEO metadata builder for PDFy tool pages.
 *
 * Each tool page is a thin server component that does:
 *
 *   export const metadata = buildToolMetadata(getTool("<slug>")!, SITE_DEFAULTS);
 *
 * `buildToolMetadata` derives a Next.js `Metadata` object from a tool's registry
 * entry, filling site-level defaults for any missing per-tool field, and emitting
 * Open Graph title/description/type, an absolute canonical URL, and exactly one
 * absolute Open Graph image.
 *
 * Invariants (property-tested in task 5.2 / Property 28):
 * - `title` and `description` are always non-empty strings.
 * - `openGraph.url` and `alternates.canonical` are the same absolute canonical URL.
 * - `openGraph.images` always has exactly one entry whose `url` is absolute.
 *
 * NOTE: `SITE_DEFAULTS.baseUrl` is a placeholder (`https://pdfy.app`). No production
 * base URL exists in the repo yet; update this constant once the canonical domain is
 * confirmed.
 *
 * _Requirements: 17.2, 17.3, 17.4_
 */

import type { Metadata } from "next";
import type { SiteDefaults } from "./types";
import type { ToolDefinition } from "./tool-registry";

/**
 * Site-level metadata defaults used to fill any missing per-tool SEO/OG field
 * (Req 17.3). `baseUrl` is used to build absolute canonical/OG URLs.
 *
 * `baseUrl` is a placeholder until the production domain is finalized.
 */
export const SITE_DEFAULTS: SiteDefaults = {
  title: "PDFy — Free, Private, In-Browser PDF Tools",
  description:
    "PDFy is a privacy-first PDF toolkit. Merge, split, compress, convert, and edit PDF files entirely in your browser — nothing is ever uploaded.",
  ogImage: "/logo.png",
  baseUrl: "https://pdfy.app",
};

/** Strip any trailing slashes so URL joining never produces a double slash. */
function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Resolve a possibly-relative asset path against the site base URL, returning an
 * absolute URL. Values that are already absolute (http/https) are returned as-is.
 */
function toAbsoluteUrl(pathOrUrl: string, baseUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  const base = trimTrailingSlash(baseUrl);
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

/** Pick `value` when it is a non-empty (post-trim) string, otherwise `fallback`. */
function fillDefault(value: string | undefined, fallback: string): string {
  return value != null && value.trim().length > 0 ? value : fallback;
}

/**
 * Build the Next.js `Metadata` for a single tool page from its registry entry,
 * filling site defaults for any missing field.
 *
 * - `title` = `tool.seoTitle` (falls back to `siteDefaults.title`).
 * - `description` = `tool.seoDescription` (falls back to `siteDefaults.description`).
 * - `openGraph` emits title/description, `type: "website"`, the absolute canonical
 *   URL, and a single absolute image (`tool.ogImage ?? siteDefaults.ogImage`).
 * - `alternates.canonical` is the same absolute canonical URL.
 *
 * @param tool - the tool's registry definition.
 * @param siteDefaults - site-level defaults filling any missing field.
 * @returns a complete, consistent `Metadata` object.
 */
export function buildToolMetadata(
  tool: ToolDefinition,
  siteDefaults: SiteDefaults
): Metadata {
  const title = fillDefault(tool.seoTitle, siteDefaults.title);
  const description = fillDefault(tool.seoDescription, siteDefaults.description);

  const canonicalUrl = `${trimTrailingSlash(siteDefaults.baseUrl)}/tools/${tool.slug}`;

  const imageUrl = toAbsoluteUrl(
    fillDefault(tool.ogImage, siteDefaults.ogImage),
    siteDefaults.baseUrl
  );

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: canonicalUrl,
      images: [{ url: imageUrl }],
    },
  };
}
