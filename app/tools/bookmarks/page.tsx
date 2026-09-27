/**
 * Server component for /tools/bookmarks. Exports metadata from the tool registry and
 * renders the interactive client UI. See app/tools/flatten/page.tsx for the pattern.
 */
import type { Metadata } from "next";
import { buildToolMetadata, SITE_DEFAULTS } from "@/lib/seo";
import { getTool } from "@/lib/tool-registry";
import BookmarksClient from "./BookmarksClient";

export const metadata: Metadata = buildToolMetadata(getTool("bookmarks")!, SITE_DEFAULTS);

export default function Page() {
  return <BookmarksClient />;
}
