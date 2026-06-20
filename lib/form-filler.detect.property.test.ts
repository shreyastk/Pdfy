// Feature: pdfy-feature-expansion, Property 12: Detected fields match the form's fields with unique labels
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { PDFDocument } from "pdf-lib";
import { detectFields, type FieldType } from "./form-filler";

/**
 * Property 12: Detected fields match the form's fields with unique labels.
 * Validates: Requirements 4.1, 4.2
 *
 * For any PDF built with a known set of AcroForm fields (each with a valid,
 * unique, alphanumeric name), `detectFields` returns exactly those fields:
 *  - the returned set of names equals the created set of names, and
 *  - each returned field's mapped type matches the kind it was created as
 *    (text -> "text", checkbox -> "checkbox", radio -> "radio",
 *     dropdown -> "dropdown", optionlist -> "listbox"), and
 *  - every returned label is unique and non-empty.
 *
 * Detection may return fields in document order, so we assert as sets keyed by
 * name rather than relying on positional order.
 *
 * Generator strategy: generate a small set (1..6) of fields, each with a unique
 * alphanumeric name (pdf-lib disallows '.' in field names and uses it for
 * hierarchy, so names are restricted to [A-Za-z0-9_] and prefixed with a letter)
 * and a randomly chosen field kind. Choice fields (radio/dropdown/optionlist)
 * are given a fixed option set.
 *
 * pdf-lib quirks documented: field names must be unique and must not contain a
 * '.' (period); unnamed fields cannot be created via the form API (every
 * created field requires a name), so the synthesized-placeholder branch of
 * detectFields is exercised by the unit-level tests rather than here. Radio
 * groups are populated with `addOptionToPage`, while dropdowns/option-lists use
 * `addOptions` + `addToPage`.
 */

type FieldKind = "text" | "checkbox" | "radio" | "dropdown" | "optionlist";

const KIND_TO_TYPE: Record<FieldKind, FieldType> = {
  text: "text",
  checkbox: "checkbox",
  radio: "radio",
  dropdown: "dropdown",
  optionlist: "listbox",
};

// Valid pdf-lib field-name characters (no '.'); prefix with a letter to keep
// every generated name non-empty and a valid identifier.
const NAME_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_".split("");

const nameArb = fc
  .array(fc.constantFrom(...NAME_CHARS), { minLength: 0, maxLength: 10 })
  .map((cs) => "f" + cs.join(""));

const kindArb = fc.constantFrom<FieldKind>(
  "text",
  "checkbox",
  "radio",
  "dropdown",
  "optionlist",
);

// A set of fields with unique names, each assigned a random kind.
const fieldsArb = fc
  .uniqueArray(nameArb, { minLength: 1, maxLength: 6 })
  .chain((names) =>
    fc
      .array(kindArb, { minLength: names.length, maxLength: names.length })
      .map((kinds) =>
        names.map((name, i) => ({ name, kind: kinds[i] as FieldKind })),
      ),
  );

const CHOICE_OPTIONS = ["Alpha", "Beta", "Gamma"];

async function buildFormPdf(
  specs: { name: string; kind: FieldKind }[],
): Promise<File> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([600, 800]);
  const form = pdf.getForm();

  let y = 760;
  for (const spec of specs) {
    switch (spec.kind) {
      case "text": {
        const f = form.createTextField(spec.name);
        f.addToPage(page, { x: 50, y, width: 200, height: 18 });
        break;
      }
      case "checkbox": {
        const f = form.createCheckBox(spec.name);
        f.addToPage(page, { x: 50, y, width: 16, height: 16 });
        break;
      }
      case "radio": {
        const f = form.createRadioGroup(spec.name);
        f.addOptionToPage(CHOICE_OPTIONS[0], page, {
          x: 50,
          y,
          width: 16,
          height: 16,
        });
        f.addOptionToPage(CHOICE_OPTIONS[1], page, {
          x: 80,
          y,
          width: 16,
          height: 16,
        });
        break;
      }
      case "dropdown": {
        const f = form.createDropdown(spec.name);
        f.addOptions(CHOICE_OPTIONS);
        f.addToPage(page, { x: 50, y, width: 200, height: 18 });
        break;
      }
      case "optionlist": {
        const f = form.createOptionList(spec.name);
        f.addOptions(CHOICE_OPTIONS);
        f.addToPage(page, { x: 50, y, width: 200, height: 40 });
        break;
      }
    }
    y -= 90;
    if (y < 20) y = 760; // wrap so positions stay on-page for larger sets
  }

  const bytes = await pdf.save();
  return new File([bytes as BlobPart], "form.pdf", { type: "application/pdf" });
}

describe("Property 12: detected fields match the form's fields with unique labels", () => {
  it("returns exactly the created fields with matching names and mapped types, all labels unique and non-empty", async () => {
    await fc.assert(
      fc.asyncProperty(fieldsArb, async (specs) => {
        const file = await buildFormPdf(specs);
        const detected = await detectFields(file);

        // Same number of fields detected as created.
        expect(detected.length).toBe(specs.length);

        // Every label is non-empty.
        for (const info of detected) {
          expect(info.name.length).toBeGreaterThan(0);
          expect(info.name.trim()).not.toBe("");
        }

        // Every label is unique.
        const labels = detected.map((d) => d.name);
        expect(new Set(labels).size).toBe(labels.length);

        // Names correspond exactly to the created field names (compare as sets).
        const expectedNames = new Set(specs.map((s) => s.name));
        const actualNames = new Set(labels);
        expect(actualNames).toEqual(expectedNames);

        // Each created field's mapped type appears on the matching detected field.
        const byName = new Map(detected.map((d) => [d.name, d]));
        for (const spec of specs) {
          const info = byName.get(spec.name);
          expect(info).toBeDefined();
          expect(info!.type).toBe(KIND_TO_TYPE[spec.kind]);
        }
      }),
      { numRuns: 50 },
    );
  });
});
