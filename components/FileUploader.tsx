"use client";

import { useCallback, useEffect, useState } from "react";
import { takePendingInput } from "@/lib/handoff";

interface FileUploaderProps {
  onFilesSelected: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  maxFiles?: number;
}

export default function FileUploader({
  onFilesSelected,
  accept = ".pdf",
  multiple = false,
  maxFiles,
}: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [handedOff, setHandedOff] = useState<string | null>(null);

  // Tool chaining: if the previous tool passed its output along, load it as
  // if the user had just selected it.
  useEffect(() => {
    const pending = takePendingInput(accept);
    if (pending) {
      setHandedOff(pending.name);
      onFilesSelected([pending]);
    }
    // Run once on mount only; the handoff is consumed on first read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;

      let fileArray = Array.from(files);

      if (maxFiles && fileArray.length > maxFiles) {
        fileArray = fileArray.slice(0, maxFiles);
      }

      setHandedOff(null);
      onFilesSelected(fileArray);
    },
    [onFilesSelected, maxFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files);
    },
    [handleFiles]
  );

  return (
    <div>
      {handedOff && (
        <p className="mb-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 px-4 py-2 text-sm text-emerald-800 dark:text-emerald-300 break-words">
          Loaded <strong>{handedOff}</strong> from the previous tool. Choose another file to replace it.
        </p>
      )}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 ${
          isDragging
            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40 scale-105"
            : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-slate-400"
        }`}
      >
        <input
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleChange}
          aria-label={multiple ? "Choose files" : "Choose a file"}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div className="pointer-events-none">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
            {isDragging ? "Drop files here" : "Choose files or drag here"}
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {multiple
              ? `Select ${maxFiles ? `up to ${maxFiles}` : "multiple"} files`
              : "Select a file"}{" "}
            to get started
          </p>
        </div>
      </div>
    </div>
  );
}
