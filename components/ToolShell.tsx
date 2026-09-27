/**
 * Page chrome shared by tools whose UI doesn't fit {@link ToolTemplate}'s
 * single "run" flow (e.g. load → review → apply). Matches its layout.
 */
export default function ToolShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 pt-24">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-2">{title}</h1>
            <p className="text-slate-600 dark:text-slate-400">{description}</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl dark:shadow-black/30 p-6 sm:p-8 mb-6 space-y-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export const ui = {
  input:
    "w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#009966]/40",
  label: "block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1",
  primary:
    "px-6 py-3 bg-[#009966] text-white font-semibold rounded-xl transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed",
  secondary:
    "px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-[#009966] hover:text-[#009966] transition-colors disabled:opacity-50",
  error:
    "rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300",
  success:
    "rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300",
};
