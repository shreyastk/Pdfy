export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "pdfy.theme";

/**
 * Resolve the effective theme.
 *
 * If a theme value has been persisted (`stored` is non-null) it takes
 * precedence. Otherwise the operating-system color-scheme preference is used:
 * dark when `osPrefersDark` is true, light otherwise.
 *
 * Requirements: 16.1, 16.2, 16.4
 */
export function resolveTheme(
  stored: Theme | null,
  osPrefersDark: boolean
): Theme {
  if (stored !== null) {
    return stored;
  }
  return osPrefersDark ? "dark" : "light";
}

/**
 * Safely read the persisted theme from localStorage.
 * Returns null when nothing is stored, the value is invalid, or storage is
 * unavailable (e.g. access throws). Never throws. (Requirement 16.6)
 */
export function readStoredTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (value === "light" || value === "dark") {
      return value;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Safely persist the theme to localStorage.
 * Returns true on success, false when storage is unavailable. Never throws.
 * (Requirement 16.6)
 */
export function writeStoredTheme(theme: Theme): boolean {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    return true;
  } catch {
    return false;
  }
}

/**
 * Determine whether the OS currently prefers a dark color scheme.
 * Falls back to false when matchMedia is unavailable. Never throws.
 */
export function osPrefersDark(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  } catch {
    return false;
  }
}

/**
 * Apply the resolved theme to the document root by toggling the `dark` class.
 * (Requirements 16.1, 16.2)
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}
