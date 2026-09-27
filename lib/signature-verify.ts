/**
 * Inspect and verify digital signatures in a PDF.
 *
 * For each signature field this checks, entirely in the browser:
 *  - integrity: the signed byte ranges hash to the value in the CMS
 *    signature, and the signature itself verifies against the signer's
 *    certificate (WebCrypto via pkijs);
 *  - coverage: whether the signature covers the whole file, or content was
 *    appended afterwards (normal for later signatures/form fills, but worth
 *    knowing);
 *  - the signer certificate's identity and validity period.
 *
 * It does NOT establish trust: there is no bundled list of trusted certificate
 * authorities and revocation (OCSP/CRL) is not checked, because that would
 * require contacting third-party servers. The UI says so explicitly.
 */
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFString } from "pdf-lib";

export type Integrity = "valid" | "invalid" | "unsupported" | "error";

export interface CertificateInfo {
  subject: string;
  issuer: string;
  validFrom: Date;
  validTo: Date;
  selfSigned: boolean;
}

export interface SignatureReport {
  fieldName: string;
  signerName: string;
  signingTime: Date | null;
  reason: string | null;
  location: string | null;
  subFilter: string;
  integrity: Integrity;
  detail: string;
  coversWholeDocument: boolean;
  certificate: CertificateInfo | null;
}

/** Parse a PDF date string, e.g. `D:20240131120000+05'30'`. */
export function parsePdfDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(?:D:)?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(Z|[+-]\d{2}'?\d{2}'?)?/.exec(value.trim());
  if (!m) return null;
  const [, y, mo = "01", d = "01", h = "00", mi = "00", s = "00", tz] = m;
  let iso = `${y}-${mo}-${d}T${h}:${mi}:${s}`;
  if (!tz || tz === "Z") iso += "Z";
  else iso += `${tz.slice(0, 3)}:${tz.replace(/'/g, "").slice(3, 5) || "00"}`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type ByteRangeCheck =
  | { ok: true; ranges: [number, number, number, number] }
  | { ok: false; reason: string };

/**
 * A usable /ByteRange is four non-negative integers `[0, a, b, c]` describing
 * two ranges that lie inside the file, with the (excluded) signature value in
 * the gap between them.
 */
export function checkByteRange(values: number[], fileLength: number): ByteRangeCheck {
  if (values.length !== 4 || !values.every((v) => Number.isInteger(v) && v >= 0)) {
    return { ok: false, reason: "malformed ByteRange" };
  }
  const [s1, l1, s2, l2] = values;
  if (s1 !== 0) return { ok: false, reason: "signed range does not start at the beginning of the file" };
  if (s2 < s1 + l1) return { ok: false, reason: "signed ranges overlap" };
  if (s2 + l2 > fileLength) return { ok: false, reason: "signed range extends past the end of the file" };
  return { ok: true, ranges: [s1, l1, s2, l2] };
}

export function signedBytes(file: Uint8Array, [s1, l1, s2, l2]: [number, number, number, number]): Uint8Array {
  const out = new Uint8Array(l1 + l2);
  out.set(file.subarray(s1, s1 + l1), 0);
  out.set(file.subarray(s2, s2 + l2), l1);
  return out;
}

function text(dict: PDFDict, key: string): string | null {
  const v = dict.lookup(PDFName.of(key));
  if (v instanceof PDFString || v instanceof PDFHexString) return v.decodeText();
  if (v instanceof PDFName) return v.decodeText();
  return null;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Collect signature dictionaries (the /V of every /FT /Sig field). */
function findSignatureDicts(doc: PDFDocument): { name: string; sig: PDFDict }[] {
  const out: { name: string; sig: PDFDict }[] = [];
  const acro = doc.catalog.lookupMaybe(PDFName.of("AcroForm"), PDFDict);
  const fields = acro?.lookupMaybe(PDFName.of("Fields"), PDFArray);
  if (!fields) return out;

  const walk = (arr: PDFArray, prefix: string) => {
    for (let i = 0; i < arr.size(); i++) {
      const field = arr.lookupMaybe(i, PDFDict);
      if (!field) continue;
      const partial = text(field, "T") ?? `Signature${out.length + 1}`;
      const name = prefix ? `${prefix}.${partial}` : partial;
      const kids = field.lookupMaybe(PDFName.of("Kids"), PDFArray);
      const ft = field.lookup(PDFName.of("FT"));
      const v = field.lookupMaybe(PDFName.of("V"), PDFDict);
      if (ft instanceof PDFName && ft.decodeText() === "Sig" && v) out.push({ name, sig: v });
      if (kids) walk(kids, name);
    }
  };
  walk(fields, "");
  return out;
}

async function describeCertificate(cert: import("pkijs").Certificate): Promise<CertificateInfo> {
  const name = (rdn: import("pkijs").RelativeDistinguishedNames) => {
    const get = (oid: string) =>
      rdn.typesAndValues.find((tv) => tv.type === oid)?.value.valueBlock.value as string | undefined;
    return get("2.5.4.3") ?? get("2.5.4.10") ?? rdn.typesAndValues.map((tv) => String(tv.value.valueBlock.value)).join(", ");
  };
  return {
    subject: name(cert.subject),
    issuer: name(cert.issuer),
    validFrom: cert.notBefore.value,
    validTo: cert.notAfter.value,
    selfSigned: cert.subject.isEqual(cert.issuer),
  };
}

async function verifyOne(fileBytes: Uint8Array, name: string, sig: PDFDict): Promise<SignatureReport> {
  const subFilter = (sig.lookup(PDFName.of("SubFilter")) as PDFName | undefined)?.decodeText() ?? "unknown";
  const report: SignatureReport = {
    fieldName: name,
    signerName: text(sig, "Name") ?? "Unknown signer",
    signingTime: parsePdfDate(text(sig, "M")),
    reason: text(sig, "Reason"),
    location: text(sig, "Location"),
    subFilter,
    integrity: "error",
    detail: "",
    coversWholeDocument: false,
    certificate: null,
  };

  const br = sig.lookupMaybe(PDFName.of("ByteRange"), PDFArray);
  const values = br ? br.asArray().map((v) => (v instanceof PDFNumber ? v.asNumber() : NaN)) : [];
  const range = checkByteRange(values, fileBytes.length);
  if (!range.ok) {
    report.detail = `Cannot verify: ${range.reason}.`;
    return report;
  }
  report.coversWholeDocument = range.ranges[2] + range.ranges[3] === fileBytes.length;

  const supported = ["adbe.pkcs7.detached", "ETSI.CAdES.detached", "adbe.pkcs7.sha1"];
  if (!supported.includes(subFilter)) {
    report.integrity = "unsupported";
    report.detail = `Signature format "${subFilter}" is not supported by this checker.`;
    return report;
  }

  const contents = sig.lookup(PDFName.of("Contents"));
  if (!(contents instanceof PDFHexString || contents instanceof PDFString)) {
    report.detail = "Signature value is missing.";
    return report;
  }

  try {
    const [asn1js, pkijs] = await Promise.all([import("asn1js"), import("pkijs")]);
    const der = contents.asBytes();
    const parsed = asn1js.fromBER(toArrayBuffer(der));
    if (parsed.offset === -1) throw new Error("Signature data is not valid DER/BER.");
    const info = new pkijs.ContentInfo({ schema: parsed.result });
    const signed = new pkijs.SignedData({ schema: info.content });
    const data = signedBytes(fileBytes, range.ranges);

    let verified = false;
    let signerCert: import("pkijs").Certificate | null = null;
    try {
      const result = await signed.verify({
        signer: 0,
        // adbe.pkcs7.sha1 embeds the digest as encapsulated content instead.
        data: subFilter === "adbe.pkcs7.sha1" ? undefined : toArrayBuffer(data),
        checkChain: false,
        extendedMode: true,
      });
      verified = Boolean(result.signatureVerified);
      signerCert = result.signerCertificate ?? null;
    } catch (err) {
      const e = err as { signatureVerified?: boolean | null; signerCertificate?: import("pkijs").Certificate; message?: string };
      signerCert = e.signerCertificate ?? null;
      if (e.signatureVerified === false || /digest/i.test(e.message ?? "")) verified = false;
      else throw err;
    }

    if (verified && subFilter === "adbe.pkcs7.sha1") {
      const content = signed.encapContentInfo.eContent?.valueBlock.valueHexView;
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", toArrayBuffer(data)));
      verified = !!content && content.length === digest.length && content.every((b, i) => b === digest[i]);
    }

    // Signing time from the signed attributes, when present, beats /M.
    const attrs = signed.signerInfos[0]?.signedAttrs?.attributes ?? [];
    const timeAttr = attrs.find((a) => a.type === "1.2.840.113549.1.9.5");
    const time = timeAttr?.values[0] as { toDate?: () => Date } | undefined;
    if (time?.toDate) report.signingTime = time.toDate();

    if (signerCert) {
      report.certificate = await describeCertificate(signerCert);
      report.signerName = report.certificate.subject || report.signerName;
    }
    report.integrity = verified ? "valid" : "invalid";
    report.detail = verified
      ? "The signed content has not been changed since it was signed."
      : "The signature does not match the document — it was altered after signing or the signature is corrupt.";
  } catch (err) {
    report.integrity = "error";
    report.detail = `Could not verify: ${err instanceof Error ? err.message : String(err)}`;
  }
  return report;
}

export async function verifySignatures(file: File): Promise<SignatureReport[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const sigs = findSignatureDicts(doc);
  const reports: SignatureReport[] = [];
  for (const { name, sig } of sigs) reports.push(await verifyOne(bytes, name, sig));
  return reports;
}
