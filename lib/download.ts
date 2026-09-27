/**
 * The one place tools hand a finished file to the user.
 *
 * Triggers the browser download and records the output (recent-files
 * history + tool chaining) via {@link rememberOutput}.
 */
import { rememberOutput } from "@/lib/handoff";

export function saveFile(data: Uint8Array | Blob, filename: string, mime?: string): void {
  const type = mime ?? (data instanceof Blob && data.type ? data.type : guessMime(filename));
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Revoke on the next tick; revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  rememberOutput(blob, filename, type);
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  zip: "application/zip",
  txt: "text/plain",
  md: "text/markdown",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export function guessMime(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}
