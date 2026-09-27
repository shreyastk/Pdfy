import { describe, it, expect } from "vitest";
import { PDFDocument, PDFName } from "pdf-lib";
import { readMetadata, splitKeywords, stripMetadata, writeMetadata } from "./metadata";

async function sample(): Promise<File> {
  const doc = await PDFDocument.create();
  doc.addPage();
  doc.setTitle("Secret plan");
  doc.setAuthor("jdoe");
  doc.setProducer("SuperWriter 3000");
  const xmp = doc.context.stream("<x:xmpmeta>jdoe C:/Users/jdoe</x:xmpmeta>", {
    Type: "Metadata",
    Subtype: "XML",
  });
  doc.catalog.set(PDFName.of("Metadata"), doc.context.register(xmp));
  return new File([(await doc.save({ useObjectStreams: false })) as BlobPart], "in.pdf");
}

describe("metadata", () => {
  it("reads Info fields and detects XMP", async () => {
    const report = await readMetadata(await sample());
    expect(report.fields.title).toBe("Secret plan");
    expect(report.fields.author).toBe("jdoe");
    expect(report.hasXmp).toBe(true);
  });

  it("writes edited fields and drops the now-stale XMP", async () => {
    const file = await sample();
    const fields = (await readMetadata(file)).fields;
    const bytes = await writeMetadata(file, { ...fields, author: "Someone else", keywords: "a; b, c" });
    const out = await readMetadata(new File([bytes as BlobPart], "out.pdf"));
    expect(out.fields.author).toBe("Someone else");
    expect(out.hasXmp).toBe(false);
  });

  it("strip removes identifying data from the file bytes entirely", async () => {
    const bytes = await stripMetadata(await sample());
    const raw = new TextDecoder("latin1").decode(bytes);
    expect(raw).not.toContain("jdoe");
    expect(raw).not.toContain("Secret plan");
    expect(raw).not.toContain("SuperWriter");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("splits keywords on commas and semicolons", () => {
    expect(splitKeywords(" a; b ,c,, ")).toEqual(["a", "b", "c"]);
  });
});
