"use client";

import { useState, useEffect } from "react";
import FileUploader from "@/components/FileUploader";
import { getPDFMetadata, updatePDFMetadata, PDFMetadata, downloadPDF } from "@/lib/pdf-operations";

export default function EditMetadata() {
    const [file, setFile] = useState<File | null>(null);
    const [metadata, setMetadata] = useState<PDFMetadata>({});
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const handleFilesSelected = async (files: File[]) => {
        if (files.length > 0) {
            const selectedFile = files[0];
            setFile(selectedFile);
            setIsLoading(true);
            try {
                const data = await getPDFMetadata(selectedFile);
                setMetadata(data);
            } catch (error) {
                console.error("Failed to load metadata", error);
            } finally {
                setIsLoading(false);
            }
        }
    };

    const handleChange = (field: keyof PDFMetadata, value: string) => {
        // Keywords logic: string to string[] is fuzzy in UI, let's just keep as string array internally?
        // Actually input is text.
        if (field === "keywords") {
            // split by comma or semi-colon
            // Actually let's just use string in UI and split on save?
            // But wait context is Typed as string[].
            // Let's store a local Keywords string state?
            // Simplification: We'll cast carefully.
        }
        setMetadata(prev => ({ ...prev, [field]: value }));
    };

    // Custom keyword handler
    const [keywordsInput, setKeywordsInput] = useState("");
    useEffect(() => {
        if (metadata.keywords) {
            setKeywordsInput(Array.isArray(metadata.keywords) ? metadata.keywords.join(", ") : metadata.keywords);
        }
    }, [metadata.keywords]);

    const handleSave = async () => {
        if (!file) return;
        setIsSaving(true);
        try {
            // Prepare metadata
            const finalMetadata = {
                ...metadata,
                keywords: keywordsInput.split(",").map(s => s.trim()).filter(Boolean)
            };

            const newPdf = await updatePDFMetadata(file, finalMetadata);
            downloadPDF(newPdf, file.name); // Keep same name generally? Or prefix?
        } catch (error) {
            console.error("Failed to save", error);
            alert("Failed to save PDF");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 pt-24">
            <div className="container mx-auto px-4 py-8">
                <div className="max-w-2xl mx-auto">
                    <div className="text-center mb-8">
                        <h1 className="text-4xl font-bold text-slate-900 mb-2">Edit Metadata</h1>
                        <p className="text-slate-600">Modify PDF title, author, and keywords.</p>
                    </div>

                    <div className="bg-white rounded-2xl shadow-xl p-8">
                        {!file ? (
                            <FileUploader
                                onFilesSelected={handleFilesSelected}
                                accept=".pdf"
                                multiple={false}
                            />
                        ) : (
                            <div>
                                <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
                                    <div>
                                        <p className="font-bold text-slate-800">{file.name}</p>
                                        <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                                    </div>
                                    <button onClick={() => setFile(null)} className="text-slate-400 hover:text-slate-600">
                                        Change File
                                    </button>
                                </div>

                                {isLoading ? (
                                    <div className="py-12 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
                                ) : (
                                    <div className="space-y-4">
                                        {/* Title */}
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                                            <input
                                                type="text"
                                                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                                value={metadata.title || ""}
                                                onChange={(e) => handleChange("title", e.target.value)}
                                            />
                                        </div>

                                        {/* Author */}
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Author</label>
                                            <input
                                                type="text"
                                                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                                value={metadata.author || ""}
                                                onChange={(e) => handleChange("author", e.target.value)}
                                            />
                                        </div>

                                        {/* Subject */}
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
                                            <input
                                                type="text"
                                                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                                value={metadata.subject || ""}
                                                onChange={(e) => handleChange("subject", e.target.value)}
                                            />
                                        </div>

                                        {/* Keywords */}
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Keywords (comma separated)</label>
                                            <input
                                                type="text"
                                                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                                value={keywordsInput}
                                                onChange={(e) => setKeywordsInput(e.target.value)}
                                            />
                                        </div>

                                        {/* Creator & Producer (Read Only mostly, but let's allow edit) */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Creator</label>
                                                <input
                                                    type="text"
                                                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50"
                                                    value={metadata.creator || ""}
                                                    onChange={(e) => handleChange("creator", e.target.value)}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Producer</label>
                                                <input
                                                    type="text"
                                                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50"
                                                    value={metadata.producer || ""}
                                                    onChange={(e) => handleChange("producer", e.target.value)}
                                                />
                                            </div>
                                        </div>

                                        <div className="pt-6">
                                            <button
                                                onClick={handleSave}
                                                disabled={isSaving}
                                                className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-lg disabled:opacity-70"
                                            >
                                                {isSaving ? "Saving..." : "Save PDF"}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
