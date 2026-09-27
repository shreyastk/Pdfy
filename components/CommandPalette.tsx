"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TOOLS } from "@/lib/tool-registry";
import { filterTools } from "@/lib/tool-search";

/** Event other components can dispatch on `window` to open the palette. */
export const OPEN_PALETTE_EVENT = "pdfy:open-palette";

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/**
 * Quick tool switcher. Opens with Ctrl/⌘+K anywhere, or "/" when not typing.
 * Arrow keys move, Enter opens, Escape closes.
 */
export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => filterTools(TOOLS, query, "All"), [query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !isTypingTarget(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const go = (slug: string) => {
    close();
    router.push(`/tools/${slug}`);
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && results[active]) {
      go(results[active].slug);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/40 backdrop-blur-sm px-4 pt-[15vh]"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Find a tool"
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white dark:bg-slate-800 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onInputKey}
          placeholder="Search tools…"
          aria-label="Search tools"
          aria-controls="palette-results"
          aria-activedescendant={results[active] ? `palette-${results[active].slug}` : undefined}
          className="w-full border-b border-slate-200 dark:border-slate-700 bg-transparent px-5 py-4 text-base text-slate-900 dark:text-slate-100 outline-none placeholder:text-slate-400"
        />
        <ul ref={listRef} id="palette-results" role="listbox" className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 && <li className="px-5 py-6 text-center text-sm text-slate-500">No tools found</li>}
          {results.map((tool, i) => (
            <li
              key={tool.slug}
              id={`palette-${tool.slug}`}
              role="option"
              aria-selected={i === active}
              data-index={i}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(tool.slug)}
              className={`cursor-pointer px-5 py-2.5 ${i === active ? "bg-emerald-50 dark:bg-emerald-950/40" : ""}`}
            >
              <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{tool.name}</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">{tool.description}</span>
            </li>
          ))}
        </ul>
        <div className="flex gap-4 border-t border-slate-200 dark:border-slate-700 px-5 py-2 text-[11px] text-slate-500 dark:text-slate-400">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>Enter</kbd> open</span>
          <span><kbd>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
