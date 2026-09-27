"use client";

import { useState } from "react";
import ToolTemplate from "@/components/ToolTemplate";
import { convertToGrayscale } from "@/lib/grayscale";
import { getTool } from "@/lib/tool-registry";
import type { ToolResult } from "@/lib/types";

const tool = getTool("grayscale")!;

export default function GrayscaleClient() {
  const [rasterize, setRasterize] = useState(false);

  const onRun = async (files: File[], onProgress: (p: { current: number; total: number; label?: string }) => void): Promise<ToolResult> => {
    const file = files[0];
    const result = await convertToGrayscale(file, {
      rasterize,
      onProgress: (label, current, total) => onProgress({ current, total, label: `${label}…` }),
    });
    const notices: string[] = [];
    if (result.imagesSkipped > 0) {
      notices.push(
        `${result.imagesSkipped} image${result.imagesSkipped === 1 ? "" : "s"} use a colour format that can't be converted without re-rendering and may still appear in colour. Tick "Render pages as images" for a guaranteed result.`,
      );
    }
    if (!rasterize) {
      notices.push("Text and vector graphics in special colour spaces (spot colours, gradients) are kept as-is.");
    }
    return {
      downloads: [{ filename: file.name.replace(/\.pdf$/i, "") + "-grayscale.pdf", data: result.bytes }],
      notices,
    };
  };

  return (
    <ToolTemplate title={tool.name} description={tool.description} onRun={onRun} runLabel="Convert to grayscale">
      <label className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-200">
        <input type="checkbox" checked={rasterize} onChange={(e) => setRasterize(e.target.checked)} className="mt-1" />
        <span>
          <span className="font-semibold">Render pages as images</span> — guarantees every trace of colour is
          removed, but text will no longer be selectable.
        </span>
      </label>
    </ToolTemplate>
  );
}
