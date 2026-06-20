"use client";

import ToolTemplate from "@/components/ToolTemplate";
import { flattenPdf } from "@/lib/flatten";
import { getTool } from "@/lib/tool-registry";
import type { ToolResult } from "@/lib/types";

const tool = getTool("flatten")!;

/** Replace a PDF filename's extension with `-flattened.pdf`. */
function flattenedName(name: string): string {
  const base = name.replace(/\.pdf$/i, "");
  return `${base}-flattened.pdf`;
}

/**
 * Interactive UI for /tools/flatten.
 *
 * Wraps the shared {@link ToolTemplate}. The injected `onRun` calls
 * {@link flattenPdf} on the single uploaded file and maps its discriminated
 * result onto the template's success/error model:
 *
 * - `{ error: "nothing-to-flatten" }` -> throw a clear message so the template
 *   surfaces it as an error and retains the file (Req 9.5, 9.6).
 * - `{ data }` -> resolve with a single download named `<original>-flattened.pdf`.
 * - any thrown error during flattening propagates to the template, which shows
 *   the message and keeps the selected file (Req 9.6).
 */
export default function FlattenClient() {
  const onRun = async (files: File[]): Promise<ToolResult> => {
    const file = files[0];

    const result = await flattenPdf(file);

    if ("error" in result) {
      // Req 9.5: nothing to flatten -> clear error, file retained by template.
      throw new Error(
        "There is nothing to flatten: this PDF has no form fields or annotations."
      );
    }

    return {
      downloads: [
        {
          filename: flattenedName(file.name),
          data: result.data,
        },
      ],
    };
  };

  return (
    <ToolTemplate
      title={tool.name}
      description={tool.description}
      accept=".pdf"
      multiple={false}
      onRun={onRun}
      runLabel="Flatten PDF"
    />
  );
}
