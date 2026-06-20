/**
 * Server component for /tools/compress. Exports metadata from the tool registry and
 * renders the interactive client UI. See app/tools/merge/page.tsx for the pattern.
 */
import type { Metadata } from "next";
import { buildToolMetadata, SITE_DEFAULTS } from "@/lib/seo";
import { getTool } from "@/lib/tool-registry";
import CompressClient from "./CompressClient";

export const metadata: Metadata = buildToolMetadata(getTool("compress")!, SITE_DEFAULTS);

export default function CompressPage() {
  return <CompressClient />;
}
