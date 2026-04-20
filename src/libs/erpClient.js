import fetch from "node-fetch";
import { erpCfg } from "./config.js";

/**
 * HTTP headers cho ERP API.
 */
function erpHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${erpCfg.bearerToken}`,
  };
}

/**
 * Tao phieu bao gia (header) tren ERP.
 * @param {object} emailData — thong tin tu email
 * @param {object} classify — ket qua classify
 * @returns {object} { quota_code, id }
 */
export async function createQuoteHeader(emailData, classify) {
  const langMap = { vi: "Tiếng Việt", en: "Tiếng Anh", ja: "Tiếng Nhật" };
  const transportId = classify.hinh_thuc_giao ? 309 : null;

  const payload = {
    id: null,
    index: null,
    quota_code: null,
    is_active: true,
    sign_status: "0",
    status: "0",
    vat: null,
    type: "Gia công",
    quoting_status: "Mới tạo",
    format: "Kinh tế",
    language: langMap[classify.ngon_ngu] || "Tiếng Nhật",
    lot_number: 1,
    quantity_for_min_price: 10,
    creator: erpCfg.username || "sale_ai@vnt.vn",
    created_date: new Date().toISOString(),
    request_time: emailData.date
      ? new Date(emailData.date).toISOString()
      : new Date().toISOString(),
    vat_value: 8,
    has_transport: !!classify.hinh_thuc_giao,
    surface_treatment: classify.xu_ly_be_mat === true,
    exchange_rate: 161.77, // TODO: lay tu ERP thuc te
    quotation_currency:
      classify.ngon_ngu === "ja"
        ? "JPY"
        : classify.ngon_ngu === "en"
        ? "USD"
        : "VND",
    transport_method: transportId,
    company_code: 1,
    customer_code: null, // ERP can lookup theo email sender
    unit: "PCS",
    term: JSON.stringify([
      {
        languageId: "vi",
        terms: [
          {
            termName: "1",
            termContent: classify.han_giao_hang
              ? `Hạn giao: ${classify.han_giao_hang}`
              : "",
          },
          { termName: "2", termContent: classify.hinh_thuc_giao || "" },
        ],
      },
      { languageId: "en", terms: [] },
      {
        languageId: "jp",
        terms: [
          {
            termName: "1",
            termContent: classify.han_giao_hang
              ? `納期：${classify.han_giao_hang}`
              : "",
          },
          { termName: "2", termContent: classify.hinh_thuc_giao || "" },
        ],
      },
    ]),
    assignment: null,
    _agent_note: `Mekong AI — ${emailData.senderEmail} — ${emailData.subject}`,
  };

  if (erpCfg.isMock) {
    const mockCode = "VNTAGENT" + Date.now().toString().slice(-6);

    return { quota_code: mockCode, id: mockCode, mock: true };
  }

  const res = await fetch(`${erpCfg.baseUrl}/quotation-sheets/create`, {
    method: "POST",
    headers: erpHeaders(),
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok)
    throw new Error("ERP tao phieu that bai: " + JSON.stringify(data));

  return data;
}

/**
 * Day tat ca dong hang vao phieu bao gia.
 * @param {string} quoteCode
 * @param {Array} drawingResults — mang ket qua tu AI
 * @returns {object}
 */
export async function pushAllLinesToERP(quoteCode, drawingResults) {
  const items = drawingResults.map((r, i) => {
    const d = r.data;
    return {
      id: i,
      fileNameOld:
        d?.ban_ve?.ma_ban_ve || r.filename?.replace(".pdf", "") || `BV_${i}`,
      fileNameNew: d?.ban_ve?.ten_chi_tiet || null,
      filePath: null,
      totalFiles: drawingResults.length,
      ma_nvl: d?.vat_lieu?.ma || null,
      so_luong: d?.san_xuat?.so_luong || 1,
      kl_phoi_kg: d?.khoi_luong?.klPhoiKg || 0,
      ma_quy_trinh: d?.ma_quy_trinh || null,
      hinh_dang: d?.hinh_dang?.loai || null,
      xu_ly_nhiet: d?.vat_lieu?.nhiet_luyen || null,
      xu_ly_be_mat:
        (d?.xu_ly?.be_mat || []).map((x) => x.ten || x).join(", ") || null,
      he_so_phuc_tap: d?.phan_tich_do_phuc_tap?.he_so_phuc_tap || null,
      drawing_db_id: r.id,
    };
  });

  if (erpCfg.isMock) {
    items.forEach((it, i) =>
      console.log(
        `  [${i + 1}] ${it.fileNameOld} — ${it.ma_nvl || "?"} — ${
          it.kl_phoi_kg
        }kg`
      )
    );
    return { ok: true, mock: true };
  }

  const url = `${
    erpCfg.baseUrl
  }/quotation-items/insert-pdf/cache?quotaCode=${encodeURIComponent(
    quoteCode
  )}`;
  const res = await fetch(url, {
    method: "POST",
    headers: erpHeaders(),
    body: JSON.stringify(items),
  });

  const data = await res.json();
  if (!res.ok)
    throw new Error("ERP push items that bai: " + JSON.stringify(data));

  return data;
}

/**
 * Queue 1 dong (giu lai cho tuong thich).
 */
export async function addQuoteLine(quoteId, stt, drawingResult) {
  const d = drawingResult.data;
  console.log(
    `[ERP] Queue dong ${stt}: ${d?.ban_ve?.ma_ban_ve} — ${d?.vat_lieu?.ma} — ${d?.khoi_luong?.klPhoiKg}kg`
  );
  return { queued: true };
}
