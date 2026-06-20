"use client";

import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import ToolTemplate from "@/components/ToolTemplate";
import { buildNup, buildBooklet, type NupCount } from "@/lib/layout-tool";
import { getTool } from "@/lib/tool-registry";
import type { ToolResult } from "@/lib/types";

const tool = getTool("layout")!;

/** The two layout modes this tool exposes. */
type LayoutType = "nup" | "booklet";

/** Supported N-up pages-per-sheet counts (Req 8.1). */
const NUP_COUNTS: readonly NupCount[] = [2, 4, 6, 8, 9, 16];

/** Replace a PDF filename's extension with the given layout suffix. */
function layoutName(name: string, suffix: "layout" | "booklet"): string {
  const base = name.replace(/\.pdf$/i, "");
  return `${base}-${suffix}.pdf`;
}

/**
 * Interactive UI for /tools/layout.
 *
 * Wraps the shared {@link ToolTemplate} and renders layout controls in the
 * template's children region: a layout-type selector (N-up vs booklet) and,
 * for N-up, a pages-per-sheet selector constrained to {@link NUP_COUNTS}.
 *
 * The injected `onRun` performs everything in the browser (Req 8.4):
 * 1. Loads the single uploaded file with pdf-lib and checks its page count;
 *    if the document has zero pages (or cannot be opened), it throws a clear
 *    error so the template surfaces it and retains the file (Req 8.7).
 * 2. For N-up it calls {@link buildNup}; for booklet it calls
 *    {@link buildBooklet}.
 * 3. Resolves with a single download named `<base>-layout.pdf` (N-up) or
 *    `<base>-booklet.pdf` (booklet).
 */
export default function LayoutClient() {
  const [layoutType, setLayoutType] = useState<LayoutType>("nup");
  const [nupCount, setNupCount] = useState<NupCount>(4);

  const onRun = async (files: File[]): Promise<ToolResult> => {
    const file = files[0];

    // Validate page count entirely in-browser before imposing (Req 8.7).
    let pageCount = 0;
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer);
      pageCount = pdf.getPageCount();
    } catch {
      // An unreadable/empty document yields no usable pages.
      throw new Error("A document with at least one page is required.");
    }

    if (pageCount === 0) {
      throw new Error("A document with at least one page is required.");
    }

    if (layoutType === "booklet") {
      const data = await buildBooklet(file);
      return {
        downloads: [{ filename: layoutName(file.name, "booklet"), data }],
      };
    }

    const data = await buildNup(file, nupCount);
    return {
      downloads: [{ filename: layoutName(file.name, "layout"), data }],
    };
  };

  return (
    <ToolTemplate
      title={tool.name}
      description={tool.description}
      accept=".pdf"
      multiple={false}
      onRun={onRun}
      runLabel="Create Layout"
    >
      <div className="space-y-4">
        {/* Layout-type selector */}
        <div>
          <label
            htmlFor="layout-type"
            className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1"
          >
            Layout type
          </label>
          <select
            id="layout-type"
            value={layoutType}
            onChange={(e) => setLayoutType(e.target.value as LayoutType)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
          >
            <option value="nup">N-up (multiple pages per sheet)</option>
            <option value="booklet">Booklet (two-up center fold)</option>
          </select>
        </div>

        {/* Pages-per-sheet selector (N-up only) */}
        {layoutType === "nup" && (
          <div>
            <label
              htmlFor="nup-count"
              className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1"
            >
              Pages per sheet
            </label>
            <select
              id="nup-count"
              value={nupCount}
              onChange={(e) => setNupCount(Number(e.target.value) as NupCount)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            >
              {NUP_COUNTS.map((count) => (
                <option key={count} value={count}>
                  {count} pages
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </ToolTemplate>
  );
}
