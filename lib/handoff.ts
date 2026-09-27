/**
 * Tool chaining ("handoff") — pass one tool's output straight into another
 * without downloading and re-uploading.
 *
 * Deliberately memory-only: the file lives in a module variable and survives
 * client-side navigation between tools, but is never written to disk
 * (IndexedDB/localStorage) and disappears on reload or when the tab closes.
 */
import { recordEntry } from "@/lib/history-store";
import { getTool } from "@/lib/tool-registry";

export interface ToolOutput {
  file: File;
  /** Display name of the tool that produced it. */
  tool: string;
  /** Slug of the tool that produced it, when known. */
  toolSlug: string | null;
}

/** Fired on `window` whenever a tool produces a downloadable output. */
export const OUTPUT_EVENT = "pdfy:output";

let lastOutput: ToolOutput | null = null;
let pendingInput: File | null = null;

/** Resolve the current tool from the URL (`/tools/<slug>`), if any. */
export function currentToolSlug(pathname: string): string | null {
  const match = /^\/tools\/([^/]+)\/?$/.exec(pathname);
  return match ? match[1] : null;
}

/** Whether `file` would be accepted by an `<input accept>` string. */
export function acceptsFile(accept: string, file: { name: string; type: string }): boolean {
  const tokens = accept
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return tokens.some((t) => {
    if (t.startsWith(".")) return name.endsWith(t);
    if (t.endsWith("/*")) return type.startsWith(t.slice(0, -1));
    return type === t;
  });
}

/**
 * Record that the current tool produced `data`. Adds a recent-files entry
 * and announces the output so the "continue with" bar can offer it onward.
 */
export function rememberOutput(data: Uint8Array | Blob, filename: string, mime?: string): void {
  if (typeof window === "undefined") return;
  const slug = currentToolSlug(window.location.pathname);
  const tool = (slug && getTool(slug)?.name) || "PDFy";
  const type = mime ?? (data instanceof Blob ? data.type : "application/pdf");
  const file = new File([data as BlobPart], filename, { type });

  lastOutput = { file, tool, toolSlug: slug };
  recordEntry({ fileName: filename, tool, timestamp: Date.now() });
  window.dispatchEvent(new CustomEvent<ToolOutput>(OUTPUT_EVENT, { detail: lastOutput }));
}

export function getLastOutput(): ToolOutput | null {
  return lastOutput;
}

/** Queue `file` to be loaded automatically by the next tool's uploader. */
export function setPendingInput(file: File): void {
  pendingInput = file;
}

/**
 * Take the queued input if the uploader accepts it. The file is consumed
 * (cleared) either way so it never leaks into an unrelated later visit.
 */
export function takePendingInput(accept: string): File | null {
  const file = pendingInput;
  pendingInput = null;
  if (!file || !acceptsFile(accept, file)) return null;
  return file;
}
