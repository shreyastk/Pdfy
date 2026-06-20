/**
 * Server component for /tools/office.
 *
 * Pattern for all tool pages: keep `page.tsx` a server component that exports
 * `metadata` derived from the tool registry, and render the interactive
 * `"use client"` UI from a sibling client component. A file marked `"use client"`
 * cannot also `export const metadata`, so the two responsibilities are split.
 */
import type { Metadata } from "next";
import { buildToolMetadata, SITE_DEFAULTS } from "@/lib/seo";
import { getTool } from "@/lib/tool-registry";
import OfficeClient from "./OfficeClient";

export const metadata: Metadata = buildToolMetadata(getTool("office")!, SITE_DEFAULTS);

export default function OfficePage() {
  return <OfficeClient />;
}
