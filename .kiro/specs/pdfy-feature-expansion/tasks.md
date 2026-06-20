# Implementation Plan: PDFy Feature Expansion

## Overview

This plan converts the design into incremental, test-driven coding steps for the PDFy
client-side PDF toolkit (Next.js 16 static export, React 19, Tailwind 4, TypeScript). Work
proceeds bottom-up: foundation and shared UI first, then each tool's pure `lib/` logic with
its property-based tests, followed by the tool-page wiring that integrates each module into
the existing `app/tools/<tool>` structure. Every step builds on prior steps so no module is
left orphaned.

Property-based tests use **fast-check** with **Vitest** and run a minimum of 100 generated
cases each. Each of the 33 correctness properties is implemented by exactly one property test,
tagged `// Feature: pdfy-feature-expansion, Property {n}: ...`. Heavy executors (OCR recognizer,
Office libs, pdf.js rendering) are mocked in property tests so pure planning/validation logic is
exercised cheaply.

## Tasks

- [x] 1. Set up testing foundation and shared types
  - [x] 1.1 Set up Vitest + fast-check test framework
    - Add `vitest`, `fast-check`, `@vitest/coverage-v8`, `jsdom` as devDependencies
    - Create `vitest.config.ts` (jsdom environment, `lib/**` + `components/**` test globs)
    - Add `test` and `test:run` (single-run) scripts to `package.json`
    - Add a sample passing test to confirm the runner works
    - _Requirements: foundation for all property tests_

  - [x] 1.2 Define shared data models and types
    - Create `lib/types.ts` with `Rect`, `Point`, `RGB`, `PageCrop`, `ResizeSpec`, `SiteDefaults`, `Progress`, `ToolResult`
    - Export common discriminated-result helper types used by validators
    - _Requirements: 7.1, 7.2, 17.3 (shared model surface)_

- [x] 2. Build the reusable ToolTemplate component
  - [x] 2.1 Implement ToolTemplate with the four-state model
    - Create `components/ToolTemplate.tsx` rendering description → upload → status → result regions in order
    - Implement `idle | processing | success | error` states; hide status + result regions when `idle`
    - On success show downloads + notices; on error show message and retain selected files
    - Preserve `#009966` accent and dark-mode Tailwind classes
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7_

  - [x] 2.2 Write property test for ToolTemplate status invariant
    - **Property 32: ToolTemplate status is always exactly one of four states**
    - **Validates: Requirements 15.4**

- [x] 3. Implement dark mode theme controller
  - [x] 3.1 Implement theme resolution, controller, and pre-paint script
    - Create `lib/theme.ts` with `resolveTheme(stored, osPrefersDark)`
    - Create `components/ThemeController.tsx` + toggle; persist `pdfy.theme` to localStorage, flip root `class`
    - Add the inline pre-paint script to `app/layout.tsx`; add `matchMedia` listener for OS changes while unset
    - Wrap localStorage access in try/catch with OS-preference fallback
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_

  - [x] 3.2 Write property test for theme resolution and persistence
    - **Property 27: Theme resolution and persistence round-trip**
    - **Validates: Requirements 16.1, 16.2, 16.4**

- [x] 4. Build tool registry, search, and catalog
  - [x] 4.1 Implement the tool registry
    - Create `lib/tool-registry.ts` with `ToolDefinition`, `ToolCategory`, `TOOLS`, `getTool`, `CATEGORIES` (including synthetic "All")
    - Populate entries for all existing + new tools with unique SEO titles (10–60 chars) and descriptions (50–160 chars)
    - _Requirements: 10.3, 10.4, 17.1_

  - [x] 4.2 Write property test for registry title/description well-formedness
    - **Property 29: Tool titles and descriptions are well-formed and unique**
    - **Validates: Requirements 17.1**

  - [x] 4.3 Implement tool search and category filtering
    - Create `lib/tool-search.ts` with a pure `filterTools(tools, query, category)` (case-insensitive substring of name/description; whitespace-only matches all; "All" matches every tool)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 4.4 Write property test for search and category filtering
    - **Property 21: Search and category filtering returns exactly the matching tools**
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5**

  - [x] 4.5 Wire the Tools_Catalog page to registry, search, and category UI
    - Update `app/tools/page.tsx` to render from `TOOLS`, with debounced (≤300ms) search field and category filter
    - Show a visible "no tools found" message and zero entries when nothing matches
    - _Requirements: 10.1, 10.6_

- [x] 5. Implement SEO metadata, sitemap, and README sync
  - [x] 5.1 Implement per-tool metadata builder and wire tool-page metadata exports
    - Create `lib/seo.ts` with `buildToolMetadata(tool, siteDefaults)` filling site defaults for missing fields and emitting OG title/description/type/canonical absolute URL/single image
    - Convert tool pages to thin server components that `export const metadata` from the registry, wrapping the existing `"use client"` UI
    - _Requirements: 17.2, 17.3, 17.4_

  - [x] 5.2 Write property test for tool metadata completeness
    - **Property 28: Tool metadata is complete and consistent**
    - **Validates: Requirements 17.2, 17.3, 17.4**

  - [x] 5.3 Implement the static-export sitemap
    - Create `app/sitemap.ts` enumerating registry tools + static public pages as absolute URLs, excluding non-public/redirected pages
    - _Requirements: 17.5, 17.6_

  - [x] 5.4 Write property test for sitemap coverage
    - **Property 30: Sitemap contains exactly one absolute URL per public page**
    - **Validates: Requirements 17.5, 17.6**

  - [x] 5.5 Implement README sync helper and update README
    - Create `lib/readme-sync.ts` parsing the README tool list and comparing it (trimmed) against the registry set
    - Update `README.md` so its `{name, description}` entries exactly match the registry; include the client-side/no-upload privacy statement
    - _Requirements: 18.1, 18.2, 18.3, 18.4_

  - [x] 5.6 Write property test for README/registry set equality
    - **Property 31: README and tool catalog are equal sets**
    - **Validates: Requirements 18.1, 18.2, 18.4**

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement Page Manager (delete, extract, crop, resize)
  - [x] 7.1 Implement pure page planners and validators
    - In `lib/page-manager.ts` implement `planDeletion`, `planExtraction`, `clampCropRect`, `validateScale`, and pure proportional-resize dimension computation
    - Return typed discriminated results (no throws) for guard cases
    - _Requirements: 6.1, 6.2, 6.4, 6.5, 7.5, 7.6, 7.7_

  - [x] 7.2 Write property test for deletion complement
    - **Property 1: Deletion keeps the ascending complement**
    - **Validates: Requirements 6.1**

  - [x] 7.3 Write property test for extraction selection
    - **Property 2: Extraction keeps exactly the selection in order**
    - **Validates: Requirements 6.2**

  - [x] 7.4 Write property test for page-operation guards
    - **Property 3: Page-operation guards reject empty and total-delete selections**
    - **Validates: Requirements 6.4, 6.5**

  - [x] 7.5 Write property test for crop clamping
    - **Property 4: Crop region is always clamped within page bounds or rejected**
    - **Validates: Requirements 7.5, 7.6**

  - [x] 7.6 Write property test for scale validation
    - **Property 5: Scale validation accepts exactly the supported range**
    - **Validates: Requirements 7.7**

  - [x] 7.7 Implement Page Manager executors (pdf-lib)
    - In `lib/page-manager.ts` implement `buildSubsetPdf`, `applyCrop` (CropBox, content preserved), `applyResize` (proportional/aspect-preserving), `reorderPdf`
    - _Requirements: 6.1, 6.2, 7.1, 7.2, 7.3, 7.4, 11.6_

  - [x] 7.8 Write property test for proportional resize
    - **Property 6: Proportional resize scales both dimensions equally**
    - **Validates: Requirements 7.2, 7.3**

  - [x] 7.9 Wire delete/extract and crop/resize tool pages
    - Create `app/tools/delete-extract/page.tsx` and `app/tools/crop-resize/page.tsx` using ToolTemplate, calling Page Manager executors
    - Surface guard/validation errors and retain the original document on failure
    - _Requirements: 6.3, 6.4, 6.5, 7.4, 7.6, 7.7_

- [x] 8. Implement thumbnail grid and drag-and-drop reordering
  - [x] 8.1 Implement thumbnail rendering and pure reorder helper
    - Create `lib/thumbnails.ts` with pure `moveItem(arr, from, to)` and a pdf.js per-page render helper
    - Create `components/ThumbnailGrid.tsx` with per-page loading indicator, render-failure placeholder (continues others), drop-target indicator, and a displayed-order source of truth
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.7_

  - [x] 8.2 Write property test for reorder permutation honored by output
    - **Property 22: Reordering is a multiset-preserving permutation honored by output**
    - **Validates: Requirements 11.6**

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement Layout Tool (N-up and booklet)
  - [x] 10.1 Implement pure imposition planners
    - In `lib/layout-tool.ts` implement `planNup` (reading order, pad full multiple with blanks) and `planBooklet` (pad to multiple of 4, fold order)
    - _Requirements: 8.1, 8.3, 8.5, 8.6, 8.7_

  - [x] 10.2 Write property test for N-up ordering and padding
    - **Property 7: N-up preserves source order and pads to a full multiple**
    - **Validates: Requirements 8.1, 8.5**

  - [x] 10.3 Write property test for booklet imposition
    - **Property 8: Booklet imposition is a valid padded permutation**
    - **Validates: Requirements 8.3, 8.6**

  - [x] 10.4 Implement Layout executors
    - In `lib/layout-tool.ts` implement `buildNup` and `buildBooklet` with uniform aspect-preserving scaling into cells
    - _Requirements: 8.2, 8.4_

  - [x] 10.5 Wire layout tool page
    - Create `app/tools/layout/page.tsx` using ToolTemplate; reject empty/zero-page input with an error
    - _Requirements: 8.4, 8.7_

- [x] 11. Implement PDF Editor (text, shapes, redaction)
  - [x] 11.1 Implement edit validation and text/shape application
    - In `lib/pdf-editor.ts` implement `validateEdit` and `applyEdits` for text (1–5,000 chars, in-bounds), rect, and line; empty edit list returns the original unchanged
    - _Requirements: 3.1, 3.2, 3.3, 3.6, 3.7_

  - [x] 11.2 Write property test for added-content embedding and rejection
    - **Property 9: Editor embeds valid added content; rejects invalid**
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [x] 11.3 Write property test for empty-edit identity
    - **Property 11: Editing with no edits is the identity**
    - **Validates: Requirements 3.7**

  - [x] 11.4 Implement redaction
    - Add redaction to `lib/pdf-editor.ts`: remove intersecting text from the content stream (unrecoverable) and draw an opaque mark
    - _Requirements: 3.4, 3.5_

  - [x] 11.5 Write property test for redaction unrecoverability
    - **Property 10: Redaction makes covered text unrecoverable**
    - **Validates: Requirements 3.4**

  - [x] 11.6 Wire PDF editor tool page
    - Create `app/tools/edit/page.tsx` using ToolTemplate; reject invalid/protected files and retain the prior document
    - _Requirements: 3.6, 3.8_

- [x] 12. Implement Form Filler
  - [x] 12.1 Implement field detection, validation, and filling
    - In `lib/form-filler.ts` implement `detectFields` (unique placeholder labels for unnamed fields; `[]` when none), `validateFieldValue` (per-field too-long / invalid-option), and `fillForm`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 12.2 Write property test for field detection
    - **Property 12: Detected fields match the form's fields with unique labels**
    - **Validates: Requirements 4.1, 4.2**

  - [x] 12.3 Write property test for fill round-trip
    - **Property 13: Filling then reading back yields the written values**
    - **Validates: Requirements 4.3**

  - [x] 12.4 Write property test for field-value validation
    - **Property 14: Field-value validation rejects over-length and out-of-set values**
    - **Validates: Requirements 4.4, 4.5**

  - [x] 12.5 Wire form filler tool page
    - Create `app/tools/fill-form/page.tsx` using ToolTemplate with distinct no-fields vs detection-error messages and per-field error indication
    - _Requirements: 4.7, 4.8_

- [x] 13. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Implement PDF Comparator
  - [x] 14.1 Implement comparison engine
    - In `lib/pdf-compare.ts` implement `comparePdfs` with per-page status (handles unequal counts), text-diff mode, visual-diff mode, and `identical` detection
    - Reject invalid/corrupt and password-protected inputs with distinct messages
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.7, 5.8_

  - [x] 14.2 Write property test for per-page accounting
    - **Property 15: Comparison accounts for every page exactly once**
    - **Validates: Requirements 5.1, 5.4**

  - [x] 14.3 Write property test for identical-document comparison
    - **Property 16: Identical documents report no differences**
    - **Validates: Requirements 5.6**

  - [x] 14.4 Write property test for text-diff reconstruction
    - **Property 17: Text diff reconstructs the per-page changes**
    - **Validates: Requirements 5.2**

  - [x] 14.5 Wire compare tool page
    - Create `app/tools/compare/page.tsx` using ToolTemplate; accept exactly two files; render per-page/text/visual results
    - _Requirements: 5.1, 5.6, 5.7, 5.8_

- [x] 15. Implement OCR Engine
  - [x] 15.1 Implement OCR pipeline with structure preservation
    - In `lib/ocr-engine.ts` implement `runOcr` (pdf.js validate/parse, per-page canvas render → Tesseract.js recognize → rebuild with text layer), preserving page count/dimensions/content, reporting `pagesWithNoText`, per-page progress, and engine-load abort
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 15.2 Write property test for OCR structure preservation (recognizer mocked)
    - **Property 18: OCR preserves page structure**
    - **Validates: Requirements 2.2**

  - [x] 15.3 Write property test for no-text page reporting (recognizer mocked)
    - **Property 19: OCR reports and preserves pages with no recognized text**
    - **Validates: Requirements 2.5**

  - [x] 15.4 Wire OCR tool page
    - Create `app/tools/ocr/page.tsx` using ToolTemplate with page/total/percent progress and invalid-file/engine-failure errors
    - _Requirements: 2.3, 2.6, 2.7_

- [x] 16. Implement Office Converter
  - [x] 16.1 Implement format detection, gating, and conversions
    - In `lib/office-converter.ts` implement `detectSourceFormat`, 100 MB / parseability gating, `pdfToOffice` and `officeToPdf` (with `fidelityNotices`); reuse `htmlToPDF` for office→PDF legs
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7, 1.8_

  - [x] 16.2 Write property test for input gating
    - **Property 33: Office conversion gates unsupported and oversized inputs**
    - **Validates: Requirements 1.6, 1.7**

  - [x] 16.3 Wire office converter tool page
    - Create `app/tools/office/page.tsx` using ToolTemplate with a ≥2s progress indicator, fidelity notice surfaced before download, and notice-failure fallback that still allows download
    - _Requirements: 1.4, 1.5, 1.8_

- [x] 17. Implement Flatten Tool
  - [x] 17.1 Implement flattening
    - In `lib/flatten.ts` implement `flattenPdf` rendering AcroForm values + annotation appearances into static content, removing interactive objects (within 1pt, preserving page count/order); return `nothing-to-flatten` sentinel when applicable
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 17.2 Write property test for flatten removal and pagination
    - **Property 20: Flatten removes all interactive objects and preserves pagination**
    - **Validates: Requirements 9.1, 9.2, 9.3**

  - [x] 17.3 Wire flatten tool page
    - Create `app/tools/flatten/page.tsx` using ToolTemplate with nothing-to-flatten and failure messaging
    - _Requirements: 9.5, 9.6_

- [x] 18. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 19. Implement Batch Processor
  - [x] 19.1 Implement batch validation, runner, archive, and panel
    - In `lib/batch.ts` implement `validateBatch` (1–100 files, ≤100 MB), `runBatch` (independent per-file, failure isolation, status updates), `zipResults` (jszip)
    - Create `components/BatchPanel.tsx` showing per-file status and completed/total count plus individual + archive downloads
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [x] 19.2 Write property test for batch validation limits
    - **Property 23: Batch validation enforces the documented limits**
    - **Validates: Requirements 12.2**

  - [x] 19.3 Write property test for batch completion and result count
    - **Property 24: Batch produces one result per success and reaches terminal status for all**
    - **Validates: Requirements 12.1, 12.3**

  - [x] 19.4 Write property test for failure isolation
    - **Property 25: A failing file does not halt the batch**
    - **Validates: Requirements 12.5**

- [x] 20. Implement Recent-Files History
  - [x] 20.1 Implement history store and recent-files view
    - In `lib/history-store.ts` implement pure `applyEntry` (255-char truncation, prepend, 50-cap LRU eviction), plus `recordEntry`/`listEntries`/`clearHistory` over localStorage with storage-error handling
    - Create a recent-files view component (most-recent-first list, empty state, clear action)
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_

  - [x] 20.2 Write property test for history truncation, cap, and ordering
    - **Property 26: History store enforces truncation, cap, and ordering**
    - **Validates: Requirements 14.1, 14.2, 14.3**

- [x] 21. Implement PWA and offline support
  - [x] 21.1 Add manifest, service worker, registration, and offline indicator
    - Create `public/manifest.webmanifest` (name, 192/512 icons, start_url, standalone) and `public/sw.js` (precache app shell + tool chunks, offline fallback message, cache update on next online load)
    - Add a client registration component + persistent offline indicator; link the manifest in `app/layout.tsx`; ensure both files are emitted by static export
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_

- [x] 22. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test tasks and can be skipped for a faster MVP; core implementation tasks are never optional.
- Each task references specific requirements (granular sub-clauses) for traceability.
- Each of the 33 correctness properties maps to exactly one property-based test, placed next to the implementation it validates so errors surface early.
- Property tests use fast-check (≥100 runs each); heavy executors (OCR/Office/pdf.js rendering) are mocked so pure planning/validation logic is tested cheaply. Real-engine behavior is covered by example/integration/smoke tests per the design's Testing Strategy.
- Checkpoints provide incremental validation points across the build.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1", "7.1", "8.1", "10.1", "11.1", "12.1", "14.1", "15.1", "16.1", "17.1", "19.1", "20.1", "21.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "4.2", "4.3", "5.1", "5.3", "5.5", "7.2", "7.3", "7.4", "7.5", "7.6", "7.7", "10.2", "10.3", "10.4", "11.2", "11.3", "11.4", "12.2", "12.3", "12.4", "14.2", "14.3", "14.4", "15.2", "15.3", "16.2", "17.2", "19.2", "19.3", "19.4", "20.2"] },
    { "id": 3, "tasks": ["4.4", "4.5", "5.2", "5.4", "5.6", "7.8", "7.9", "8.2", "10.5", "11.5", "11.6", "12.5", "14.5", "15.4", "16.3", "17.3"] }
  ]
}
```
