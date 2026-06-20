"use client";

import ToolTemplate from "@/components/ToolTemplate";
import { runOcr } from "@/lib/ocr-engine";
import { getTool } from "@/lib/tool-registry";
import type { Progress, ToolResult } from "@/lib/types";

const tool = getTool("ocr")!;

/** Replace a PDF filename's extension with `-ocr.pdf`. */
function ocrName(name: string): string {
  const base = name.replace(/\.pdf$/i, "");
  return `${base}-ocr.pdf`;
}

/**
 * Interactive UI for /tools/ocr.
 *
 * Wraps the shared {@link ToolTemplate}. The injected `onRun` calls
 * {@link runOcr} on the single uploaded file and maps its model onto the
 * template's success/error/progress model:
 *
 * - Per-page progress `{ page, total, pct }` is mapped to the template's
 *   `{ current, total, label }` so the status region shows page/total/percent
 *   (Req 2.3).
 * - `runOcr` throws `ERR_INVALID_PDF` for unreadable files (Req 2.6) and
 *   `ERR_ENGINE_FAILED` if the WASM engine fails to load (Req 2.7). These
 *   propagate to the template, which surfaces the message and retains the file.
 * - On success it returns `{ pdf, pagesWithNoText }`; we resolve with a single
 *   download named `<original>-ocr.pdf` plus a notice listing any pages that
 *   yielded no recognized text (Req 2.5).
 */
export default function OcrClient() {
  const onRun = async (
    files: File[],
    onProgress: (p: Progress) => void,
  ): Promise<ToolResult> => {
    const file = files[0];

    const { pdf, pagesWithNoText } = await runOcr(file, (p) => {
      // Map OCR's per-page progress onto the template's progress model so the
      // status region shows page / total / percent (Req 2.3).
      onProgress({
        current: p.page,
        total: p.total,
        label: `Page ${p.page} of ${p.total} (${p.pct}%)`,
      });
    });

    return {
      downloads: [
        {
          filename: ocrName(file.name),
          data: pdf,
        },
      ],
      notices: pagesWithNoText.length
        ? [`No recognized text on page(s): ${pagesWithNoText.join(", ")}`]
        : [],
    };
  };

  return (
    <ToolTemplate
      title={tool.name}
      description={tool.description}
      accept=".pdf"
      multiple={false}
      onRun={onRun}
      runLabel="Run OCR"
    />
  );
}
