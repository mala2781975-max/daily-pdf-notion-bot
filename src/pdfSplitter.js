import { PDFDocument } from 'pdf-lib';

export async function getPageCount(buf) {
  const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
  return doc.getPageCount();
}

/** Yields mini-PDFs of `size` pages each, with 1-based page ranges. */
export async function* splitIntoBatches(buf, size) {
  const src = await PDFDocument.load(buf, { ignoreEncryption: true });
  const total = src.getPageCount();
  for (let start = 0; start < total; start += size) {
    const end = Math.min(start + size, total);
    const out = await PDFDocument.create();
    const idx = Array.from({ length: end - start }, (_, i) => start + i);
    const pages = await out.copyPages(src, idx);
    pages.forEach((p) => out.addPage(p));
    const bytes = await out.save();
    yield { from: start + 1, to: end, total, data: Buffer.from(bytes) };
  }
}
