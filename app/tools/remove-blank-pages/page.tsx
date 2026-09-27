/**
 * Server component for /tools/remove-blank-pages. Exports metadata from the tool registry and
 * renders the interactive client UI. See app/tools/flatten/page.tsx for the pattern.
 */
import type { Metadata } from "next";
import { buildToolMetadata, SITE_DEFAULTS } from "@/lib/seo";
import { getTool } from "@/lib/tool-registry";
import BlankPagesClient from "./BlankPagesClient";

export const metadata: Metadata = buildToolMetadata(getTool("remove-blank-pages")!, SITE_DEFAULTS);

export default function Page() {
  return <BlankPagesClient />;
}
