import type { Metadata } from "next";

import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import LoadingOverlay from "@/components/LoadingOverlay";
import ThemeController from "@/components/ThemeController";
import PwaController from "@/components/PwaController";
import ContinueBar from "@/components/ContinueBar";
import CommandPalette from "@/components/CommandPalette";
import { Suspense } from "react";

import { Open_Sans } from "next/font/google"; // Changed from Geist

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
  display: "swap", // Best practice for loading
});

export const metadata: Metadata = {
  title: "PDFy - Professional PDF Tools in Your Browser",
  description: "Merge, split, compress, and edit PDF files with 100% privacy. Everything happens on your computer. No uploads needed.",
};

// Runs before first paint to apply the persisted theme (or OS preference),
// preventing a flash of the wrong theme (FOUC). Requirements 16.3, 16.4.
const themePrePaintScript = `(function(){try{var t=localStorage.getItem('pdfy.theme');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d){document.documentElement.classList.add('dark');}}catch(e){try{if(window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.classList.add('dark');}}catch(_){}}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#009966" />
        <script dangerouslySetInnerHTML={{ __html: themePrePaintScript }} />
      </head>
      <body className={`${openSans.variable} antialiased bg-white min-h-screen flex flex-col`}>
        <Suspense fallback={null}>
          <LoadingOverlay />
        </Suspense>
        <div className="fixed bottom-6 right-6 z-50">
          <ThemeController />
        </div>
        <PwaController />
        <Navbar />
        <main className="flex-grow">
          {children}
        </main>
        <Footer />
        <ContinueBar />
        <CommandPalette />
      </body>
    </html>
  );
}
