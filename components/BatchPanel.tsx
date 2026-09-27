"use client";

import { useCallback, useMemo, useState } from "react";
import {
  runBatch,
  validateBatch,
  zipResults,
  type BatchItem,
  type FileStatus,
} from "@/lib/batch";
import { saveFile } from "@/lib/download";

const ACCENT = "#009966";

export interface BatchPanelProps {
  /** Files the user selected for the batch. */
  files: File[];
  /** The per-file operation applied to each input independently. */
  op: (f: File) => Promise<Uint8Array>;
  /**
   * Optional label for processed outputs' download buttons. Defaults to the
   * source file name.
   */
  archiveName?: string;
}

/** Human-readable copy + accent color per file status (Req 12.3). */
const STATUS_META: Record<
  FileStatus,
  { label: string; dotClass: string; textClass: string }
> = {
  queued: {
    label: "Queued",
    dotClass: "bg-slate-400",
    textClass: "text-slate-500 dark:text-slate-400",
  },
  processing: {
    label: "Processing",
    dotClass: "bg-blue-500 animate-pulse",
    textClass: "text-blue-600 dark:text-blue-400",
  },
  completed: {
    label: "Completed",
    dotClass: "", // uses inline accent style
    textClass: "",
  },
  failed: {
    label: "Failed",
    dotClass: "bg-red-500",
    textClass: "text-red-600 dark:text-red-400",
  },
};

/** Map a batch-validation reason to a user-facing message (Req 12.2). */
function validationMessage(reason: "too-many" | "none" | "too-large"): string {
  switch (reason) {
    case "none":
      return "Select at least one file to start a batch.";
    case "too-many":
      return "Too many files. A batch can contain at most 100 files.";
    case "too-large":
      return "One or more files exceed the 100 MB per-file limit.";
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  saveFile(blob, filename);
}

/**
 * Batch processing panel.
 *
 * Displays each file's current status (queued / processing / completed /
 * failed) and the completed-out-of-total count (Req 12.3). When every file has
 * reached a terminal status it offers an individual download per successful
 * file and a single "download all as archive" action (Req 12.4). A failing file
 * is shown with its reason and never halts the batch (Req 12.5). All work runs
 * in-browser (Req 12.6).
 */
export default function BatchPanel({ files, op, archiveName }: BatchPanelProps) {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = items.length;
  const completedCount = useMemo(
    () => items.filter((item) => item.status === "completed").length,
    [items],
  );
  const allTerminal =
    started &&
    !running &&
    total > 0 &&
    items.every(
      (item) => item.status === "completed" || item.status === "failed",
    );
  const hasSuccess = items.some((item) => item.status === "completed");

  const handleStart = useCallback(async () => {
    const validation = validateBatch(files);
    if (!validation.ok) {
      setError(validationMessage(validation.reason));
      return;
    }

    setError(null);
    setStarted(true);
    setRunning(true);
    try {
      await runBatch(files, op, (updated) => setItems(updated));
    } finally {
      setRunning(false);
    }
  }, [files, op]);

  const handleDownloadItem = useCallback((item: BatchItem) => {
    if (!item.output) return;
    const blob = new Blob([new Uint8Array(item.output)], {
      type: "application/pdf",
    });
    downloadBlob(blob, item.file.name);
  }, []);

  const handleDownloadArchive = useCallback(async () => {
    const blob = await zipResults(items);
    downloadBlob(blob, archiveName ?? "batch-results.zip");
  }, [items, archiveName]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleStart}
          disabled={running || files.length === 0}
          style={{ backgroundColor: ACCENT }}
          className="px-6 py-3 text-white font-semibold rounded-xl transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {running ? "Processing..." : "Start batch"}
        </button>

        {total > 0 && (
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
            {completedCount} / {total} completed
          </span>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-3 px-6 py-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800">
          <div className="w-5 h-5 rounded-full bg-red-500 flex-shrink-0" />
          <span className="text-sm font-medium text-red-700 dark:text-red-300">
            {error}
          </span>
        </div>
      )}

      {total > 0 && (
        <ul className="space-y-2">
          {items.map((item, index) => {
            const meta = STATUS_META[item.status];
            return (
              <li
                key={`${item.file.name}-${index}`}
                className="flex items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-3 h-3 rounded-full flex-shrink-0 ${meta.dotClass}`}
                    style={
                      item.status === "completed"
                        ? { backgroundColor: ACCENT }
                        : undefined
                    }
                  />
                  <div className="min-w-0">
                    <span className="block text-sm text-slate-900 dark:text-slate-100 break-words">
                      {item.file.name}
                    </span>
                    <span
                      className="block text-xs font-medium"
                      style={
                        item.status === "completed"
                          ? { color: ACCENT }
                          : undefined
                      }
                    >
                      <span className={meta.textClass}>{meta.label}</span>
                      {item.status === "failed" && item.error && (
                        <span className="text-red-600 dark:text-red-400">
                          {" "}
                          — {item.error}
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {item.status === "completed" && (
                  <button
                    type="button"
                    onClick={() => handleDownloadItem(item)}
                    style={{ backgroundColor: ACCENT }}
                    className="px-4 py-2 text-sm text-white font-medium rounded-lg transition-all hover:brightness-110 flex-shrink-0"
                  >
                    Download
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {allTerminal && hasSuccess && (
        <button
          type="button"
          onClick={handleDownloadArchive}
          className="w-full px-6 py-3 font-semibold rounded-xl border transition-all hover:brightness-110"
          style={{ borderColor: ACCENT, color: ACCENT }}
        >
          Download all as archive
        </button>
      )}

      {allTerminal && !hasSuccess && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No files were processed successfully.
        </p>
      )}
    </div>
  );
}
