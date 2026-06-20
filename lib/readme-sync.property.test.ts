// Feature: pdfy-feature-expansion, Property 31: README and tool catalog are equal sets
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  parseReadmeTools,
  registryToolEntries,
  compareReadmeToRegistry,
  renderToolsSection,
  ENTRY_SEPARATOR,
  type ReadmeToolEntry,
} from "./readme-sync";

/**
 * Property 31: README and tool catalog are EQUAL SETS.
 * Validates: Requirements 18.1, 18.2, 18.4
 *
 * For any state of the tool registry, parsing the README's tool list yields a
 * set of {name, description} entries (compared with leading/trailing whitespace
 * trimmed — Req 18.4) exactly equal to the registry's set: no missing entries
 * (Req 18.1), no extra entries (Req 18.2), and equal counts.
 *
 * This file has two parts:
 *  1. A real-README invariant: the committed README.md must already match the
 *     registry exactly (guards Req 18.1/18.2/18.4 against the actual file).
 *  2. A property-based round-trip: starting from the canonical rendered section
 *     (parse -> equal), apply a generated perturbation (drop / add / mutate an
 *     entry) and assert the comparator reports the precise missing/extra deltas.
 */
describe("Property 31: README and tool catalog are equal sets", () => {
  // ── Part 1: the committed README matches the registry exactly ────────────
  it("the real README.md tool list equals the registry set", () => {
    // README.md lives at the project root, one level above this `lib/` test.
    // Resolved from the Vitest root (the project root) for portability across
    // platforms and module-URL schemes.
    const readmeContent = readFileSync(
      path.resolve(process.cwd(), "README.md"),
      "utf-8",
    );
    const parsed = parseReadmeTools(readmeContent);
    const registry = registryToolEntries();

    const comparison = compareReadmeToRegistry(parsed, registry);

    expect(
      comparison.equal,
      `README/registry mismatch.\n  missingFromReadme: ${JSON.stringify(
        comparison.missingFromReadme,
        null,
        2,
      )}\n  extraInReadme: ${JSON.stringify(comparison.extraInReadme, null, 2)}`,
    ).toBe(true);
    expect(comparison.missingFromReadme).toEqual([]);
    expect(comparison.extraInReadme).toEqual([]);
    // Equal counts follow from set equality with unique registry names.
    expect(parsed.length).toBe(registry.length);
  });

  // ── Part 2: canonical render round-trips to equal ────────────────────────
  it("parsing the canonical rendered section equals the registry set", () => {
    const parsed = parseReadmeTools(renderToolsSection());
    const comparison = compareReadmeToRegistry(parsed, registryToolEntries());
    expect(comparison.equal).toBe(true);
  });

  // ── Part 2: generated perturbations are detected with precise deltas ──────
  it("detects dropped / added / mutated entries via generated perturbations", () => {
    const registry = registryToolEntries();
    expect(registry.length).toBeGreaterThan(0);

    const key = (e: ReadmeToolEntry) =>
      `${e.name.trim()}${ENTRY_SEPARATOR}${e.description.trim()}`;

    fc.assert(
      fc.property(
        // Pick a perturbation kind and an index into the registry to target.
        fc.constantFrom("drop", "add", "mutate" as const),
        fc.nat({ max: registry.length - 1 }),
        // A non-empty suffix used to fabricate fake/extra/mutated entries.
        fc
          .string({ minLength: 1, maxLength: 12 })
          .filter((s) => s.trim().length > 0 && !s.includes("\n")),
        (kind, index, suffix) => {
          const baseline = parseReadmeTools(renderToolsSection());
          // Sanity: the unperturbed parse is always equal.
          expect(compareReadmeToRegistry(baseline, registry).equal).toBe(true);

          if (kind === "drop") {
            // Remove one entry -> exactly that entry is missing, none extra.
            const dropped = baseline[index];
            const perturbed = baseline.filter((_, i) => i !== index);
            const cmp = compareReadmeToRegistry(perturbed, registry);
            return (
              cmp.equal === false &&
              cmp.extraInReadme.length === 0 &&
              cmp.missingFromReadme.length === 1 &&
              cmp.missingFromReadme[0] === key(dropped)
            );
          }

          if (kind === "add") {
            // Add a fake entry -> exactly that entry is extra, none missing.
            const fake: ReadmeToolEntry = {
              name: `Fake Tool ${suffix}`,
              description: `Fabricated description ${suffix}`,
            };
            const perturbed = [...baseline, fake];
            const cmp = compareReadmeToRegistry(perturbed, registry);
            return (
              cmp.equal === false &&
              cmp.missingFromReadme.length === 0 &&
              cmp.extraInReadme.length === 1 &&
              cmp.extraInReadme[0] === key(fake)
            );
          }

          // kind === "mutate": change one description -> the original entry is
          // missing and the mutated entry is extra.
          const original = baseline[index];
          const mutated: ReadmeToolEntry = {
            name: original.name,
            description: `${original.description} ${suffix}`,
          };
          const perturbed = baseline.map((e, i) => (i === index ? mutated : e));
          const cmp = compareReadmeToRegistry(perturbed, registry);
          return (
            cmp.equal === false &&
            cmp.missingFromReadme.length === 1 &&
            cmp.missingFromReadme[0] === key(original) &&
            cmp.extraInReadme.length === 1 &&
            cmp.extraInReadme[0] === key(mutated)
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  // ── Req 18.4: comparison is on trimmed values ────────────────────────────
  it("treats entries as equal regardless of surrounding whitespace (trimmed)", () => {
    const registry = registryToolEntries();
    const padded = registry.map((e) => ({
      name: `   ${e.name}  `,
      description: `\t${e.description}   `,
    }));
    expect(compareReadmeToRegistry(padded, registry).equal).toBe(true);
  });
});
