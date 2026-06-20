/**
 * Recent-files history store (Requirement 14).
 *
 * Records lightweight metadata about files a user has processed so they can be
 * revisited. All data is kept in the user's browser via `localStorage` and is
 * never transmitted anywhere (Req 14.7).
 *
 * The module separates the pure list transformation (`applyEntry`) from the
 * storage-bound operations (`recordEntry`/`listEntries`/`clearHistory`) so the
 * core LRU/truncation/ordering logic can be property-tested without a browser.
 */

/** A single recorded recent-file entry. */
export interface HistoryEntry {
  /** Original file name, truncated to {@link MAX_FILENAME_LENGTH} characters. */
  fileName: string;
  /** The tool the file was processed with. */
  tool: string;
  /** Absolute timestamp (ms since epoch) at which the entry was recorded. */
  timestamp: number;
}

/** Maximum number of characters retained from a file name (Req 14.1). */
export const MAX_FILENAME_LENGTH = 255;

/** Maximum number of entries the store retains (Req 14.2). */
export const MAX_ENTRIES = 50;

/** localStorage key under which the history JSON array is stored. */
export const STORAGE_KEY = "pdfy.history";

/**
 * Pure list transformation applied when recording a new entry.
 *
 * Semantics (Req 14.1, 14.2, 14.3):
 * - Truncates `e.fileName` to a maximum of {@link MAX_FILENAME_LENGTH} characters.
 * - PREPENDS the (truncated) entry to the front of the list so the list stays
 *   ordered most-recent-first.
 * - Caps the resulting list at {@link MAX_ENTRIES} by evicting the least-recent
 *   entries (dropping from the end), so the length never exceeds the cap.
 *
 * Returns a NEW array and never mutates its input.
 *
 * @param entries - the current entries, most-recent first.
 * @param e - the new entry to record.
 * @returns a new, capped, most-recent-first list including the truncated entry.
 */
export function applyEntry(entries: HistoryEntry[], e: HistoryEntry): HistoryEntry[] {
  const truncated: HistoryEntry = {
    fileName: e.fileName.slice(0, MAX_FILENAME_LENGTH),
    tool: e.tool,
    timestamp: e.timestamp,
  };
  // Prepend (most-recent first), then cap by dropping least-recent from the end.
  return [truncated, ...entries].slice(0, MAX_ENTRIES);
}

/**
 * Read and parse the stored entries.
 *
 * Any failure (storage unavailable, malformed JSON, non-array payload) is
 * treated as "no history" and yields an empty array rather than throwing.
 * The stored list is already maintained most-recent-first by {@link applyEntry}.
 *
 * @returns the recorded entries, most-recent first (Req 14.3); `[]` on any error.
 */
export function listEntries(): HistoryEntry[] {
  try {
    if (typeof localStorage === "undefined") {
      return [];
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isHistoryEntry);
  } catch {
    return [];
  }
}

/**
 * Record a new entry into browser-local storage.
 *
 * Reads the current entries, applies {@link applyEntry}, and writes the result
 * back. On any storage failure (storage unavailable or quota exceeded) the
 * previously stored entries are left UNCHANGED and an error is signalled
 * (Req 14.6).
 *
 * @param e - the entry to record.
 * @returns `{ ok: true }` on success, or `{ ok: false, reason: "storage-error" }`.
 */
export function recordEntry(
  e: HistoryEntry,
): { ok: true } | { ok: false; reason: "storage-error" } {
  try {
    if (typeof localStorage === "undefined") {
      return { ok: false, reason: "storage-error" };
    }
    const next = applyEntry(listEntries(), e);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return { ok: true };
  } catch {
    // Write failed (unavailable/quota) -> previously stored entries are untouched.
    return { ok: false, reason: "storage-error" };
  }
}

/**
 * Remove all recorded entries from browser-local storage (Req 14.5).
 * Wrapped in try/catch so a storage failure never throws to the caller.
 */
export function clearHistory(): void {
  try {
    if (typeof localStorage === "undefined") {
      return;
    }
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best-effort clear; nothing else to do if storage is unavailable.
  }
}

/** Runtime guard that a parsed value is a well-formed {@link HistoryEntry}. */
function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.fileName === "string" &&
    typeof v.tool === "string" &&
    typeof v.timestamp === "number"
  );
}
