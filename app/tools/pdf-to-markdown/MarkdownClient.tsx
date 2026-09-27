"use client";

import { useState } from "react";
import ToolTemplate from "@/components/ToolTemplate";
import { pdfToMarkdown } from "@/lib/pdf-to-markdown";
import { getTool } from "@/lib/tool-registry";
import type { Progress, ToolResult } from "@/lib/types";

const tool = getTool("pdf-to-markdown")!;

export default function MarkdownClient() {
  const [markdown, setMarkdown] = useState("");
  const [copied, setCopied] = useState(false);

  const onRun = async (files: File[], onProgress: (p: Progress) => void): Promise<ToolResult> => {
    setMarkdown("");
    const file = files[0];
    const result = await pdfToMarkdown(file, (current, total) =>
      onProgress({ current, total, label: `Reading page ${current} of ${total}…` }),
    );
    if (!result.hasText) {
      throw new Error("This PDF has no selectable text (it is probably a scan). Run OCR PDF on it first, then convert.");
    }
    setMarkdown(result.markdown);
    return {
      downloads: [
        {
          filename: file.name.replace(/\.pdf$/i, "") + ".md",
          data: new Blob([result.markdown], { type: "text/markdown" }),
        },
      ],
      notices: ["Structure is inferred from font sizes and layout, so tables and multi-column pages may need tidying."],
    };
  };

  const copy = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <ToolTemplate
      title={tool.name}
      description={tool.description}
      onRun={onRun}
      runLabel="Convert to Markdown"
      resultExtra={
        markdown && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Preview</h3>
              <button
                type="button"
                onClick={copy}
                className="px-3 py-1.5 text-sm font-medium rounded-lg border border-[#009966] text-[#009966] hover:bg-[#009966] hover:text-white transition-colors"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 dark:bg-slate-900 p-4 text-xs text-slate-800 dark:text-slate-200">
              {markdown}
            </pre>
          </div>
        )
      }
    />
  );
}
