// ─── TRONG LUONG RIENG (g/cm3) theo vat lieu VNT ──────────────────────────
const KL_RIENG = {
  // Nhom
  A2017: 2.8,
  A2024: 2.78,
  A5052: 2.68,
  A5056: 2.64,
  A5083: 2.66,
  A6060: 2.7,
  A6061: 2.7,
  A6063: 2.7,
  A6082: 2.71,
  A7075: 2.81,
  // Thep
  SS400: 7.85,
  S45C: 7.85,
  S50C: 7.85,
  S55C: 7.85,
  SCM415: 7.85,
  SCM435: 7.85,
  SCM440: 7.85,
  SKD11: 7.7,
  SKD61: 7.8,
  SKS3: 7.9,
  NAK55: 7.8,
  SPHC: 7.85,
  SPCC: 7.85,
  // Inox
  SUS303: 8.0,
  SUS304: 7.93,
  SUS316: 8.0,
  SUS316L: 8.0,
  SUS420J1: 7.73,
  SUS420J2: 7.73,
  SUS440C: 7.7,
  // Dong
  C1100: 8.9,
  C3604: 8.5,
  // Nhua
  POM: 1.41,
  MICA: 1.18,
  TEFLON: 2.2,
};

// ─── BANG QUY TRINH VNT ───────────────────────────────────────────────────
const QUY_TRINH = {
  // TRON XOAY — LC (Tien CNC)
  QT111: ["MAL", "LC11", "LC12", "XLN", "QC", "ĐGTP", "NK"],
  QT112: ["MAL", "LC11", "LC12", "MC11", "MC12", "XLN", "QC", "ĐGTP", "NK"],
  QT113: [
    "MAL",
    "LC11",
    "LC12",
    "MC11",
    "MC12",
    "MC13",
    "XLN",
    "QC",
    "ĐGTP",
    "NK",
  ],
  QT114: [
    "MAL",
    "LC11",
    "LC12",
    "MC11",
    "MC12",
    "MC13",
    "MC14",
    "XLN",
    "QC",
    "ĐGTP",
    "NK",
  ],
  QT115: [
    "MAL",
    "LC11",
    "LC12",
    "MC11",
    "MC12",
    "MC13",
    "MC14",
    "MC15",
    "XLN",
    "QC",
    "ĐGTP",
    "NK",
  ],
  QT116: [
    "MAL",
    "LC11",
    "LC12",
    "MC11",
    "MC12",
    "MC13",
    "MC14",
    "MC15",
    "MC16",
    "XLN",
    "QC",
    "ĐGTP",
    "NK",
  ],
  // PHAY CNC TRUNG BINH (50-200mm)
  QT211: ["MAL", "MC21", "XLN", "QC", "ĐGTP", "NK"],
  QT212: ["MAL", "MC21", "MC22", "XLN", "QC", "ĐGTP", "NK"],
  QT213: ["MAL", "MC21", "MC22", "MC23", "XLN", "QC", "ĐGTP", "NK"],
  QT214: ["MAL", "MC21", "MC22", "MC23", "MC24", "XLN", "QC", "ĐGTP", "NK"],
  QT215: [
    "MAL",
    "MC21",
    "MC22",
    "MC23",
    "MC24",
    "MC25",
    "XLN",
    "QC",
    "ĐGTP",
    "NK",
  ],
  QT216: [
    "MAL",
    "MC21",
    "MC22",
    "MC23",
    "MC24",
    "MC25",
    "MC26",
    "XLN",
    "QC",
    "ĐGTP",
    "NK",
  ],
  // PHAY CNC LON (>200mm) — co MI4
  QT411: ["MAL", "MI4", "MC11", "XLN", "QC", "ĐGTP", "NK"],
  QT412: ["MAL", "MI4", "MC11", "MC12", "XLN", "QC", "ĐGTP", "NK"],
  QT413: ["MAL", "MI4", "MC11", "MC12", "MC13", "XLN", "QC", "ĐGTP", "NK"],
  QT414: [
    "MAL",
    "MI4",
    "MC11",
    "MC12",
    "MC13",
    "MC14",
    "XLN",
    "QC",
    "ĐGTP",
    "NK",
  ],
  QT415: [
    "MAL",
    "MI4",
    "MC11",
    "MC12",
    "MC13",
    "MC14",
    "MC15",
    "XLN",
    "QC",
    "ĐGTP",
    "NK",
  ],
  QT416: [
    "MAL",
    "MI4",
    "MC11",
    "MC12",
    "MC13",
    "MC14",
    "MC15",
    "MC16",
    "XLN",
    "QC",
    "ĐGTP",
    "NK",
  ],
  // PHAY CNC TRUNG BINH voi MI6
  QT611: ["MAL", "MI6", "MC11", "XLN", "QC", "ĐGTP", "NK"],
  QT612: ["MAL", "MI6", "MC11", "MC12", "XLN", "QC", "ĐGTP", "NK"],
  QT613: ["MAL", "MI6", "MC11", "MC12", "MC13", "XLN", "QC", "ĐGTP", "NK"],
  QT614: [
    "MAL",
    "MI6",
    "MC11",
    "MC12",
    "MC13",
    "MC14",
    "XLN",
    "QC",
    "ĐGTP",
    "NK",
  ],
  QT615: [
    "MAL",
    "MI6",
    "MC11",
    "MC12",
    "MC13",
    "MC14",
    "MC15",
    "XLN",
    "QC",
    "ĐGTP",
    "NK",
  ],
  QT616: [
    "MAL",
    "MI6",
    "MC11",
    "MC12",
    "MC13",
    "MC14",
    "MC15",
    "MC16",
    "XLN",
    "QC",
    "ĐGTP",
    "NK",
  ],
};

// ─── TINH KHOI LUONG ──────────────────────────────────────────────────────

/**
 * Tinh khoi luong chi tiet theo hinh dang va kich thuoc.
 * @param {string} kieuPhoi — loai phoi
 * @param {object} kt — kich thuoc { dai, rong, cao, phi_lon, phi_nho } (mm)
 * @param {string} maVl — ma vat lieu
 * @returns {object} { klSpKg, klPhoiKg, donVi, ghiChu }
 */
export function tinhKhoiLuong(kieuPhoi, kt, maVl) {
  const rho = KL_RIENG[maVl] ?? 7.85;
  const PI = Math.PI;
  const r = (n) => Math.round(n * 1000) / 1000;

  let theTichSp = 0;
  let theTichPhoi = 0;
  const LUU_DU = 5; // mm luu du moi phia

  const loai = (kieuPhoi || "").toLowerCase();

  if (
    loai.includes("tron") ||
    loai.includes("tròn") ||
    loai.includes("ong") ||
    loai.includes("ống") ||
    loai.includes("luc") ||
    loai.includes("lục")
  ) {
    const D = kt.phi_lon || kt.cao_hoac_duong_kinh || 0;
    const d = kt.phi_nho || 0;
    const L = kt.dai || 0;

    if (D > 0 && L > 0) {
      if (d > 0 && loai.includes("ong")) {
        theTichSp = (PI * ((D / 2) ** 2 - (d / 2) ** 2) * L) / 1000;
      } else {
        theTichSp = (PI * (D / 2) ** 2 * L) / 1000;
      }

      const D_phoi = D + LUU_DU * 2;
      const L_phoi = L + LUU_DU * 2;
      theTichPhoi = (PI * (D_phoi / 2) ** 2 * L_phoi) / 1000;
    }
  } else if (
    loai.includes("tam") ||
    loai.includes("tấm") ||
    loai.includes("vuong") ||
    loai.includes("vuông")
  ) {
    const L = kt.dai || 0;
    const W = kt.rong || 0;
    const H = kt.cao_hoac_duong_kinh || 0;

    if (L > 0 && W > 0 && H > 0) {
      theTichSp = (L * W * H) / 1000;
      theTichPhoi =
        ((L + LUU_DU * 2) * (W + LUU_DU * 2) * (H + LUU_DU * 2)) / 1000;
    }
  }

  if (theTichSp === 0) {
    return { klSpKg: null, klPhoiKg: null, ghiChu: "Thieu kich thuoc de tinh" };
  }

  const klSp = r((theTichSp * rho) / 1000);
  const klPhoi = r((theTichPhoi * rho) / 1000);

  return {
    klSpKg: klSp,
    klPhoiKg: klPhoi,
    trongLuongRieng: rho,
    donVi: "kg",
    ghiChu: `ρ=${rho} g/cm³ | SP: ${r(theTichSp)} cm³ | Phoi: ${r(
      theTichPhoi
    )} cm³`,
  };
}

// ─── CHON MA QUY TRINH F8 ─────────────────────────────────────────────────

/**
 * Chon ma quy trinh theo logic VNT.
 * @param {string} kieuPhoi
 * @param {string} loaiVl — Nhom | Thep | Inox | Dong | Nhua
 * @param {number} kichThuocMax — kich thuoc lon nhat (mm)
 * @param {number} soMatGiaCong — so mat can gia cong
 * @param {number} soLoRen — tong so lo ren
 * @returns {object} { maQt, tenQt, danhSachNguyenCong, moTa }
 */
export function chonQuyTrinh(
  kieuPhoi,
  loaiVl,
  kichThuocMax,
  soMatGiaCong = 1,
  soLoRen = 0
) {
  const loai = (kieuPhoi || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");

  const soMat = Math.max(1, Math.min(6, soMatGiaCong || 1));
  let nhom = "";
  let moTa = "";

  if (
    loai.includes("tron") ||
    loai.includes("ong") ||
    loai.includes("luc giac")
  ) {
    nhom = "1";
    moTa = "Tien CNC (tron xoay/ong/luc giac)";
  } else if (kichThuocMax < 50) {
    nhom = "2";
    moTa = `Phay CNC nho (<50mm), ${loaiVl}`;
  } else if (kichThuocMax > 200) {
    nhom = "4";
    moTa = "Phay CNC lon (>200mm), co mai phang MI4";
  } else {
    nhom = "6";
    moTa = "Phay CNC trung binh (50-200mm), co mai phang MI6";
  }

  const maQt = `QT${nhom}1${soMat}`;
  const nguyenCong = QUY_TRINH[maQt] || QUY_TRINH[`QT${nhom}11`] || [];

  return {
    maQt,
    tenQt: moTa,
    danhSachNguyenCong: nguyenCong,
    soMatGiaCong: soMat,
    nhomQt: nhom,
    ghiChu: `${nguyenCong.length} nguyen cong | ${
      soLoRen > 0 ? `${soLoRen} lo ren` : "khong co ren"
    }`,
  };
}

// ─── HAM TONG HOP: BO SUNG F7 + F8 + F9 ───────────────────────────────────

/**
 * Bo sung khoi luong (F7), ma quy trinh (F8), do phuc tap (F9) vao JSON tu AI.
 * @param {object} aiData — ket qua tu analyzDrawing()
 * @returns {object} aiData da bo sung
 */
export function enrichWithF7F8(aiData) {
  if (!aiData) return aiData;

  const dims = aiData.kich_thuoc_bao || {};
  const material = aiData.vat_lieu || {};
  const shape = aiData.hinh_dang || {};

  // ── F7: Khoi luong ──
  const khoiLuong = tinhKhoiLuong(
    shape.kieu_phoi || shape.loai,
    {
      dai: dims.dai,
      rong: dims.rong,
      cao_hoac_duong_kinh: dims.cao_hoac_duong_kinh,
      phi_lon: dims.phi_lon,
      phi_nho: dims.phi_nho,
    },
    material.ma
  );
  aiData.khoi_luong = khoiLuong;

  // ── F8: Ma quy trinh ──
  const kichThuocMax = (() => {
    const inchFactor = dims.don_vi === "inch" ? 25.4 : 1;
    const vals = [dims.dai, dims.rong, dims.cao_hoac_duong_kinh, dims.phi_lon]
      .filter(Boolean)
      .map((v) => v * inchFactor);
    return vals.length ? Math.max(...vals) : 0;
  })();

  const soMat =
    (aiData.nguyen_cong_cnc || []).filter((nguyenCong) => {
      const ten = (nguyenCong.ten || "").toLowerCase();
      return (
        ten.includes("phay") || ten.includes("tiện") || ten.includes("mặt")
      );
    }).length ||
    Math.ceil((aiData.nguyen_cong_cnc || []).length / 2) ||
    1;

  const soLoRen = (aiData.be_mat_gia_cong || []).filter((beMat) => {
    const loaiLower = (beMat.loai || "").toLowerCase();
    return loaiLower.includes("ren") || loaiLower.includes("taro");
  }).length;

  const quyTrinh = chonQuyTrinh(
    shape.kieu_phoi || shape.loai,
    material.loai,
    kichThuocMax,
    soMat,
    soLoRen
  );
  aiData.ma_quy_trinh = quyTrinh.maQt;
  aiData.quy_trinh_chi_tiet = quyTrinh;

  // ── F9: Do phuc tap ──
  aiData.phan_tich_do_phuc_tap = phanTichDoPhucTap(aiData);

  return aiData;
}

// ─── OPERATION INFO (don gia / thoi gian) ─────────────────────────────────

export const OPERATION_INFO = {
  MAL: { ten: "Nguyen lieu", dvt: "PCS", donGia: 0, tg: 6 },
  LC11: { ten: "Tien CNC lan 1", dvt: "Phut", donGia: 4500, tg: 15 },
  LC12: { ten: "Tien CNC lan 2", dvt: "Phut", donGia: 4500, tg: 15 },
  MC11: { ten: "Phay CNC1 mat 1", dvt: "Phut", donGia: 3700, tg: 15 },
  MC12: { ten: "Phay CNC1 mat 2", dvt: "Phut", donGia: 3700, tg: 15 },
  MC13: { ten: "Phay CNC1 mat 3", dvt: "Phut", donGia: 3700, tg: 15 },
  MC14: { ten: "Phay CNC1 mat 4", dvt: "Phut", donGia: 3700, tg: 15 },
  MC15: { ten: "Phay CNC1 mat 5", dvt: "Phut", donGia: 3700, tg: 15 },
  MC16: { ten: "Phay CNC1 mat 6", dvt: "Phut", donGia: 3700, tg: 15 },
  MC21: { ten: "Phay CNC4 mat 1", dvt: "Phut", donGia: 4200, tg: 15 },
  MC22: { ten: "Phay CNC4 mat 2", dvt: "Phut", donGia: 4200, tg: 15 },
  MC23: { ten: "Phay CNC4 mat 3", dvt: "Phut", donGia: 4200, tg: 15 },
  MC24: { ten: "Phay CNC4 mat 4", dvt: "Phut", donGia: 4200, tg: 15 },
  MC25: { ten: "Phay CNC4 mat 5", dvt: "Phut", donGia: 4200, tg: 15 },
  MC26: { ten: "Phay CNC4 mat 6", dvt: "Phut", donGia: 4200, tg: 15 },
  MC41: { ten: "Phay CNC4 truc mat 1", dvt: "Phut", donGia: 4200, tg: 15 },
  MC42: { ten: "Phay CNC4 truc mat 2", dvt: "Phut", donGia: 4200, tg: 15 },
  MC485: { ten: "GC 5 truc may 1", dvt: "Phut", donGia: 5500, tg: 30 },
  MC415: { ten: "GC 5 truc may 1", dvt: "Phut", donGia: 5500, tg: 30 },
  MI2: { ten: "Mai phang 2 mat", dvt: "Phut", donGia: 3000, tg: 20 },
  MI4: { ten: "Mai phang 4 mat", dvt: "Phut", donGia: 3000, tg: 20 },
  MI6: { ten: "Mai phang 6 mat", dvt: "Phut", donGia: 3000, tg: 20 },
  GF2: { ten: "Mai phang 2 mat", dvt: "Phut", donGia: 3000, tg: 15 },
  GF6: { ten: "Mai phang 6 mat", dvt: "Phut", donGia: 3000, tg: 15 },
  XLN: { ten: "Xu ly nghieu", dvt: "Phut", donGia: 2200, tg: 15 },
  QC: { ten: "Kiem tra", dvt: "Phut", donGia: 2200, tg: 15 },
  DGTP: { ten: "Dong goi thanh pham", dvt: "PCS", donGia: 2200, tg: 3 },
  NK: { ten: "Nhap kho", dvt: "PCS", donGia: 0, tg: 0 },
  "HA-AL": { ten: "Han nhom", dvt: "PCS", donGia: 70000, tg: 1 },
  "HA-SUS": { ten: "Han inox", dvt: "PCS", donGia: 60000, tg: 1 },
};

// ─── FIELD 9: PHAN TICH DO PHUC TAP ─────────────────────────────────────

const BANG_KICH_THUOC = [
  { den: 50, loai: "Nho 1", heSo: 1.0 },
  { den: 100, loai: "Nho 2", heSo: 1.0 },
  { den: 200, loai: "T. Binh 1", heSo: 1.0 },
  { den: 300, loai: "T. Binh 2", heSo: 1.2 },
  { den: 500, loai: "Lon 1", heSo: 1.5 },
  { den: 800, loai: "Lon 2", heSo: 2.0 },
  { den: 1050, loai: "Lon 3", heSo: 2.5 },
  { den: 9999, loai: "Dac Biet", heSo: 3.0 },
];

const BANG_KHOI_LUONG = [
  { den: 1, loai: "Nhe 1", heSo: 1.0 },
  { den: 3, loai: "Nhe 2", heSo: 1.0 },
  { den: 5, loai: "T. Binh 1", heSo: 1.0 },
  { den: 10, loai: "T. Binh 2", heSo: 1.1 },
  { den: 20, loai: "Nang 1", heSo: 1.2 },
  { den: 50, loai: "Nang 2", heSo: 1.3 },
  { den: 9999, loai: "Dac Biet", heSo: 1.5 },
];

const HE_SO_VL = {
  "Thep Thuong": { loai: "Thep Thuong", heSo: 1.0 },
  "Thep Carbon": { loai: "Thep Carbon", heSo: 1.0 },
  "Thep HK": { loai: "Thep HK", heSo: 1.2 },
  Inox: { loai: "Inox thuong", heSo: 1.4 },
  "Inox DB": { loai: "Inox DB", heSo: 1.6 },
  Nhom: { loai: "Nhom", heSo: 0.8 },
  Dong: { loai: "Dong", heSo: 0.8 },
  Nhua: { loai: "Nhua", heSo: 1.0 },
};

const BANG_HAN = {
  KO: { loai: "Khong", heSo: 1.0 },
  "DON GIAN": { loai: "Don gian", heSo: 1.5 },
  "TRUNG BINH": { loai: "Trung binh", heSo: 1.75 },
  KHO: { loai: "Kho", heSo: 2.0 },
  "DAC BIET": { loai: "Dac biet", heSo: 3.0 },
};

const BANG_DUNG_SAI = {
  "CAP 1": { heSo: 2.0 },
  "CAP 2": { heSo: 1.5 },
  "CAP 3": { heSo: 1.2 },
  "CAP 4": { heSo: 1.0 },
  "CAP 5": { heSo: 1.0 },
};

const BANG_DO_KHO = {
  "RAT DE": { ma: "STW01", tgSentup: 3, heSo: 1.0 },
  DE: { ma: "STW02", tgSentup: 4, heSo: 1.0 },
  "TRUNG BINH": { ma: "STW03", tgSentup: 5, heSo: 1.1 },
  "TRUNG BINH KHO": { ma: "STW04", tgSentup: 8, heSo: 1.5 },
  KHO: { ma: "STW05", tgSentup: 10, heSo: 2.0 },
  "RAT KHO": { ma: "STW06", tgSentup: 30, heSo: 2.5 },
  "DAC BIET": { ma: "STW07", tgSentup: 60, heSo: 3.0 },
};

const BANG_SO_LUONG = [
  { den: 2, loai: "SL1", heSo: 1.0 },
  { den: 5, loai: "SL2", heSo: 0.9 },
  { den: 10, loai: "SL3", heSo: 0.8 },
  { den: 20, loai: "SL4", heSo: 0.7 },
  { den: 50, loai: "SL5", heSo: 0.6 },
  { den: 100, loai: "SL6", heSo: 0.5 },
  { den: 200, loai: "SL7", heSo: 0.45 },
  { den: 500, loai: "SL8", heSo: 0.4 },
  { den: 1000, loai: "SL9", heSo: 0.35 },
  { den: 5000, loai: "SL10", heSo: 0.32 },
  { den: 99999, loai: "SL11", heSo: 0.3 },
];

function lookupBang(bang, giaTri) {
  for (const row of bang) {
    if (giaTri <= row.den) return row;
  }
  return bang[bang.length - 1];
}

function phanLoaiVL(maVl, loaiVl) {
  const maVlUpper = (maVl || "").toUpperCase();
  const loaiLower = (loaiVl || "").toLowerCase();

  if (
    ["POM", "MIKA", "TEFLON"].some((x) => maVlUpper.includes(x)) ||
    loaiLower.includes("nhựa")
  )
    return HE_SO_VL["Nhua"];
  if (
    ["C1100", "C3604", "C3609"].some((x) => maVlUpper.includes(x)) ||
    loaiLower.includes("đồng")
  )
    return HE_SO_VL["Dong"];
  if (
    ["A5052", "A5056", "A5083", "A6060", "A6061", "A6063", "A6082"].some((x) =>
      maVlUpper.includes(x)
    )
  )
    return HE_SO_VL["Nhom"];
  if (["A7075", "A2017", "A2024"].some((x) => maVlUpper.includes(x)))
    return { loai: "Nhom HK", heSo: 1.0 };
  if (["SUS316", "SUS316L", "SUS440"].some((x) => maVlUpper.includes(x)))
    return HE_SO_VL["Inox DB"];
  if (["SUS", "INOX"].some((x) => maVlUpper.includes(x)) || loaiLower.includes("inox"))
    return HE_SO_VL["Inox"];
  if (["SKD", "SKS", "SCM", "SK2", "SK3", "NAK"].some((x) => maVlUpper.includes(x)))
    return HE_SO_VL["Thep HK"];
  if (["S45C", "S50C", "S55C"].some((x) => maVlUpper.includes(x)))
    return HE_SO_VL["Thep Carbon"];
  return HE_SO_VL["Thep Thuong"];
}

function phanLoaiDungSai(beMatGiaCong) {
  const beMat = beMatGiaCong || [];
  let cap = 5;

  for (const beMatItem of beMat) {
    const dungSaiLower = (beMatItem.dung_sai || "").toLowerCase();
    const loaiLower = (beMatItem.loai || "").toLowerCase();
    const quyCachLower = (beMatItem.quy_cach || "").toLowerCase();

    if (/h[45]|js[45]|g6/.test(dungSaiLower) || /h[45]|js[45]/.test(quyCachLower)) {
      cap = Math.min(cap, 1);
    } else if (
      /h7|k6|n6|m6/.test(dungSaiLower) ||
      /h7/.test(quyCachLower) ||
      loaiLower.includes("lắp ghép")
    ) {
      cap = Math.min(cap, 2);
    } else if (/[±0][.,]0[1-2]/.test(dungSaiLower)) {
      cap = Math.min(cap, 3);
    } else if (/[±0][.,]0[3-5]/.test(dungSaiLower)) {
      cap = Math.min(cap, 4);
    }
  }

  const tenCap = `CAP ${cap}`;
  return { cap, tenCap, heSo: BANG_DUNG_SAI[tenCap]?.heSo ?? 1.0 };
}

function phanLoaiDoKho(hinhDang, nguyenCongCnc, beMatGiaCong) {
  const shapeLower = (hinhDang?.loai || hinhDang?.kieu_phoi || "").toLowerCase();
  const beMat = beMatGiaCong || [];
  const nguyenCong = nguyenCongCnc || [];

  const coH7 = beMat.some((b) =>
    /h7|h6|lắp ghép/.test(
      (b.dung_sai || b.loai || b.quy_cach || "").toLowerCase()
    )
  );
  const coPocket = beMat.some((b) =>
    /pocket|rãnh|groove|slot|profile/.test(
      (b.loai || b.quy_cach || b.ghi_chu || "").toLowerCase()
    )
  );
  const soMat =
    nguyenCong.filter((nc) => (nc.ten || "").toLowerCase().includes("mặt")).length ||
    Math.ceil(nguyenCong.length / 2);
  const laTron = /tròn|xoay|ống/.test(shapeLower);
  const laHonHop = /hỗn hợp/.test(shapeLower);

  let diem = 0;
  if (laTron && !coH7 && !coPocket) diem = 0;
  else if (laTron && coH7) diem = 1;
  else if (!laTron && soMat <= 2 && !coH7) diem = 2;
  else if (!laTron && soMat <= 3 && coH7) diem = 3;
  else if (soMat >= 4 && coH7) diem = 4;
  else if (laHonHop || coPocket || soMat >= 5) diem = 5;
  else diem = 2;

  const capDoKho = [
    "RAT DE",
    "DE",
    "TRUNG BINH",
    "TRUNG BINH KHO",
    "KHO",
    "RAT KHO",
  ][diem];
  return { ten: capDoKho, ...BANG_DO_KHO[capDoKho] };
}

function phatHienNCDacBiet(nguyenCongCnc, beMatGiaCong) {
  const ncStr = (nguyenCongCnc || [])
    .map((n) => (n.ten || n.may || "").toLowerCase())
    .join(" ");
  const bmStr = (beMatGiaCong || [])
    .map((b) => (b.loai || b.quy_cach || b.ghi_chu || "").toLowerCase())
    .join(" ");
  const all = ncStr + " " + bmStr;

  return {
    WC: /cắt dây|wire cut|wc/.test(all),
    GF: /mài phẳng|grinding|gf/.test(all),
    LF: /laser|lf/.test(all),
    HAN: /hàn|weld|ha-al|ha-sus/.test(all),
    CAYREN: /cấy ren|insert|cayren/.test(all),
    DONGPIN: /đóng pin|dong pin|pin/.test(all),
    TOOL: /dao đặc biệt|special tool/.test(all),
  };
}

/**
 * Phan tich do phuc tap day du (Field 9).
 * @param {object} aiData
 * @returns {object}
 */
export function phanTichDoPhucTap(aiData) {
  if (!aiData) return null;

  const dims = aiData.kich_thuoc_bao || {};
  const material = aiData.vat_lieu || {};
  const khoiLuong = aiData.khoi_luong || {};
  const shape = aiData.hinh_dang || {};
  const nguyenCong = aiData.nguyen_cong_cnc || [];
  const beMat = aiData.be_mat_gia_cong || [];
  const soLuong = aiData.san_xuat?.so_luong || 1;

  const inchFactor = dims.don_vi === "inch" ? 25.4 : 1;
  const ktMax = Math.max(
    (dims.dai || 0) * inchFactor,
    (dims.rong || 0) * inchFactor,
    (dims.cao_hoac_duong_kinh || 0) * inchFactor,
    (dims.phi_lon || 0) * inchFactor
  );

  const rKt = lookupBang(BANG_KICH_THUOC, ktMax);
  const rKl = lookupBang(BANG_KHOI_LUONG, khoiLuong.klPhoiKg || 0);
  const rVl = phanLoaiVL(material.ma, material.loai);
  const rDs = phanLoaiDungSai(beMat);
  const rHd = phanLoaiDoKho(shape, nguyenCong, beMat);
  const rSl = lookupBang(BANG_SO_LUONG, soLuong);

  const coHan = nguyenCong.some((nc) =>
    /hàn|weld|ha-/.test((nc.ten || "").toLowerCase())
  );
  const rHan = coHan ? BANG_HAN["DON GIAN"] : BANG_HAN["KO"];

  const ncDacBiet = phatHienNCDacBiet(nguyenCong, beMat);

  const heSoTong =
    rKt.heSo * rKl.heSo * rVl.heSo * rDs.heSo * rHd.heSo * rHan.heSo;

  return {
    kich_thuoc: { giaTri: Math.round(ktMax), loai: rKt.loai, heSo: rKt.heSo },
    khoi_luong: { giaTri: khoiLuong.klPhoiKg, loai: rKl.loai, heSo: rKl.heSo },
    loai_vat_lieu: { loai: rVl.loai, heSo: rVl.heSo },
    nguyen_cong_han: { loai: rHan.loai, heSo: rHan.heSo },
    do_kho_dung_sai: { cap: rDs.tenCap, heSo: rDs.heSo },
    hinh_dang: {
      ten: rHd.ten,
      ma: rHd.ma,
      tgSentup: rHd.tgSentup,
      heSo: rHd.heSo,
    },
    so_luong: { giaTri: soLuong, loai: rSl.loai, heSo: rSl.heSo },
    nc_dac_biet: ncDacBiet,
    he_so_phuc_tap: Math.round(heSoTong * 100) / 100,
  };
}

export { phanTichDoPhucTap as analyzePhanTichDocBiet };
