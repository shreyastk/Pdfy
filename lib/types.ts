/**
 * Shared data models and types for the PDFy feature expansion.
 *
 * This module is the single source of truth for the geometry, tool-result, and
 * configuration shapes used across the `lib/` logic layer and the UI. It is kept
 * dependency-free (no React, no pdf-lib) so it can be imported anywhere — pure
 * planners, validators, executors, and components alike.
 *
 * See design.md "Data Models" and the ToolTemplate interface for the contracts
 * these types implement.
 */

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** An axis-aligned rectangle in PDF user-space (points). */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A 2D point in PDF user-space (points). */
export interface Point {
  x: number;
  y: number;
}

/** An RGB color with each channel normalized to the 0..1 range (pdf-lib convention). */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

// ---------------------------------------------------------------------------
// Page operations
// ---------------------------------------------------------------------------

/** A crop region targeting a single 1-based page. */
export interface PageCrop {
  /** 1-based page number. */
  page: number;
  rect: Rect;
}

/** Specification for resizing pages by absolute size or by scale factor. */
export interface ResizeSpec {
  mode: "size" | "scale";
  /** Target dimensions in points; used when `mode === "size"`. */
  target?: { width: number; height: number };
  /** Scale factor in the 0.1..10.0 range; used when `mode === "scale"`. */
  scale?: number;
  /** Whether to preserve aspect ratio. */
  proportional: boolean;
  /** Whether the spec applies to every page or only a selection. */
  applyToAll: boolean;
}

// ---------------------------------------------------------------------------
// SEO / site configuration
// ---------------------------------------------------------------------------

/** Site-level defaults used to fill any missing per-tool SEO/OG metadata. */
export interface SiteDefaults {
  title: string;
  description: string;
  ogImage: string;
  baseUrl: string;
}

// ---------------------------------------------------------------------------
// Tool execution surface (ToolTemplate contract)
// ---------------------------------------------------------------------------

/** Progress reported by a running tool operation. */
export interface Progress {
  current: number;
  total: number;
  label?: string;
}

/** A single downloadable artifact produced by a tool. */
export interface Download {
  filename: string;
  data: Uint8Array | Blob;
}

/** The result of a successful tool operation: downloads plus optional notices. */
export interface ToolResult {
  downloads: Download[];
  /** Informational messages (e.g. fidelity-limitation notices) shown before download. */
  notices?: string[];
}

// ---------------------------------------------------------------------------
// Discriminated-result helpers (used by validators and pure planners)
// ---------------------------------------------------------------------------

/**
 * Successful arm of a generic discriminated result.
 *
 * @typeParam T - the success payload type.
 */
export interface Ok<T> {
  ok: true;
  value: T;
}

/**
 * Failure arm of a generic discriminated result.
 *
 * @typeParam E - the error payload type (defaults to `string`).
 */
export interface Err<E = string> {
  ok: false;
  error: E;
}

/**
 * A discriminated union representing either success (`Ok<T>`) or failure (`Err<E>`).
 * Validators and pure planners return this instead of throwing so guard cases are
 * explicit and exhaustively checkable.
 *
 * @typeParam T - the success payload type.
 * @typeParam E - the error payload type (defaults to `string`).
 */
export type Result<T, E = string> = Ok<T> | Err<E>;

/** Construct a successful {@link Result}. */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/** Construct a failed {@link Result}. */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/** Type guard narrowing a {@link Result} to its success arm. */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

/** Type guard narrowing a {@link Result} to its failure arm. */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/**
 * A lightweight discriminated result for validators that only need to signal
 * success or a typed reason for failure. Mirrors the `{ ok: true } | { ok: false; reason }`
 * shape used throughout the design's validator signatures.
 *
 * @typeParam R - the union of valid failure reasons.
 */
export type Validation<R extends string> = { ok: true } | { ok: false; reason: R };

/** Construct a passing {@link Validation}. */
export function valid(): { ok: true } {
  return { ok: true };
}

/** Construct a failing {@link Validation} with a typed reason. */
export function invalid<R extends string>(reason: R): { ok: false; reason: R } {
  return { ok: false, reason };
}
