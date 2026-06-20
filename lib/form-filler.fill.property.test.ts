// Feature: pdfy-feature-expansion, Property 13: Filling then reading back yields the written values
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { PDFDocument } from "pdf-lib";
import { fillForm } from "./form-filler";

/**
 * Property 13: Filling then reading back yields the written values.
 * Validates: Requirements 4.3
 *
 * For any form built with a known set of AcroForm fields and any set of valid
 * field values, calling `fillForm(file, values)` and then RELOADING the output
 * with pdf-lib yields, for each field, exactly the value that was written:
 *  - text fields: `textField.getText()` equals the written string
 *  - dropdowns:   `dropdown.getSelected()` equals `[writtenOption]`
 *
 * The form is NOT flattened by `fillForm`, so the field values survive a
 * save/reload round-trip.
 *
 * Text-normalization caveat
 * -------------------------
 * pdf-lib generates a WinAnsi appearance stream for text fields when saving, and
 * it must be able to encode every character with the default Helvetica font.
 * Arbitrary Unicode (emoji, CJK, control characters) would either throw on save
 * or be normalized, making an exact round-trip flaky. To keep the round-trip
 * EXACT we therefore restrict generated text to printable ASCII (U+0020..U+007E)
 * with length 1..200. Empty text is excluded because pdf-lib reports an unset
 * text field as `undefined` rather than `""`, which would conflate "no value"
 * with "empty value". These restrictions still exercise a representative,
 * non-trivial subset of "any set of valid field values".
 */

/** Printable ASCII characters (U+0020 space .. U+007E tilde). */
const PRINTABLE_ASCII = Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) =>
  String.fromCharCode(0x20 + i),
);

/** A generator of printable-ASCII strings of length 1..200 (exact round-trip safe). */
const asciiText = fc
  .array(fc.constantFrom(...PRINTABLE_ASCII), { minLength: 1, maxLength: 200 })
  .map((chars) => chars.join(""));

/** A fixed, distinct set of dropdown options (alphanumeric, ASCII). */
const DROPDOWN_OPTIONS = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"];

/**
 * Build a PDF containing the given number of text fields and dropdowns with
 * simple alphanumeric field names, then wrap the saved bytes in a File.
 *
 * Text field names: `text0`, `text1`, ...
 * Dropdown names:    `drop0`, `drop1`, ...
 */
async function buildFormFile(textCount: number, dropdownCount: number): Promise<File> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const form = pdf.getForm();

  let y = 740;
  for (let i = 0; i < textCount; i++) {
    const tf = form.createTextField(`text${i}`);
    tf.addToPage(page, { x: 50, y, width: 200, height: 20 });
    y -= 30;
  }
  for (let i = 0; i < dropdownCount; i++) {
    const dd = form.createDropdown(`drop${i}`);
    dd.setOptions(DROPDOWN_OPTIONS);
    dd.addToPage(page, { x: 300, y: 740 - i * 30, width: 200, height: 20 });
  }

  const bytes = await pdf.save();
  return new File([bytes as BlobPart], "form.pdf", { type: "application/pdf" });
}

describe("Property 13: filling then reading back yields the written values", () => {
  it("round-trips text-field and dropdown values through fillForm and reload", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 1..4 text fields and 0..3 dropdowns, with at least one field overall.
        fc
          .record({
            textCount: fc.integer({ min: 1, max: 4 }),
            dropdownCount: fc.integer({ min: 0, max: 3 }),
          })
          .chain(({ textCount, dropdownCount }) =>
            fc.record({
              textCount: fc.constant(textCount),
              dropdownCount: fc.constant(dropdownCount),
              textValues: fc.array(asciiText, {
                minLength: textCount,
                maxLength: textCount,
              }),
              dropdownValues: fc.array(fc.constantFrom(...DROPDOWN_OPTIONS), {
                minLength: dropdownCount,
                maxLength: dropdownCount,
              }),
            }),
          ),
        async ({ textCount, dropdownCount, textValues, dropdownValues }) => {
          const file = await buildFormFile(textCount, dropdownCount);

          // Assemble the value map keyed by field name.
          const values: Record<string, string> = {};
          for (let i = 0; i < textCount; i++) {
            values[`text${i}`] = textValues[i];
          }
          for (let i = 0; i < dropdownCount; i++) {
            values[`drop${i}`] = dropdownValues[i];
          }

          const output = await fillForm(file, values);

          // Reload the (non-flattened) output and read each field back.
          const reloaded = await PDFDocument.load(output);
          const reForm = reloaded.getForm();

          for (let i = 0; i < textCount; i++) {
            const tf = reForm.getTextField(`text${i}`);
            expect(tf.getText()).toBe(textValues[i]);
          }
          for (let i = 0; i < dropdownCount; i++) {
            const dd = reForm.getDropdown(`drop${i}`);
            expect(dd.getSelected()).toEqual([dropdownValues[i]]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
