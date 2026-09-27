"use client";

import { useState } from "react";
import FileUploader from "@/components/FileUploader";
import ToolShell, { ui } from "@/components/ToolShell";
import { readOutline, validateOutline, writeOutline, type OutlineEntry } from "@/lib/bookmarks";
import { saveFile } from "@/lib/download";
import { getTool } from "@/lib/tool-registry";

const tool = getTool("bookmarks")!;

const REASONS = {
  "empty-title": "needs a title",
  "bad-page": "points to a page that doesn't exist",
  "bad-level": "is indented more than one level below the bookmark above it",
} as const;

export default function BookmarksClient() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [entries, setEntries] = useState<OutlineEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const onFiles = async (files: File[]) => {
    const f = files[0];
    setFile(f ?? null);
    setLoaded(false);
    setError("");
    setDone("");
    if (!f) return;
    try {
      const r = await readOutline(f);
      setEntries(r.entries);
      setPageCount(r.pageCount);
      setLoaded(true);
    } catch {
      setError("Could not read this PDF. It may be encrypted or damaged.");
    }
  };

  const update = (i: number, patch: Partial<OutlineEntry>) =>
    setEntries((list) => list.map((e, j) => (j === i ? { ...e, ...patch } : e)));

  const move = (i: number, delta: -1 | 1) =>
    setEntries((list) => {
      const j = i + delta;
      if (j < 0 || j >= list.length) return list;
      const next = list.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const remove = (i: number) =>
    setEntries((list) =>
      list
        .filter((_, j) => j !== i)
        // Children of the removed item move up a level so the outline stays valid.
        .map((e, j, arr) => (j === 0 ? { ...e, level: 0 } : { ...e, level: Math.min(e.level, arr[j - 1].level + 1) })),
    );

  const add = () =>
    setEntries((list) => [
      ...list,
      { title: "New bookmark", page: Math.min(pageCount - 1, (list[list.length - 1]?.page ?? -1) + 1), level: 0 },
    ]);

  const check = validateOutline(entries, pageCount);

  const save = async () => {
    if (!file || !check.ok) return;
    setBusy(true);
    setError("");
    setDone("");
    try {
      const bytes = await writeOutline(file, entries);
      saveFile(bytes, file.name.replace(/\.pdf$/i, "") + "-bookmarks.pdf", "application/pdf");
      setDone(entries.length ? `Saved ${entries.length} bookmark${entries.length === 1 ? "" : "s"}.` : "All bookmarks removed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolShell title={tool.name} description={tool.description}>
      <FileUploader onFilesSelected={onFiles} />
      {error && <p className={ui.error}>{error}</p>}

      {loaded && (
        <>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Bookmarks <span className="text-sm font-normal text-slate-500">({pageCount} pages)</span>
            </h2>
            <div className="flex gap-2">
              {entries.length > 0 && (
                <button type="button" className={ui.secondary} onClick={() => setEntries([])}>
                  Remove all
                </button>
              )}
              <button type="button" className={ui.secondary} onClick={add}>
                + Add
              </button>
            </div>
          </div>

          {entries.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              This PDF has no bookmarks. Add some to create a clickable table of contents.
            </p>
          ) : (
            <ul className="space-y-2">
              {entries.map((e, i) => (
                <li
                  key={i}
                  className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 dark:bg-slate-700/50 p-2"
                  style={{ marginLeft: `${Math.min(e.level, 6) * 1.25}rem` }}
                >
                  <input
                    aria-label={`Bookmark ${i + 1} title`}
                    className={`${ui.input} flex-1 min-w-[10rem]`}
                    value={e.title}
                    onChange={(ev) => update(i, { title: ev.target.value })}
                  />
                  <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                    Page
                    <input
                      type="number"
                      min={1}
                      max={pageCount}
                      aria-label={`Bookmark ${i + 1} page`}
                      className={`${ui.input} w-20`}
                      value={e.page + 1}
                      onChange={(ev) => update(i, { page: (Number(ev.target.value) || 1) - 1 })}
                    />
                  </label>
                  <div className="flex gap-1">
                    <button type="button" className={ui.secondary} aria-label="Outdent" disabled={e.level === 0} onClick={() => update(i, { level: e.level - 1 })}>←</button>
                    <button type="button" className={ui.secondary} aria-label="Indent" disabled={i === 0 || e.level > entries[i - 1].level} onClick={() => update(i, { level: e.level + 1 })}>→</button>
                    <button type="button" className={ui.secondary} aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                    <button type="button" className={ui.secondary} aria-label="Move down" disabled={i === entries.length - 1} onClick={() => move(i, 1)}>↓</button>
                    <button type="button" className={ui.secondary} aria-label="Delete" onClick={() => remove(i)}>✕</button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {!check.ok && (
            <p className={ui.error}>
              Bookmark {check.index + 1} {REASONS[check.reason]}.
            </p>
          )}
          <button type="button" className={`${ui.primary} w-full`} disabled={busy || !check.ok} onClick={save}>
            Save bookmarks
          </button>
          {done && <p className={ui.success}>{done}</p>}
        </>
      )}
    </ToolShell>
  );
}
