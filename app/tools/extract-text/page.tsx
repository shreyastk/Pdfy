"use client";

import { useState } from "react";
import FileUploader from "@/components/FileUploader";
import { extractPDFText } from "@/lib/pdf-operations";

export default function ExtractText() {
    const [file, setFile] = useState<File | null>(null);
    const [text, setText] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);

    const handleFilesSelected = async (files: File[]) => {
        if (files.length > 0) {
            const selectedFile = files[0];
            setFile(selectedFile);
            setIsProcessing(true);
            try {
                const extracted = await extractPDFText(selectedFile);
                setText(extracted);
            } catch (error) {
                console.error("Failed to extract text", error);
                setText("Error extracting text. Please share the console logs if you report this issue.");
            } finally {
                setIsProcessing(false);
            }
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(text);
        alert("Text copied to clipboard!");
    };

    const downloadText = () => {
        const blob = new Blob([text], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${file?.name.replace(".pdf", "")}.txt`;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 pt-24">
            <div className="container mx-auto px-4 py-8">
                <div className="max-w-4xl mx-auto">
                    <div className="text-center mb-8">
                        <h1 className="text-4xl font-bold text-slate-900 mb-2">Extract Text</h1>
                        <p className="text-slate-600">Copy text content from your PDF files.</p>
                    </div>

                    <div className="bg-white rounded-2xl shadow-xl p-8 min-h-[400px]">
                        {!file ? (
                            <FileUploader
                                onFilesSelected={handleFilesSelected}
                                accept=".pdf"
                                multiple={false}
                            />
                        ) : (
                            <div className="flex flex-col h-full">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-slate-700">Extracted Content</h3>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setFile(null)}
                                            className="text-sm text-slate-500 hover:text-slate-700 mr-4"
                                        >
                                            Upload Another
                                        </button>
                                        <button
                                            onClick={copyToClipboard}
                                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                                        >
                                            Copy
                                        </button>
                                        <button
                                            onClick={downloadText}
                                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                                        >
                                            Download .txt
                                        </button>
                                    </div>
                                </div>

                                {isProcessing ? (
                                    <div className="flex-grow flex items-center justify-center p-12">
                                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                                    </div>
                                ) : (
                                    <textarea
                                        readOnly
                                        value={text}
                                        className="w-full flex-grow min-h-[500px] p-4 border border-slate-200 rounded-lg bg-slate-50 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
