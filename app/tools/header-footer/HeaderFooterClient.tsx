"use client";

import { useState } from "react";
import ToolTemplate from "@/components/ToolTemplate";
import { addHeaderFooter, SLOTS, type Slot } from "@/lib/header-footer";
import { getTool } from "@/lib/tool-registry";
import type { ToolResult } from "@/lib/types";

const tool = getTool("header-footer")!;

const INPUT =
  "w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#009966]/40";
const LABEL = "block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1";

const SLOT_LABELS: Record<Slot, string> = {
  "header-left": "Header left",
  "header-center": "Header center",
  "header-right": "Header right",
  "footer-left": "Footer left",
  "footer-center": "Footer center",
  "footer-right": "Footer right",
};

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

export default function HeaderFooterClient() {
  const [slots, setSlots] = useState<Partial<Record<Slot, string>>>({ "footer-center": "Page {page} of {total}" });
  const [fontSize, setFontSize] = useState(10);
  const [margin, setMargin] = useState(24);
  const [color, setColor] = useState("#333333");
  const [firstPage, setFirstPage] = useState(1);
  const [useBates, setUseBates] = useState(false);
  const [bates, setBates] = useState({ prefix: "ABC", start: 1, digits: 6, suffix: "" });

  const onRun = async (files: File[]): Promise<ToolResult> => {
    if (!Object.values(slots).some((v) => v?.trim())) throw new Error("Enter text for at least one header or footer position.");
    const usesBatesToken = Object.values(slots).some((v) => v?.includes("{bates}"));
    const file = files[0];
    const data = await addHeaderFooter(file, {
      slots,
      fontSize,
      margin,
      color: hexToRgb(color),
      firstPage: Math.max(1, firstPage),
      bates: useBates ? bates : undefined,
    });
    return {
      downloads: [{ filename: file.name.replace(/\.pdf$/i, "") + "-stamped.pdf", data }],
      notices: useBates && !usesBatesToken ? ["Bates numbering is on, but no position uses the {bates} token, so no Bates numbers were added."] : undefined,
    };
  };

  return (
    <ToolTemplate title={tool.name} description={tool.description} onRun={onRun} runLabel="Add headers & footers">
      <div className="space-y-5">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Tokens: <code>{"{page}"}</code> <code>{"{total}"}</code> <code>{"{date}"}</code> <code>{"{filename}"}</code>{" "}
          <code>{"{bates}"}</code>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {SLOTS.map((slot) => (
            <div key={slot}>
              <label className={LABEL} htmlFor={slot}>
                {SLOT_LABELS[slot]}
              </label>
              <input
                id={slot}
                className={INPUT}
                value={slots[slot] ?? ""}
                onChange={(e) => setSlots((s) => ({ ...s, [slot]: e.target.value }))}
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className={LABEL} htmlFor="hf-size">Font size (pt)</label>
            <input id="hf-size" type="number" min={6} max={36} className={INPUT} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value) || 10)} />
          </div>
          <div>
            <label className={LABEL} htmlFor="hf-margin">Margin (pt)</label>
            <input id="hf-margin" type="number" min={0} max={144} className={INPUT} value={margin} onChange={(e) => setMargin(Number(e.target.value) || 0)} />
          </div>
          <div>
            <label className={LABEL} htmlFor="hf-first">Start on page</label>
            <input id="hf-first" type="number" min={1} className={INPUT} value={firstPage} onChange={(e) => setFirstPage(Number(e.target.value) || 1)} />
          </div>
          <div>
            <label className={LABEL} htmlFor="hf-color">Color</label>
            <input id="hf-color" type="color" className="h-10 w-full rounded-lg border border-slate-300 dark:border-slate-600" value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <input type="checkbox" checked={useBates} onChange={(e) => setUseBates(e.target.checked)} />
            Bates numbering
          </label>
          {useBates && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className={LABEL} htmlFor="b-prefix">Prefix</label>
                  <input id="b-prefix" className={INPUT} value={bates.prefix} onChange={(e) => setBates({ ...bates, prefix: e.target.value })} />
                </div>
                <div>
                  <label className={LABEL} htmlFor="b-start">Start number</label>
                  <input id="b-start" type="number" min={0} className={INPUT} value={bates.start} onChange={(e) => setBates({ ...bates, start: Number(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className={LABEL} htmlFor="b-digits">Digits</label>
                  <input id="b-digits" type="number" min={1} max={12} className={INPUT} value={bates.digits} onChange={(e) => setBates({ ...bates, digits: Number(e.target.value) || 1 })} />
                </div>
                <div>
                  <label className={LABEL} htmlFor="b-suffix">Suffix</label>
                  <input id="b-suffix" className={INPUT} value={bates.suffix} onChange={(e) => setBates({ ...bates, suffix: e.target.value })} />
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Put <code>{"{bates}"}</code> in any position above, e.g. footer right.
              </p>
            </>
          )}
        </div>
      </div>
    </ToolTemplate>
  );
}
