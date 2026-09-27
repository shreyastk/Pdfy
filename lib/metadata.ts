/**
 * View, edit and strip PDF metadata.
 *
 * Besides the visible Info dictionary (title, author…), PDFs often carry an
 * XMP metadata packet and application "PieceInfo" data that can reveal
 * usernames, software, file paths and edit history. Stripping removes all of
 * it without touching page content.
 */
import { PDFDict, PDFDocument, PDFName, PDFRef, PDFStream } from "pdf-lib";

export interface MetadataFields {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
}

export interface MetadataReport {
  fields: MetadataFields;
  creationDate: Date | null;
  modificationDate: Date | null;
  pageCount: number;
  hasXmp: boolean;
  hasPieceInfo: boolean;
}

export const EMPTY_FIELDS: MetadataFields = {
  title: "",
  author: "",
  subject: "",
  keywords: "",
  creator: "",
  producer: "",
};

async function load(file: File): Promise<PDFDocument> {
  // updateMetadata:false stops pdf-lib stamping its own Producer/ModDate.
  return PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
}

export async function readMetadata(file: File): Promise<MetadataReport> {
  const doc = await load(file);
  const catalog = doc.catalog;
  return {
    fields: {
      title: doc.getTitle() ?? "",
      author: doc.getAuthor() ?? "",
      subject: doc.getSubject() ?? "",
      keywords: doc.getKeywords() ?? "",
      creator: doc.getCreator() ?? "",
      producer: doc.getProducer() ?? "",
    },
    creationDate: doc.getCreationDate() ?? null,
    modificationDate: doc.getModificationDate() ?? null,
    pageCount: doc.getPageCount(),
    hasXmp: catalog.has(PDFName.of("Metadata")),
    hasPieceInfo:
      catalog.has(PDFName.of("PieceInfo")) ||
      doc.getPages().some((p) => p.node.has(PDFName.of("PieceInfo"))),
  };
}

/** Split a keywords string on commas/semicolons into trimmed, non-empty terms. */
export function splitKeywords(keywords: string): string[] {
  return keywords
    .split(/[;,]/)
    .map((k) => k.trim())
    .filter(Boolean);
}

export async function writeMetadata(file: File, fields: MetadataFields): Promise<Uint8Array> {
  const doc = await load(file);
  doc.setTitle(fields.title);
  doc.setAuthor(fields.author);
  doc.setSubject(fields.subject);
  doc.setKeywords(splitKeywords(fields.keywords));
  doc.setCreator(fields.creator);
  doc.setProducer(fields.producer);
  doc.setModificationDate(new Date());
  // The XMP packet would otherwise contradict the edited Info values.
  const xmp = doc.catalog.get(PDFName.of("Metadata"));
  if (xmp instanceof PDFRef) doc.context.delete(xmp);
  doc.catalog.delete(PDFName.of("Metadata"));
  return doc.save();
}

/** Remove every metadata source: Info dictionary, XMP packets and PieceInfo. */
export async function stripMetadata(file: File): Promise<Uint8Array> {
  const doc = await load(file);
  const ctx = doc.context;
  const METADATA = PDFName.of("Metadata");
  const PIECE_INFO = PDFName.of("PieceInfo");

  // pdf-lib writes every object in its context, even unreferenced ones, so
  // the old Info dictionary and XMP streams must be deleted, not just unlinked.
  const oldInfo = ctx.trailerInfo.Info;
  if (oldInfo instanceof PDFRef) ctx.delete(oldInfo);
  ctx.trailerInfo.Info = ctx.register(ctx.obj({}));

  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    const dict = obj instanceof PDFDict ? obj : obj instanceof PDFStream ? obj.dict : null;
    if (!dict) continue;
    if (dict.get(PDFName.of("Type")) === METADATA) {
      ctx.delete(ref);
      continue;
    }
    // XMP and PieceInfo can hang off the catalog, pages, images, fonts…
    dict.delete(METADATA);
    dict.delete(PIECE_INFO);
  }
  return doc.save();
}
