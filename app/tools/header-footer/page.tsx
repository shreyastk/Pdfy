/**
 * Server component for /tools/header-footer. Exports metadata from the tool registry and
 * renders the interactive client UI. See app/tools/flatten/page.tsx for the pattern.
 */
import type { Metadata } from "next";
import { buildToolMetadata, SITE_DEFAULTS } from "@/lib/seo";
import { getTool } from "@/lib/tool-registry";
import HeaderFooterClient from "./HeaderFooterClient";

export const metadata: Metadata = buildToolMetadata(getTool("header-footer")!, SITE_DEFAULTS);

export default function Page() {
  return <HeaderFooterClient />;
}
