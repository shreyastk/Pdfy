/**
 * Server component for /tools/split. Exports metadata from the tool registry and
 * renders the interactive client UI. See app/tools/merge/page.tsx for the pattern.
 */
import type { Metadata } from "next";
import { buildToolMetadata, SITE_DEFAULTS } from "@/lib/seo";
import { getTool } from "@/lib/tool-registry";
import SplitClient from "./SplitClient";

export const metadata: Metadata = buildToolMetadata(getTool("split")!, SITE_DEFAULTS);

export default function SplitPage() {
  return <SplitClient />;
}
