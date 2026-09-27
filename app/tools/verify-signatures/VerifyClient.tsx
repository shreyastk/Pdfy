"use client";

import { useState } from "react";
import FileUploader from "@/components/FileUploader";
import ToolShell, { ui } from "@/components/ToolShell";
import { getTool } from "@/lib/tool-registry";
import { verifySignatures, type Integrity, type SignatureReport } from "@/lib/signature-verify";

const tool = getTool("verify-signatures")!;

const BADGE: Record<Integrity, { label: string; className: string }> = {
  valid: { label: "Unchanged since signing", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300" },
  invalid: { label: "Altered or invalid", className: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300" },
  unsupported: { label: "Can't check this format", className: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200" },
  error: { label: "Could not verify", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300" },
};

const fmt = (d: Date | null | undefined) => (d ? d.toLocaleString() : "—");

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="col-span-2 text-slate-900 dark:text-slate-100 break-words">{children}</dd>
    </div>
  );
}

export default function VerifyClient() {
  const [reports, setReports] = useState<SignatureReport[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onFiles = async (files: File[]) => {
    const f = files[0];
    setReports(null);
    setError("");
    if (!f) return;
    setBusy(true);
    try {
      setReports(await verifySignatures(f));
    } catch {
      setError("Could not read this PDF. It may be damaged — try Repair PDF (note that repairing removes signatures).");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolShell title={tool.name} description={tool.description}>
      <FileUploader onFilesSelected={onFiles} />
      {busy && <p className="text-sm text-slate-600 dark:text-slate-300">Checking signatures…</p>}
      {error && <p className={ui.error}>{error}</p>}

      {reports && reports.length === 0 && (
        <p className="rounded-xl bg-slate-50 dark:bg-slate-700/50 px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
          This PDF has no digital signatures. (A drawn or typed signature image — like the ones Sign PDF adds — is not a digital signature.)
        </p>
      )}

      {reports?.map((r) => (
        <article key={r.fieldName} className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900 dark:text-slate-100 break-words">{r.signerName}</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${BADGE[r.integrity].className}`}>
              {BADGE[r.integrity].label}
            </span>
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-300">{r.detail}</p>
          <dl className="space-y-1">
            <Row label="Signed">{fmt(r.signingTime)}</Row>
            {r.reason && <Row label="Reason">{r.reason}</Row>}
            {r.location && <Row label="Location">{r.location}</Row>}
            <Row label="Coverage">
              {r.coversWholeDocument
                ? "Covers the entire file."
                : "Content was added after this signature (e.g. a later signature or form fill). The part that was signed is what was checked."}
            </Row>
            {r.certificate && (
              <>
                <Row label="Issued by">
                  {r.certificate.selfSigned ? "Self-signed (the signer vouches for themselves)" : r.certificate.issuer}
                </Row>
                <Row label="Certificate valid">
                  {fmt(r.certificate.validFrom)} – {fmt(r.certificate.validTo)}
                  {r.signingTime && (r.signingTime < r.certificate.validFrom || r.signingTime > r.certificate.validTo) && (
                    <span className="block text-red-600 dark:text-red-400">The certificate was not valid when this was signed.</span>
                  )}
                </Row>
              </>
            )}
            <Row label="Field">{r.fieldName} · {r.subFilter}</Row>
          </dl>
        </article>
      ))}

      {reports && reports.length > 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          This check confirms whether the document changed after signing. It does not confirm the signer&apos;s identity against a
          trusted certificate authority or check revocation, because that requires contacting outside servers. Use Adobe Acrobat
          for full trust validation.
        </p>
      )}
    </ToolShell>
  );
}
