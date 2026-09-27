"use client";

import { useState } from "react";
import ToolTemplate from "@/components/ToolTemplate";
import { encodePng, extractImages } from "@/lib/extract-images";
import { getTool } from "@/lib/tool-registry";
import type { Download, ToolResult } from "@/lib/types";

const tool = getTool("extract-images")!;

export default function ExtractImagesClient() {
  const [skipSmall, setSkipSmall] = useState(true);

  const onRun = async (
    files: File[],
    onProgress: (p: { current: number; total: number; label?: string }) => void,
    signal: AbortSignal,
  ): Promise<ToolResult> => {
    const file = files[0];
    const result = await extractImages(file, {
      minSize: skipSmall ? 32 : 1,
      onProgress: (current, total) => onProgress({ current, total, label: "Reading images…" }),
    });
    if (result.images.length === 0) {
      throw new Error(
        result.unsupported > 0
          ? "This PDF's images use a format that can't be extracted (such as fax/JBIG2 compression). Try PDF to Images instead."
          : "No images were found in this PDF.",
      );
    }

    const outputs: Download[] = [];
    for (let i = 0; i < result.images.length; i++) {
      if (signal.aborted) throw new Error("Cancelled");
      onProgress({ current: i + 1, total: result.images.length, label: "Saving images…" });
      const img = result.images[i];
      const data = img.data instanceof Uint8Array ? img.data : await encodePng(img.data.rgba, img.width, img.height);
      outputs.push({ filename: img.filename, data });
    }

    const notices: string[] = [`Extracted ${outputs.length} image${outputs.length === 1 ? "" : "s"}.`];
    if (result.tooSmall > 0) {
      notices.push(`Skipped ${result.tooSmall} tiny image${result.tooSmall === 1 ? "" : "s"} (icons, bullets, spacers).`);
    }
    if (result.unsupported > 0) {
      notices.push(
        `${result.unsupported} image${result.unsupported === 1 ? "" : "s"} use an unsupported format and ${result.unsupported === 1 ? "was" : "were"} skipped.`,
      );
    }
    if (outputs.some((o) => o.filename.endsWith(".jp2"))) {
      notices.push("Some images are JPEG 2000 (.jp2), which not every image viewer can open.");
    }

    if (outputs.length === 1) return { downloads: outputs, notices };

    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    for (const o of outputs) zip.file(o.filename, o.data);
    const blob = await zip.generateAsync({ type: "blob" });
    return {
      downloads: [{ filename: file.name.replace(/\.pdf$/i, "") + "-images.zip", data: blob }],
      notices,
    };
  };

  return (
    <ToolTemplate title={tool.name} description={tool.description} onRun={onRun} runLabel="Extract images">
      <label className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-200">
        <input type="checkbox" checked={skipSmall} onChange={(e) => setSkipSmall(e.target.checked)} className="mt-1" />
        <span>
          <span className="font-semibold">Skip tiny images</span> — ignore icons, bullets, and spacers smaller
          than 32×32 pixels.
        </span>
      </label>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        JPEG images are saved exactly as stored in the PDF; everything else is saved as PNG.
      </p>
    </ToolTemplate>
  );
}
