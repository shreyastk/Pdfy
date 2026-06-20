/**
 * Batch Processor — validation, per-file runner, and archive packaging.
 *
 * This module applies a single operation to many input files independently
 * (Req 12.1). It is intentionally split into:
 *
 *  - `validateBatch` — a pure, synchronous gate enforcing the documented limits
 *    (1–100 files, ≤100 MB each) so it can be property-tested cheaply
 *    (Correctness Property 23).
 *  - `runBatch` — an async runner that takes an INJECTED `op` so tests can pass
 *    a mock operation. Each file is processed independently; a failing file is
 *    marked `failed` and the batch continues (failure isolation — Req 12.5,
 *    Property 25). Every item reaches a terminal status and there is exactly one
 *    output per success (Property 24).
 *  - `zipResults` — packages all `completed` outputs into a single archive Blob
 *    via jszip (Req 12.4).
 *
 * All processing is client-side; no file content or metadata leaves the browser
 * (Req 12.6).
 *
 * See design.md "Batch Processor".
 */

/** Maximum number of files allowed in a single batch (Req 12.1, 12.2). */
export const MAX_BATCH_FILES = 100;

/** Maximum allowed size, in bytes, of any single file (100 MB — Req 12.1, 12.2). */
export const MAX_FILE_SIZE = 100 * 1024 * 1024;

/**
 * The status of a single file within a batch. A file starts `queued`, moves to
 * `processing` while its operation runs, and ends in one of the two terminal
 * states `completed` or `failed`.
 */
export type FileStatus = "queued" | "processing" | "completed" | "failed";

/** The per-file unit of work and its current state within the batch. */
export interface BatchItem {
  /** The source file. */
  file: File;
  /** Current processing status. */
  status: FileStatus;
  /** Human-readable failure reason; present only when `status === "failed"`. */
  error?: string;
  /** Operation output; present only when `status === "completed"`. */
  output?: Uint8Array;
}

/** The discriminated result of {@link validateBatch}. */
export type BatchValidation =
  | { ok: true }
  | { ok: false; reason: "too-many" | "none" | "too-large" };

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a candidate batch against the documented limits.
 *
 * Pure and synchronous. The checks are applied in a fixed precedence so the
 * returned reason is deterministic:
 *   1. `none`      — when no files are provided.
 *   2. `too-many`  — when more than {@link MAX_BATCH_FILES} files are provided.
 *   3. `too-large` — when any file exceeds {@link MAX_FILE_SIZE} bytes.
 *
 * @param files - the candidate files for the batch.
 * @returns `{ ok: true }` when the batch is within all limits, otherwise
 *   `{ ok: false, reason }` identifying the first violated limit.
 *
 * Validates: Requirements 12.1, 12.2.
 */
export function validateBatch(files: File[]): BatchValidation {
  if (files.length === 0) {
    return { ok: false, reason: "none" };
  }
  if (files.length > MAX_BATCH_FILES) {
    return { ok: false, reason: "too-many" };
  }
  if (files.some((file) => file.size > MAX_FILE_SIZE)) {
    return { ok: false, reason: "too-large" };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * Produce an immutable snapshot of the working items so each `onUpdate` callback
 * receives a fresh array of fresh objects (safe for React state updates and for
 * callers that retain references between updates).
 */
function snapshot(items: BatchItem[]): BatchItem[] {
  return items.map((item) => ({ ...item }));
}

/**
 * Run a batch operation over `files`, processing each file INDEPENDENTLY.
 *
 * Every item is initialized to `queued` (one `onUpdate` emission), then each
 * file is processed in sequence: it is marked `processing` (emitting an update),
 * `op` is awaited, and the item transitions to `completed` (with its output) on
 * success or `failed` (with the error message) on failure. A failure NEVER halts
 * the batch — remaining files are still processed (Req 12.5).
 *
 * `op` may throw or reject; the error is caught per-file and recorded as that
 * item's failure reason. On resolution every item is in a terminal state and
 * there is exactly one `output` per `completed` item (Req 12.1, 12.3).
 *
 * @param files - the input files (assumed already validated via {@link validateBatch}).
 * @param op - the per-file operation; injected so tests can supply a mock.
 * @param onUpdate - called with a fresh snapshot after every status change.
 * @returns the final list of {@link BatchItem}s, each in a terminal status.
 *
 * Validates: Requirements 12.1, 12.3, 12.5.
 */
export async function runBatch(
  files: File[],
  op: (f: File) => Promise<Uint8Array>,
  onUpdate: (items: BatchItem[]) => void,
): Promise<BatchItem[]> {
  const items: BatchItem[] = files.map((file) => ({ file, status: "queued" }));

  // Emit the initial all-queued state.
  onUpdate(snapshot(items));

  for (const item of items) {
    item.status = "processing";
    item.error = undefined;
    item.output = undefined;
    onUpdate(snapshot(items));

    try {
      const output = await op(item.file);
      item.status = "completed";
      item.output = output;
      item.error = undefined;
    } catch (error) {
      // Failure isolation: record the reason and keep going (Req 12.5).
      item.status = "failed";
      item.error =
        error instanceof Error ? error.message : "Processing failed.";
      item.output = undefined;
    }
    onUpdate(snapshot(items));
  }

  return items;
}

// ---------------------------------------------------------------------------
// Archive packaging
// ---------------------------------------------------------------------------

/**
 * Ensure a file name is unique within the archive by appending ` (n)` before the
 * extension on collision (e.g. `report.pdf`, `report (1).pdf`).
 */
function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }

  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";

  let counter = 1;
  let candidate = `${base} (${counter})${ext}`;
  while (used.has(candidate)) {
    counter += 1;
    candidate = `${base} (${counter})${ext}`;
  }
  used.add(candidate);
  return candidate;
}

/**
 * Package every successfully processed item's output into a single ZIP archive.
 *
 * Only `completed` items with an `output` are included. Each entry is named by
 * its source file name with collisions disambiguated via {@link uniqueName}.
 *
 * @param items - the (typically terminal) batch items to archive.
 * @returns a Promise resolving to a `Blob` containing the ZIP archive.
 *
 * Validates: Requirements 12.4.
 */
export async function zipResults(items: BatchItem[]): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const used = new Set<string>();

  for (const item of items) {
    if (item.status === "completed" && item.output) {
      const name = uniqueName(item.file.name || "output.pdf", used);
      // Copy into a fresh Uint8Array so jszip owns an independent buffer.
      zip.file(name, new Uint8Array(item.output));
    }
  }

  return zip.generateAsync({ type: "blob" });
}
