"use client";

import { useCallback, useState } from "react";
import FileUploader from "@/components/FileUploader";
import { comparePdfs } from "@/lib/pdf-compare";
import type { CompareResult, PageStatus } from "@/lib/pdf-compare";
import { getTool } from "@/lib/tool-registry";

const tool = getTool("compare")!;
const ACCENT = "#009966";

/**
 * The four mutually-exclusive states this page can be in, mirroring the shared
 * ToolTemplate four-state model (idle hides the status + result regions).
 */
type CompareStatus = "idle" | "processing" | "success" | "error";

/** Human-readable label for each per-page status. */
const STATUS_LABEL: Record<PageStatus, string> = {
  unchanged: "Unchanged",
  modified: "Modified",
  added: "Added",
  removed: "Removed",
};

/** Tailwind badge classes per status (preserves dark-mode support). */
const STATUS_BADGE: Record<PageStatus, string> = {
  unchanged:
    "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  modified:
    "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  added:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  removed: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
};

/**
 * Interactive UI for /tools/compare.
 *
 * This tool needs exactly two input files and renders a rich comparison view
 * (per-page status, text diffs, and visual regions) rather than a downloadable
 * artifact, so it uses a custom layout that still follows the four-region
 * structure required by Requirement 15 (description -> upload -> status ->
 * result) and preserves the green `#009966` accent + dark-mode styling.
 *
 * Behavior:
 *  - Requires exactly two files; otherwise an error is shown and files retained.
 *  - Calls {@link comparePdfs} with mode `"both"`. That function throws distinct
 *    messages for invalid/corrupt (Req 5.7) and password-protected (Req 5.8)
 *    inputs; those messages are surfaced and the selected files are retained.
 *  - On success renders per-page status (Req 5.1), text diffs (Req 5.2), and any
 *    visual differing regions (Req 5.3), or a clear "no differences" message
 *    when the documents are identical (Req 5.6).
 *  - All processing happens in the browser (Req 5.5).
 */
export default function CompareClient() {
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<CompareStatus>("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<CompareResult | null>(null);

  const handleFilesSelected = useCallback((selected: File[]) => {
    setFiles(selected);
    // Selecting new files resets any prior result/status back to idle.
    setStatus("idle");
    setMessage("");
    setResult(null);
  }, []);

  const handleCompare = useCallback(async () => {
    if (files.length !== 2) {
      // Validation failure -> error state, selected files retained.
      setStatus("error");
      setMessage("Please select exactly two PDF files to compare.");
      return;
    }

    setStatus("processing");
    setMessage("Comparing...");
    setResult(null);

    try {
      // comparePdfs throws distinct messages for invalid/corrupt (Req 5.7) and
      // password-protected (Req 5.8) inputs; let those propagate to the catch.
      const compareResult = await comparePdfs(files[0], files[1], "both");
      setResult(compareResult);
      setStatus("success");
      setMessage("Comparison complete.");
    } catch (error) {
      // Error -> surface the distinct message, KEEP selected files (Req 5.7, 5.8).
      const reason =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while comparing the files.";
      setStatus("error");
      setMessage(reason);
    }
  }, [files]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 pt-24">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Region 1: Description */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-2">
              {tool.name}
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              {tool.description} Select exactly two PDF files to see per-page,
              text, and visual differences.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl dark:shadow-black/30 p-8 mb-6">
            {/* Region 2: Upload area */}
            <FileUploader
              onFilesSelected={handleFilesSelected}
              accept=".pdf"
              multiple
              maxFiles={2}
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

            <button
              type="button"
              onClick={handleCompare}
              disabled={status === "processing"}
              style={{ backgroundColor: ACCENT }}
              className="w-full mt-6 px-6 py-3 text-white font-semibold rounded-xl transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "processing" ? "Comparing..." : "Compare PDFs"}
            </button>

            {/* Region 3: Processing status (hidden when idle - Req 15.4) */}
            {status !== "idle" && (
              <div className="mt-6">
                {status === "processing" && (
                  <div className="flex items-center gap-3 px-6 py-4 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
                    <div
                      className="w-5 h-5 border-2 rounded-full animate-spin border-t-transparent"
                      style={{ borderColor: ACCENT, borderTopColor: "transparent" }}
                    />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {message}
                    </span>
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
                    <span className="text-sm font-medium" style={{ color: ACCENT }}>
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

            {/* Region 4: Result (hidden when idle - Req 15.4) */}
            {status === "success" && result && (
              <CompareResultView result={result} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Renders the comparison result: a clear "no differences" message when the
 * documents are identical (Req 5.6), otherwise the per-page status list
 * (Req 5.1), the per-page text diffs (Req 5.2), and the per-page visual
 * differing regions when present (Req 5.3).
 */
function CompareResultView({ result }: { result: CompareResult }) {
  if (result.identical) {
    return (
      <div className="mt-6">
        <div
          className="rounded-xl border px-6 py-5 text-center"
          style={{
            backgroundColor: "rgba(0, 153, 102, 0.08)",
            borderColor: "rgba(0, 153, 102, 0.4)",
          }}
        >
          <p className="text-lg font-semibold" style={{ color: ACCENT }}>
            No differences found
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            The two documents have no per-page, text, or visual differences.
          </p>
        </div>
      </div>
    );
  }

  const visualWithRegions = (result.visualDiffs ?? []).filter(
    (d) => d.regions.length > 0
  );

  return (
    <div className="mt-6 space-y-6">
      {/* Per-page status (Req 5.1) */}
      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Per-page status
        </h3>
        <ul className="space-y-2">
          {result.pages.map((p) => (
            <li
              key={p.page}
              className="flex items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg"
            >
              <span className="text-sm text-slate-900 dark:text-slate-100">
                Page {p.page}
              </span>
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_BADGE[p.status]}`}
              >
                {STATUS_LABEL[p.status]}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Text diffs (Req 5.2) */}
      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Text differences
        </h3>
        {result.textDiffs.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No text differences were found on the pages present in both
            documents.
          </p>
        ) : (
          <div className="space-y-4">
            {result.textDiffs.map((diff) => (
              <div
                key={diff.page}
                className="rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden"
              >
                <div className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-sm font-medium text-slate-900 dark:text-slate-100">
                  Page {diff.page}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-600">
                  <div className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400 mb-2">
                      Removed ({diff.removed.length})
                    </p>
                    {diff.removed.length === 0 ? (
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        —
                      </p>
                    ) : (
                      <p className="text-sm text-slate-700 dark:text-slate-300 break-words">
                        {diff.removed.join(" ")}
                      </p>
                    )}
                  </div>
                  <div className="p-4">
                    <p
                      className="text-xs font-semibold uppercase tracking-wide mb-2"
                      style={{ color: ACCENT }}
                    >
                      Added ({diff.added.length})
                    </p>
                    {diff.added.length === 0 ? (
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        —
                      </p>
                    ) : (
                      <p className="text-sm text-slate-700 dark:text-slate-300 break-words">
                        {diff.added.join(" ")}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Visual diffs (Req 5.3) */}
      {result.visualDiffs !== undefined && (
        <section className="space-y-3">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Visual differences
          </h3>
          {visualWithRegions.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              No visual differences were detected on the pages present in both
              documents.
            </p>
          ) : (
            <ul className="space-y-2">
              {visualWithRegions.map((diff) => (
                <li
                  key={diff.page}
                  className="flex items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg"
                >
                  <span className="text-sm text-slate-900 dark:text-slate-100">
                    Page {diff.page}
                  </span>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                    {diff.regions.length} differing region
                    {diff.regions.length > 1 ? "s" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
