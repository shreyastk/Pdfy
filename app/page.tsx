import Link from "next/link";
import ScrollReveal from "@/components/ScrollReveal";

const featuredTools = [
  {
    name: "Merge PDF",
    description: "Combine multiple PDF files into one.",
    href: "/tools/merge",
    icon: "M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2",
  },
  {
    name: "Compress PDF",
    description: "Reduce file size while optimizing for quality.",
    href: "/tools/compress",
    icon: "M19 14l-7 7m0 0l-7-7m7 7V3",
  },
  {
    name: "Encrypt PDF",
    description: "Protect your PDF files with a password.",
    href: "/tools/encrypt",
    icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
  },
  {
    name: "Unlock PDF",
    description: "Remove passwords from PDF files.",
    href: "/tools/decrypt",
    icon: "M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z",
  },
];

export default function LandingPage() {
  return (
    <div className="bg-white min-h-screen">
      {/* Hero Section */}
      <section className="pt-32 pb-20 text-center">
        <ScrollReveal>
          <div className="container mx-auto px-4">
            <h1 className="text-4xl md:text-5xl font-bold text-[#333333] mb-4 tracking-tight">
              Online PDF Tools
              <span className="text-xs text-slate-400 font-normal align-top ml-2 border border-slate-200 rounded px-1">BETA</span>
            </h1>
            <p className="text-xl text-[#666666] mb-12 font-normal">
              Free online PDF tools. Fill & sign PDF
            </p>

            <div className="flex flex-col items-center justify-center gap-4">
              <Link
                href="/tools"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-[#009966] text-white font-bold text-lg rounded-[4px] shadow-sm hover:bg-[#008055] transition-all min-w-[280px]"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Upload PDF file
              </Link>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* Curve Separator (Optional / Simplified) */}
      <div className="w-full h-16 bg-[#f7f7f7] rounded-t-[50%] scale-x-150 translate-y-8 hidden md:block opacity-50"></div>

      {/* Popular Tools Grid - Simplified */}
      <section className="py-16 bg-[#fdfdfd] border-t border-slate-100">
        <div className="container mx-auto px-4">
          <ScrollReveal delay={200}>
            <h2 className="text-center text-2xl font-bold text-[#333333] mb-12">Popular PDF Tools</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
              {featuredTools.map((tool) => (
                <Link
                  key={tool.name}
                  href={tool.href}
                  className="group p-6 bg-white rounded border border-slate-200 hover:border-[#009966] hover:shadow-md transition-all duration-200 text-center flex flex-col items-center"
                >
                  <div className="w-12 h-12 text-[#4d4d4d] group-hover:text-[#009966] mb-4 transition-colors">
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
                  <h3 className="text-lg font-bold text-[#333333] mb-2">{tool.name}</h3>
                  <p className="text-sm text-[#666666] leading-relaxed">
                    {tool.description}
                  </p>
                </Link>
              ))}
            </div>

            <div className="text-center mt-12">
              <Link href="/tools" className="text-[#009966] font-bold hover:underline flex items-center justify-center gap-1">
                See all PDF tools
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>


    </div>
  );
}
