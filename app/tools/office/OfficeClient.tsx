"use client";

import { useState } from "react";
import ToolTemplate from "@/components/ToolTemplate";
import {
  detectSourceFormat,
  officeToPdf,
  pdfToOffice,
  type OfficeFormat,
} from "@/lib/office-converter";
import { getTool } from "@/lib/tool-registry";
import type { Progress, ToolResult } from "@/lib/types";

const tool = getTool("office")!;

/** Error shown when an uploaded file is neither a PDF nor a supported Office file. */
const ERR_UNSUPPORTED =
  "Unsupported file format. Upload a PDF (.pdf) or an Office file (.docx, .xlsx, .pptx).";

/** Human-readable labels for the PDF → Office target selector. */
const TARGET_OPTIONS: { value: OfficeFormat; label: string }[] = [
  { value: "docx", label: "Word (.docx)" },
  { value: "xlsx", label: "Excel (.xlsx)" },
  { value: "pptx", label: "PowerPoint (.pptx)" },
];

/**
 * Interactive UI for /tools/office.
 *
 * Wraps the shared {@link ToolTemplate}. The converter is bidirectional, so the
 * direction is inferred from the uploaded file via {@link detectSourceFormat}:
 *
 * - PDF source  -> {@link pdfToOffice} into the chosen target Office format.
 * - Office source -> {@link officeToPdf}.
 * - unknown source -> a clear unsupported-format error (Req 1.6), surfaced by the
 *   template, which retains the selected file.
 *
 * The library reports progress as a percentage at start / 50 / 100; that is mapped
 * onto the template's {@link Progress} shape. ToolTemplate's spinner provides a
 * continuous indicator between those points, satisfying the ≥2s progress
 * requirement (Req 1.4).
 *
 * On success the library's `fidelityNotices` are returned as `notices` so the
 * template renders them in the result region BEFORE the download button (Req 1.5).
 * Notices and downloads are independent fields of {@link ToolResult} and the
 * template always renders downloads, so a failure to surface the notice can never
 * block the download (Req 1.8).
 */
export default function OfficeClient() {
  const [target, setTarget] = useState<OfficeFormat>("docx");

  const onRun = async (
    files: File[],
    onProgress: (p: Progress) => void,
  ): Promise<ToolResult> => {
    const file = files[0];

    // Map the library's percentage callback onto the template's Progress shape.
    // The spinner stays animated between the start/50/100 reports (Req 1.4).
    const onPct = (pct: number) =>
      onProgress({ current: pct, total: 100, label: `Converting... ${pct}%` });

    const source = detectSourceFormat(file);

    // Gating errors (unsupported / too-large) thrown by the library propagate to
    // the template, which shows the message and keeps the selected file.
    let result;
    if (source === "pdf") {
      result = await pdfToOffice(file, target, onPct);
    } else if (source === "docx" || source === "xlsx" || source === "pptx") {
      result = await officeToPdf(file, onPct);
    } else {
      // Unknown source: fail fast with a clear, actionable message (Req 1.6).
      throw new Error(ERR_UNSUPPORTED);
    }

    // `notices` (fidelity limitations) are surfaced before the download in the
    // result region. They are independent of `downloads`, so even if rendering a
    // notice failed the download would still be offered (Req 1.5, Req 1.8).
    return {
      downloads: [{ filename: result.filename, data: result.data }],
      notices: result.fidelityNotices,
    };
  };

  return (
    <ToolTemplate
      title={tool.name}
      description={tool.description}
      accept=".pdf,.docx,.xlsx,.pptx"
      multiple={false}
      onRun={onRun}
      runLabel="Convert"
    >
      {/* Direction/target control. The target only applies when the source is a
          PDF; for an Office source the conversion always targets PDF. */}
      <div className="space-y-2">
        <label
          htmlFor="office-target"
          className="block text-sm font-medium text-slate-700 dark:text-slate-200"
        >
          When converting a PDF, convert to:
        </label>
        <select
          id="office-target"
          value={target}
          onChange={(e) => setTarget(e.target.value as OfficeFormat)}
          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#009966]"
        >
          {TARGET_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Uploading a Word, Excel, or PowerPoint file converts it to PDF
          automatically.
        </p>
      </div>
    </ToolTemplate>
  );
}
