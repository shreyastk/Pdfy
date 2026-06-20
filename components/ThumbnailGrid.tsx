"use client";

/**
 * ThumbnailGrid — renders per-page PDF thumbnails with native HTML5 drag-and-drop
 * reordering.
 *
 * Responsibilities (Requirement 11):
 *  - Render a thumbnail preview for every page, client-side (11.1, 11.7).
 *  - Show a per-page loading indicator while a thumbnail is still rendering (11.2).
 *  - Show a placeholder on render failure for a page WITHOUT aborting the others (11.3).
 *  - Show a visible drop-target indicator while dragging (11.4).
 *  - Update the displayed order on drop using the pure {@link moveItem} helper (11.5).
 *  - Treat the displayed `order` array as the single source of truth, handed back to the
 *    parent via {@link ThumbnailGridProps.onReorder} so executors produce output whose
 *    page order equals the displayed order (11.6).
 *
 * The component is intentionally "controlled": the parent owns the `order` array (the
 * source of truth) and updates it from the `onReorder` callback. The component renders
 * thumbnails keyed by stable page id, so reordering never re-renders/re-fetches images.
 */

import { useEffect, useRef, useState } from "react";
import { moveItem, renderAllThumbnails } from "@/lib/thumbnails";

/** Render state for a single source page. */
type ThumbState =
  | { status: "loading" }
  | { status: "ready"; dataUrl: string }
  | { status: "failed" };

export interface ThumbnailGridProps {
  /** The PDF source to render thumbnails from. */
  file: File | ArrayBuffer | Uint8Array;
  /**
   * Displayed order as a list of 0-based source page indices. This is the single source
   * of truth for page order. When omitted, the grid initializes to natural order once the
   * page count is known.
   */
  order?: number[];
  /**
   * Called with the new order array whenever the user drops a thumbnail at a new position.
   * The array is a permutation of the current order (multiset-preserving).
   */
  onReorder?: (order: number[]) => void;
  /** Viewport scale for thumbnail rasterization (smaller = faster). Default 0.5. */
  scale?: number;
}

export default function ThumbnailGrid({
  file,
  order: controlledOrder,
  onReorder,
  scale = 0.5,
}: ThumbnailGridProps) {
  // Per-page render state keyed by 0-based source page index.
  const [thumbs, setThumbs] = useState<Record<number, ThumbState>>({});
  // Internal order used when the parent does not control `order`.
  const [internalOrder, setInternalOrder] = useState<number[]>(controlledOrder ?? []);
  // Drag bookkeeping (positions are indices into the displayed `order` array).
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  // The order array that is actually displayed: controlled prop wins when provided.
  const order = controlledOrder ?? internalOrder;

  // Track whether we've started a render pass for the current file to avoid duplicates.
  const renderTokenRef = useRef(0);

  // Kick off client-side rendering of all page thumbnails whenever the file changes.
  useEffect(() => {
    const token = ++renderTokenRef.current;
    let cancelled = false;

    setThumbs({});

    (async () => {
      try {
        const total = await renderAllThumbnails(
          file,
          (pageNumber, dataUrl) => {
            if (cancelled || token !== renderTokenRef.current) return;
            const idx = pageNumber - 1; // store by 0-based index
            setThumbs((prev) => ({
              ...prev,
              [idx]: dataUrl ? { status: "ready", dataUrl } : { status: "failed" },
            }));
          },
          scale
        );

        if (cancelled || token !== renderTokenRef.current) return;

        // Seed the loading placeholders for any pages not yet reported, and initialize
        // the natural order when uncontrolled.
        setThumbs((prev) => {
          const next = { ...prev };
          for (let i = 0; i < total; i++) {
            if (!next[i]) next[i] = { status: "loading" };
          }
          return next;
        });

        if (controlledOrder === undefined) {
          setInternalOrder((prev) =>
            prev.length === total ? prev : Array.from({ length: total }, (_, i) => i)
          );
        }
      } catch {
        // Whole-document load failure: nothing to render. Leave the grid empty;
        // the parent tool surfaces the file-level error.
        if (!cancelled && token === renderTokenRef.current) {
          setThumbs({});
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, scale]);

  function commitOrder(next: number[]) {
    if (controlledOrder === undefined) {
      setInternalOrder(next);
    }
    onReorder?.(next);
  }

  function handleDrop(position: number) {
    if (dragFrom !== null && dragFrom !== position) {
      const next = moveItem(order, dragFrom, position);
      commitOrder(next);
    }
    setDragFrom(null);
    setDropTarget(null);
  }

  if (order.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-gray-300 p-8 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400"
        role="status"
      >
        Rendering page previews…
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
      role="list"
      aria-label="Page thumbnails"
    >
      {order.map((pageIndex, position) => {
        const state: ThumbState = thumbs[pageIndex] ?? { status: "loading" };
        const isDropTarget = dropTarget === position && dragFrom !== position;

        return (
          <div
            key={pageIndex}
            role="listitem"
            draggable
            onDragStart={() => setDragFrom(position)}
            onDragEnter={() => setDropTarget(position)}
            onDragOver={(e) => {
              // Required to allow a drop.
              e.preventDefault();
              if (dropTarget !== position) setDropTarget(position);
            }}
            onDragLeave={() => {
              setDropTarget((cur) => (cur === position ? null : cur));
            }}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(position);
            }}
            onDragEnd={() => {
              setDragFrom(null);
              setDropTarget(null);
            }}
            className={[
              "group relative flex cursor-grab flex-col items-center rounded-lg border bg-white p-2 transition-colors active:cursor-grabbing dark:bg-gray-900",
              isDropTarget
                ? "border-[#009966] ring-2 ring-[#009966]"
                : "border-gray-200 dark:border-gray-700",
              dragFrom === position ? "opacity-50" : "",
            ].join(" ")}
            aria-label={`Page ${pageIndex + 1} (position ${position + 1})`}
          >
            {/* Drop-target indicator bar (Req 11.4) */}
            {isDropTarget && (
              <span
                className="pointer-events-none absolute inset-y-1 left-0 w-1 rounded-full bg-[#009966]"
                aria-hidden="true"
              />
            )}

            <div className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded bg-gray-50 dark:bg-gray-800">
              {state.status === "loading" && (
                // Per-page loading indicator (Req 11.2)
                <div
                  className="flex flex-col items-center gap-2 text-gray-400"
                  role="status"
                  aria-label={`Rendering page ${pageIndex + 1}`}
                >
                  <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-[#009966]" />
                  <span className="text-xs">Loading…</span>
                </div>
              )}

              {state.status === "ready" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={state.dataUrl}
                  alt={`Page ${pageIndex + 1} preview`}
                  className="h-full w-full object-contain"
                  draggable={false}
                />
              )}

              {state.status === "failed" && (
                // Render-failure placeholder (Req 11.3) — other pages keep rendering.
                <div
                  className="flex flex-col items-center gap-1 px-2 text-center text-gray-400 dark:text-gray-500"
                  role="img"
                  aria-label={`Page ${pageIndex + 1} preview failed to render`}
                >
                  <svg
                    className="h-7 w-7"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M9.88 5.06A9 9 0 0121 12m-1.06 4.94A9 9 0 013 12c0-1.02.17-2 .49-2.9" />
                  </svg>
                  <span className="text-[11px] leading-tight">Preview unavailable</span>
                </div>
              )}
            </div>

            <span className="mt-1 text-xs font-medium text-gray-600 dark:text-gray-300">
              {pageIndex + 1}
            </span>
          </div>
        );
      })}
    </div>
  );
}
