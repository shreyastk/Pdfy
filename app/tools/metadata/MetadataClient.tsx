"use client";

import { useState } from "react";
import FileUploader from "@/components/FileUploader";
import ToolShell, { ui } from "@/components/ToolShell";
import { saveFile } from "@/lib/download";
import {
  EMPTY_FIELDS,
  readMetadata,
  stripMetadata,
  writeMetadata,
  type MetadataFields,
  type MetadataReport,
} from "@/lib/metadata";
import { getTool } from "@/lib/tool-registry";

const tool = getTool("metadata")!;

const FIELDS: { key: keyof MetadataFields; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "author", label: "Author" },
  { key: "subject", label: "Subject" },
  { key: "keywords", label: "Keywords (comma separated)" },
  { key: "creator", label: "Creator (app that made it)" },
  { key: "producer", label: "Producer (PDF library)" },
];

const fmtDate = (d: Date | null) => (d ? d.toLocaleString() : "—");

export default function MetadataClient() {
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<MetadataReport | null>(null);
  const [fields, setFields] = useState<MetadataFields>(EMPTY_FIELDS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const onFiles = async (files: File[]) => {
    const f = files[0];
    setFile(f ?? null);
    setReport(null);
    setError("");
    setDone("");
    if (!f) return;
    try {
      const r = await readMetadata(f);
      setReport(r);
      setFields(r.fields);
    } catch {
      setError("Could not read this PDF. It may be encrypted or damaged — try Unlock PDF or Repair PDF first.");
    }
  };

  const run = async (kind: "save" | "strip") => {
    if (!file) return;
    setBusy(true);
    setError("");
    setDone("");
    try {
      const bytes = kind === "save" ? await writeMetadata(file, fields) : await stripMetadata(file);
      const base = file.name.replace(/\.pdf$/i, "");
      saveFile(bytes, `${base}-${kind === "save" ? "edited" : "clean"}.pdf`, "application/pdf");
      setDone(kind === "save" ? "Metadata updated." : "All metadata removed (Info dictionary, XMP and edit history).");
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

      {report && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div><span className={ui.label}>Pages</span>{report.pageCount}</div>
            <div><span className={ui.label}>Created</span>{fmtDate(report.creationDate)}</div>
            <div><span className={ui.label}>Modified</span>{fmtDate(report.modificationDate)}</div>
            <div>
              <span className={ui.label}>Hidden data</span>
              {[report.hasXmp && "XMP packet", report.hasPieceInfo && "Edit history"].filter(Boolean).join(", ") || "None found"}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label className={ui.label} htmlFor={`md-${key}`}>{label}</label>
                <input
                  id={`md-${key}`}
                  className={ui.input}
                  value={fields[key]}
                  onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button type="button" className={`${ui.primary} flex-1`} disabled={busy} onClick={() => run("save")}>
              Save changes
            </button>
            <button type="button" className={`${ui.secondary} flex-1 py-3`} disabled={busy} onClick={() => run("strip")}>
              Remove all metadata
            </button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            &ldquo;Remove all metadata&rdquo; clears every field above plus hidden XMP data and application edit history — useful before sharing a file publicly.
          </p>
          {done && <p className={ui.success}>{done}</p>}
        </>
      )}
    </ToolShell>
  );
}
