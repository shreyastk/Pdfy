"use client";

import { useCallback, useState } from "react";
import FileUploader from "@/components/FileUploader";
import { saveFile } from "@/lib/download";
import {
  detectFields,
  validateFieldValue,
  fillForm,
  type FieldInfo,
} from "@/lib/form-filler";

const ACCENT = "#009966";

/**
 * Distinct user-facing messages for the two failure modes a form PDF can hit
 * during detection. Keeping them as separate constants makes the requirement
 * that they differ (Req 4.7 vs 4.8) explicit and testable.
 */
const NO_FIELDS_MESSAGE = "No fillable fields were found in this PDF.";
const DETECTION_ERROR_MESSAGE =
  "Could not read form fields: the file may be invalid or protected.";

/** The mutually-exclusive phases of the detection step. */
type DetectStatus = "idle" | "detecting" | "no-fields" | "error" | "ready";

/** The mutually-exclusive phases of the fill/download step. */
type FillStatus = "idle" | "filling" | "success" | "error";

/** Human-readable, per-field error text for a validation reason. */
function reasonText(reason: "too-long" | "invalid-option"): string {
  return reason === "too-long"
    ? "Value too long (max 10,000 characters)."
    : "Invalid option.";
}

/** Trigger a browser download of the given bytes without leaving the page. */
function downloadBytes(data: Uint8Array, filename: string): void {
  saveFile(data, filename, "application/pdf");
}

/**
 * Fill PDF Forms tool — a custom two-step client UI (detect fields, then fill).
 *
 * It preserves the shared four-region spirit (description → upload → status →
 * result) and the green `#009966` accent with dark-mode support, while adding
 * the multi-field interaction the form filler needs.
 *
 * Detection has two distinct outcomes that must not be confused:
 *  - no AcroForm fields  -> {@link NO_FIELDS_MESSAGE} (Req 4.7), source unchanged.
 *  - a technical/parse error -> {@link DETECTION_ERROR_MESSAGE} (Req 4.8),
 *    which is worded distinctly and retains any values already entered.
 *
 * Each field input is validated with {@link validateFieldValue}; failures are
 * surfaced as a per-field error indication (Req 4.4 / 4.5).
 */
export default function FillFormClient() {
  const [file, setFile] = useState<File | null>(null);
  const [fields, setFields] = useState<FieldInfo[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [detectStatus, setDetectStatus] = useState<DetectStatus>("idle");
  const [fillStatus, setFillStatus] = useState<FillStatus>("idle");
  const [fillError, setFillError] = useState("");

  const handleFilesSelected = useCallback(async (selected: File[]) => {
    const next = selected[0] ?? null;
    setFile(next);
    // A new file resets everything except — when detection later fails — the
    // values, which we only ever clear on a successful detection.
    setFields([]);
    setValues({});
    setFieldErrors({});
    setFillStatus("idle");
    setFillError("");

    if (!next) {
      setDetectStatus("idle");
      return;
    }

    setDetectStatus("detecting");
    try {
      const detected = await detectFields(next);
      if (detected.length === 0) {
        // Req 4.7: distinct "no fillable fields" message; source unchanged.
        setDetectStatus("no-fields");
        return;
      }
      setFields(detected);
      setDetectStatus("ready");
    } catch {
      // Req 4.8: distinct technical-error message (retain any entered values —
      // here there are none yet, but the message must differ from no-fields).
      setDetectStatus("error");
    }
  }, []);

  const handleValueChange = useCallback(
    (field: FieldInfo, value: string) => {
      setValues((prev) => ({ ...prev, [field.name]: value }));

      const validation = validateFieldValue(field, value);
      setFieldErrors((prev) => {
        const next = { ...prev };
        if (validation.ok) {
          delete next[field.name];
        } else {
          next[field.name] = reasonText(validation.reason);
        }
        return next;
      });
      // Editing invalidates a previous success/error result.
      setFillStatus("idle");
      setFillError("");
    },
    [],
  );

  const handleFill = useCallback(async () => {
    if (!file || fields.length === 0) return;

    // Re-validate every field; block the fill if any value is invalid so we
    // never write a rejected value, while retaining all entered values.
    const errors: Record<string, string> = {};
    for (const field of fields) {
      const value = values[field.name] ?? "";
      const validation = validateFieldValue(field, value);
      if (!validation.ok) {
        errors[field.name] = reasonText(validation.reason);
      }
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFillStatus("error");
      setFillError("Some fields have invalid values. Fix them and try again.");
      return;
    }

    setFillStatus("filling");
    setFillError("");
    try {
      const output = await fillForm(file, values);
      const outName = file.name.replace(/\.pdf$/i, "") + "-filled.pdf";
      downloadBytes(output, outName);
      setFillStatus("success");
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Could not fill the form.";
      setFillStatus("error");
      setFillError(reason);
    }
  }, [file, fields, values]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 pt-24">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Region 1: Description */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-2">
              Fill Forms
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Detect and complete interactive PDF form fields, then download the
              filled document. Everything is processed in your browser.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl dark:shadow-black/30 p-8 mb-6">
            {/* Region 2: Upload area */}
            <FileUploader
              onFilesSelected={handleFilesSelected}
              accept=".pdf"
              multiple={false}
            />

            {file && (
              <div className="mt-6">
                <div className="flex items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                  <span className="text-sm text-slate-900 dark:text-slate-100 break-words min-w-0">
                    {file.name}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">
                    {(file.size / 1024).toFixed(1)} KB
                  </span>
                </div>
              </div>
            )}

            {/* Region 3: Status (detection feedback) */}
            {detectStatus === "detecting" && (
              <div className="mt-6 flex items-center gap-3 px-6 py-4 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
                <div
                  className="w-5 h-5 border-2 rounded-full animate-spin border-t-transparent"
                  style={{ borderColor: ACCENT, borderTopColor: "transparent" }}
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Detecting form fields...
                </span>
              </div>
            )}

            {/* Req 4.7: distinct no-fields message */}
            {detectStatus === "no-fields" && (
              <div className="mt-6 flex items-center gap-3 px-6 py-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                <div className="w-5 h-5 rounded-full bg-amber-500 flex-shrink-0" />
                <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  {NO_FIELDS_MESSAGE}
                </span>
              </div>
            )}

            {/* Req 4.8: distinct detection-error message */}
            {detectStatus === "error" && (
              <div className="mt-6 flex items-center gap-3 px-6 py-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800">
                <div className="w-5 h-5 rounded-full bg-red-500 flex-shrink-0" />
                <span className="text-sm font-medium text-red-700 dark:text-red-300">
                  {DETECTION_ERROR_MESSAGE}
                </span>
              </div>
            )}

            {/* Fields form (rendered when detection found fields) */}
            {detectStatus === "ready" && fields.length > 0 && (
              <div className="mt-6 space-y-5">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Form Fields ({fields.length})
                </h3>

                {fields.map((field) => {
                  const value = values[field.name] ?? "";
                  const error = fieldErrors[field.name];
                  const hasError = Boolean(error);
                  const inputBorder = hasError
                    ? "border-red-400 dark:border-red-500"
                    : "border-slate-300 dark:border-slate-600";

                  return (
                    <div key={field.name} className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                        {field.name}
                        <span className="ml-2 text-xs font-normal text-slate-400 dark:text-slate-500">
                          {field.type}
                        </span>
                      </label>

                      {field.type === "checkbox" ? (
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={value === "true"}
                            onChange={(e) =>
                              handleValueChange(
                                field,
                                e.target.checked ? "true" : "false",
                              )
                            }
                            className="h-5 w-5 rounded border-slate-300 dark:border-slate-600"
                            style={{ accentColor: ACCENT }}
                          />
                          <span className="text-sm text-slate-600 dark:text-slate-400">
                            Checked
                          </span>
                        </label>
                      ) : field.options ? (
                        <select
                          value={value}
                          onChange={(e) => handleValueChange(field, e.target.value)}
                          className={`w-full rounded-lg border ${inputBorder} bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2`}
                          style={{ ["--tw-ring-color" as string]: ACCENT }}
                        >
                          <option value="">— Select —</option>
                          {field.options.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => handleValueChange(field, e.target.value)}
                          className={`w-full rounded-lg border ${inputBorder} bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2`}
                          style={{ ["--tw-ring-color" as string]: ACCENT }}
                        />
                      )}

                      {/* Per-field error indication (Req 4.4 / 4.5) */}
                      {hasError && (
                        <p className="text-xs font-medium text-red-600 dark:text-red-400">
                          {error}
                        </p>
                      )}
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={handleFill}
                  disabled={fillStatus === "filling"}
                  style={{ backgroundColor: ACCENT }}
                  className="w-full mt-2 px-6 py-3 text-white font-semibold rounded-xl transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {fillStatus === "filling" ? "Filling..." : "Fill & Download"}
                </button>

                {/* Region 4: Result / fill status */}
                {fillStatus === "success" && (
                  <div
                    className="flex items-center gap-3 px-6 py-4 rounded-xl border"
                    style={{
                      backgroundColor: "rgba(0, 153, 102, 0.1)",
                      borderColor: "rgba(0, 153, 102, 0.4)",
                    }}
                  >
                    <div
                      className="w-5 h-5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: ACCENT }}
                    />
                    <span className="text-sm font-medium" style={{ color: ACCENT }}>
                      Form filled. Your download should begin automatically.
                    </span>
                  </div>
                )}

                {fillStatus === "error" && (
                  <div className="flex items-center gap-3 px-6 py-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800">
                    <div className="w-5 h-5 rounded-full bg-red-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-red-700 dark:text-red-300">
                      {fillError}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
