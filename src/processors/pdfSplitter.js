import fs from "fs";
import os from "os";
import path from "path";
import { PDFDocument } from "pdf-lib";

/**
 * Tach PDF thanh mang cac trang, moi trang luu vao file tam.
 * @param {Buffer} pdfBuffer
 * @param {string} originalName — ten file goc de dat ten temp
 * @returns {Array<{path, page, name, total}>}
 */
export async function splitPdf(pdfBuffer, originalName = "page.pdf") {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pageCount = pdfDoc.getPageCount();
  const pages = [];

  for (let i = 0; i < pageCount; i++) {
    const newPdf = await PDFDocument.create();
    const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
    newPdf.addPage(copiedPage);
    const bytes = await newPdf.save();
    const tmpPath = path.join(
      os.tmpdir(),
      `vnt_p${i + 1}_${Date.now()}_${originalName}`
    );
    fs.writeFileSync(tmpPath, bytes);
    pages.push({
      path: tmpPath,
      page: i + 1,
      name: `${originalName}_trang${i + 1}.pdf`,
      total: pageCount,
    });
  }

  return pages;
}

/**
 * Tach PDF — chi tra ve Buffer, khong luu file.
 * Su dung cho server.js batch endpoint.
 * @param {Buffer} pdfBuffer
 * @returns {Promise<Array<{buffer, page, total}>>}
 */
export async function splitPdfBuffer(pdfBuffer) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const total = pdfDoc.getPageCount();
  const pages = [];

  for (let i = 0; i < total; i++) {
    const single = await PDFDocument.create();
    const [copiedPage] = await single.copyPages(pdfDoc, [i]);
    single.addPage(copiedPage);
    const bytes = await single.save();
    pages.push({ buffer: bytes, page: i + 1, total });
  }

  return pages;
}
