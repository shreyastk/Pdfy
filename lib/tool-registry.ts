/**
 * Tool Registry — single source of truth for the PDFy tool catalog.
 *
 * Drives the catalog grid, search/filter, sitemap generation, per-tool SEO
 * metadata defaults, and README synchronization.
 *
 * Invariants (property-tested in task 4.2 / Property 29):
 * - Every `seoTitle` is 10–60 characters inclusive and unique.
 * - Every `seoDescription` is 50–160 characters inclusive and unique.
 * - Every `name` and `description` is unique.
 * - Every `slug` is unique.
 */

export type ToolCategory =
  | "Convert"
  | "Edit"
  | "Organize"
  | "Optimize"
  | "Security"
  | "View";

export interface ToolDefinition {
  slug: string; // e.g. "ocr" -> /tools/ocr
  name: string; // display name (matches README + catalog)
  description: string; // one-line description (matches README + catalog)
  category: ToolCategory;
  icon: string; // path key into lib/icons.ts
  seoTitle: string; // 10–60 chars, unique
  seoDescription: string; // 50–160 chars, unique
  ogImage?: string; // falls back to site default
  isNew?: boolean;
}

export const TOOLS: readonly ToolDefinition[] = [
  // ── Existing tools ──────────────────────────────────────────────────────
  {
    slug: "merge",
    name: "Merge PDF",
    description: "Combine multiple PDF files into one.",
    category: "Organize",
    icon: "merge",
    seoTitle: "Merge PDF Files Online — Free & Private | PDFy",
    seoDescription:
      "Combine multiple PDF files into a single document directly in your browser. Free, fast, and completely private with no uploads.",
  },
  {
    slug: "sign",
    name: "Sign PDF",
    description: "Sign documents with your signature.",
    category: "Edit",
    icon: "sign",
    seoTitle: "Sign PDF Documents Online Free | PDFy",
    seoDescription:
      "Draw or type your signature and sign PDF documents securely in the browser. No account required and nothing ever leaves your device.",
  },
  {
    slug: "page-numbers",
    name: "Page Numbers",
    description: "Add page numbers to your document.",
    category: "Edit",
    icon: "pageNumbers",
    seoTitle: "Add Page Numbers to PDF Online | PDFy",
    seoDescription:
      "Insert customizable page numbers into any PDF document quickly and privately, with all processing handled inside your own browser.",
  },
  {
    slug: "extract-text",
    name: "Extract Text",
    description: "Copy text from PDF files",
    category: "Convert",
    icon: "extractText",
    seoTitle: "Extract Text from PDF Online Free | PDFy",
    seoDescription:
      "Pull selectable, copyable text out of your PDF files in seconds. Everything runs client-side so your documents stay on your computer.",
  },
  {
    slug: "split",
    name: "Split PDF",
    description: "Extract pages or split into multiple files.",
    category: "Organize",
    icon: "split",
    seoTitle: "Split PDF — Separate Pages Online | PDFy",
    seoDescription:
      "Split a PDF into separate files or extract specific page ranges right in your browser. Fast, free, and your files never get uploaded.",
  },
  {
    slug: "compress",
    name: "Compress PDF",
    description: "Reduce file size while optimizing for quality.",
    category: "Optimize",
    icon: "compress",
    seoTitle: "Compress PDF — Reduce File Size | PDFy",
    seoDescription:
      "Shrink large PDF files while keeping good visual quality, entirely in your browser. No uploads, no waiting, and no privacy trade-offs.",
  },
  {
    slug: "rotate",
    name: "Rotate PDF",
    description: "Rotate PDF pages.",
    category: "Edit",
    icon: "rotate",
    seoTitle: "Rotate PDF Pages Online — Free Tool | PDFy",
    seoDescription:
      "Rotate one page or every page in your PDF to the correct orientation. A free, private tool that processes documents locally in-browser.",
  },
  {
    slug: "pdf-to-images",
    name: "PDF to Images",
    description: "Convert PDF pages to JPG or PNG.",
    category: "Convert",
    icon: "pdfToImg",
    seoTitle: "Convert PDF to JPG or PNG Images | PDFy",
    seoDescription:
      "Turn each page of your PDF into high-quality JPG or PNG images instantly. All conversion happens privately in your browser, never online.",
  },
  {
    slug: "images-to-pdf",
    name: "Images to PDF",
    description: "Convert images to PDF document.",
    category: "Convert",
    icon: "imgToPdf",
    seoTitle: "Convert Images to PDF Online Free | PDFy",
    seoDescription:
      "Combine JPG, PNG, and other images into a single PDF document in seconds. Completely client-side, so your photos stay private and secure.",
  },
  {
    slug: "organize",
    name: "Organize Pages",
    description: "Reorder, rotate, or delete PDF pages.",
    category: "Organize",
    icon: "organize",
    seoTitle: "Organize PDF Pages — Reorder & Sort | PDFy",
    seoDescription:
      "Reorder, rotate, and delete pages to organize your PDF exactly how you want. Drag-and-drop simplicity with full in-browser privacy.",
  },
  {
    slug: "watermark",
    name: "Add Watermark",
    description: "Add text watermark to PDF pages.",
    category: "Edit",
    icon: "watermark",
    seoTitle: "Add Watermark to PDF Online Free | PDFy",
    seoDescription:
      "Stamp a custom text watermark across the pages of your PDF document. Free and private, with every change made locally in your browser.",
  },
  {
    slug: "encrypt",
    name: "Encrypt PDF",
    description: "Protect your PDF files with a password.",
    category: "Security",
    icon: "encrypt",
    seoTitle: "Encrypt PDF — Password Protect Files | PDFy",
    seoDescription:
      "Add a password to your PDF so only the right people can open it. Encryption happens in your browser and your file is never uploaded.",
  },
  {
    slug: "decrypt",
    name: "Unlock PDF",
    description: "Remove passwords from PDF files.",
    category: "Security",
    icon: "decrypt",
    seoTitle: "Unlock PDF — Remove Password Online | PDFy",
    seoDescription:
      "Remove a known password from your PDF to make it freely accessible again. Runs entirely client-side so your file stays on your device.",
  },
  {
    slug: "html-to-pdf",
    name: "HTML to PDF",
    description: "Convert HTML files or code to PDF documents.",
    category: "Convert",
    icon: "htmlToPdf",
    seoTitle: "Convert HTML to PDF Online Free | PDFy",
    seoDescription:
      "Transform HTML files or raw markup into polished PDF documents in your browser. No server round-trips and no uploads of your content.",
  },

  // ── New tools added by this feature expansion ───────────────────────────
  {
    slug: "office",
    name: "Office Converter",
    description: "Convert between PDF and Word, Excel, or PowerPoint.",
    category: "Convert",
    icon: "htmlToPdf",
    isNew: true,
    seoTitle: "PDF to Word, Excel & PowerPoint | PDFy",
    seoDescription:
      "Convert between PDF and Office formats like Word, Excel, and PowerPoint right in your browser, with a clear note on formatting fidelity.",
  },
  {
    slug: "ocr",
    name: "OCR PDF",
    description: "Make scanned PDFs searchable with text recognition.",
    category: "Convert",
    icon: "extractText",
    isNew: true,
    seoTitle: "OCR PDF — Make Scans Searchable | PDFy",
    seoDescription:
      "Run optical character recognition on scanned PDFs to add a selectable, searchable text layer. Powered by in-browser WASM, fully private.",
  },
  {
    slug: "edit",
    name: "Edit PDF",
    description: "Add text, shapes, and redactions to PDF pages.",
    category: "Edit",
    icon: "editMetadata",
    isNew: true,
    seoTitle: "Edit PDF — Add Text, Shapes & Redact | PDFy",
    seoDescription:
      "Annotate your PDF with text boxes, shapes, lines, and permanent redactions. Edits are applied locally so your document never leaves you.",
  },
  {
    slug: "fill-form",
    name: "Fill Forms",
    description: "Fill in and complete interactive PDF form fields.",
    category: "Edit",
    icon: "pageNumbers",
    isNew: true,
    seoTitle: "Fill PDF Forms Online — Free Tool | PDFy",
    seoDescription:
      "Detect and complete interactive AcroForm fields in your PDF, then download the filled document. Everything is processed in your browser.",
  },
  {
    slug: "compare",
    name: "Compare PDF",
    description: "Find differences between two PDF documents.",
    category: "View",
    icon: "pdfToImg",
    isNew: true,
    seoTitle: "Compare Two PDFs — Spot Differences | PDFy",
    seoDescription:
      "Compare two PDF documents to reveal text and visual differences page by page. The comparison runs entirely client-side for full privacy.",
  },
  {
    slug: "delete-extract",
    name: "Delete & Extract Pages",
    description: "Remove unwanted pages or extract a selection.",
    category: "Organize",
    icon: "organize",
    isNew: true,
    seoTitle: "Delete or Extract PDF Pages Free | PDFy",
    seoDescription:
      "Delete pages you do not need or extract just the pages you want into a new PDF. Quick, free, and handled privately inside your browser.",
  },
  {
    slug: "crop-resize",
    name: "Crop & Resize",
    description: "Crop margins or change PDF page dimensions.",
    category: "Edit",
    icon: "rotate",
    isNew: true,
    seoTitle: "Crop & Resize PDF Pages Online | PDFy",
    seoDescription:
      "Trim away margins or rescale page dimensions to reshape your PDF exactly how you need. All adjustments happen locally in your browser.",
  },
  {
    slug: "layout",
    name: "Page Layout",
    description: "Arrange pages with N-up or booklet imposition.",
    category: "Organize",
    icon: "organize",
    isNew: true,
    seoTitle: "PDF Page Layout — N-up & Booklet | PDFy",
    seoDescription:
      "Arrange multiple pages per sheet with N-up grids or build print-ready booklets with fold imposition, all computed privately in-browser.",
  },
  {
    slug: "flatten",
    name: "Flatten PDF",
    description: "Flatten form fields and annotations into the page.",
    category: "Optimize",
    icon: "compress",
    isNew: true,
    seoTitle: "Flatten PDF — Lock Forms & Notes | PDFy",
    seoDescription:
      "Bake form field values and annotation appearances into static page content so the result has no interactive objects. Fully in-browser.",
  },
] as const;

/**
 * Category filter values shown in the catalog, including the synthetic "All"
 * option that matches every tool regardless of its assigned category.
 */
export type CategoryFilter = "All" | ToolCategory;

export const CATEGORIES: readonly CategoryFilter[] = [
  "All",
  "Convert",
  "Edit",
  "Organize",
  "Optimize",
  "Security",
  "View",
] as const;

/** Look up a tool definition by its slug. Returns undefined when not found. */
export function getTool(slug: string): ToolDefinition | undefined {
  return TOOLS.find((tool) => tool.slug === slug);
}
