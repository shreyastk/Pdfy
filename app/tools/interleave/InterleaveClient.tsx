"use client";

import { useState } from "react";
import ToolTemplate from "@/components/ToolTemplate";
import { interleavePdfs } from "@/lib/interleave";
import { getTool } from "@/lib/tool-registry";
import type { ToolResult } from "@/lib/types";

const tool = getTool("interleave")!;

export default function InterleaveClient() {
  const [reverseBacks, setReverseBacks] = useState(true);
  const [swap, setSwap] = useState(false);

  const onRun = async (files: File[]): Promise<ToolResult> => {
    if (files.length !== 2) {
      throw new Error("Please select exactly two PDF files: the front sides and the back sides.");
    }
    const [fronts, backs] = swap ? [files[1], files[0]] : [files[0], files[1]];
    const result = await interleavePdfs(fronts, backs, reverseBacks);
    const notices = [
      `Front sides: ${fronts.name} (${result.countA} pages). Back sides: ${backs.name} (${result.countB} pages).`,
    ];
    if (result.countA !== result.countB) {
      notices.push("The two files have different page counts, so the extra pages were added at the end.");
    }
    return {
      downloads: [{ filename: fronts.name.replace(/\.pdf$/i, "") + "-interleaved.pdf", data: result.bytes }],
      notices,
    };
  };

  return (
    <ToolTemplate
      title={tool.name}
      description={tool.description}
      onRun={onRun}
      multiple
      runLabel="Interleave pages"
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Select two PDFs. The first file listed is used as the front sides, the second as the back sides.
        </p>
        <label className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={reverseBacks}
            onChange={(e) => setReverseBacks(e.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="font-semibold">Back sides are in reverse order</span> — usual when you flipped the
            whole stack over to scan the other side.
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={swap} onChange={(e) => setSwap(e.target.checked)} className="mt-1" />
          <span>
            <span className="font-semibold">Swap files</span> — use the second file as the front sides.
          </span>
        </label>
      </div>
    </ToolTemplate>
  );
}
