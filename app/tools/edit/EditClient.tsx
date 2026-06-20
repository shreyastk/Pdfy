"use client";

import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import ToolTemplate from "@/components/ToolTemplate";
import { applyEdits, type Edit } from "@/lib/pdf-editor";
import { getTool } from "@/lib/tool-registry";
import type { ToolResult } from "@/lib/types";

const tool = getTool("edit")!;

/** Replace a PDF filename's extension with `-edited.pdf`. */
function editedName(name: string): string {
  const base = name.replace(/\.pdf$/i, "");
  return `${base}-edited.pdf`;
}

/**
 * Interactive UI for /tools/edit.
 *
 * Wraps the shared {@link ToolTemplate}. The user specifies a single text edit
 * (page, x, y, text, font size) via the controls rendered as `children`. The
 * injected `onRun`:
 *
 * - Confirms the uploaded file parses with pdf-lib; a parse failure means the
 *   file is invalid or password-protected, so it throws a clear error and the
 *   template retains the previously selected document (Req 3.8).
 * - Builds an `Edit[]` from the form inputs and calls {@link applyEdits}, which
 *   validates every edit (in-bounds, 1–5,000 chars) and throws on invalid input;
 *   that message is surfaced to the user.
 * - All processing is performed in-browser with no upload (Req 3.6).
 */
export default function EditClient() {
  const [pageNumber, setPageNumber] = useState(1);
  const [x, setX] = useState(72);
  const [y, setY] = useState(720);
  const [text, setText] = useState("");
  const [fontSize, setFontSize] = useState(12);

  const onRun = async (files: File[]): Promise<ToolResult> => {
    const file = files[0];

    // Req 3.8: reject invalid/password-protected files. The template keeps the
    // previously loaded document when onRun throws.
    try {
      await PDFDocument.load(await file.arrayBuffer());
    } catch {
      throw new Error("The file is invalid or password-protected.");
    }

    if (text.trim().length === 0) {
      throw new Error("Please enter the text to add.");
    }

    // Build a single text edit. `page` is a 0-based index for applyEdits.
    const edits: Edit[] = [
      {
        kind: "text",
        page: pageNumber - 1,
        x,
        y,
        text,
        size: fontSize,
      },
    ];

    // applyEdits validates (in-bounds, text length) and throws a clear message
    // on invalid edits; let it propagate so the template surfaces it (Req 3.6).
    const data = await applyEdits(file, edits);

    return {
      downloads: [
        {
          filename: editedName(file.name),
          data,
        },
      ],
    };
  };

  const inputClass =
    "w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-[#009966]";
  const labelClass =
    "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1";

  return (
    <ToolTemplate
      title={tool.name}
      description={tool.description}
      accept=".pdf"
      multiple={false}
      onRun={onRun}
      runLabel="Apply Edit"
    >
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Add Text
        </h3>

        <div>
          <label className={labelClass} htmlFor="edit-text">
            Text
          </label>
          <input
            id="edit-text"
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Text to add to the page"
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <label className={labelClass} htmlFor="edit-page">
              Page
            </label>
            <input
              id="edit-page"
              type="number"
              min={1}
              value={pageNumber}
              onChange={(e) => setPageNumber(Math.max(1, Number(e.target.value)))}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="edit-x">
              X (pt)
            </label>
            <input
              id="edit-x"
              type="number"
              value={x}
              onChange={(e) => setX(Number(e.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="edit-y">
              Y (pt)
            </label>
            <input
              id="edit-y"
              type="number"
              value={y}
              onChange={(e) => setY(Number(e.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="edit-size">
              Font size
            </label>
            <input
              id="edit-size"
              type="number"
              min={1}
              value={fontSize}
              onChange={(e) => setFontSize(Math.max(1, Number(e.target.value)))}
              className={inputClass}
            />
          </div>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Coordinates are in PDF points from the bottom-left of the page. Files
          are processed entirely in your browser and never uploaded.
        </p>
      </div>
    </ToolTemplate>
  );
}
