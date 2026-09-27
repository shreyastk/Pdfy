/**
 * Server component for /tools/batch. Exports metadata from the tool registry and
 * renders the interactive client UI. See app/tools/flatten/page.tsx for the pattern.
 */
import type { Metadata } from "next";
import { buildToolMetadata, SITE_DEFAULTS } from "@/lib/seo";
import { getTool } from "@/lib/tool-registry";
import BatchClient from "./BatchClient";

export const metadata: Metadata = buildToolMetadata(getTool("batch")!, SITE_DEFAULTS);

export default function Page() {
  return <BatchClient />;
}
