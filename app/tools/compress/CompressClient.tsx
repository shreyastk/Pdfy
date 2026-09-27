"use client";

import { useState } from "react";
import FileUploader from "@/components/FileUploader";
import ProcessingStatus from "@/components/ProcessingStatus";
import { compressPdf, type CompressionLevel } from "@/lib/compress";
import { downloadPDF } from "@/lib/pdf-operations";

const LEVELS: { value: CompressionLevel; label: string; hint: string }[] = [
  { value: "low", label: "Light", hint: "Best quality, smaller savings" },
  { value: "medium", label: "Balanced", hint: "Good quality, good savings" },
  { value: "high", label: "Strong", hint: "Smallest file, lower image quality" },
];

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function CompressClient() {
  const [file, setFile] = useState<File | null>(null);
  const [level, setLevel] = useState<CompressionLevel>("medium");
  const [rasterize, setRasterize] = useState(false);
  const [status, setStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [compressedSize, setCompressedSize] = useState(0);

  const handleFileSelected = (selectedFiles: File[]) => {
    setFile(selectedFiles[0] ?? null);
    setStatus("idle");
    setCompressedSize(0);
  };

  const handleCompress = async () => {
    if (!file) {
      setStatus("error");
      setMessage("Please select a PDF file");
      return;
    }

    try {
      setStatus("processing");
      setMessage("Compressing PDF...");

      const result = await compressPdf(file, {
        level,
        rasterize,
        onProgress: (current, total) =>
          setMessage(
            rasterize
              ? `Rendering page ${current} of ${total}...`
              : `Optimizing image ${current} of ${total}...`,
          ),
      });
      setCompressedSize(result.bytes.length);

      if (result.unchanged) {
        setStatus("success");
        setMessage(
          "This PDF is already well optimized — compressing it would not make it smaller, so nothing was changed.",
        );
        return;
      }

      downloadPDF(result.bytes, `compressed-${file.name}`);
      const reduction = ((1 - result.bytes.length / result.originalSize) * 100).toFixed(1);
      setStatus("success");
      setMessage(
        `Size reduced by ${reduction}%` +
          (rasterize ? "." : ` (${result.imagesRecompressed} image${result.imagesRecompressed === 1 ? "" : "s"} optimized).`),
      );
    } catch (error) {
      setStatus("error");
      setMessage("Failed to compress PDF. Please try again.");
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50 dark:from-slate-900 dark:to-slate-950 pt-24">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-2">Compress PDF</h1>
            <p className="text-slate-600 dark:text-slate-400">
              Reduce PDF file size while keeping text selectable and pages the same size
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 mb-6">
            <FileUploader onFilesSelected={handleFileSelected} accept=".pdf" multiple={false} />

            {file && (
              <div className="mt-6 space-y-5">
                <div className="p-4 bg-orange-50 dark:bg-slate-700/50 rounded-lg">
                  <p className="text-sm text-slate-700 dark:text-slate-200 break-words">
                    <span className="font-semibold">File:</span> {file.name}
                  </p>
                  <p className="text-sm text-slate-700 dark:text-slate-200">
                    <span className="font-semibold">Original size:</span> {formatSize(file.size)}
                  </p>
                  {compressedSize > 0 && (
                    <p className="text-sm text-green-700 dark:text-green-400 font-semibold">
                      Compressed size: {formatSize(compressedSize)}
                    </p>
                  )}
                </div>

                <fieldset>
                  <legend className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                    Compression level
                  </legend>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {LEVELS.map((l) => (
                      <label
                        key={l.value}
                        className={`cursor-pointer rounded-xl border-2 p-3 transition-colors ${
                          level === l.value
                            ? "border-orange-500 bg-orange-50 dark:bg-orange-950/30"
                            : "border-slate-200 dark:border-slate-600 hover:border-orange-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name="level"
                          value={l.value}
                          checked={level === l.value}
                          onChange={() => setLevel(l.value)}
                          className="sr-only"
                        />
                        <span className="block font-semibold text-slate-900 dark:text-slate-100">{l.label}</span>
                        <span className="block text-xs text-slate-500 dark:text-slate-400">{l.hint}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={rasterize}
                    onChange={(e) => setRasterize(e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-semibold">Convert pages to images</span> — best for scanned
                    documents. Text will no longer be selectable, and links and form fields are removed.
                  </span>
                </label>

                <button
                  onClick={handleCompress}
                  disabled={status === "processing"}
                  className="w-full px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white font-semibold rounded-xl hover:from-orange-600 hover:to-red-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {status === "processing" ? "Compressing..." : "Compress PDF"}
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
