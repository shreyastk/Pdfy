import ToolsCatalogClient from "./ToolsCatalogClient";

export default function ToolsPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pt-32 pb-16">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center mb-16">
          <h1 className="text-3xl md:text-4xl font-bold text-[#333333] dark:text-slate-100 mb-4 tracking-tight">
            All PDF Tools
          </h1>
          <p className="text-lg text-[#666666] dark:text-slate-400">
            Make use of our collection of PDF tools to process your digital documents.
          </p>
        </div>

        <ToolsCatalogClient />
      </div>
    </div>
  );
}
