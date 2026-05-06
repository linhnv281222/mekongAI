/**
 * Chuẩn hóa kết quả phân tích bản vẽ: schema phẳng (mới) hoặc nested (cũ + enrich).
 * Tránh undefined / [object Object] ở agent log và UI.
 */

function toStr(v) {
  if (v == null || v === "") return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return "";
    }
  }
  return String(v);
}

/** Vật liệu / hình dạng có thể là object { ma, loai } */
function materialToStr(vl) {
  if (vl == null) return "";
  if (typeof vl === "string") return vl;
  if (typeof vl === "object") {
    const ma = vl.ma != null ? String(vl.ma).trim() : "";
    const loai = vl.loai != null ? String(vl.loai).trim() : "";
    if (ma && loai) return `${ma} (${loai})`;
    return ma || loai || "";
  }
  return toStr(vl);
}

/** Fallback: trích xuất vat_lieu từ ly_giai_qt khi AI khong fill vat_lieu */
function extractVatLieuFromLyGiai(lyGiai, currentVl) {
  if (currentVl && currentVl.trim()) return currentVl;
  if (!lyGiai) return "";

  const matMap = {
    "SS400": "SS400", "SS41": "SS41", "S45C": "S45C", "S50C": "S50C",
    "SKD11": "SKD11", "SKD61": "SKD61", "SCM415": "SCM415", "SCM420": "SCM420",
    "A5052": "A5052", "A6061": "A6061", "A2017": "A2017", "AL6061": "AL6061",
    "AL5052": "AL5052", "AL": "Nhôm", "A-": "Nhôm",
    "SUS304": "SUS304", "SUS316": "SUS316", "SUS": "Inox",
    "C3604": "C3604", "C3771": "C3771", "C2801": "C2801",
    "POM": "POM", "PA6": "PA6", "PA66": "PA66", "PEEK": "PEEK", "MC尼龙": "MC Nylon",
    "IC-36": "IC-36", "QT400": "QT400", "QT500": "QT500",
    "FC-": "FC", "FCD": "FCD",
    "TB-": "Thép", "SCM-": "Thép",
    "タフトライド": "TUFTRIDING",
  };

  const upper = lyGiai.toUpperCase();
  for (const [key, val] of Object.entries(matMap)) {
    if (upper.includes(key.toUpperCase())) return val;
  }

  // Nhom/Japanese aluminum patterns
  if (/\bA\s*\d{4}\b/.test(lyGiai)) {
    const m = lyGiai.match(/\bA\s*(\d{4})\b/);
    return "A" + m[1];
  }
  // Steel patterns
  if (/\bS(S|45C|50C|KD|CM)\b/i.test(lyGiai)) {
    const m = lyGiai.match(/\b(S[SKMC]\d+)\b/i);
    return m ? m[1] : "";
  }

  return "";
}

function shapeToStr(hd) {
  if (hd == null) return "";
  if (typeof hd === "string") return hd;
  if (typeof hd === "object") {
    const loai = hd.loai != null ? String(hd.loai).trim() : "";
    const kieu = hd.kieu_phoi != null ? String(hd.kieu_phoi).trim() : "";
    if (loai && kieu) return `${loai} · ${kieu}`;
    return loai || kieu || "";
  }
  return toStr(hd);
}

function kichThuocFromBao(kt) {
  if (!kt || typeof kt !== "object") return "";
  if (kt.phi_lon != null && kt.phi_lon !== "")
    return `Ø${kt.phi_lon} × ${kt.cao_hoac_duong_kinh ?? ""}`.trim();
  if (kt.dai != null && kt.rong != null)
    return `${kt.dai}×${kt.rong}×${kt.cao_hoac_duong_kinh ?? ""}`;
  return "";
}

function maQtFromLegacy(d) {
  if (d.ma_quy_trinh != null && String(d.ma_quy_trinh).trim())
    return String(d.ma_quy_trinh).trim();
  const qt = d.quy_trinh_tong_the;
  if (!Array.isArray(qt) || qt.length === 0) return "";
  const last = qt[qt.length - 1];
  if (typeof last === "string") return last;
  if (last && typeof last === "object")
    return String(last.ma || last.ma_quy_trinh || "").trim();
  return "";
}

function lyGiaiFromLegacy(d) {
  if (d.ly_giai_qt != null && String(d.ly_giai_qt).trim())
    return String(d.ly_giai_qt).trim();
  const qt = d.quy_trinh_tong_the;
  if (!Array.isArray(qt) || qt.length < 2) return "";
  const prev = qt[qt.length - 2];
  return typeof prev === "string" ? prev : toStr(prev);
}

function xuLyBeMatFromLegacy(d) {
  const xuLy = d.xu_ly;
  if (xuLy && Array.isArray(xuLy.be_mat) && xuLy.be_mat.length) {
    return xuLy.be_mat
      .map((b) => (b && typeof b === "object" ? b.ten || b.tieu_chuan : b))
      .filter(Boolean)
      .join("; ");
  }
  return toStr(d.xu_ly_be_mat);
}

/**
 * @param {object} raw — parsed JSON từ AI (flat hoặc legacy nested)
 * @returns {object} bản phẳng cho UI / job
 */
export function normalizeDrawingToFlat(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      ma_ban_ve: "",
      vat_lieu: "",
      so_luong: 1,
      xu_ly_be_mat: "",
      xu_ly_nhiet: "",
      dung_sai_chung: "",
      hinh_dang: "",
      kich_thuoc: "",
      so_be_mat_cnc: null,
      dung_sai_chat_nhat: "",
      co_gdt: false,
      ma_quy_trinh: "",
      ly_giai_qt: "",
    };
  }

  // Aliases: AI có thể trả tên field khác tùy prompt version
  const maBv = raw.ma_ban_ve ?? raw.ma_so_ban_ve ?? "";
  const vlRaw = raw.vat_lieu ?? raw.ma_nguyen_vat_lieu ?? "";

  const lyGiai = raw.ly_giai_qt || raw.ly_giai || "";
  const vlNormalized = extractVatLieuFromLyGiai(lyGiai, vlRaw);

  const legacy =
    raw.ban_ve != null ||
    (typeof vlRaw === "object" && vlRaw !== null) ||
    raw.kich_thuoc_bao != null;

  if (!legacy) {
    const sl = Number(raw.so_luong);
    return {
      ma_ban_ve: toStr(maBv),
      vat_lieu: vlNormalized,
      so_luong: Number.isFinite(sl) && sl > 0 ? sl : 1,
      xu_ly_be_mat: toStr(raw.xu_ly_be_mat),
      xu_ly_nhiet: toStr(raw.xu_ly_nhiet),
      dung_sai_chung: toStr(raw.dung_sai_chung),
      hinh_dang: shapeToStr(raw.hinh_dang),
      kich_thuoc: toStr(raw.kich_thuoc),
      so_be_mat_cnc:
        raw.so_be_mat_cnc != null && raw.so_be_mat_cnc !== ""
          ? Number(raw.so_be_mat_cnc)
          : null,
      dung_sai_chat_nhat: toStr(raw.dung_sai_chat_nhat),
      co_gdt: Boolean(raw.co_gdt),
      ma_quy_trinh: toStr(raw.ma_quy_trinh),
      ly_giai_qt: toStr(raw.ly_giai_qt),
    };
  }

  const bv = raw.ban_ve || {};
  const sx = raw.san_xuat || {};
  const kt = raw.kich_thuoc_bao || {};
  const xu = raw.xu_ly || {};
  const sl = Number(sx.so_luong);

  return {
    ma_ban_ve: toStr(bv.ma_ban_ve),
    vat_lieu: extractVatLieuFromLyGiai(lyGiai, materialToStr(raw.vat_lieu)),
    so_luong: Number.isFinite(sl) && sl > 0 ? sl : 1,
    xu_ly_be_mat: xuLyBeMatFromLegacy(raw),
    xu_ly_nhiet: toStr(xu.nhiet ?? raw.xu_ly_nhiet),
    dung_sai_chung: toStr(sx.tieu_chuan ?? raw.dung_sai_chung),
    hinh_dang: shapeToStr(raw.hinh_dang),
    kich_thuoc: toStr(raw.kich_thuoc) || kichThuocFromBao(kt),
    so_be_mat_cnc:
      raw.so_be_mat_cnc != null && raw.so_be_mat_cnc !== ""
        ? Number(raw.so_be_mat_cnc)
        : Array.isArray(raw.nguyen_cong_cnc)
        ? raw.nguyen_cong_cnc.length
        : null,
    dung_sai_chat_nhat: toStr(raw.dung_sai_chat_nhat),
    co_gdt: Boolean(raw.co_gdt),
    ma_quy_trinh: maQtFromLegacy(raw),
    ly_giai_qt: lyGiaiFromLegacy(raw) || toStr(raw.ly_giai_qt),
  };
}

/** Có đủ tín hiệu để coi là 1 bản vẽ đã đọc (không bỏ qua) */
export function drawingHasMinimalData(flat) {
  if (!flat || typeof flat !== "object") return false;
  return !!(
    String(flat.ma_ban_ve || "").trim() ||
    String(flat.vat_lieu || "").trim() ||
    String(flat.kich_thuoc || "").trim()
  );
}
