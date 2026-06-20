"use client";

import { useEffect, useState } from "react";

import {
  applyTheme,
  osPrefersDark,
  readStoredTheme,
  resolveTheme,
  writeStoredTheme,
  type Theme,
} from "@/lib/theme";

/**
 * ThemeController renders a light/dark toggle button.
 *
 * - Initializes from the persisted `pdfy.theme` value, falling back to the OS
 *   color-scheme preference when nothing is stored (Req 16.4).
 * - Toggling applies the new appearance and persists it to localStorage
 *   (Req 16.1, 16.2). localStorage access is wrapped so failures fall back to
 *   OS preference without interrupting the user (Req 16.6).
 * - While no value is persisted, an OS color-scheme change updates the applied
 *   appearance (Req 16.5).
 *
 * The pre-paint inline script in app/layout.tsx applies the correct class
 * before first paint (Req 16.3); this component keeps React state in sync with
 * the already-applied DOM state to avoid hydration flicker.
 */
export default function ThemeController() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  // Sync React state with the theme the pre-paint script already applied.
  useEffect(() => {
    const stored = readStoredTheme();
    setTheme(resolveTheme(stored, osPrefersDark()));
    setMounted(true);
  }, []);

  // Track OS color-scheme changes while no theme has been persisted (Req 16.5).
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (event: MediaQueryListEvent) => {
      // Only follow the OS while the user has not explicitly chosen a theme.
      if (readStoredTheme() !== null) {
        return;
      }
      const next: Theme = event.matches ? "dark" : "light";
      applyTheme(next);
      setTheme(next);
    };

    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
    // Persist; failure is non-fatal and falls back to OS preference (Req 16.6).
    writeStoredTheme(next);
  };

  const isDark = theme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      aria-pressed={isDark}
      // suppressHydrationWarning: the pre-paint script may set the applied
      // theme before React hydrates; the icon resolves on mount.
      suppressHydrationWarning
      className="p-2 rounded-full text-slate-600 hover:text-[#009966] hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
    >
      {mounted && isDark ? (
        // Sun icon (currently dark -> offer light)
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      ) : (
        // Moon icon (currently light -> offer dark)
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      )}
    </button>
  );
}
