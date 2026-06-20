"use client";

import { useCallback, useEffect, useState } from "react";
import {
  clearHistory,
  listEntries,
  type HistoryEntry,
} from "@/lib/history-store";

const ACCENT = "#009966";

/**
 * Format an absolute timestamp into a human-readable date and time (Req 14.3).
 * Falls back to a raw locale string if Intl options are unavailable.
 */
function formatTimestamp(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return new Date(timestamp).toString();
  }
}

/**
 * Recent-files view (Requirement 14).
 *
 * Renders the recorded history entries ordered most-recent first (Req 14.3),
 * shows an empty-state message when there are no entries (Req 14.4), and
 * provides a clear-history action that wipes storage and reveals the empty
 * state (Req 14.5). All data is read from the browser-local history store; no
 * network access occurs (Req 14.7).
 */
export default function RecentFiles() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  // Load entries after mount (localStorage is only available client-side).
  useEffect(() => {
    setEntries(listEntries());
  }, []);

  const handleClear = useCallback(() => {
    clearHistory();
    setEntries([]);
  }, []);

  return (
    <section className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl dark:shadow-black/30 p-6">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Recent Files
        </h2>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 transition-colors hover:border-red-300 hover:text-red-600 dark:hover:text-red-400"
          >
            Clear history
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
          No recent files yet. Files you process will appear here.
        </p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry, index) => (
            <li
              key={`${entry.timestamp}-${index}`}
              className="flex items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 break-words">
                  {entry.fileName}
                </p>
                <p className="text-xs" style={{ color: ACCENT }}>
                  {entry.tool}
                </p>
              </div>
              <time
                dateTime={new Date(entry.timestamp).toISOString()}
                className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0 text-right"
              >
                {formatTimestamp(entry.timestamp)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
