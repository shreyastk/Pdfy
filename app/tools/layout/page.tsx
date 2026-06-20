/**
 * Server component for /tools/layout. Exports metadata from the tool registry and
 * renders the interactive client UI. See app/tools/split/page.tsx for the pattern.
 */
import type { Metadata } from "next";
import { buildToolMetadata, SITE_DEFAULTS } from "@/lib/seo";
import { getTool } from "@/lib/tool-registry";
import LayoutClient from "./LayoutClient";

export const metadata: Metadata = buildToolMetadata(getTool("layout")!, SITE_DEFAULTS);

export default function LayoutPage() {
  return <LayoutClient />;
}
