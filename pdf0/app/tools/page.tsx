import Link from "next/link";
import { toolIcons } from "@/lib/icons";

const tools = [
  {
    name: "Merge PDF",
    description: "Combine multiple PDF files into one.",
    href: "/tools/merge",
    icon: toolIcons.merge,
  },
  {
    name: "Sign PDF",
    description: "Sign documents with your signature.",
    href: "/tools/sign",
    icon: toolIcons.sign,
  },
  {
    name: "Page Numbers",
    description: "Add page numbers to your document.",
    href: "/tools/page-numbers",
    category: "Edit",
    isNew: true
  },
  {
    name: "Extract Text",
    description: "Copy text from PDF files",
    href: "/tools/extract-text",
    icon: toolIcons.extractText,
  },
  {
    name: "Edit Metadata",
    description: "Modify PDF title, author, and keywords",
    href: "/tools/edit-metadata",
    icon: toolIcons.editMetadata,
  },
  {
    name: "Split PDF",
    description: "Extract pages or split into multiple files.",
    href: "/tools/split",
    icon: toolIcons.split, // Using split/scissors icon or similar
  },
  {
    name: "Compress PDF",
    description: "Reduce file size while optimizing for quality.",
    href: "/tools/compress",
    icon: toolIcons.compress,
  },
  {
    name: "Rotate PDF",
    description: "Rotate PDF pages.",
    href: "/tools/rotate",
    icon: toolIcons.rotate,
  },
  {
    name: "PDF to Images",
    description: "Convert PDF pages to JPG or PNG.",
    href: "/tools/pdf-to-images",
    icon: toolIcons.pdfToImg,
  },
  {
    name: "Images to PDF",
    description: "Convert images to PDF document.",
    href: "/tools/images-to-pdf",
    icon: toolIcons.imgToPdf,
  },
  {
    name: "Organize Pages",
    description: "Reorder, rotate, or delete PDF pages.",
    href: "/tools/organize",
    icon: toolIcons.organize,
  },
  {
    name: "Add Watermark",
    description: "Add text watermark to PDF pages.",
    href: "/tools/watermark",
    icon: toolIcons.watermark,
  },
  {
    name: "Encrypt PDF",
    description: "Protect your PDF files with a password.",
    href: "/tools/encrypt",
    icon: toolIcons.encrypt,
  },
  {
    name: "Unlock PDF",
    description: "Remove passwords from PDF files.",
    href: "/tools/decrypt",
    icon: toolIcons.decrypt,
  },
  {
    name: "HTML to PDF",
    description: "Convert HTML files or code to PDF documents.",
    href: "/tools/html-to-pdf",
    icon: toolIcons.htmlToPdf,
  },
];

export default function ToolsPage() {
  return (
    <div className="min-h-screen bg-slate-50 pt-32 pb-16">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center mb-16">
          <h1 className="text-3xl md:text-4xl font-bold text-[#333333] mb-4 tracking-tight">All PDF Tools</h1>
          <p className="text-lg text-[#666666]">
            Make use of our collection of PDF tools to process your digital documents.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {tools.map((tool) => (
            <Link
              key={tool.name}
              href={tool.href}
              className="group p-8 bg-white rounded border border-slate-200 hover:border-[#009966] hover:shadow-md transition-all duration-200 text-center flex flex-col items-center h-full"
            >
              <div className="w-12 h-12 text-[#4d4d4d] group-hover:text-[#009966] mb-6 transition-colors">
                <svg
                  className="w-full h-full"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d={tool.icon}
                  />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-[#333333] mb-3">{tool.name}</h3>
              <p className="text-sm text-[#666666] leading-relaxed">
                {tool.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

