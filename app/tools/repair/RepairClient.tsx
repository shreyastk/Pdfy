"use client";

import ToolTemplate from "@/components/ToolTemplate";
import { repairPdf } from "@/lib/repair";
import { getTool } from "@/lib/tool-registry";
import type { Progress, ToolResult } from "@/lib/types";

const tool = getTool("repair")!;

export default function RepairClient() {
  const onRun = async (files: File[], onProgress: (p: Progress) => void): Promise<ToolResult> => {
    const file = files[0];
    const result = await repairPdf(file, (label) => onProgress({ current: 0, total: 0, label }));
    return {
      downloads: [{ filename: file.name.replace(/\.pdf$/i, "") + "-repaired.pdf", data: result.bytes }],
      notices: [
        result.method === "rebuilt"
          ? `Rebuilt the document structure and recovered ${result.pageCount} page${result.pageCount === 1 ? "" : "s"}. Text, links and fonts are preserved.`
          : `The file was too damaged to rebuild, so ${result.pageCount} page${result.pageCount === 1 ? " was" : "s were"} recovered as images. Text in the result is not selectable — run OCR on it to make it searchable again.`,
      ],
    };
  };

  return (
    <ToolTemplate
      title={tool.name}
      description={tool.description}
      accept=".pdf,application/pdf,application/octet-stream"
      onRun={onRun}
      runLabel="Repair PDF"
    />
  );
}
