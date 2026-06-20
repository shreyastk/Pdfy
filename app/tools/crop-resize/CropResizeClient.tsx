"use client";

import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import ToolTemplate from "@/components/ToolTemplate";
import { applyResize, applyCrop, validateScale } from "@/lib/page-manager";
import { getTool } from "@/lib/tool-registry";
import type { PageCrop, ToolResult } from "@/lib/types";

const tool = getTool("crop-resize")!;

type Mode = "resize" | "crop";

/** Replace a PDF filename's extension with a mode-specific suffix. */
function outputName(name: string, mode: Mode): string {
  const base = name.replace(/\.pdf$/i, "");
  return `${base}-${mode === "resize" ? "resized" : "cropped"}.pdf`;
}

/**
 * Interactive UI for /tools/crop-resize.
 *
 * Wraps the shared {@link ToolTemplate}. A mode toggle switches between:
 *
 * - resize: a scale factor is validated with {@link validateScale}; an invalid
 *   value is thrown (identifying it) so the template keeps the original
 *   document (Req 7.7). Otherwise {@link applyResize} is called with a
 *   proportional, apply-to-all scale spec.
 * - crop: the same crop rectangle (x, y, width, height in points) is applied to
 *   every page via {@link applyCrop}; a degenerate rectangle causes `applyCrop`
 *   to throw, which the template surfaces while retaining the document (Req 7.6).
 *
 * All work runs in-browser (Req 7.4).
 */
export default function CropResizeClient() {
  const [mode, setMode] = useState<Mode>("resize");
  const [scale, setScale] = useState("1");
  const [cropX, setCropX] = useState("0");
  const [cropY, setCropY] = useState("0");
  const [cropWidth, setCropWidth] = useState("0");
  const [cropHeight, setCropHeight] = useState("0");

  const onRun = async (files: File[]): Promise<ToolResult> => {
    const file = files[0];

    if (mode === "resize") {
      const scaleValue = Number(scale);
      const validation = validateScale(scaleValue);
      if (!validation.ok) {
        // Req 7.7: reject out-of-range scale, identifying the invalid value.
        throw new Error(
          `Invalid scale factor "${scale}": enter a number between 0.1 and 10.0.`,
        );
      }

      const data = await applyResize(file, {
        mode: "scale",
        scale: scaleValue,
        proportional: true,
        applyToAll: true,
      });

      return {
        downloads: [{ filename: outputName(file.name, "resize"), data }],
      };
    }

    // mode === "crop": apply the same rect to every page.
    const rect = {
      x: Number(cropX),
      y: Number(cropY),
      width: Number(cropWidth),
      height: Number(cropHeight),
    };

    // Read the page count so we can target every page (1-based).
    const arrayBuffer = await file.arrayBuffer();
    const srcPdf = await PDFDocument.load(arrayBuffer);
    const totalPages = srcPdf.getPageCount();

    const regions: PageCrop[] = Array.from({ length: totalPages }, (_, i) => ({
      page: i + 1,
      rect,
    }));

    // applyCrop throws on a degenerate rectangle (Req 7.6); the template keeps
    // the original document on the thrown error.
    const data = await applyCrop(file, regions);

    return {
      downloads: [{ filename: outputName(file.name, "crop"), data }],
    };
  };

  const inputClass =
    "w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none";
  const labelClass =
    "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2";

  return (
    <ToolTemplate
      title={tool.name}
      description={tool.description}
      accept=".pdf"
      multiple={false}
      onRun={onRun}
      runLabel={mode === "resize" ? "Resize PDF" : "Crop PDF"}
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass}>Mode</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("resize")}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                mode === "resize"
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600"
              }`}
            >
              Resize
            </button>
            <button
              type="button"
              onClick={() => setMode("crop")}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                mode === "crop"
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600"
              }`}
            >
              Crop
            </button>
          </div>
        </div>

        {mode === "resize" ? (
          <div>
            <label htmlFor="scale-factor" className={labelClass}>
              Scale factor
            </label>
            <input
              id="scale-factor"
              type="number"
              step="0.1"
              min={0.1}
              max={10}
              value={scale}
              onChange={(e) => setScale(e.target.value)}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Applied proportionally to every page (0.1 to 10.0). 1.0 keeps the
              original size.
            </p>
          </div>
        ) : (
          <div>
            <label className={labelClass}>Crop region (points)</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="crop-x"
                  className="block text-xs text-slate-500 dark:text-slate-400 mb-1"
                >
                  X
                </label>
                <input
                  id="crop-x"
                  type="number"
                  value={cropX}
                  onChange={(e) => setCropX(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label
                  htmlFor="crop-y"
                  className="block text-xs text-slate-500 dark:text-slate-400 mb-1"
                >
                  Y
                </label>
                <input
                  id="crop-y"
                  type="number"
                  value={cropY}
                  onChange={(e) => setCropY(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label
                  htmlFor="crop-width"
                  className="block text-xs text-slate-500 dark:text-slate-400 mb-1"
                >
                  Width
                </label>
                <input
                  id="crop-width"
                  type="number"
                  value={cropWidth}
                  onChange={(e) => setCropWidth(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label
                  htmlFor="crop-height"
                  className="block text-xs text-slate-500 dark:text-slate-400 mb-1"
                >
                  Height
                </label>
                <input
                  id="crop-height"
                  type="number"
                  value={cropHeight}
                  onChange={(e) => setCropHeight(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              The same region is applied to all pages and clamped to each page&apos;s
              bounds. A region that collapses to zero is rejected.
            </p>
          </div>
        )}
      </div>
    </ToolTemplate>
  );
}
