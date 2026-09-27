"use client";

import { useCallback, useRef, useState } from "react";
import FileUploader from "@/components/FileUploader";
import { guessMime, saveFile } from "@/lib/download";
import type { Progress, ToolResult, Download } from "@/lib/types";

/**
 * The four mutually-exclusive processing states a Tool_Page can be in.
 * `idle` hides both the status and result regions (Req 15.4).
 */
export type ToolStatus = "idle" | "processing" | "success" | "error";

export interface ToolTemplateProps {
  /** Page title shown in the description region. */
  title: string;
  /** One-line description shown beneath the title. */
  description: string;
  /** Accepted file types passed to the uploader (defaults to ".pdf"). */
  accept?: string;
  /** Whether multiple files may be selected. */
  multiple?: boolean;
  /**
   * The tool-specific operation. Receives the selected files and a progress
   * reporter, performs all work in-browser (Req 15.7), and resolves with the
   * downloadable result. Throwing (or rejecting) drives the error state.
   *
   * `signal` is aborted when the user presses Cancel. Long-running tools
   * should check it between steps and stop early; either way the template
   * discards the result of a cancelled run.
   */
  onRun: (
    files: File[],
    onProgress: (p: Progress) => void,
    signal: AbortSignal,
  ) => Promise<ToolResult>;
  /** Tool-specific controls rendered inside the upload region. */
  children?: React.ReactNode;
  /** Optional label for the run button (defaults to "Run"). */
  runLabel?: string;
  /** Extra tool-specific content shown in the result region (e.g. a preview). */
  resultExtra?: React.ReactNode;
}

const ACCENT = "#009966";

/** Resolve a {@link Download}'s payload into a Blob for object-URL creation. */
function toBlob(download: Download): Blob {
  if (download.data instanceof Blob) {
    return download.data;
  }
  // Uint8Array -> Blob, typed from the filename extension.
  return new Blob([download.data as BlobPart], { type: guessMime(download.filename) });
}

/**
 * Reusable tool-page layout enforcing the four-region structure required by
 * Requirement 15: description -> upload area -> processing status -> result.
 *
 * The component owns the four-state model and the selected-file list; the
 * actual processing logic is injected via `onRun`. It preserves the existing
 * visual identity (green `#009966` accent) and supports dark mode via Tailwind
 * `dark:` variants.
 */
export default function ToolTemplate({
  title,
  description,
  accept = ".pdf",
  multiple = false,
  onRun,
  children,
  runLabel = "Run",
  resultExtra,
}: ToolTemplateProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<ToolStatus>("idle");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<ToolResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleFilesSelected = useCallback((selected: File[]) => {
    setFiles(selected);
    // Selecting new files resets any prior result/status back to idle.
    setStatus("idle");
    setMessage("");
    setProgress(null);
    setResult(null);
  }, []);

  const handleRun = useCallback(async () => {
    if (files.length === 0) {
      // Validation failure -> error state, selected files retained (Req 15.6).
      setStatus("error");
      setMessage("Please select at least one file.");
      return;
    }

    setStatus("processing");
    setMessage("Processing...");
    setProgress(null);
    setResult(null);

    const controller = new AbortController();
    abortRef.current = controller;
    const cancelled = () => controller.signal.aborted || abortRef.current !== controller;

    try {
      const toolResult = await onRun(
        files,
        (p) => !cancelled() && setProgress(p),
        controller.signal,
      );
      if (cancelled()) return;
      // Success -> show result/download region (Req 15.5).
      setResult(toolResult);
      setStatus("success");
      setMessage("Done.");
    } catch (error) {
      if (cancelled()) return;
      // Error -> show message, KEEP selected files (Req 15.6).
      const reason =
        error instanceof Error ? error.message : "An unexpected error occurred.";
      setStatus("error");
      setMessage(reason);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [files, onRun]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
    setMessage("");
    setProgress(null);
  }, []);

  const handleDownload = useCallback((download: Download) => {
    saveFile(toBlob(download), download.filename);
  }, []);

  const progressPct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 pt-24">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Region 1: Description */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-2">
              {title}
            </h1>
            <p className="text-slate-600 dark:text-slate-400">{description}</p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl dark:shadow-black/30 p-8 mb-6">
            {/* Region 2: Upload area (with tool-specific controls) */}
            <FileUploader
              onFilesSelected={handleFilesSelected}
              accept={accept}
              multiple={multiple}
            />

            {files.length > 0 && (
              <div className="mt-6 space-y-2">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Selected File{files.length > 1 ? "s" : ""} ({files.length})
                </h3>
                <ul className="space-y-2">
                  {files.map((file, index) => (
                    <li
                      key={`${file.name}-${index}`}
                      className="flex items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg"
                    >
                      <span className="text-sm text-slate-900 dark:text-slate-100 break-words min-w-0">
                        {file.name}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">
                        {(file.size / 1024).toFixed(1)} KB
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Tool-specific controls */}
            {children && <div className="mt-6">{children}</div>}

            <button
              type="button"
              onClick={handleRun}
              disabled={status === "processing"}
              style={{ backgroundColor: ACCENT }}
              className="w-full mt-6 px-6 py-3 text-white font-semibold rounded-xl transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "processing" ? "Processing..." : runLabel}
            </button>

            {/* Region 3: Processing status (hidden when idle - Req 15.4) */}
            {status !== "idle" && (
              <div className="mt-6">
                {status === "processing" && (
                  <div className="flex flex-col gap-3 px-6 py-4 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-5 h-5 border-2 rounded-full animate-spin border-t-transparent"
                        style={{ borderColor: ACCENT, borderTopColor: "transparent" }}
                      />
                      <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                        {progress?.label || message}
                      </span>
                      <button
                        type="button"
                        onClick={handleCancel}
                        className="px-3 py-1 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-500 text-slate-600 dark:text-slate-300 hover:border-red-400 hover:text-red-600"
                      >
                        Cancel
                      </button>
                    </div>
                    {progressPct !== null && (
                      <div className="w-full">
                        <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-600 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${progressPct}%`, backgroundColor: ACCENT }}
                          />
                        </div>
                        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                          {progress?.current} / {progress?.total} ({progressPct}%)
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {status === "success" && (
                  <div
                    className="flex items-center gap-3 px-6 py-4 rounded-xl border"
                    style={{
                      backgroundColor: "rgba(0, 153, 102, 0.1)",
                      borderColor: "rgba(0, 153, 102, 0.4)",
                    }}
                  >
                    <div
                      className="w-5 h-5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: ACCENT }}
                    />
                    <span
                      className="text-sm font-medium"
                      style={{ color: ACCENT }}
                    >
                      {message}
                    </span>
                  </div>
                )}

                {status === "error" && (
                  <div className="flex items-center gap-3 px-6 py-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800">
                    <div className="w-5 h-5 rounded-full bg-red-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-red-700 dark:text-red-300">
                      {message}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Region 4: Result / download (hidden when idle - Req 15.4) */}
            {status === "success" && result && (
              <div className="mt-6 space-y-4">
                {result.notices && result.notices.length > 0 && (
                  <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-6 py-4">
                    <ul className="list-disc list-inside space-y-1">
                      {result.notices.map((notice, i) => (
                        <li
                          key={i}
                          className="text-sm text-amber-800 dark:text-amber-300"
                        >
                          {notice}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {resultExtra}

                {result.downloads.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Result{result.downloads.length > 1 ? "s" : ""}
                  </h3>
                  {result.downloads.map((download, i) => (
                    <div
                      key={`${download.filename}-${i}`}
                      className="flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg"
                    >
                      <span className="text-sm text-slate-900 dark:text-slate-100 break-words min-w-0">
                        {download.filename}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDownload(download)}
                        style={{ backgroundColor: ACCENT }}
                        className="px-4 py-2 text-sm text-white font-medium rounded-lg transition-all hover:brightness-110 flex-shrink-0"
                      >
                        Download
                      </button>
                    </div>
                  ))}
                </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
