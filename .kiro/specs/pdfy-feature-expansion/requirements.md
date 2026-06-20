# Requirements Document

## Introduction

PDFy is a privacy-first, 100% client-side PDF toolkit built with Next.js 16 (App Router, static export), React 19, Tailwind CSS 4, and TypeScript. All PDF processing happens locally in the browser using pdf-lib, pdf.js, jspdf, and html2canvas; no file is ever uploaded to a server.

This feature expansion adds a broad set of new conversion and editing tools, several UX and platform improvements, and SEO/growth enhancements. Every new capability MUST preserve the core privacy guarantee (all processing client-side), remain compatible with Next.js static export, and match the existing visual style (green accent #009966, Tailwind, clean minimal UI).

The requirements below cover nine new tools, seven UX/platform improvements, and two SEO/growth items. Some document conversions (PDF to/from Office formats) are technically difficult to perform with high fidelity purely in the browser; the requirements capture the expected behavior and fidelity boundaries, and the design phase will select libraries and define detailed fidelity expectations.

## Glossary

- **PDFy**: The overall client-side web application.
- **Tool_Page**: A page under `/tools/<tool>` that exposes a single PDF operation.
- **Tools_Catalog**: The `/tools` page that lists all available tools.
- **PDF_Engine**: The collection of client-side libraries (pdf-lib, pdf.js, jspdf, html2canvas, and any added WASM modules) that perform PDF processing in `lib/`.
- **Office_Converter**: The component that converts between PDF and Office document formats (Word/Excel/PowerPoint).
- **OCR_Engine**: The in-browser WASM optical-character-recognition component (e.g., Tesseract.js).
- **PDF_Editor**: The tool that adds text boxes, shapes, and redactions to a PDF.
- **Form_Filler**: The tool that detects and fills AcroForm fields.
- **PDF_Comparator**: The tool that compares two PDF documents.
- **Page_Manager**: The shared logic that handles page-level operations (delete, extract, crop, resize, reorder).
- **Layout_Tool**: The tool that produces N-up and booklet print layouts.
- **Flatten_Tool**: The tool that merges form fields and annotations into static page content.
- **Thumbnail_Renderer**: The component that renders page thumbnail previews using pdf.js.
- **Batch_Processor**: The component that applies one operation to multiple input files in a single run.
- **History_Store**: The in-browser store (e.g., IndexedDB/localStorage) that records recent-file metadata.
- **Tool_Template**: A reusable page/layout component shared by Tool_Pages to reduce duplication.
- **Theme_Controller**: The component that manages light/dark appearance.
- **AcroForm field**: An interactive form field embedded in a PDF.
- **Searchable PDF**: A PDF in which recognized text is embedded as a selectable, copyable text layer.
- **Round-trip**: Performing an operation and its inverse (e.g., parse then serialize) to verify equivalence.

## Requirements

### Requirement 1: PDF to/from Office Conversions

**User Story:** As a user, I want to convert between PDF and Word/Excel/PowerPoint formats, so that I can reuse document content in editable Office files and vice versa.

#### Acceptance Criteria

1. WHEN a user provides a PDF file no larger than 100 MB to the Office_Converter and selects a target Office format of Word (.docx), Excel (.xlsx), or PowerPoint (.pptx), THE Office_Converter SHALL produce a downloadable file in the selected format generated entirely in the browser.
2. WHEN a user provides a Word (.docx), Excel (.xlsx), or PowerPoint (.pptx) file no larger than 100 MB to the Office_Converter and selects PDF as the target, THE Office_Converter SHALL produce a downloadable PDF file generated entirely in the browser.
3. THE Office_Converter SHALL perform all conversion processing client-side within the browser and SHALL NOT transmit file content, file metadata, or conversion output to any server.
4. WHILE a conversion is in progress, THE Office_Converter SHALL display a processing indicator that updates at least once every 2 seconds until the conversion completes or fails.
5. WHERE the source document contains layout or formatting that the client-side conversion cannot reproduce exactly, THE Office_Converter SHALL display a fidelity-limitation notice identifying the affected formatting categories to the user before download.
6. IF the provided file is not one of the supported source formats for the selected conversion, THEN THE Office_Converter SHALL display an error message indicating the unsupported format and the list of accepted formats, and SHALL NOT produce an output file.
7. IF the provided file exceeds 100 MB or cannot be parsed because it is corrupted or password-protected, THEN THE Office_Converter SHALL display an error message indicating the specific failure reason, SHALL NOT produce an output file, and SHALL retain the user's current selection so the user can choose another file.
8. IF the fidelity-limitation notice cannot be displayed due to a UI error, THEN THE Office_Converter SHALL allow the conversion to proceed without the notice.

### Requirement 2: OCR for Scanned PDFs

**User Story:** As a user, I want to run OCR on scanned PDFs, so that I can obtain selectable, searchable text from image-based documents.

#### Acceptance Criteria

1. WHEN a user provides a valid PDF (a PDF that can be parsed and whose pages contain rasterized page images) to the OCR_Engine and starts recognition, THE OCR_Engine SHALL extract text from each page image using an in-browser WASM engine.
2. THE OCR_Engine SHALL produce a Searchable PDF that embeds the recognized text as a selectable text layer positioned over the corresponding source text region of each original page, preserving the original page count, dimensions, and visual content.
3. WHILE OCR is running, THE OCR_Engine SHALL display progress indicating the current page number, the total page count, and a completion percentage, and SHALL update this indicator within 1 second after each page completes processing.
4. THE OCR_Engine SHALL perform all recognition client-side in the browser and SHALL NOT transmit page images, document content, or recognized text to any server.
5. IF OCR produces no recognizable text for a page, THEN THE OCR_Engine SHALL retain that page's original image unchanged in the output AND SHALL report the page numbers that yielded no recognized text.
6. IF the provided file cannot be parsed as a valid PDF or is corrupt, THEN THE OCR_Engine SHALL reject the file without starting recognition AND SHALL display an error indicating the file is invalid or unreadable.
7. IF the in-browser WASM OCR engine fails to load or initialize, THEN THE OCR_Engine SHALL abort recognition, leave the input file unchanged, AND display an error indicating that OCR could not be started.

### Requirement 3: Edit PDF (Text, Shapes, Redaction)

**User Story:** As a user, I want to add text boxes and shapes and redact content in a PDF, so that I can annotate documents and remove sensitive information.

#### Acceptance Criteria

1. WHEN a user adds a text box containing 1 to 5,000 characters at a position within the page boundaries on a page, THE PDF_Editor SHALL embed the entered text at that position in the output PDF.
2. IF a user attempts to add a text box at a position outside the page boundaries or containing more than 5,000 characters, THEN THE PDF_Editor SHALL reject the action, SHALL display an error message indicating the position or length is invalid, and SHALL leave the page content unchanged.
3. WHEN a user adds a shape that is either a rectangle or a line at a position within the page boundaries on a page, THE PDF_Editor SHALL embed that shape at that position in the output PDF.
4. WHEN a user applies a redaction over a region, THE PDF_Editor SHALL remove all text content that intersects that region from the output PDF such that the removed text is not recoverable through text extraction or copy operations.
5. WHEN a user applies a redaction over a region, THE PDF_Editor SHALL cover the region with an opaque mark in the output PDF such that the underlying content is not visually discernible.
6. THE PDF_Editor SHALL perform all editing within the browser client-side and SHALL NOT transmit file content to any server.
7. IF a user attempts to save while no edits have been made, THEN THE PDF_Editor SHALL return the original document unchanged.
8. IF the selected file cannot be parsed as a valid PDF or is password-protected, THEN THE PDF_Editor SHALL reject the file, SHALL display an error message indicating the file is invalid or protected, and SHALL retain the previously loaded document if one exists.

### Requirement 4: Fill PDF Forms

**User Story:** As a user, I want to detect and fill AcroForm fields, so that I can complete interactive PDF forms in the browser.

#### Acceptance Criteria

1. WHEN a user provides a PDF that contains AcroForm fields, THE Form_Filler SHALL detect and list the fillable fields with their field names and field types, supporting at minimum text, checkbox, radio group, dropdown, and list box field types.
2. WHERE a detected field has no defined name, THE Form_Filler SHALL assign and display a unique placeholder label for that field so the user can identify and fill it.
3. WHEN a user enters or selects values for detected fields and saves, THE Form_Filler SHALL write the entered values into the corresponding fields and produce a downloadable output PDF generated entirely in the browser.
4. IF a user enters more than 10,000 characters into a text field, THEN THE Form_Filler SHALL reject the input for that field, SHALL display an error indicating the maximum length, and SHALL retain the values entered in other fields.
5. IF a user enters a value that is invalid for a field's type (for example, a value not in a dropdown's option set), THEN THE Form_Filler SHALL reject the value for that field, SHALL display a field-level error indication, and SHALL retain the values entered in other fields.
6. THE Form_Filler SHALL perform all field detection, filling, and output generation client-side without transmitting file content to any server.
7. IF the provided PDF contains no detectable AcroForm fields, THEN THE Form_Filler SHALL display a message stating that no fillable fields were found and SHALL leave the source PDF unchanged.
8. IF field detection fails due to a technical error, THEN THE Form_Filler SHALL display a descriptive error message that is distinct from the no-fillable-fields message and SHALL retain any values the user has already entered.

### Requirement 5: Compare Two PDFs

**User Story:** As a user, I want to compare two PDF files, so that I can identify differences between document versions.

#### Acceptance Criteria

1. WHEN a user provides exactly two valid PDF files to the PDF_Comparator, THE PDF_Comparator SHALL produce a difference result that lists, per page, whether the page is unchanged, modified, added, or removed.
2. THE PDF_Comparator SHALL support a text-difference mode that reports each added and removed text segment between the two documents, identified by page number.
3. THE PDF_Comparator SHALL support a visual-difference mode that, for each page present in both documents, highlights the rendered regions where the two pages differ.
4. WHEN the two documents have a different number of pages, THE PDF_Comparator SHALL report each page that exists in only one document as added or removed and compare only the pages present in both documents.
5. THE PDF_Comparator SHALL perform all comparison processing within the user's browser without transmitting file content to any server.
6. IF the two provided documents are byte-for-byte identical or produce no text differences and no visual differences, THEN THE PDF_Comparator SHALL report that no differences were found.
7. IF either provided file is not a valid PDF, is corrupt, or cannot be parsed, THEN THE PDF_Comparator SHALL reject the comparison, retain any already-loaded files, and display an error message indicating which file could not be processed.
8. IF either provided file is password-protected and cannot be opened without a password, THEN THE PDF_Comparator SHALL halt the comparison and display an error message indicating that the file is password-protected.

### Requirement 6: Delete and Extract Pages

**User Story:** As a user, I want a focused tool to delete or extract specific pages, so that I can quickly produce a document containing only the pages I need.

#### Acceptance Criteria

1. WHEN a user selects one or more pages to delete, where each selected page is referenced by a page number between 1 and the document's total page count, and confirms, THE Page_Manager SHALL produce a downloadable output PDF, generated entirely in the browser, that excludes exactly the selected pages and preserves the ascending relative order of the remaining pages.
2. WHEN a user selects one or more pages to extract, where each selected page is referenced by a page number between 1 and the document's total page count, and confirms, THE Page_Manager SHALL produce a downloadable output PDF, generated entirely in the browser, that contains exactly the selected pages in their original ascending relative order.
3. THE Page_Manager SHALL perform all page operations client-side without transmitting file content to any server.
4. IF a user confirms a delete or extract operation with no pages selected, THEN THE Page_Manager SHALL prevent the operation, SHALL NOT produce an output PDF, and SHALL display a message indicating that at least one page must be selected.
5. IF a user attempts to delete every page in the document, THEN THE Page_Manager SHALL prevent the operation, SHALL NOT produce an output PDF, and SHALL display a message indicating that at least one page must remain.

### Requirement 7: Crop and Resize Pages

**User Story:** As a user, I want to crop and resize/scale PDF pages, so that I can adjust page dimensions and remove unwanted margins.

#### Acceptance Criteria

1. WHEN a user defines a crop region for a page and applies it, THE Page_Manager SHALL set the visible page area of the output PDF to the defined region and SHALL preserve the remaining page content outside the visible area as unrendered rather than deleted.
2. WHEN a user selects a target page size or a scale factor between 0.1 and 10.0 inclusive and applies it, THE Page_Manager SHALL resize the affected pages to the specified dimensions in the output PDF while preserving the original page aspect ratio unless the user explicitly selects non-proportional dimensions.
3. WHERE a user chooses to apply a crop or resize to all pages, THE Page_Manager SHALL apply the identical operation to every page in the document, including pages with differing original dimensions.
4. THE Page_Manager SHALL perform all crop and resize operations entirely within the browser and SHALL NOT transmit file content to any server or external endpoint.
5. IF a defined crop region extends beyond the page boundaries, THEN THE Page_Manager SHALL clamp the crop region to the page boundaries and SHALL apply the clamped region.
6. IF a defined crop region has a width or height of zero or negative dimension after clamping, THEN THE Page_Manager SHALL reject the operation, SHALL display an error indication that the crop region is invalid, and SHALL retain the original page unchanged.
7. IF a selected scale factor falls outside the range of 0.1 to 10.0 inclusive or a target page size produces a dimension outside the supported bounds, THEN THE Page_Manager SHALL reject the operation, SHALL display an error indication identifying the invalid value, and SHALL retain the original page dimensions unchanged.

### Requirement 8: N-up and Booklet Layout

**User Story:** As a user, I want N-up and booklet layouts, so that I can arrange multiple pages per sheet for efficient printing.

#### Acceptance Criteria

1. WHEN a user selects an N-up layout of 2, 4, 6, 8, 9, or 16 pages per sheet, THE Layout_Tool SHALL arrange the source pages onto sheets at the selected count per sheet, ordered left-to-right then top-to-bottom, preserving the source page sequence across sheets.
2. WHEN the Layout_Tool places source pages into N-up cells, THE Layout_Tool SHALL scale each page uniformly to fit its cell without distorting the page's aspect ratio.
3. WHEN a user selects booklet layout, THE Layout_Tool SHALL impose pages two-up per side for double-sided printing with a center fold, ordering pages so the output folds into a booklet with an ascending page sequence.
4. THE Layout_Tool SHALL perform all layout processing within the user's browser and SHALL NOT transmit file content to any server or external endpoint.
5. WHERE the source page count is not a multiple of the pages required to fill the final N-up sheet, THE Layout_Tool SHALL insert blank pages, matching the source page dimensions, to complete the layout.
6. WHERE a booklet layout's source page count is not a multiple of 4, THE Layout_Tool SHALL insert blank pages, matching the source page dimensions, so that the total page count is a multiple of 4 suitable for folding.
7. IF the source document has zero pages or no document is loaded, THEN THE Layout_Tool SHALL prevent the operation, SHALL NOT produce an output PDF, and SHALL display an error indication that a document with at least one page is required.

### Requirement 9: Flatten PDF

**User Story:** As a user, I want to flatten a PDF, so that form fields and annotations become static, non-editable content.

#### Acceptance Criteria

1. WHEN a user flattens a PDF that contains AcroForm fields, THE Flatten_Tool SHALL render each field's current value as static page content and SHALL remove the interactive field such that the output PDF contains zero interactive AcroForm fields.
2. WHEN a user flattens a PDF that contains annotations, THE Flatten_Tool SHALL merge each annotation's visible appearance into static page content and SHALL remove the interactive annotation such that the output PDF contains zero interactive annotations.
3. WHEN flattening completes, THE Flatten_Tool SHALL position each flattened field value and annotation appearance at the same page coordinates, dimensions, and orientation as in the source document, within a tolerance of 1 point, and SHALL preserve the original page count and page order.
4. THE Flatten_Tool SHALL perform all flattening client-side without transmitting file content to any server.
5. IF the provided PDF contains no AcroForm fields and no annotations, THEN THE Flatten_Tool SHALL display a message stating that there is no content to flatten and SHALL NOT produce a modified output file.
6. IF the flattening operation fails due to a technical error, THEN THE Flatten_Tool SHALL display a descriptive error message indicating the failure and SHALL retain the original document unchanged.

### Requirement 10: Tool Search and Category Filtering

**User Story:** As a user, I want to search and filter tools by category, so that I can quickly find the tool I need.

#### Acceptance Criteria

1. WHEN a user enters one or more characters in the Tools_Catalog search field, THE Tools_Catalog SHALL perform a case-insensitive partial-substring match against each tool's name and description, and SHALL display only the tools whose name or description contains the entered text within 300 milliseconds of the last keystroke.
2. WHILE the search field is empty or contains only whitespace characters, THE Tools_Catalog SHALL display all tools that match the currently active category filter.
3. WHEN a user selects a category filter, THE Tools_Catalog SHALL display only the tools assigned to the selected category and SHALL hide all tools not assigned to that category.
4. WHERE a category filter labeled "All" (or equivalent default) is selected, THE Tools_Catalog SHALL display all tools regardless of category assignment, subject to any active search term.
5. WHERE a search term and a non-default category filter are both active, THE Tools_Catalog SHALL display only the tools that both match the search term (per criterion 1) and are assigned to the selected category, and SHALL hide all other tools.
6. IF zero tools match the active search term and category criteria, THEN THE Tools_Catalog SHALL display a visible message indicating that no tools were found and SHALL display zero tool entries.

### Requirement 11: Page Thumbnail Previews and Drag-and-Drop Reordering

**User Story:** As a user, I want page thumbnail previews with drag-and-drop reordering, so that I can visually preview and rearrange pages across tools.

#### Acceptance Criteria

1. WHEN a user loads a valid PDF in a tool that supports page-level operations, THE Thumbnail_Renderer SHALL render and display a thumbnail preview for each page client-side, with each thumbnail rendered within 3 seconds of that page becoming visible in the viewport.
2. WHILE the Thumbnail_Renderer is generating thumbnails, THE Thumbnail_Renderer SHALL display a loading indicator for each page whose thumbnail has not yet completed rendering.
3. IF a page fails to render as a thumbnail, THEN THE Thumbnail_Renderer SHALL display a placeholder indicating the render failure for that page and SHALL continue rendering the remaining pages without aborting the overall preview.
4. WHEN a user drags a page thumbnail over a valid drop position, THE Thumbnail_Renderer SHALL display a visual indication of the drop target position.
5. WHEN a user drops a page thumbnail at a new position, THE Thumbnail_Renderer SHALL update the displayed page order within 500 milliseconds to reflect the new position.
6. WHEN a user applies an operation after reordering, THE PDF_Engine SHALL produce an output PDF whose page order exactly matches the displayed thumbnail order at the time the operation is applied.
7. THE Thumbnail_Renderer SHALL render all thumbnails client-side without transmitting file content to any server.

### Requirement 12: Batch Processing

**User Story:** As a user, I want to apply one operation to many files at once, so that I can process multiple documents without repeating steps.

#### Acceptance Criteria

1. WHEN a user provides 1 to 100 files (each no larger than 100 MB) and starts a batch operation, THE Batch_Processor SHALL apply the selected operation to each input file independently and produce one output result per successfully processed file.
2. IF a user attempts to start a batch operation with more than 100 files, with no files selected, or with any file larger than 100 MB, THEN THE Batch_Processor SHALL reject the operation, retain the current file selection, and display an error message indicating the violated limit.
3. WHILE a batch operation is running, THE Batch_Processor SHALL display for each file its current status as exactly one of "queued", "processing", "completed", or "failed", and SHALL display the count of files completed out of the total file count.
4. WHEN all files in a batch have reached a terminal status ("completed" or "failed"), THE Batch_Processor SHALL provide each successfully processed file as an individual download and SHALL provide an option to download all successful results as a single archive file.
5. IF an individual file in a batch fails to process, THEN THE Batch_Processor SHALL mark that file's status as "failed", continue processing the remaining files, and display for each failed file an error indication identifying the file and the reason for failure, without halting the batch.
6. THE Batch_Processor SHALL perform all processing within the user's browser and SHALL NOT transmit any file content or file metadata to any server.

### Requirement 13: PWA and Offline Support

**User Story:** As a user, I want PDFy to work as an installable offline app, so that I can use the tools without an internet connection.

#### Acceptance Criteria

1. THE PDFy SHALL serve a web app manifest that includes an application name, at least one icon of 192x192 pixels and one of 512x512 pixels, a start URL, and a display mode of "standalone", and SHALL register a service worker so that the browser presents the application as installable.
2. WHEN a user who has previously loaded PDFy at least once opens the application without network connectivity, THE PDFy SHALL load the application shell and previously cached tool assets from the local cache and render an interactive UI within 3 seconds on the cached assets.
3. WHILE PDFy is running without network connectivity, THE PDF_Engine SHALL perform all PDF operations whose required code and assets are present in the local cache, producing the same output as when running with network connectivity.
4. IF a user requests a tool or asset that is not present in the local cache while running without network connectivity, THEN THE PDFy SHALL retain the current application state without crashing and SHALL display a message indicating that the requested feature is unavailable offline.
5. WHILE PDFy is running without network connectivity, THE PDFy SHALL display a persistent visual indication that the application is in offline mode.
6. WHEN an updated version of the cached assets becomes available and the user reopens PDFy with network connectivity, THE service worker SHALL fetch and store the updated assets so that the updated version is served on the next application load.
7. THE service worker and web app manifest SHALL be emitted as static files in the Next.js static export output and SHALL function without any server-side runtime.

### Requirement 14: Recent-Files History

**User Story:** As a user, I want a recent-files history kept in my browser, so that I can revisit documents I recently worked on.

#### Acceptance Criteria

1. WHEN a user completes processing a file with a tool, THE History_Store SHALL record an entry containing the file name (truncated to a maximum of 255 characters), the tool used, and a timestamp expressed as an absolute date and time, in browser-local storage.
2. WHILE the recorded entries already number 50, WHEN the History_Store records a new entry, THE History_Store SHALL remove the least-recent entry so that the total number of stored entries never exceeds 50.
3. WHEN a user opens the recent-files view, THE History_Store SHALL display all recorded entries ordered from most recent timestamp to least recent timestamp.
4. WHEN a user opens the recent-files view AND no entries are recorded, THE History_Store SHALL display an empty-state indication that no recent files exist.
5. WHEN a user clears the recent-files history, THE History_Store SHALL remove all recorded entries from browser-local storage and display the empty-state indication.
6. IF writing an entry to browser-local storage fails because storage is unavailable or the quota is exceeded, THEN THE History_Store SHALL retain the previously stored entries unchanged and display an indication that the entry could not be saved.
7. THE History_Store SHALL store history data only in the user's browser without transmitting it to any server.

### Requirement 15: Reusable Tool-Page Template

**User Story:** As a developer, I want a reusable tool-page template, so that tool pages share consistent structure and reduce duplication.

#### Acceptance Criteria

1. THE Tool_Template SHALL render four regions on every Tool_Page in top-to-bottom order: a tool description region, a file upload area, a processing status region, and a result/download area.
2. WHEN a Tool_Page is built using the Tool_Template, THE Tool_Page SHALL render with the shared layout of Criterion 1 while supplying its own operation logic and its own metadata consisting of at minimum a page title and a description text.
3. THE Tool_Template SHALL preserve the existing visual style, including the green accent color #009966 and the existing Tailwind-based minimal UI, on every Tool_Page.
4. THE Tool_Template SHALL represent processing status using exactly four mutually exclusive states (idle, processing, success, error), where the idle state hides the processing status region and the result/download area.
5. WHEN a Tool_Page operation completes successfully, THE Tool_Template SHALL set the processing status to success and display the result/download area containing the generated output.
6. IF a Tool_Page operation fails or input validation fails, THEN THE Tool_Template SHALL set the processing status to error, display an error indication describing the failure, and retain the user's currently selected files without clearing them.
7. WHILE a Tool_Page operation is processing, THE Tool_Template SHALL perform all file processing in-browser and SHALL NOT upload the selected files to any server.

### Requirement 16: Dark Mode

**User Story:** As a user, I want a dark mode, so that I can use PDFy comfortably in low-light conditions.

#### Acceptance Criteria

1. WHEN a user toggles the theme to dark, THE Theme_Controller SHALL apply the dark appearance to every page of the application within 200 milliseconds and persist the selected theme value in browser local storage.
2. WHEN a user toggles the theme to light, THE Theme_Controller SHALL apply the light appearance to every page of the application within 200 milliseconds and persist the selected theme value in browser local storage.
3. WHEN a user loads any page of PDFy in a browser that has a previously persisted theme value, THE Theme_Controller SHALL apply that persisted theme before the page content is first rendered to the user.
4. WHERE no theme value has been persisted in browser local storage, THE Theme_Controller SHALL apply the appearance matching the operating system color-scheme preference (dark or light).
5. WHILE no theme value has been persisted in browser local storage, WHEN the operating system color-scheme preference changes, THE Theme_Controller SHALL update the applied appearance to match the new operating system preference within 200 milliseconds.
6. IF the persisted theme value cannot be read from or written to browser local storage, THEN THE Theme_Controller SHALL apply the appearance matching the operating system color-scheme preference and continue operating without interrupting the user.

### Requirement 17: Per-Tool SEO Metadata and Sitemap

**User Story:** As a site owner, I want per-tool metadata, Open Graph tags, and a sitemap, so that search engines and social platforms index and present each tool correctly.

#### Acceptance Criteria

1. THE PDFy SHALL provide for each Tool_Page a unique page title between 10 and 60 characters and a unique meta description between 50 and 160 characters, where uniqueness means no two Tool_Pages share an identical title or identical description.
2. THE PDFy SHALL provide for each Tool_Page Open Graph tags including title, description, type, canonical URL, and a single image reference, where the Open Graph title and description match the Tool_Page's page title and meta description.
3. IF a Tool_Page does not define its own title, meta description, or Open Graph image, THEN THE PDFy SHALL apply a site-level default value for each missing field so that every Tool_Page renders a complete title, meta description, and Open Graph image.
4. THE PDFy SHALL provide for each Tool_Page a canonical URL tag containing the absolute URL of that Tool_Page.
5. THE PDFy SHALL generate, as part of the Next.js static export build, a sitemap that lists every public page including each Tool_Page, where each entry contains the page's absolute URL and excludes any non-public or redirected page.
6. WHEN a new Tool_Page is added and the next static export build completes, THE PDFy SHALL include exactly one sitemap entry for the new Tool_Page with its absolute URL.

### Requirement 18: README Synchronization

**User Story:** As a maintainer, I want the README to reflect the actual tool list, so that documentation matches the implemented features.

#### Acceptance Criteria

1. THE README SHALL list every tool present in the Tools_Catalog, where each listed entry's name and description are an exact character-for-character match (excluding leading/trailing whitespace) of the corresponding tool's name and description in the Tools_Catalog.
2. IF the README contains a tool entry whose name does not correspond to any tool in the Tools_Catalog, THEN THE README SHALL be treated as out of sync and SHALL have that entry removed so that the count of tool entries in the README equals the count of tools in the Tools_Catalog.
3. THE README SHALL include a statement that all PDF processing is performed entirely client-side in the user's browser and that no user files are uploaded to or transmitted to any server.
4. WHEN the set of available tools in the Tools_Catalog changes (a tool is added, removed, or renamed), THE README SHALL be updated within the same change set (commit or pull request) so that, after the update, all criteria above hold with zero mismatched, missing, or extra tool entries.
