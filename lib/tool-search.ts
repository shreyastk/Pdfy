/**
 * Tool search and category filtering — pure logic for the Tools_Catalog.
 *
 * Used by `app/tools/page.tsx` to filter the registry by a search query and an
 * active category. All logic here is pure (no DOM, no React) so it can be
 * property-tested directly (task 4.4 / Property 21).
 *
 * Behavior (Requirements 10.1–10.5):
 * - 10.1: Case-insensitive partial-substring match of the query against each
 *   tool's `name` OR `description`.
 * - 10.2: An empty or whitespace-only query matches every tool.
 * - 10.3: A specific category matches only tools whose `category` equals it.
 * - 10.4: The synthetic "All" category matches every tool.
 * - 10.5: When both a non-empty query and a non-"All" category are active, a
 *   tool must satisfy BOTH to be included.
 */

import type {
  CategoryFilter,
  ToolDefinition,
} from "./tool-registry";

/**
 * Filter the given tools by a case-insensitive search query and a category.
 *
 * Returns exactly the matching tools as a new array, preserving the relative
 * order of the input.
 *
 * @param tools    The tools to filter (e.g. the registry `TOOLS`).
 * @param query    The search text. Empty or whitespace-only matches all tools.
 * @param category The active category filter. "All" matches every tool.
 */
export function filterTools(
  tools: readonly ToolDefinition[],
  query: string,
  category: CategoryFilter,
): ToolDefinition[] {
  // Req 10.2: a whitespace-only (or empty) query imposes no text constraint.
  const normalizedQuery = query.trim().toLowerCase();
  const hasQuery = normalizedQuery.length > 0;

  // Req 10.4: "All" imposes no category constraint.
  const hasCategory = category !== "All";

  return tools.filter((tool) => {
    // Req 10.3 / 10.4: category constraint.
    if (hasCategory && tool.category !== category) {
      return false;
    }

    // Req 10.1 / 10.2: text constraint (name OR description, case-insensitive).
    if (hasQuery) {
      const matchesText =
        tool.name.toLowerCase().includes(normalizedQuery) ||
        tool.description.toLowerCase().includes(normalizedQuery);
      if (!matchesText) {
        return false;
      }
    }

    // Req 10.5: a tool is included only when it satisfies every active filter.
    return true;
  });
}
