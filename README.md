# PDFy

**A fast, privacy-focused PDF toolkit built by Shreyas TK.**

Hi, I'm **Shreyas**. I built PDFy because I was tired of uploading my private documents to random servers just to merge or split them. I wanted a tool that runs **100% in the browser**, ensuring that my files (and yours) never leave the device.

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![React](https://img.shields.io/badge/React-19-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38bdf8)

## ✨ Why I Built This

- **🔒 100% Private** — I believe privacy is a fundamental right. All processing happens locally in your browser.
- **⚡ Fast** — No upload/download delays. Since it's local, it's instant.
- **🆓 Free** — I made this tool free for everyone. No registration, no limits.
- **📱 Responsive** — I spent a lot of time polishing the UI to work perfectly on both desktop and mobile.

## Tools

All PDF processing is performed entirely client-side in your browser. No user files are ever uploaded to or transmitted to any server.

- **Merge PDF** — Combine multiple PDF files into one.
- **Sign PDF** — Sign documents with your signature.
- **Page Numbers** — Add page numbers to your document.
- **Extract Text** — Copy text from PDF files
- **Split PDF** — Extract pages or split into multiple files.
- **Compress PDF** — Reduce file size while optimizing for quality.
- **Rotate PDF** — Rotate PDF pages.
- **PDF to Images** — Convert PDF pages to JPG or PNG.
- **Images to PDF** — Convert images to PDF document.
- **Organize Pages** — Reorder, rotate, or delete PDF pages.
- **Add Watermark** — Add text watermark to PDF pages.
- **Encrypt PDF** — Protect your PDF files with a password.
- **Unlock PDF** — Remove passwords from PDF files.
- **HTML to PDF** — Convert HTML files or code to PDF documents.
- **Office Converter** — Convert between PDF and Word, Excel, or PowerPoint.
- **OCR PDF** — Make scanned PDFs searchable with text recognition.
- **Edit PDF** — Add text, shapes, and redactions to PDF pages.
- **Fill Forms** — Fill in and complete interactive PDF form fields.
- **Compare PDF** — Find differences between two PDF documents.
- **Delete & Extract Pages** — Remove unwanted pages or extract a selection.
- **Crop & Resize** — Crop margins or change PDF page dimensions.
- **Page Layout** — Arrange pages with N-up or booklet imposition.
- **Flatten PDF** — Flatten form fields and annotations into the page.

## 🚀 Getting Started

If you want to run my code locally, here is how you can do it:

### Prerequisites

- Node.js 18+
- npm, yarn, pnpm, or bun

### Installation

```bash
# Clone the repository
git clone https://github.com/shreyas/pdf0.git
cd pdfy

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🏗️ How I Built It

I chose a modern, cutting-edge stack to make this project as performant and maintainable as possible:

- **Framework:** [Next.js 16](https://nextjs.org/) — For its powerful App Router and server-side capabilities (though I use client components for the PDF logic).
- **UI:** [React 19](https://react.dev/) + [Tailwind CSS 4](https://tailwindcss.com/) — I love Tailwind for its utility-first approach and used React 19 for the latest hooks and features.
- **PDF Processing:** [pdf-lib](https://pdf-lib.js.org/) + [PDF.js](https://mozilla.github.io/pdf.js/) — These libraries do the heavy lifting for PDF manipulation directly in the browser.
- **Language:** TypeScript — For type safety and better developer experience.

## 📁 Project Structure

Here's a quick look at how I organized the code:

```
pdfy/
├── app/
│   ├── page.tsx          # The landing page I designed
│   ├── layout.tsx        # Root layout with my custom Navbar & Footer
│   └── tools/            # Individual tool pages
├── components/           # Reusable UI components
├── lib/
│   └── pdf-operations.ts # The core logic where the magic happens
└── ...
```

## 🌐 Deployment

I deployed this using static export, so it can be hosted anywhere. It works great on Vercel, Netlify, or Cloudflare Pages.

## 📄 License

**MIT License** — I want this to be helpful to others, so feel free to use my code for your own projects, personal or commercial.

## ☕ Support My Work

I spend a lot of time maintaining and improving PDFy. If you find it useful, you can support me by buying me a coffee!

<a href="https://buymeacoffee.com/shreyastk" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>

---

*Built with ❤️ by Shreyas TK*
