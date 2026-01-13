"use client";

import { useRef, useState, useEffect } from "react";

interface SignaturePadProps {
    onSave: (signatureDataUrl: string) => void;
    onCancel: () => void;
}

export default function SignaturePad({ onSave, onCancel }: SignaturePadProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [activeTab, setActiveTab] = useState<"draw" | "type" | "upload">("draw");
    const [typedName, setTypedName] = useState("");
    const [typedFont, setTypedFont] = useState("font-cursive"); // conceptual font class

    // Drawing state
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Set canvas size
        canvas.width = canvas.parentElement?.clientWidth || 500;
        canvas.height = 200;

        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
    }, [activeTab]);

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        setIsDrawing(true);
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const { offsetX, offsetY } = getCoordinates(e, canvas);
        ctx.beginPath();
        ctx.moveTo(offsetX, offsetY);
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const { offsetX, offsetY } = getCoordinates(e, canvas);
        ctx.lineTo(offsetX, offsetY);
        ctx.stroke();
    };

    const stopDrawing = () => {
        setIsDrawing(false);
    };

    const getCoordinates = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
        if ("touches" in e) {
            const rect = canvas.getBoundingClientRect();
            return {
                offsetX: e.touches[0].clientX - rect.left,
                offsetY: e.touches[0].clientY - rect.top,
            };
        }
        return {
            offsetX: (e as React.MouseEvent).nativeEvent.offsetX,
            offsetY: (e as React.MouseEvent).nativeEvent.offsetY,
        };
    };

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    const handleSave = () => {
        if (activeTab === "draw") {
            const canvas = canvasRef.current;
            if (canvas) {
                onSave(canvas.toDataURL("image/png"));
            }
        } else if (activeTab === "type") {
            // Create a temporary canvas to render the typed text as an image
            const canvas = document.createElement("canvas");
            canvas.width = 500;
            canvas.height = 150;
            const ctx = canvas.getContext("2d");
            if (ctx) {
                ctx.fillStyle = "rgba(0,0,0,0)"; // Transparent background
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                // Map font selection to actual CSS font
                let fontStyle = "48px cursive";
                if (typedFont === "font-serif") fontStyle = "48px serif";
                if (typedFont === "font-sans") fontStyle = "48px sans-serif";
                if (typedFont === "font-mono") fontStyle = "48px monospace";

                // Try to load a google font style if we had one, but sticking to basics for now
                // Or we could use the @next/font if we had it set up, but let's just use standard
                if (typedFont === "ephesis") fontStyle = "60px 'Ephesis', cursive";
                if (typedFont === "sacramento") fontStyle = "60px 'Sacramento', cursive";

                ctx.font = fontStyle;
                ctx.fillStyle = "#000";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(typedName || "Your Signature", canvas.width / 2, canvas.height / 2);
                onSave(canvas.toDataURL("image/png"));
            }
        } else if (activeTab === "upload") {
            // Logic handled in the component via file input change
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                if (event.target?.result) {
                    onSave(event.target.result as string);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-lg border border-slate-200">
            <h3 className="text-xl font-bold text-slate-800 mb-4">Create Signature</h3>

            <div className="flex border-b border-slate-200 mb-4">
                <button
                    onClick={() => setActiveTab("draw")}
                    className={`px-4 py-2 text-sm font-medium ${activeTab === "draw"
                            ? "text-blue-600 border-b-2 border-blue-600"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                >
                    Draw
                </button>
                <button
                    onClick={() => setActiveTab("type")}
                    className={`px-4 py-2 text-sm font-medium ${activeTab === "type"
                            ? "text-blue-600 border-b-2 border-blue-600"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                >
                    Type
                </button>
                <button
                    onClick={() => setActiveTab("upload")}
                    className={`px-4 py-2 text-sm font-medium ${activeTab === "upload"
                            ? "text-blue-600 border-b-2 border-blue-600"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                >
                    Upload
                </button>
            </div>

            <div className="min-h-[220px] flex items-center justify-center bg-slate-50 rounded-lg border-2 border-dashed border-slate-300 relative overflow-hidden">
                {activeTab === "draw" && (
                    <>
                        <canvas
                            ref={canvasRef}
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseLeave={stopDrawing}
                            onTouchStart={startDrawing}
                            onTouchMove={draw}
                            onTouchEnd={stopDrawing}
                            className="cursor-crosshair bg-transparent w-full h-full touch-none"
                        />
                        <button
                            onClick={clearCanvas}
                            className="absolute top-2 right-2 text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 px-2 py-1 rounded"
                        >
                            Clear
                        </button>
                    </>
                )}

                {activeTab === "type" && (
                    <div className="w-full h-full p-4 flex flex-col items-center justify-center">
                        <input
                            type="text"
                            value={typedName}
                            onChange={(e) => setTypedName(e.target.value)}
                            placeholder="Type your name"
                            className="w-full text-center text-3xl p-2 bg-transparent outline-none border-b-2 border-slate-300 focus:border-blue-500 mb-4"
                            style={{
                                fontFamily: typedFont === 'sacramento' ? 'cursive' :
                                    typedFont === 'ephesis' ? 'cursive' :
                                        'inherit'
                            }}
                        />
                        <div className="flex gap-2 mt-4">
                            {/* Simple font selector mock */}
                            <button onClick={() => setTypedFont("font-sans")} className="p-2 border rounded hover:bg-slate-100 font-sans">Sans</button>
                            <button onClick={() => setTypedFont("font-serif")} className="p-2 border rounded hover:bg-slate-100 font-serif">Serif</button>
                            <button onClick={() => setTypedFont("sacramento")} className="p-2 border rounded hover:bg-slate-100 italic">Cursive</button>
                        </div>
                    </div>
                )}

                {activeTab === "upload" && (
                    <div className="text-center p-6">
                        <p className="text-slate-500 mb-4">Upload an image of your signature</p>
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleFileUpload}
                            className="block w-full text-sm text-slate-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100"
                        />
                    </div>
                )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
                <button
                    onClick={onCancel}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium"
                >
                    Cancel
                </button>
                <button
                    onClick={handleSave}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium shadow-sm hover:shadow-md"
                >
                    Use Signature
                </button>
            </div>
        </div>
    );
}
