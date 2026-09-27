"use client";

import { useMemo, useState } from "react";
import BatchPanel from "@/components/BatchPanel";
import FileUploader from "@/components/FileUploader";
import ToolShell, { ui } from "@/components/ToolShell";
import { findBlankPages, removePages } from "@/lib/blank-pages";
import { compressPdf } from "@/lib/compress";
import { flattenPdf } from "@/lib/flatten";
import { convertToGrayscale } from "@/lib/grayscale";
import { stripMetadata } from "@/lib/metadata";
import { removeAnnotations } from "@/lib/remove-annotations";
import { rotatePDF } from "@/lib/pdf-operations";
import { repairPdf } from "@/lib/repair";
import { getTool } from "@/lib/tool-registry";

const tool = getTool("batch")!;

interface BatchOperation {
  id: string;
  label: string;
  hint: string;
  run: (file: File) => Promise<Uint8Array>;
}

const OPERATIONS: BatchOperation[] = [
  {
    id: "compress",
    label: "Compress",
    hint: "Balanced compression; text stays selectable.",
    run: async (f) => (await compressPdf(f, { level: "medium" })).bytes,
  },
  {
    id: "grayscale",
    label: "Convert to grayscale",
    hint: "Print-friendly black and white.",
    run: async (f) => (await convertToGrayscale(f)).bytes,
  },
  {
    id: "strip-metadata",
    label: "Remove metadata",
    hint: "Clears author, XMP data and edit history.",
    run: stripMetadata,
  },
  {
    id: "flatten",
    label: "Flatten forms & annotations",
    hint: "Files with nothing to flatten are passed through unchanged.",
    run: async (f) => {
      const r = await flattenPdf(f);
      return "data" in r ? r.data : new Uint8Array(await f.arrayBuffer());
    },
  },
  {
    id: "remove-annotations",
    label: "Remove comments & markup",
    hint: "Deletes highlights and notes; keeps links and form fields.",
    run: async (f) => (await removeAnnotations(f)).bytes,
  },
  {
    id: "remove-blank",
    label: "Remove blank pages",
    hint: "Uses the recommended sensitivity.",
    run: async (f) => {
      const scan = await findBlankPages(f, "normal");
      if (scan.blank.length === 0) return new Uint8Array(await f.arrayBuffer());
      return removePages(f, scan.pageCount, scan.blank);
    },
  },
  {
    id: "rotate",
    label: "Rotate 90° clockwise",
    hint: "Rotates every page.",
    run: (f) => rotatePDF(f, 90),
  },
  {
    id: "repair",
    label: "Repair",
    hint: "Rebuilds damaged files.",
    run: async (f) => (await repairPdf(f)).bytes,
  },
];

export default function BatchClient() {
  const [files, setFiles] = useState<File[]>([]);
  const [opId, setOpId] = useState(OPERATIONS[0].id);
  // Remount the panel when inputs change so it starts a fresh batch.
  const [runKey, setRunKey] = useState(0);
  const op = useMemo(() => OPERATIONS.find((o) => o.id === opId)!, [opId]);

  return (
    <ToolShell title={tool.name} description={tool.description}>
      <fieldset>
        <legend className={ui.label}>Action</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {OPERATIONS.map((o) => (
            <label
              key={o.id}
              className={`cursor-pointer rounded-xl border-2 p-3 transition-colors ${
                opId === o.id ? "border-[#009966] bg-emerald-50 dark:bg-emerald-950/30" : "border-slate-200 dark:border-slate-600 hover:border-[#009966]/50"
              }`}
            >
              <input
                type="radio"
                name="op"
                className="sr-only"
                checked={opId === o.id}
                onChange={() => {
                  setOpId(o.id);
                  setRunKey((k) => k + 1);
                }}
              />
              <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">{o.label}</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">{o.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <FileUploader
        multiple
        maxFiles={100}
        onFilesSelected={(selected) => {
          setFiles(selected);
          setRunKey((k) => k + 1);
        }}
      />

      {files.length > 0 && (
        <BatchPanel key={runKey} files={files} op={op.run} archiveName={`pdfy-${op.id}.zip`} />
      )}
    </ToolShell>
  );
}
