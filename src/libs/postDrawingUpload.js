import fs from "fs";
import path from "path";

/**
 * POST PDF tới /drawings. Dùng FormData + Blob built-in của Node để fetch (undici)
 * gửi multipart đầy đủ. Package `form-data` + fetch hay khiến multer báo "Unexpected end of form".
 *
 * @param {object} opts
 * @param {string} opts.pdfPath — đường dẫn file trên disk
 * @param {string} opts.filename — tên hiển thị trong multipart
 * @param {string} opts.baseUrl — ví dụ http://localhost:3000
 * @param {string} [opts.provider=gemini]
 */
export async function postPdfToDrawingsApi({
  pdfPath,
  filename,
  baseUrl,
  provider = "gemini",
}) {
  const buf = fs.readFileSync(pdfPath);
  const blob = new Blob([buf], { type: "application/pdf" });
  const form = new FormData();
  const name =
    typeof filename === "string" && filename.trim()
      ? path.basename(filename.trim())
      : "drawing.pdf";
  form.append("file", blob, name);

  const url = `${String(baseUrl).replace(
    /\/$/,
    ""
  )}/drawings?provider=${encodeURIComponent(provider)}`;
  const res = await fetch(url, { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Lỗi đọc bản vẽ");
  return data;
}
