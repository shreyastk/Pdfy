import type { Metadata } from "next";

import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import LoadingOverlay from "@/components/LoadingOverlay";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${openSans.variable} antialiased bg-white min-h-screen flex flex-col`}>
        <Suspense fallback={null}>
          <LoadingOverlay />
        </Suspense>
        <Navbar />
        <main className="flex-grow">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
