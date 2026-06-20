/**
 * Form Filler — AcroForm field detection, value validation, and form filling.
 *
 * This module wraps pdf-lib's form API to power the Fill PDF Forms tool. It is
 * split into three responsibilities (see design.md "Form Filler" and Correctness
 * Properties 12–14):
 *
 *  - {@link detectFields}: enumerate the document's fillable fields, mapping each
 *    to a {@link FieldInfo} (name + type, plus options for choice fields), and
 *    synthesizing a unique, non-empty placeholder label for any unnamed field.
 *    Returns `[]` when the document has no AcroForm fields. Detection failures
 *    (corrupt/protected files) are allowed to throw so the UI can surface a
 *    distinct error (Req 4.8).
 *
 *  - {@link validateFieldValue}: a pure, per-field validator that rejects
 *    over-length text and out-of-set choice values without touching other
 *    fields' values (Req 4.4, 4.5).
 *
 *  - {@link fillForm}: write the provided values into their fields using the
 *    appropriate pdf-lib setter and return the saved bytes. Reading the fields
 *    back from the output yields the written values (the form is NOT flattened).
 *
 * All work happens client-side; no file bytes leave the browser (Req 4.6).
 */

import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
  type PDFField,
} from "pdf-lib";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The supported AcroForm field types. At minimum text, checkbox, radio group,
 * dropdown, and list box are supported (Req 4.1).
 */
export type FieldType = "text" | "checkbox" | "radio" | "dropdown" | "listbox";

/** A detected fillable field: its (possibly synthesized) label, type, and options. */
export interface FieldInfo {
  /** Unique, non-empty label. Real field name, or a synthesized placeholder. */
  name: string;
  type: FieldType;
  /** The allowed values for choice fields (dropdown / radio / listbox). */
  options?: string[];
}

/** Result of {@link validateFieldValue}: ok, or a typed rejection reason. */
export type FieldValueValidation =
  | { ok: true }
  | { ok: false; reason: "too-long" | "invalid-option" };

/** Maximum number of characters accepted in a text field (Req 4.4). */
export const MAX_TEXT_FIELD_LENGTH = 10000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Map a pdf-lib field instance to our {@link FieldType}, or `undefined` for an
 * unsupported field kind.
 */
function fieldTypeOf(field: PDFField): FieldType | undefined {
  if (field instanceof PDFTextField) return "text";
  if (field instanceof PDFCheckBox) return "checkbox";
  if (field instanceof PDFRadioGroup) return "radio";
  if (field instanceof PDFDropdown) return "dropdown";
  if (field instanceof PDFOptionList) return "listbox";
  return undefined;
}

/**
 * Read the option set for a choice field (dropdown / radio / listbox), or
 * `undefined` for non-choice fields.
 */
function optionsOf(field: PDFField): string[] | undefined {
  if (
    field instanceof PDFRadioGroup ||
    field instanceof PDFDropdown ||
    field instanceof PDFOptionList
  ) {
    return field.getOptions();
  }
  return undefined;
}

/**
 * Produce a unique, non-empty label, falling back to synthesized "Field N"
 * placeholders when the raw name is empty or already taken.
 *
 * @param rawName - the field's defined name (may be empty/whitespace).
 * @param used - the set of labels already assigned (mutated to include the result).
 * @param index - the 0-based position of the field, used to seed the placeholder.
 */
function uniqueLabel(rawName: string, used: Set<string>, index: number): string {
  const trimmed = rawName.trim();
  let label = trimmed;

  if (label === "" || used.has(label)) {
    // Synthesize a placeholder; keep bumping the counter until it is unique.
    let n = index + 1;
    do {
      label = `Field ${n}`;
      n++;
    } while (used.has(label));
  }

  used.add(label);
  return label;
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Detect the fillable AcroForm fields in a PDF.
 *
 * Each supported field is mapped to a {@link FieldInfo} carrying its label, type,
 * and (for choice fields) its options. Fields with no/empty name receive a unique
 * synthesized placeholder label so every returned label is unique and non-empty
 * (Req 4.2). Unsupported field kinds are skipped.
 *
 * @param file - the source PDF.
 * @returns the detected fields, or `[]` when the document has no AcroForm fields
 *   (Req 4.1, 4.7).
 * @throws if the file cannot be parsed (corrupt or password-protected); the
 *   caller surfaces this as a distinct detection error (Req 4.8).
 */
export async function detectFields(file: File): Promise<FieldInfo[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);
  const form = pdf.getForm();
  const fields = form.getFields();

  if (fields.length === 0) {
    return [];
  }

  const used = new Set<string>();
  const infos: FieldInfo[] = [];

  fields.forEach((field, index) => {
    const type = fieldTypeOf(field);
    if (type === undefined) {
      // Skip field kinds we do not support so labels stay aligned with output.
      return;
    }

    const label = uniqueLabel(field.getName(), used, index);
    const options = optionsOf(field);

    const info: FieldInfo = { name: label, type };
    if (options !== undefined) {
      info.options = options;
    }
    infos.push(info);
  });

  return infos;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a single field value against its field's constraints.
 *
 * This is pure and per-field: it never inspects or mutates other fields, so a
 * rejection for one field leaves the rest untouched (Req 4.4, 4.5).
 *
 * @param field - the target field's detected info.
 * @param value - the candidate value to write.
 * @returns `{ ok: true }` when the value is acceptable; `"too-long"` when a text
 *   field value exceeds {@link MAX_TEXT_FIELD_LENGTH} characters; or
 *   `"invalid-option"` when the field has an option set and `value` is not one of
 *   its options.
 */
export function validateFieldValue(field: FieldInfo, value: string): FieldValueValidation {
  if (field.type === "text" && value.length > MAX_TEXT_FIELD_LENGTH) {
    return { ok: false, reason: "too-long" };
  }

  if (field.options !== undefined && !field.options.includes(value)) {
    return { ok: false, reason: "invalid-option" };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Filling
// ---------------------------------------------------------------------------

/**
 * Look up a field by either its real name or its synthesized placeholder label.
 *
 * `detectFields` may rename unnamed fields to "Field N"; this rebuilds the same
 * label assignment so the values keyed by those labels can be matched back to the
 * underlying field instances.
 */
function buildLabelToField(form: ReturnType<PDFDocument["getForm"]>): Map<string, PDFField> {
  const fields = form.getFields();
  const used = new Set<string>();
  const map = new Map<string, PDFField>();

  fields.forEach((field, index) => {
    if (fieldTypeOf(field) === undefined) {
      return;
    }
    const label = uniqueLabel(field.getName(), used, index);
    map.set(label, field);
  });

  return map;
}

/**
 * Determine whether a checkbox value should be checked.
 *
 * Truthy markers ("true", "on", "yes", "checked", "1") check the box; everything
 * else (including the empty string) unchecks it.
 */
function isCheckedValue(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === "true" || v === "on" || v === "yes" || v === "checked" || v === "1";
}

/**
 * Fill a PDF form with the provided values and return the saved bytes.
 *
 * Values are keyed by the labels produced by {@link detectFields} (real names or
 * synthesized placeholders). Each value is written with the setter appropriate to
 * its field type: text via `setText`, dropdown/radio/option-list via `select`,
 * and checkboxes via `check`/`uncheck` based on the value's truthiness. The form
 * is saved WITHOUT flattening, so reading the fields back from the output yields
 * the written values (Property 13, Req 4.3).
 *
 * Unknown labels and values for unsupported field kinds are ignored. All work is
 * client-side (Req 4.6).
 *
 * @param file - the source PDF.
 * @param values - a map of field label to the value to write.
 * @returns the filled PDF bytes.
 */
export async function fillForm(
  file: File,
  values: Record<string, string>,
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);
  const form = pdf.getForm();
  const labelToField = buildLabelToField(form);

  for (const [label, value] of Object.entries(values)) {
    const field = labelToField.get(label);
    if (field === undefined) {
      continue;
    }

    if (field instanceof PDFTextField) {
      field.setText(value);
    } else if (field instanceof PDFCheckBox) {
      if (isCheckedValue(value)) {
        field.check();
      } else {
        field.uncheck();
      }
    } else if (field instanceof PDFRadioGroup) {
      if (field.getOptions().includes(value)) {
        field.select(value);
      }
    } else if (field instanceof PDFDropdown) {
      if (field.getOptions().includes(value)) {
        field.select(value);
      }
    } else if (field instanceof PDFOptionList) {
      if (field.getOptions().includes(value)) {
        field.select(value);
      }
    }
  }

  return await pdf.save();
}
