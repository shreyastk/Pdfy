"use client";

import { useState } from "react";
import FileUploader from "@/components/FileUploader";
import ProcessingStatus from "@/components/ProcessingStatus";
import { downloadPDF } from "@/lib/pdf-operations";
import {
  STAMP_PRESETS,
  addImageWatermark,
  addStamp,
  addTextWatermark,
  type PageScope,
  type Placement,
} from "@/lib/watermark";

type Mode = "text" | "image" | "stamp";

const INPUT =
  "w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-900 dark:text-slate-100";
const LABEL = "block text-sm font-bold text-slate-900 dark:text-slate-100 mb-2";

const PLACEMENTS: { value: Placement; label: string }[] = [
  { value: "center", label: "Center" },
  { value: "tile", label: "Tiled across page" },
  { value: "top-left", label: "Top left" },
  { value: "top-center", label: "Top center" },
  { value: "top-right", label: "Top right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-center", label: "Bottom center" },
  { value: "bottom-right", label: "Bottom right" },
];

const SCOPES: { value: PageScope; label: string }[] = [
  { value: "all", label: "All pages" },
  { value: "first", label: "First page only" },
  { value: "last", label: "Last page only" },
];

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

function Range(props: { label: string; value: number; display: string; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className={LABEL}>
        {props.label}: <span className="text-teal-600">{props.display}</span>
        <input
          type="range"
          min={props.min}
          max={props.max}
          step={props.step ?? 1}
          value={props.value}
          onChange={(e) => props.onChange(Number(e.target.value))}
          className="w-full accent-teal-500 mt-2"
        />
      </label>
    </div>
  );
}

export default function WatermarkPDF() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>("text");
  const [placement, setPlacement] = useState<Placement>("center");
  const [pages, setPages] = useState<PageScope>("all");
  const [opacity, setOpacity] = useState(0.3);
  const [rotation, setRotation] = useState(-45);
  // Text
  const [text, setText] = useState("");
  const [fontSize, setFontSize] = useState(48);
  const [color, setColor] = useState("#808080");
  // Image
  const [image, setImage] = useState<File | null>(null);
  const [scale, setScale] = useState(0.4);
  // Stamp
  const [stampText, setStampText] = useState<string>("APPROVED");
  const [stampColor, setStampColor] = useState("#0f8c45");
  const [stampDate, setStampDate] = useState(true);

  const [status, setStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const chooseMode = (m: Mode) => {
    setMode(m);
    setStatus("idle");
    if (m === "stamp") {
      setPlacement("top-right");
      setRotation(-12);
    } else if (m === "image") {
      setPlacement("center");
      setRotation(0);
    } else {
      setPlacement("center");
      setRotation(-45);
    }
  };

  const handleApply = async () => {
    if (!file) {
      setStatus("error");
      setMessage("Please select a PDF file");
      return;
    }
    if (mode === "text" && !text.trim()) {
      setStatus("error");
      setMessage("Please enter watermark text");
      return;
    }
    if (mode === "image" && !image) {
      setStatus("error");
      setMessage("Please choose an image (PNG with transparency works best)");
      return;
    }
    if (mode === "stamp" && !stampText.trim()) {
      setStatus("error");
      setMessage("Please enter stamp text");
      return;
    }

    try {
      setStatus("processing");
      setMessage("Adding watermark...");
      let out: Uint8Array;
      if (mode === "text") {
        out = await addTextWatermark(file, { text, fontSize, opacity, rotation, color: hexToRgb(color), placement, pages });
      } else if (mode === "image") {
        out = await addImageWatermark(file, image!, { scale, opacity, rotation, placement, pages });
      } else {
        out = await addStamp(file, {
          text: stampText,
          color: hexToRgb(stampColor),
          date: stampDate ? new Date().toLocaleDateString() : undefined,
          fontSize: 28,
          rotation,
          placement: placement === "tile" ? "top-right" : placement,
          pages,
        });
      }
      downloadPDF(out, `watermarked-${file.name}`);
      setStatus("success");
      setMessage("Watermark added successfully!");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Failed to add watermark. Please try again.");
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-slate-900 dark:to-slate-950 pt-24">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-2">Add Watermark</h1>
            <p className="text-slate-600 dark:text-slate-400">Add a text watermark, your logo, or a rubber stamp to your PDF</p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 mb-6">
            <FileUploader
              onFilesSelected={(files) => {
                setFile(files[0] ?? null);
                setStatus("idle");
              }}
              accept=".pdf"
            />

            {file && (
              <div className="mt-6 space-y-5">
                <div role="tablist" aria-label="Watermark type" className="grid grid-cols-3 gap-2 rounded-xl bg-slate-100 dark:bg-slate-900 p-1">
                  {(["text", "image", "stamp"] as Mode[]).map((m) => (
                    <button
                      key={m}
                      role="tab"
                      type="button"
                      aria-selected={mode === m}
                      onClick={() => chooseMode(m)}
                      className={`rounded-lg py-2 text-sm font-semibold capitalize transition-colors ${
                        mode === m ? "bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 shadow" : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {m === "image" ? "Image / logo" : m}
                    </button>
                  ))}
                </div>

                {mode === "text" && (
                  <>
                    <div>
                      <label className={LABEL} htmlFor="wm-text">Watermark text</label>
                      <input id="wm-text" type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. CONFIDENTIAL" className={INPUT} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Range label="Font size" value={fontSize} display={`${fontSize}pt`} min={12} max={120} onChange={setFontSize} />
                      <div>
                        <label className={LABEL} htmlFor="wm-color">Color</label>
                        <input id="wm-color" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-full rounded-lg border border-slate-300 dark:border-slate-600" />
                      </div>
                    </div>
                  </>
                )}

                {mode === "image" && (
                  <>
                    <div>
                      <label className={LABEL} htmlFor="wm-image">Image</label>
                      <input
                        id="wm-image"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        onChange={(e) => setImage(e.target.files?.[0] ?? null)}
                        className="block w-full text-sm text-slate-700 dark:text-slate-200 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-4 file:py-2 file:text-teal-700"
                      />
                    </div>
                    <Range label="Width" value={scale} display={`${Math.round(scale * 100)}% of page`} min={0.05} max={1} step={0.05} onChange={setScale} />
                  </>
                )}

                {mode === "stamp" && (
                  <>
                    <div>
                      <span className={LABEL}>Stamp</span>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(STAMP_PRESETS).map(([label, c]) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => {
                              setStampText(label);
                              setStampColor(
                                "#" + [c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join(""),
                              );
                            }}
                            className={`rounded-lg border-2 px-3 py-1 text-xs font-bold tracking-wide ${stampText === label ? "ring-2 ring-teal-400" : ""}`}
                            style={{ color: `rgb(${c.r * 255},${c.g * 255},${c.b * 255})`, borderColor: `rgb(${c.r * 255},${c.g * 255},${c.b * 255})` }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className={LABEL} htmlFor="st-text">Custom text</label>
                        <input id="st-text" value={stampText} onChange={(e) => setStampText(e.target.value)} className={INPUT} />
                      </div>
                      <div>
                        <label className={LABEL} htmlFor="st-color">Color</label>
                        <input id="st-color" type="color" value={stampColor} onChange={(e) => setStampColor(e.target.value)} className="h-10 w-full rounded-lg border border-slate-300 dark:border-slate-600" />
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                      <input type="checkbox" checked={stampDate} onChange={(e) => setStampDate(e.target.checked)} />
                      Include today&apos;s date
                    </label>
                  </>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL} htmlFor="wm-place">Position</label>
                    <select id="wm-place" value={placement} onChange={(e) => setPlacement(e.target.value as Placement)} className={INPUT}>
                      {PLACEMENTS.filter((p) => mode !== "stamp" || p.value !== "tile").map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="wm-pages">Pages</label>
                    <select id="wm-pages" value={pages} onChange={(e) => setPages(e.target.value as PageScope)} className={INPUT}>
                      {SCOPES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {mode !== "stamp" && (
                    <Range label="Opacity" value={opacity} display={`${Math.round(opacity * 100)}%`} min={0.05} max={1} step={0.05} onChange={setOpacity} />
                  )}
                  <Range label="Rotation" value={rotation} display={`${rotation}°`} min={-90} max={90} onChange={setRotation} />
                </div>

                <button
                  onClick={handleApply}
                  disabled={status === "processing"}
                  className="w-full px-6 py-3 bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-semibold rounded-xl hover:from-teal-600 hover:to-cyan-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {status === "processing" ? "Adding Watermark..." : "Add Watermark"}
                </button>
              </div>
            )}

            {status !== "idle" && (
              <div className="mt-6">
                <ProcessingStatus status={status} message={message} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
