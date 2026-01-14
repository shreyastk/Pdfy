"use client";

import Link from "next/link";

import { useState } from "react";

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo Area */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-[#009966] tracking-tight">PDFy</span>
          </div>
        </Link>

        {/* Desktop Navigation - Center/Left-ish like Sejda */}
        <div className="hidden md:flex items-center gap-6 ml-8 flex-1">
          <Link href="/tools" className="text-[15px] font-medium text-slate-600 hover:text-[#009966] transition-colors">
            All Tools
          </Link>
          <Link href="/tools/compress" className="text-[15px] font-medium text-slate-600 hover:text-[#009966] transition-colors">
            Compress
          </Link>

          <Link href="/tools/sign" className="text-[15px] font-medium text-slate-600 hover:text-[#009966] transition-colors">
            Sign
          </Link>
          <Link href="/tools/merge" className="text-[15px] font-medium text-slate-600 hover:text-[#009966] transition-colors">
            Merge
          </Link>
        </div>

        {/* Buy Me A Coffee Button - Desktop */}
        <a
          href="https://buymeacoffee.com/shreyastk"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden md:flex items-center gap-2 bg-[#FFDD00] text-slate-900 px-4 py-2 rounded-full font-medium text-sm hover:scale-105 hover:shadow-lg transition-all duration-300 ease-in-out transform"
        >
          <span className="text-lg">☕</span>
          <span>Buy me a coffee</span>
        </a>



        {/* Mobile Menu Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 text-slate-600 hover:text-[#009966] transition-colors"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-t border-slate-100 shadow-xl absolute w-full left-0">
          <div className="container mx-auto px-4 py-4 flex flex-col gap-2">
            <Link href="/tools" onClick={() => setMobileMenuOpen(false)} className="py-2 text-slate-600 hover:text-[#009966] font-medium">
              All Tools
            </Link>
            <Link href="/tools/compress" onClick={() => setMobileMenuOpen(false)} className="py-2 text-slate-600 hover:text-[#009966] font-medium">
              Compress
            </Link>
            <Link href="/tools/sign" onClick={() => setMobileMenuOpen(false)} className="py-2 text-slate-600 hover:text-[#009966] font-medium">
              Sign
            </Link>
            <Link href="/tools/page-numbers" onClick={() => setMobileMenuOpen(false)} className="py-2 text-slate-600 hover:text-[#009966] font-medium">
              Page Numbers
            </Link>
            <Link href="/tools/merge" onClick={() => setMobileMenuOpen(false)} className="py-2 text-slate-600 hover:text-[#009966] font-medium">
              Merge
            </Link>

            <a
              href="https://buymeacoffee.com/shreyastk"
              target="_blank"
              rel="noopener noreferrer"
              className="py-2 font-medium flex items-center gap-2 text-[#FFDD00] hover:text-[#e6c700] transition-colors"
            >
              <span>☕</span>
              <span>Buy me a coffee</span>
            </a>

          </div>
        </div>
      )}
    </nav>
  );
}
