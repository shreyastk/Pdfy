/**
 * Server component for /tools/grayscale. Exports metadata from the tool registry and
 * renders the interactive client UI. See app/tools/flatten/page.tsx for the pattern.
 */
import type { Metadata } from "next";
import { buildToolMetadata, SITE_DEFAULTS } from "@/lib/seo";
import { getTool } from "@/lib/tool-registry";
import GrayscaleClient from "./GrayscaleClient";

export const metadata: Metadata = buildToolMetadata(getTool("grayscale")!, SITE_DEFAULTS);

export default function Page() {
  return <GrayscaleClient />;
}
