/**
 * Single entry point for loading PDF.js.
 *
 * The worker is served from our own origin (copied into public/vendor by
 * scripts/copy-assets.mjs) rather than a CDN, so no third party sees usage
 * and tools keep working offline once cached by the service worker.
 */
export const PDFJS_WORKER_SRC = "/vendor/pdfjs/pdf.worker.min.mjs";

export async function loadPdfjs() {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
  return pdfjsLib;
}
