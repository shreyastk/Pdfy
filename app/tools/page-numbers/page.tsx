"use client";

import { useState } from "react";
import FileUploader from "@/components/FileUploader";
import ProcessingStatus from "@/components/ProcessingStatus";
import { addPageNumbers, downloadPDF, PageNumberPosition } from "@/lib/pdf-operations";

type Format = "n" | "page-n" | "page-n-of-m" | "n-of-m";

export default function AddPageNumbers() {
    const [file, setFile] = useState<File | null>(null);
    const [status, setStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
    const [message, setMessage] = useState("");

    const [position, setPosition] = useState<PageNumberPosition>("bottom-center");
    const [format, setFormat] = useState<Format>("n");
    const [startNumber, setStartNumber] = useState(1);
    const [margin, setMargin] = useState(20);

    const handleFilesSelected = (files: File[]) => {
        if (files.length > 0) {
            setFile(files[0]);
            setStatus("idle");
        }
    };

    const handleAddPageNumbers = async () => {
        if (!file) return;

        try {
            setStatus("processing");
            setMessage("Adding page numbers...");

            const outputPdf = await addPageNumbers(file, {
                position,
                format,
                startNumber,
                margin
            });

            downloadPDF(outputPdf, `numbered-${file.name}`);

            setStatus("success");
            setMessage("Page numbers added successfully!");
        } catch (error) {
            console.error(error);
            setStatus("error");
            setMessage("Failed to add page numbers");
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 pt-24">
            <div className="container mx-auto px-4 py-8">
                <div className="max-w-4xl mx-auto">
                    <div className="text-center mb-8">
                        <h1 className="text-4xl font-bold text-slate-900 mb-2">Add Page Numbers</h1>
                        <p className="text-slate-600">
                            Insert page numbers into your PDF document with ease.
                        </p>
                    </div>

                    <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
                        {!file ? (
                            <FileUploader
                                onFilesSelected={handleFilesSelected}
                                accept=".pdf"
                                multiple={false}
                            />
                        ) : (
                            <div className="flex flex-col md:flex-row gap-8">
                                {/* Settings Panel */}
                                <div className="flex-1 space-y-6">
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-900 mb-4">Settings</h3>

                                        {/* Position Selection */}
                                        <div className="mb-6">
                                            <label className="block text-sm font-medium text-slate-700 mb-2">Position</label>
                                            <div className="grid grid-cols-3 gap-2 w-48 mx-auto md:mx-0 bg-slate-100 p-2 rounded-lg border border-slate-200">
                                                {/* Top Row */}
                                                <button
                                                    onClick={() => setPosition("top-left")}
                                                    className={`h-10 rounded hover:bg-white hover:shadow-sm transition-all ${position === "top-left" ? "bg-blue-600 shadow-md ring-2 ring-blue-300" : "bg-transparent"}`}
                                                />
                                                <button
                                                    onClick={() => setPosition("top-center")}
                                                    className={`h-10 rounded hover:bg-white hover:shadow-sm transition-all ${position === "top-center" ? "bg-blue-600 shadow-md ring-2 ring-blue-300" : "bg-transparent"}`}
                                                />
                                                <button
                                                    onClick={() => setPosition("top-right")}
                                                    className={`h-10 rounded hover:bg-white hover:shadow-sm transition-all ${position === "top-right" ? "bg-blue-600 shadow-md ring-2 ring-blue-300" : "bg-transparent"}`}
                                                />

                                                {/* Bottom Row */}
                                                <button
                                                    onClick={() => setPosition("bottom-left")}
                                                    className={`h-10 rounded hover:bg-white hover:shadow-sm transition-all ${position === "bottom-left" ? "bg-blue-600 shadow-md ring-2 ring-blue-300" : "bg-transparent"}`}
                                                />
                                                <button
                                                    onClick={() => setPosition("bottom-center")}
                                                    className={`h-10 rounded hover:bg-white hover:shadow-sm transition-all ${position === "bottom-center" ? "bg-blue-600 shadow-md ring-2 ring-blue-300" : "bg-transparent"}`}
                                                />
                                                <button
                                                    onClick={() => setPosition("bottom-right")}
                                                    className={`h-10 rounded hover:bg-white hover:shadow-sm transition-all ${position === "bottom-right" ? "bg-blue-600 shadow-md ring-2 ring-blue-300" : "bg-transparent"}`}
                                                />
                                            </div>
                                            <p className="text-center md:text-left text-xs text-slate-500 mt-2">
                                                Selected: <span className="font-medium text-slate-700 capitalize">{position.replace("-", " ")}</span>
                                            </p>
                                        </div>

                                        {/* Format Selection */}
                                        <div className="mb-6">
                                            <label className="block text-sm font-medium text-slate-700 mb-2">Format</label>
                                            <select
                                                value={format}
                                                onChange={(e) => setFormat(e.target.value as Format)}
                                                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                            >
                                                <option value="n">1</option>
                                                <option value="page-n">Page 1</option>
                                                <option value="n-of-m">1 of 10</option>
                                                <option value="page-n-of-m">Page 1 of 10</option>
                                            </select>
                                        </div>

                                        {/* Start Number & Margin */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-2">Start Number</label>
                                                <input
                                                    type="number"
                                                    value={startNumber}
                                                    onChange={(e) => setStartNumber(Number(e.target.value))}
                                                    min={1}
                                                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-2">Margin (px)</label>
                                                <input
                                                    type="number"
                                                    value={margin}
                                                    onChange={(e) => setMargin(Number(e.target.value))}
                                                    min={0}
                                                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Preview / Action */}
                                <div className="flex-1 bg-slate-50 rounded-xl p-6 border border-slate-200 flex flex-col justify-between">
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="w-12 h-16 bg-white border border-slate-200 shadow-sm flex items-center justify-center">
                                            <span className="text-xs font-bold text-slate-400">PDF</span>
                                        </div>
                                        <div>
                                            <p className="font-medium text-slate-900 truncate max-w-[200px]">{file.name}</p>
                                            <p className="text-sm text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                                        </div>
                                        <button
                                            onClick={() => setFile(null)}
                                            className="ml-auto text-red-500 hover:text-red-700 text-sm font-medium"
                                        >
                                            Change
                                        </button>
                                    </div>

                                    <div className="aspect-[1/1.4] bg-white shadow-lg mx-auto w-48 relative border border-slate-200 mb-8 pointer-events-none">
                                        {/* Visual Preview Mockup */}
                                        <div className="absolute inset-0 flex flex-col justify-between p-4 opacity-50">
                                            <div className="w-full h-2 bg-slate-200 rounded" />
                                            <div className="space-y-2">
                                                <div className="w-full h-2 bg-slate-200 rounded" />
                                                <div className="w-2/3 h-2 bg-slate-200 rounded" />
                                                <div className="w-full h-2 bg-slate-200 rounded" />
                                            </div>
                                        </div>

                                        {/* Page Number Preview Indicator */}
                                        <div className={`absolute flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 ring-2 ring-blue-500 text-[10px] font-bold text-blue-700
                           transition-all duration-300
                           ${position === 'top-left' ? 'top-2 left-2' : ''}
                           ${position === 'top-center' ? 'top-2 left-1/2 -translate-x-1/2' : ''}
                           ${position === 'top-right' ? 'top-2 right-2' : ''}
                           ${position === 'bottom-left' ? 'bottom-2 left-2' : ''}
                           ${position === 'bottom-center' ? 'bottom-2 left-1/2 -translate-x-1/2' : ''}
                           ${position === 'bottom-right' ? 'bottom-2 right-2' : ''}
                        `}>
                                            #
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleAddPageNumbers}
                                        disabled={status === "processing"}
                                        className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-lg hover:shadow-xl disabled:opacity-50"
                                    >
                                        {status === "processing" ? "Processing..." : "Add Page Numbers"}
                                    </button>

                                    {status === "success" && (
                                        <p className="text-green-600 text-center text-sm font-medium mt-4">Download started automatically!</p>
                                    )}
                                </div>
                            </div>
                        )}

                        {status === "error" && (
                            <div className="mt-6 text-center text-red-600">
                                {message}
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </div>
    );
}
