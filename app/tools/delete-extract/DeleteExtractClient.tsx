"use client";

import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import ToolTemplate from "@/components/ToolTemplate";
import {
  planDeletion,
  planExtraction,
  buildSubsetPdf,
} from "@/lib/page-manager";
import { getTool } from "@/lib/tool-registry";
import type { ToolResult } from "@/lib/types";

const tool = getTool("delete-extract")!;

type Mode = "delete" | "extract";

/** Replace a PDF filename's extension with a mode-specific suffix. */
function outputName(name: string, mode: Mode): string {
  const base = name.replace(/\.pdf$/i, "");
  return `${base}-${mode === "delete" ? "deleted" : "extracted"}.pdf`;
}

/**
 * Parse a free-form page-selection string (e.g. "1,3,5") into a list of 1-based
 * page numbers. Whitespace and empty segments are ignored; non-numeric or
 * non-positive entries are dropped so the planners receive a tolerant set.
 */
function parsePageNumbers(input: string): number[] {
  return input
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => Number(part))
    .filter((n) => Number.isInteger(n) && n >= 1);
}

/**
 * Interactive UI for /tools/delete-extract.
 *
 * Wraps the shared {@link ToolTemplate}. The injected `onRun`:
 *  - reads the source page count via pdf-lib,
 *  - parses the user's 1-based page selection,
 *  - plans the operation with {@link planDeletion} / {@link planExtraction},
 *  - surfaces guard errors (`none-selected` / `all-selected`) as thrown
 *    messages so the template keeps the original document (Req 6.4, 6.5),
 *  - otherwise builds the subset PDF with {@link buildSubsetPdf}.
 *
 * All work runs in-browser (Req 6.3).
 */
export default function DeleteExtractClient() {
  const [mode, setMode] = useState<Mode>("delete");
  const [pagesInput, setPagesInput] = useState("");

  const onRun = async (files: File[]): Promise<ToolResult> => {
    const file = files[0];

    // Read the total page count from the source document (in-browser).
    const arrayBuffer = await file.arrayBuffer();
    const srcPdf = await PDFDocument.load(arrayBuffer);
    const totalPages = srcPdf.getPageCount();

    const selected = parsePageNumbers(pagesInput);

    const plan =
      mode === "delete"
        ? planDeletion(totalPages, selected)
        : planExtraction(totalPages, selected);

    if ("error" in plan) {
      // Guard cases -> clear error, original document retained by template.
      if (plan.error === "none-selected") {
        // Req 6.4: a valid page selection is required.
        throw new Error(
          `No valid pages selected. Enter page numbers between 1 and ${totalPages} (for example "1,3,5").`,
        );
      }
      // Req 6.5: deleting every page would leave an empty document.
      throw new Error(
        "You selected every page for deletion, which would leave an empty document. Keep at least one page.",
      );
    }

    const data = await buildSubsetPdf(file, plan.keepIndices);

    return {
      downloads: [
        {
          filename: outputName(file.name, mode),
          data,
        },
      ],
    };
  };

  const inputClass =
    "w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none";

  return (
    <ToolTemplate
      title={tool.name}
      description={tool.description}
      accept=".pdf"
      multiple={false}
      onRun={onRun}
      runLabel={mode === "delete" ? "Delete Pages" : "Extract Pages"}
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Mode
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("delete")}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                mode === "delete"
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600"
              }`}
            >
              Delete selected pages
            </button>
            <button
              type="button"
              onClick={() => setMode("extract")}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                mode === "extract"
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600"
              }`}
            >
              Extract selected pages
            </button>
          </div>
        </div>

        <div>
          <label
            htmlFor="page-selection"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
          >
            Page numbers
          </label>
          <input
            id="page-selection"
            type="text"
            inputMode="numeric"
            value={pagesInput}
            onChange={(e) => setPagesInput(e.target.value)}
            placeholder="e.g. 1,3,5"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {mode === "delete"
              ? "These pages will be removed; the rest are kept."
              : "Only these pages will be kept in the output."}
          </p>
        </div>
      </div>
    </ToolTemplate>
  );
}
