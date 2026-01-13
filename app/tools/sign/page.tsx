"use client";

import { useState, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import FileUploader from "@/components/FileUploader";
import SignaturePad from "@/components/SignaturePad";
import { signPDF, downloadPDF } from "@/lib/pdf-operations";
// CSS imports removed as text/annotation layers are disabled

// Configure worker for react-pdf
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface FileWithPreview extends File {
    preview?: string;
}

export default function SignPDF() {
    const [file, setFile] = useState<FileWithPreview | null>(null);
    const [numPages, setNumPages] = useState<number | null>(null);
    const [signature, setSignature] = useState<string | null>(null);
    const [isCreatingSignature, setIsCreatingSignature] = useState(false);
    const [placingSignature, setPlacingSignature] = useState(false);
    const [placedSignatures, setPlacedSignatures] = useState<
        { pageIndex: number; x: number; y: number; width: number; height: number; id: number }[]
    >([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [pageWidth, setPageWidth] = useState<number>(0);
    const [scale, setScale] = useState(1);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Responsive PDF scaling
        const handleResize = () => {
            if (containerRef.current) {
                setPageWidth(Math.min(containerRef.current.clientWidth - 48, 800)); // Max width 800px
            }
        };
        handleResize();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const handleFilesSelected = (files: File[]) => {
        if (files.length > 0) {
            setFile(files[0]);
        }
    };

    const handleDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
        setNumPages(numPages);
    };

    const handlePageClick = (e: React.MouseEvent, pageIndex: number, pdfPageWidth: number, pdfPageHeight: number) => {
        if (!signature || !placingSignature) return;

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Default signature size (aspect ratio preserved usually, but fixed here for simplicity)
        // We render it as maybe 150px wide on screen
        const displayWidth = 150;
        const displayHeight = 60; // Approximate

        // Center signature on click
        const centeredX = x - displayWidth / 2;
        const centeredY = y - displayHeight / 2;

        // Convert to PDF coordinates (0,0 is bottom-left in PDF usually, but pdf-lib handles it.
        // pdf-lib's (0,0) is bottom-left.
        // PDF.js renders from top-left.
        // We need to invert Y.

        // BUT! We will store SCREEN coordinates relative to the rendered page first, 
        // and convert to PDF coordinates ONLY when saving, 
        // OR we can just store percentage and convert later.
        // Storing raw PDF coordinates is best if we know the page size.
        // However, we don't know the TRUE underlying PDF page size easily without loading it in pdf-lib too.
        // The `pdfPageWidth` passed here is the RENDERED width from react-pdf.

        // For simplicity, we'll store normalized coordinates (0-1) and then multiply by actual page size in backend?
        // OR, we assume the display ratio.

        // Let's store the raw display coordinates for UI rendering, and the ratio for backend.

        setPlacedSignatures([
            ...placedSignatures,
            {
                pageIndex,
                x: centeredX,
                y: centeredY,
                width: displayWidth,
                height: displayHeight,
                id: Date.now(),
            },
        ]);

        setPlacingSignature(false);
    };

    const removeSignature = (id: number) => {
        setPlacedSignatures(placedSignatures.filter((s) => s.id !== id));
    };

    const handleSave = async () => {
        if (!file || placedSignatures.length === 0 || !signature) return;

        try {
            setIsProcessing(true);

            // We need to map the screen coordinates to the actual PDF coordinates.
            // Since we don't have the original PDF page size loaded here in the UI (only rendered size),
            // we'll have to re-calculate it or assume a standard ratio.
            // Better approach: Pass the RENDERED width/height to the backend function, and let it scale?
            // No, backend uses the real PDF dimensions.

            // We will pass the normalization ratios!
            // xRatio = x / displayedPageWidth
            // yRatio = y / displayedPageHeight

            // The issue is React-PDF renders at a specific width. We need that width.
            // We will assume the `width={pageWidth}` prop sets the width.

            // But we need the HEIGHT of the rendered page to normalize Y.
            // We can get this by querying the DOM elements or assuming standard A4 ratio... but files vary.

            // Quick fix: We'll read the actual elements from the DOM just before saving?
            // Or we can just calculate ratios based on the click event target which we know.
            // But we stored x/y, we didn't store the page Element dimensions at that moment.

            // Let's modify `placedSignatures` to include the `pageWidth` and `pageHeight` of the RENDERED page it was placed on.
            // I'll update `handlePageClick` to capture this context if possible, or just look it up now.

            // Actually, since all pages are rendered with `width={pageWidth}`, we know the width.
            // The height is variable.

            // Let's query the specific page elements.
            const processedSignatures = placedSignatures.map(sig => {
                const pageElement = document.querySelector(`[data-page-number="${sig.pageIndex + 1}"]`);
                if (!pageElement) return null;

                const rect = pageElement.getBoundingClientRect();
                // rect.width should be approximately pageWidth

                // Normalize coordinates (0 to 1)
                // PDF-lib coordinate system: (0,0) is BOTTOM-LEFT.
                // Screen coordinate system: (0,0) is TOP-LEFT.

                const xRatio = sig.x / rect.width;
                // Invert Y for PDF-lib
                const yRatio = (rect.height - sig.y - sig.height) / rect.height; // Bottom-left of the signature rect

                const widthRatio = sig.width / rect.width;
                const heightRatio = sig.height / rect.height;

                return {
                    pageIndex: sig.pageIndex,
                    xRatio,
                    yRatio,
                    widthRatio,
                    heightRatio
                };
            }).filter(Boolean);

            // Now we modify the backend function to accept ratios instead of absolute points, 
            // OR we just load the PDF here to get dimensions. 
            // Loading here using `pdf-lib` is safer.

            const { PDFDocument } = await import("pdf-lib");
            const arrayBuffer = await file.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            const pages = pdfDoc.getPages();

            const finalSignatures = processedSignatures.map(sig => {
                if (!sig) return null;
                const page = pages[sig.pageIndex];
                const { width, height } = page.getSize();

                return {
                    pageIndex: sig.pageIndex,
                    x: sig.xRatio * width,
                    y: sig.yRatio * height,
                    width: sig.widthRatio * width,
                    height: sig.heightRatio * height
                };
            }).filter(Boolean) as any[];

            const signedPdf = await signPDF(file, signature, finalSignatures);
            downloadPDF(signedPdf, `signed-${file.name}`);
        } catch (error) {
            console.error("Error signing PDF:", error);
            alert("Failed to sign PDF");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 pt-24 pb-16">
            <div className="container mx-auto px-4">
                {!file ? (
                    <div className="max-w-xl mx-auto">
                        <h1 className="text-3xl font-bold text-slate-900 mb-4 text-center">
                            Sign PDF
                        </h1>
                        <p className="text-slate-600 mb-8 text-center">
                            Add your signature to PDF documents. Draw, type, or upload a signature image.
                        </p>
                        <FileUploader
                            onFilesSelected={handleFilesSelected}
                            accept=".pdf"
                            multiple={false}
                        />
                    </div>
                ) : (
                    <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-8">
                        {/* Sticky Sidebar for Tools */}
                        <div className="lg:w-80 flex-shrink-0">
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sticky top-24">
                                <h2 className="text-lg font-bold text-slate-900 mb-4">Signature Tools</h2>

                                {!signature ? (
                                    <button
                                        onClick={() => setIsCreatingSignature(true)}
                                        className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-3 font-medium transition-colors mb-4 flex items-center justify-center gap-2"
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                        </svg>
                                        Create Signature
                                    </button>
                                ) : (
                                    <div className="mb-6">
                                        <p className="text-sm text-slate-500 mb-2">Your Signature:</p>
                                        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 mb-3 flex items-center justify-center h-24">
                                            <img src={signature} alt="Signature" className="max-h-full max-w-full" />
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setPlacingSignature(true)}
                                                className={`flex-1 py-2 rounded-lg font-medium text-sm transition-colors ${placingSignature ? 'bg-blue-600 text-white ring-2 ring-blue-300' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                                            >
                                                {placingSignature ? 'Click on page to place' : 'Place Signature'}
                                            </button>
                                            <button
                                                onClick={() => { setSignature(null); setPlacingSignature(false); }}
                                                className="px-3 py-2 border border-slate-300 rounded-lg text-slate-600 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
                                            >
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="border-t border-slate-200 pt-6 mt-6">
                                    <button
                                        onClick={handleSave}
                                        disabled={placedSignatures.length === 0 || isProcessing}
                                        className={`w-full py-3 rounded-lg font-bold text-white transition-all transform hover:-translate-y-0.5
                           ${placedSignatures.length === 0 || isProcessing
                                                ? "bg-slate-300 cursor-not-allowed"
                                                : "bg-green-600 hover:bg-green-700 shadow-md hover:shadow-lg"}`}
                                    >
                                        {isProcessing ? "Processing..." : "Download Signed PDF"}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Main Content - PDF Preview */}
                        <div className="flex-grow flex flex-col items-center min-h-[600px] bg-slate-200 rounded-xl p-4 md:p-8 overflow-y-auto" ref={containerRef}>
                            <Document
                                file={file}
                                onLoadSuccess={handleDocumentLoadSuccess}
                                loading={<div className="animate-pulse flex space-x-4"><div className="h-96 w-64 bg-slate-300 rounded"></div></div>}
                                className="flex flex-col gap-8"
                            >
                                {Array.from(new Array(numPages), (el, index) => (
                                    <div key={`page_${index + 1}`} className="relative shadow-xl relative-group" data-page-number={index + 1}>
                                        <Page
                                            pageNumber={index + 1}
                                            width={pageWidth > 0 ? pageWidth : 600}
                                            onClick={(e) => handlePageClick(e, index, pageWidth, 0)}
                                            renderTextLayer={false}
                                            renderAnnotationLayer={false}
                                            className={placingSignature ? "cursor-crosshair" : ""}
                                        />

                                        {/* Render placed signatures for this page */}
                                        {placedSignatures.filter(s => s.pageIndex === index).map(sig => (
                                            <div
                                                key={sig.id}
                                                style={{
                                                    position: 'absolute',
                                                    left: sig.x,
                                                    top: sig.y,
                                                    width: sig.width,
                                                    height: sig.height,
                                                    zIndex: 10
                                                }}
                                                className="group border border-transparent hover:border-blue-500 cursor-move"
                                            >
                                                <img src={signature!} alt="Signature" className="w-full h-full object-contain pointer-events-none" />
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); removeSignature(sig.id); }}
                                                    className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                                >
                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </Document>
                        </div>
                    </div>
                )}

                {/* Modal for Creating Signature */}
                {isCreatingSignature && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                        <SignaturePad
                            onSave={(sig: string) => { setSignature(sig); setIsCreatingSignature(false); setPlacingSignature(true); }}
                            onCancel={() => setIsCreatingSignature(false)}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
