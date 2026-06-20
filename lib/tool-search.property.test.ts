// Feature: pdfy-feature-expansion, Property 21: Search and category filtering returns exactly the matching tools
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { filterTools } from "./tool-search";
import {
  TOOLS,
  CATEGORIES,
  type CategoryFilter,
  type ToolDefinition,
} from "./tool-registry";

/**
 * Property 21: Search and category filtering returns exactly the matching tools.
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5
 *
 * For any query string and any category (from CATEGORIES, including "All"),
 * filterTools(TOOLS, query, category) returns EXACTLY the set of tools that
 * BOTH:
 *  - match the query: a whitespace-only/empty query matches all; otherwise a
 *    case-insensitive substring of name OR description (Req 10.1, 10.2), AND
 *  - belong to the category: "All" matches every tool; otherwise
 *    tool.category === category (Req 10.3, 10.4, 10.5).
 *
 * The expected result is re-derived independently from filterTools and compared
 * by deep equality, which also verifies that the input order is preserved.
 */
describe("Property 21: search and category filtering returns exactly the matching tools", () => {
  /**
   * Independent reference implementation of the filtering semantics, written
   * differently from the production code (a manual loop rather than reusing
   * its branch structure) to avoid mirroring any bug.
   */
  function expectedFilter(
    query: string,
    category: CategoryFilter,
  ): ToolDefinition[] {
    const q = query.trim().toLowerCase();
    const result: ToolDefinition[] = [];
    for (const tool of TOOLS) {
      // Category constraint (Req 10.3, 10.4).
      const categoryOk = category === "All" || tool.category === category;
      if (!categoryOk) continue;

      // Text constraint (Req 10.1, 10.2).
      let textOk: boolean;
      if (q.length === 0) {
        textOk = true; // empty / whitespace-only query matches all
      } else {
        textOk =
          tool.name.toLowerCase().indexOf(q) !== -1 ||
          tool.description.toLowerCase().indexOf(q) !== -1;
      }

      // Combined constraint (Req 10.5).
      if (textOk) result.push(tool);
    }
    return result;
  }

  // A query generator that exercises empty, whitespace, random text, and real
  // substrings drawn from actual tool names/descriptions (to hit real matches).
  const realSubstringArb = fc
    .constantFrom<ToolDefinition>(...TOOLS)
    .chain((tool) =>
      fc.constantFrom(tool.name, tool.description).chain((text) =>
        fc
          .tuple(
            fc.nat({ max: Math.max(0, text.length - 1) }),
            fc.nat({ max: text.length }),
          )
          .chain(([a, b]) => {
            const start = Math.min(a, b);
            const end = Math.max(a, b);
            const slice = text.slice(start, end);
            // Randomly change case to exercise case-insensitivity.
            return fc.constantFrom(
              slice,
              slice.toLowerCase(),
              slice.toUpperCase(),
            );
          }),
      ),
    );

  const queryArb = fc.oneof(
    fc.constant(""), // empty
    fc.constantFrom("   ", "\t", " \n ", "  \t  "), // whitespace-only
    fc.string(), // arbitrary random text
    realSubstringArb, // substrings of real names/descriptions
  );

  const categoryArb = fc.constantFrom<CategoryFilter>(...CATEGORIES);

  it("returns exactly the tools matching both query and category, order preserved", () => {
    fc.assert(
      fc.property(queryArb, categoryArb, (query, category) => {
        const actual = filterTools(TOOLS, query, category);
        const expected = expectedFilter(query, category);
        expect(actual).toEqual(expected);
      }),
      { numRuns: 200 },
    );
  });

  it("empty / whitespace-only query with 'All' returns the full registry (Req 10.2, 10.4)", () => {
    fc.assert(
      fc.property(fc.constantFrom("", " ", "   ", "\t\n  "), (query) => {
        expect(filterTools(TOOLS, query, "All")).toEqual([...TOOLS]);
      }),
      { numRuns: 100 },
    );
  });

  it("category filtering keeps only tools of that category (Req 10.3, 10.5)", () => {
    fc.assert(
      fc.property(categoryArb, (category) => {
        const result = filterTools(TOOLS, "", category);
        if (category === "All") {
          expect(result).toEqual([...TOOLS]);
        } else {
          for (const tool of result) {
            expect(tool.category).toBe(category);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
