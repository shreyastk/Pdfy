"use client";

import { useState } from "react";
import ToolTemplate from "@/components/ToolTemplate";
import { removeAnnotations } from "@/lib/remove-annotations";
import { getTool } from "@/lib/tool-registry";
import type { ToolResult } from "@/lib/types";

const tool = getTool("remove-annotations")!;

/** Friendlier names for common annotation subtypes. */
const LABELS: Record<string, string> = {
  Text: "sticky note",
  FreeText: "text box",
  Highlight: "highlight",
  Underline: "underline",
  StrikeOut: "strike-through",
  Squiggly: "squiggly underline",
  Ink: "drawing",
  Stamp: "stamp",
  Square: "rectangle",
  Circle: "circle",
  Line: "line",
  Polygon: "polygon",
  PolyLine: "polyline",
  Popup: "popup",
  Link: "link",
  Widget: "form field",
  FileAttachment: "file attachment",
};

export default function RemoveAnnotationsClient() {
  const [keepLinks, setKeepLinks] = useState(true);
  const [keepFormFields, setKeepFormFields] = useState(true);

  const onRun = async (files: File[]): Promise<ToolResult> => {
    const file = files[0];
    const result = await removeAnnotations(file, { keepLinks, keepFormFields });
    if (result.total === 0) {
      throw new Error("This PDF has no annotations to remove with the current settings.");
    }
    const breakdown = Object.entries(result.removed)
      .sort((a, b) => b[1] - a[1])
      .map(([subtype, n]) => `${n} ${LABELS[subtype] ?? subtype.toLowerCase()}${n === 1 ? "" : "s"}`)
      .join(", ");
    return {
      downloads: [{ filename: file.name.replace(/\.pdf$/i, "") + "-clean.pdf", data: result.bytes }],
      notices: [`Removed ${result.total} annotation${result.total === 1 ? "" : "s"}: ${breakdown}.`],
    };
  };

  return (
    <ToolTemplate title={tool.name} description={tool.description} onRun={onRun} runLabel="Remove annotations">
      <div className="space-y-3">
        <label className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={keepLinks} onChange={(e) => setKeepLinks(e.target.checked)} className="mt-1" />
          <span>
            <span className="font-semibold">Keep links</span> — clickable web and table-of-contents links stay working.
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={keepFormFields}
            onChange={(e) => setKeepFormFields(e.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="font-semibold">Keep form fields</span> — untick to delete fillable fields too. To keep
            their typed-in values on the page, use Flatten PDF instead.
          </span>
        </label>
      </div>
    </ToolTemplate>
  );
}
