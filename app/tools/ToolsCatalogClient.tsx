"use client";

/**
 * ToolsCatalogClient — interactive catalog grid for the Tools page.
 *
 * Renders every tool from the registry (`TOOLS`) and lets the user narrow the
 * list with a debounced search field and a category filter. All filtering is
 * delegated to the pure `filterTools` helper.
 *
 * Behavior (Requirements 10.1, 10.6):
 * - 10.1: Case-insensitive partial match on tool name OR description. The
 *   search input is debounced so filtering applies within ~250ms (≤300ms) of
 *   the last keystroke.
 * - 10.6: When no tools match, a visible "No tools found" message is shown and
 *   zero cards are rendered.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CATEGORIES,
  TOOLS,
  type CategoryFilter,
} from "@/lib/tool-registry";
import { filterTools } from "@/lib/tool-search";
import { toolIcons } from "@/lib/icons";

const ACCENT = "#009966";
const DEBOUNCE_MS = 250;

export default function ToolsCatalogClient() {
  // Raw input value (updates on every keystroke).
  const [searchInput, setSearchInput] = useState("");
  // Debounced query that actually drives filtering (Req 10.1).
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("All");

  // Debounce: apply the latest keystroke to `query` after ~250ms of idle.
  useEffect(() => {
    const handle = setTimeout(() => setQuery(searchInput), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const visibleTools = useMemo(
    () => filterTools(TOOLS, query, category),
    [query, category],
  );

  return (
    <div>
      {/* Controls: search + category filter */}
      <div className="max-w-3xl mx-auto mb-10 flex flex-col gap-4">
        <div className="relative">
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search tools..."
            aria-label="Search tools"
            className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#333333] dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-[#009966] focus:ring-2 focus:ring-[#009966]/30 transition-colors"
          />
        </div>

        <div
          className="flex flex-wrap justify-center gap-2"
          role="group"
          aria-label="Filter tools by category"
        >
          {CATEGORIES.map((cat) => {
            const active = cat === category;
            return (
              <button
                key={cat}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(cat)}
                className={
                  active
                    ? "px-4 py-1.5 rounded-full text-sm font-medium bg-[#009966] text-white border border-[#009966] transition-colors"
                    : "px-4 py-1.5 rounded-full text-sm font-medium bg-white dark:bg-slate-800 text-[#4d4d4d] dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-[#009966] hover:text-[#009966] transition-colors"
                }
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Results (Req 10.6: zero cards + visible message when empty) */}
      {visibleTools.length === 0 ? (
        <p
          role="status"
          className="text-center text-lg text-[#666666] dark:text-slate-400 py-16"
        >
          No tools found
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {visibleTools.map((tool) => {
            const iconPath = toolIcons[tool.icon as keyof typeof toolIcons];
            return (
              <Link
                key={tool.slug}
                href={`/tools/${tool.slug}`}
                className="group relative p-8 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 hover:border-[#009966] dark:hover:border-[#009966] hover:shadow-md dark:hover:shadow-black/30 transition-all duration-200 text-center flex flex-col items-center h-full"
              >
                {tool.isNew && (
                  <span
                    className="absolute top-3 right-3 px-2 py-0.5 text-xs font-semibold rounded-full text-white"
                    style={{ backgroundColor: ACCENT }}
                  >
                    New
                  </span>
                )}
                <div className="w-12 h-12 text-[#4d4d4d] dark:text-slate-300 group-hover:text-[#009966] dark:group-hover:text-[#009966] mb-6 transition-colors">
                  {iconPath ? (
                    <svg
                      className="w-full h-full"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d={iconPath}
                      />
                    </svg>
                  ) : null}
                </div>
                <h3 className="text-lg font-bold text-[#333333] dark:text-slate-100 mb-3">
                  {tool.name}
                </h3>
                <p className="text-sm text-[#666666] dark:text-slate-400 leading-relaxed">
                  {tool.description}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
