"use client";

import { useState } from "react";
import FileUploader from "@/components/FileUploader";
import ToolShell, { ui } from "@/components/ToolShell";
import { findBlankPages, removePages, type Sensitivity } from "@/lib/blank-pages";
import { saveFile } from "@/lib/download";
import { getTool } from "@/lib/tool-registry";

const tool = getTool("remove-blank-pages")!;

const LEVELS: { value: Sensitivity; label: string }[] = [
  { value: "strict", label: "Only completely empty pages" },
  { value: "normal", label: "Empty pages and faint marks (recommended)" },
  { value: "lenient", label: "Also noisy scanned blanks" },
];

export default function BlankPagesClient() {
  const [file, setFile] = useState<File | null>(null);
  const [sensitivity, setSensitivity] = useState<Sensitivity>("normal");
  const [scan, setScan] = useState<{ pageCount: number; blank: number[] } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const reset = () => {
    setScan(null);
    setError("");
    setDone("");
  };

  const detect = async () => {
    if (!file) return;
    reset();
    setBusy(true);
    try {
      const r = await findBlankPages(file, sensitivity, (c, t) => setProgress(`Checking page ${c} of ${t}…`));
      setScan(r);
      setSelected(new Set(r.blank));
    } catch {
      setError("Could not read this PDF. It may be encrypted or damaged.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const apply = async () => {
    if (!file || !scan) return;
    setBusy(true);
    setError("");
    try {
      const bytes = await removePages(file, scan.pageCount, [...selected]);
      saveFile(bytes, file.name.replace(/\.pdf$/i, "") + "-no-blanks.pdf", "application/pdf");
      setDone(`Removed ${selected.size} page${selected.size === 1 ? "" : "s"}; ${scan.pageCount - selected.size} remain.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (i: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <ToolShell title={tool.name} description={tool.description}>
      <FileUploader
        onFilesSelected={(files) => {
          setFile(files[0] ?? null);
          reset();
        }}
      />

      {file && (
        <>
          <fieldset className="space-y-2">
            <legend className={ui.label}>What counts as blank?</legend>
            {LEVELS.map((l) => (
              <label key={l.value} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input type="radio" name="sens" checked={sensitivity === l.value} onChange={() => setSensitivity(l.value)} />
                {l.label}
              </label>
            ))}
          </fieldset>
          <button type="button" className={`${ui.primary} w-full`} disabled={busy} onClick={detect}>
            {progress || "Find blank pages"}
          </button>
        </>
      )}

      {error && <p className={ui.error}>{error}</p>}

      {scan && (
        scan.blank.length === 0 ? (
          <p className={ui.success}>No blank pages found in {scan.pageCount} pages.</p>
        ) : (
          <>
            <p className="text-sm text-slate-700 dark:text-slate-200">
              Found {scan.blank.length} blank page{scan.blank.length === 1 ? "" : "s"}. Untick any you want to keep:
            </p>
            <div className="flex flex-wrap gap-2">
              {scan.blank.map((i) => (
                <label
                  key={i}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm cursor-pointer ${
                    selected.has(i) ? "border-red-300 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300" : "border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300"
                  }`}
                >
                  <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
                  Page {i + 1}
                </label>
              ))}
            </div>
            <button type="button" className={`${ui.primary} w-full`} disabled={busy || selected.size === 0} onClick={apply}>
              Remove {selected.size} page{selected.size === 1 ? "" : "s"}
            </button>
          </>
        )
      )}
      {done && <p className={ui.success}>{done}</p>}
    </ToolShell>
  );
}
