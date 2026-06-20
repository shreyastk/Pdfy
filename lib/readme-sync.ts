/**
 * README synchronization helper — keeps `README.md`'s tool list in sync with
 * the tool registry (single source of truth in `lib/tool-registry.ts`).
 *
 * This module is pure (no DOM, no filesystem) so it can be property-tested
 * directly (task 5.6 / Property 31: README and tool catalog are EQUAL SETS).
 *
 * Behavior (Requirements 18.1–18.4):
 * - 18.1: Every tool in the registry appears in the README with a name and
 *   description that match character-for-character (excluding leading/trailing
 *   whitespace) the registry entry.
 * - 18.2: A README entry whose name does not correspond to any registry tool is
 *   "extra" and must be removed so the counts match.
 * - 18.4: Comparison is done on trimmed names and descriptions.
 *
 * ── README tool-list format (the stable contract parsed by `parseReadmeTools`)
 *
 * The tool list lives in a dedicated markdown section delimited by a heading
 * named exactly `## Tools`. The section runs until the next heading at the same
 * or higher level (a line beginning with `## ` or `# `) or end-of-file.
 *
 * Inside that section, each tool is a single list item of the exact form:
 *
 *     - **{name}** — {description}
 *
 * where:
 * - the bullet is `- ` (hyphen + space),
 * - the name is wrapped in double asterisks: `**{name}**`,
 * - the name and description are separated by ` — ` (space, EM DASH U+2014,
 *   space),
 * - everything after the separator (trimmed) is the description.
 *
 * Lines in the section that do not match this shape (blank lines, intro prose,
 * the privacy statement) are ignored by the parser.
 */

import { TOOLS, type ToolDefinition } from "./tool-registry";

/** A single tool entry as it appears in either the README or the registry. */
export interface ReadmeToolEntry {
  name: string;
  description: string;
}

/** The result of comparing the README tool list against the registry. */
export interface ReadmeComparison {
  /** True when the README and registry describe exactly the same set. */
  equal: boolean;
  /** Registry entries (as `"name — description"`) missing from the README. */
  missingFromReadme: string[];
  /** README entries (as `"name — description"`) absent from the registry. */
  extraInReadme: string[];
}

/** Heading that opens the tool-list section in the README. */
const TOOLS_HEADING = "## Tools";

/** Separator between a tool name and its description in a README list item. */
export const ENTRY_SEPARATOR = " — ";

/**
 * Matches a single tool list item:  `- **{name}** — {description}`
 * Group 1 = name (inside the `**…**`), group 2 = description (after ` — `).
 */
const LIST_ITEM_RE = /^\s*-\s+\*\*(.+?)\*\*\s+—\s+(.+?)\s*$/;

/**
 * Parse the `## Tools` section of a README into tool entries.
 *
 * Only list items matching the documented `- **{name}** — {description}` shape
 * are returned; names and descriptions are trimmed (Req 18.4). Returns an empty
 * array when the README has no `## Tools` section.
 */
export function parseReadmeTools(readmeContent: string): ReadmeToolEntry[] {
  const lines = readmeContent.split(/\r?\n/);

  // Locate the start of the "## Tools" section.
  const startIndex = lines.findIndex(
    (line) => line.trim() === TOOLS_HEADING,
  );
  if (startIndex === -1) {
    return [];
  }

  const entries: ReadmeToolEntry[] = [];
  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i];

    // Stop at the next heading of equal or higher level (`# ` or `## `).
    if (/^#{1,2}\s/.test(line.trim())) {
      break;
    }

    const match = LIST_ITEM_RE.exec(line);
    if (match) {
      entries.push({
        name: match[1].trim(),
        description: match[2].trim(),
      });
    }
  }

  return entries;
}

/**
 * The registry's tool entries as `{ name, description }`, trimmed.
 *
 * @param tools Optional tool list; defaults to the registry `TOOLS`.
 */
export function registryToolEntries(
  tools: readonly ToolDefinition[] = TOOLS,
): ReadmeToolEntry[] {
  return tools.map((tool) => ({
    name: tool.name.trim(),
    description: tool.description.trim(),
  }));
}

/** Canonical, trimmed key for set comparison by both name and description. */
function entryKey(entry: ReadmeToolEntry): string {
  return `${entry.name.trim()}${ENTRY_SEPARATOR}${entry.description.trim()}`;
}

/**
 * Compare the README's parsed tool entries against the registry entries as
 * sets keyed by trimmed name AND description (Req 18.1, 18.2, 18.4).
 *
 * The sets are EQUAL when every registry entry appears in the README and the
 * README contains no extra entries.
 */
export function compareReadmeToRegistry(
  readmeEntries: readonly ReadmeToolEntry[],
  registryEntries: readonly ReadmeToolEntry[],
): ReadmeComparison {
  const readmeKeys = new Set(readmeEntries.map(entryKey));
  const registryKeys = new Set(registryEntries.map(entryKey));

  const missingFromReadme: string[] = [];
  for (const key of registryKeys) {
    if (!readmeKeys.has(key)) {
      missingFromReadme.push(key);
    }
  }

  const extraInReadme: string[] = [];
  for (const key of readmeKeys) {
    if (!registryKeys.has(key)) {
      extraInReadme.push(key);
    }
  }

  return {
    equal: missingFromReadme.length === 0 && extraInReadme.length === 0,
    missingFromReadme,
    extraInReadme,
  };
}

/**
 * Render the canonical `## Tools` section body (heading + privacy statement +
 * one list item per registry tool) as a markdown string. Useful for generating
 * or refreshing the README section programmatically.
 *
 * @param tools Optional tool list; defaults to the registry `TOOLS`.
 */
export function renderToolsSection(
  tools: readonly ToolDefinition[] = TOOLS,
): string {
  const items = tools
    .map(
      (tool) =>
        `- **${tool.name.trim()}**${ENTRY_SEPARATOR}${tool.description.trim()}`,
    )
    .join("\n");

  return [
    TOOLS_HEADING,
    "",
    "All PDF processing is performed entirely client-side in your browser. " +
      "No user files are ever uploaded to or transmitted to any server.",
    "",
    items,
  ].join("\n");
}
