// Feature: pdfy-feature-expansion, Property 14: Field-value validation rejects over-length and out-of-set values
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  validateFieldValue,
  MAX_TEXT_FIELD_LENGTH,
  type FieldInfo,
  type FieldValueValidation,
} from "./form-filler";

/**
 * Property 14: Field-value validation rejects over-length and out-of-set values.
 * Validates: Requirements 4.4, 4.5
 *
 * `validateFieldValue` is a pure, per-field gate with a FIXED precedence that
 * mirrors the implementation:
 *   1. `too-long`       — when a TEXT field's value exceeds
 *                         MAX_TEXT_FIELD_LENGTH (10000) characters (Req 4.4).
 *   2. `invalid-option` — when the field carries an option set and the value is
 *                         not one of those options (Req 4.5).
 *   otherwise           — `{ ok: true }`.
 *
 * The generators below intentionally span:
 *   - text fields whose value length straddles the 10000 boundary (9999..10002)
 *     plus much larger over-length values, and
 *   - choice fields (dropdown / radio / listbox) with a generated option set and
 *     values both inside and outside that set,
 * with the model re-deriving the expected result from the spec precedence and
 * asserting an exact match.
 */

/** Re-derivation of the documented precedence: too-long -> invalid-option -> ok. */
function expected(field: FieldInfo, value: string): FieldValueValidation {
  if (field.type === "text" && value.length > MAX_TEXT_FIELD_LENGTH) {
    return { ok: false, reason: "too-long" };
  }
  if (field.options !== undefined && !field.options.includes(value)) {
    return { ok: false, reason: "invalid-option" };
  }
  return { ok: true };
}

/**
 * Text-field value lengths emphasizing the MAX_TEXT_FIELD_LENGTH boundary plus
 * clearly over-length values.
 */
const textLengthArb = fc.oneof(
  // Around the boundary 9999..10002.
  fc.integer({ min: 9999, max: 10002 }),
  // Comfortably within the limit (including empty).
  fc.integer({ min: 0, max: MAX_TEXT_FIELD_LENGTH }),
  // Clearly over the limit.
  fc.integer({ min: MAX_TEXT_FIELD_LENGTH + 1, max: MAX_TEXT_FIELD_LENGTH * 2 }),
  // Explicit boundary values.
  fc.constantFrom(
    0,
    MAX_TEXT_FIELD_LENGTH - 1,
    MAX_TEXT_FIELD_LENGTH,
    MAX_TEXT_FIELD_LENGTH + 1,
  ),
);

/** A text field paired with a value built via "a".repeat(n). */
const textCaseArb = textLengthArb.map((n) => {
  const field: FieldInfo = { name: "txt", type: "text" };
  const value = "a".repeat(n);
  return { field, value };
});

const choiceTypeArb = fc.constantFrom<FieldInfo["type"]>(
  "dropdown",
  "radio",
  "listbox",
);

/** A non-empty option set of short distinct-ish strings. */
const optionsArb = fc
  .array(fc.string({ minLength: 1, maxLength: 6 }), { minLength: 1, maxLength: 8 })
  .map((opts) => Array.from(new Set(opts)))
  .filter((opts) => opts.length > 0);

/**
 * A choice field paired with a value that is EITHER drawn from its option set
 * (expected ok) OR an arbitrary string (which may or may not be a member, so
 * both invalid-option and ok outcomes are exercised).
 */
const choiceCaseArb = fc
  .tuple(choiceTypeArb, optionsArb)
  .chain(([type, options]) => {
    const field: FieldInfo = { name: "choice", type, options };
    const valueArb = fc.oneof(
      // In-set value.
      fc.constantFrom(...options),
      // Arbitrary value (usually out-of-set).
      fc.string({ maxLength: 10 }),
    );
    return valueArb.map((value) => ({ field, value }));
  });

const caseArb = fc.oneof(textCaseArb, choiceCaseArb);

describe("Property 14: field-value validation rejects over-length and out-of-set values", () => {
  it("matches the documented precedence (too-long, then invalid-option, then ok)", () => {
    fc.assert(
      fc.property(caseArb, ({ field, value }) => {
        expect(validateFieldValue(field, value)).toEqual(expected(field, value));
      }),
      { numRuns: 300 },
    );
  });

  it("exercises every outcome across the generated space (coverage guard)", () => {
    const seen = new Set<string>();
    fc.assert(
      fc.property(caseArb, ({ field, value }) => {
        const result = validateFieldValue(field, value);
        seen.add(result.ok ? "ok" : result.reason);
        expect(result).toEqual(expected(field, value));
      }),
      { numRuns: 500 },
    );
    expect(seen.has("too-long")).toBe(true);
    expect(seen.has("invalid-option")).toBe(true);
    expect(seen.has("ok")).toBe(true);
  });
});
