"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { OUTPUT_EVENT, setPendingInput, type ToolOutput } from "@/lib/handoff";
import { getExternalRequests, type ExternalRequestSummary } from "@/lib/network-monitor";
import { TOOLS } from "@/lib/tool-registry";

/** Tools offered as one-click next steps, in order of how often they follow another. */
const QUICK_NEXT = ["compress", "sign", "watermark", "page-numbers", "encrypt", "organize"];

/**
 * After any tool produces a PDF, offers to send it straight into another tool
 * (no re-upload) and shows whether anything was sent to another server.
 */
export default function ContinueBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [shown, setShown] = useState<{ output: ToolOutput; path: string } | null>(null);
  const [network, setNetwork] = useState<ExternalRequestSummary | null>(null);

  useEffect(() => {
    const onOutput = (e: Event) => {
      setShown({ output: (e as CustomEvent<ToolOutput>).detail, path: window.location.pathname });
      setNetwork(getExternalRequests());
    };
    window.addEventListener(OUTPUT_EVENT, onOutput);
    return () => window.removeEventListener(OUTPUT_EVENT, onOutput);
  }, []);

  // Only shown on the page that produced the output; hidden once the user navigates away.
  if (!shown || shown.path !== pathname) return null;
  const { output } = shown;
  const setOutput = (value: null) => setShown(value);

  const isPdf = output.file.name.toLowerCase().endsWith(".pdf");
  const next = TOOLS.filter((t) => t.slug !== output.toolSlug);
  const quick = QUICK_NEXT.map((slug) => next.find((t) => t.slug === slug)).filter(
    (t): t is (typeof TOOLS)[number] => Boolean(t),
  );

  const go = (slug: string) => {
    setPendingInput(output.file);
    router.push(`/tools/${slug}`);
  };

  return (
    <div
      role="region"
      aria-label="Next steps"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur shadow-2xl"
    >
      <div className="container mx-auto max-w-5xl pl-4 pr-20 py-3 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-slate-900 dark:text-slate-100 break-words">
              ✓ {output.file.name} is ready
            </p>
            {network && (
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {network.count === 0 ? (
                  <>🔒 Processed on this device — no requests to any other server this session.</>
                ) : (
                  <>
                    Processed on this device. Your file was not uploaded; {network.count} request
                    {network.count === 1 ? "" : "s"} went to {network.origins.join(", ")}.
                  </>
                )}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setOutput(null)}
            aria-label="Dismiss"
            className="flex-shrink-0 rounded-md px-2 text-lg leading-none text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
          >
            ×
          </button>
        </div>

        {isPdf && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Continue with:</span>
            {quick.map((tool) => (
              <button
                key={tool.slug}
                type="button"
                onClick={() => go(tool.slug)}
                className="rounded-full border border-[#009966] px-3 py-1 text-xs font-medium text-[#009966] transition-colors hover:bg-[#009966] hover:text-white"
              >
                {tool.name}
              </button>
            ))}
            <select
              aria-label="Continue with another tool"
              value=""
              onChange={(e) => e.target.value && go(e.target.value)}
              className="rounded-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1 text-xs text-slate-700 dark:text-slate-200"
            >
              <option value="">More tools…</option>
              {next.map((tool) => (
                <option key={tool.slug} value={tool.slug}>
                  {tool.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
