/**
 * process_router.js
 * Field 7: Tính khối lượng phôi + sản phẩm
 * Field 8: Chọn mã quy trình theo logic VNT (từ PT_BÁO_GIÁ__VNT.xlsx)
 */

// ── TRỌNG LƯỢNG RIÊNG (g/cm³) theo vật liệu VNT ─────────────────────────────
const KL_RIENG = {
  // Nhôm
  A2017: 2.8, A2024: 2.78, A5052: 2.68, A5056: 2.64,
  A5083: 2.66, A6060: 2.7,  A6061: 2.7,  A6063: 2.7,
  A6082: 2.71, A7075: 2.81,
  // Thép
  SS400: 7.85, S45C: 7.85, S50C: 7.85, S55C: 7.85,
  SCM415: 7.85, SCM435: 7.85, SCM440: 7.85,
  SKD11: 7.7, SKD61: 7.8, SKS3: 7.9, NAK55: 7.8,
  SPHC: 7.85, SPCC: 7.85,
  // Inox
  SUS303: 8.0, SUS304: 7.93, SUS316: 8.0, SUS316L: 8.0,
  SUS420J1: 7.73, SUS420J2: 7.73, SUS440C: 7.7,
  // Đồng
  C1100: 8.9, C3604: 8.5,
  // Nhựa
  POM: 1.41, MICA: 1.18, TEFLON: 2.2,
};

// ── BẢNG QUY TRÌNH VNT (từ sheet QUY TRÌNH) ──────────────────────────────────
// Cấu trúc: QTxyz — x: nhóm, y: số mặt, z: mức độ lỗ
// QT1xx = Tròn xoay (LC - Tiện), QT2xx = Phay nhỏ, QT4xx = Phay lớn (có MI),
// QT6xx = Phay trung bình (có MI), QT7xx = 5-trục
const QUY_TRINH = {
  // TRÒN XOAY — LC (Tiện CNC)
  QT111: ['MAL','LC11','LC12','XLN','QC','ĐGTP','NK'],
  QT112: ['MAL','LC11','LC12','MC11','MC12','XLN','QC','ĐGTP','NK'],
  QT113: ['MAL','LC11','LC12','MC11','MC12','MC13','XLN','QC','ĐGTP','NK'],
  QT114: ['MAL','LC11','LC12','MC11','MC12','MC13','MC14','XLN','QC','ĐGTP','NK'],
  QT115: ['MAL','LC11','LC12','MC11','MC12','MC13','MC14','MC15','XLN','QC','ĐGTP','NK'],
  QT116: ['MAL','LC11','LC12','MC11','MC12','MC13','MC14','MC15','MC16','XLN','QC','ĐGTP','NK'],

  // PHAY CNC TRUNG BÌNH (50-200mm) — có MI (mài phẳng)
  QT211: ['MAL','MC21','XLN','QC','ĐGTP','NK'],
  QT212: ['MAL','MC21','MC22','XLN','QC','ĐGTP','NK'],
  QT213: ['MAL','MC21','MC22','MC23','XLN','QC','ĐGTP','NK'],
  QT214: ['MAL','MC21','MC22','MC23','MC24','XLN','QC','ĐGTP','NK'],
  QT215: ['MAL','MC21','MC22','MC23','MC24','MC25','XLN','QC','ĐGTP','NK'],
  QT216: ['MAL','MC21','MC22','MC23','MC24','MC25','MC26','XLN','QC','ĐGTP','NK'],

  // PHAY CNC LỚN (>200mm) — có MI4 (mài phẳng 4 mặt)
  QT411: ['MAL','MI4','MC11','XLN','QC','ĐGTP','NK'],
  QT412: ['MAL','MI4','MC11','MC12','XLN','QC','ĐGTP','NK'],
  QT413: ['MAL','MI4','MC11','MC12','MC13','XLN','QC','ĐGTP','NK'],
  QT414: ['MAL','MI4','MC11','MC12','MC13','MC14','XLN','QC','ĐGTP','NK'],
  QT415: ['MAL','MI4','MC11','MC12','MC13','MC14','MC15','XLN','QC','ĐGTP','NK'],
  QT416: ['MAL','MI4','MC11','MC12','MC13','MC14','MC15','MC16','XLN','QC','ĐGTP','NK'],

  // PHAY CNC TRUNG BÌNH với MI6
  QT611: ['MAL','MI6','MC11','XLN','QC','ĐGTP','NK'],
  QT612: ['MAL','MI6','MC11','MC12','XLN','QC','ĐGTP','NK'],
  QT613: ['MAL','MI6','MC11','MC12','MC13','XLN','QC','ĐGTP','NK'],
  QT614: ['MAL','MI6','MC11','MC12','MC13','MC14','XLN','QC','ĐGTP','NK'],
  QT615: ['MAL','MI6','MC11','MC12','MC13','MC14','MC15','XLN','QC','ĐGTP','NK'],
  QT616: ['MAL','MI6','MC11','MC12','MC13','MC14','MC15','MC16','XLN','QC','ĐGTP','NK'],
};

// ── TÍNH KHỐI LƯỢNG (kg) ─────────────────────────────────────────────────────
/**
 * Tính khối lượng chi tiết theo hình dạng và kích thước
 * @param {string} kieu_phoi - loại phôi
 * @param {object} kt - kích thước { dai, rong, cao, phi_lon, phi_nho } (mm)
 * @param {string} ma_vl - mã vật liệu
 * @returns {object} { kl_sp_kg, kl_phoi_kg, don_vi, ghi_chu }
 */
export function tinhKhoiLuong(kieu_phoi, kt, ma_vl) {
  const rho = KL_RIENG[ma_vl] ?? 7.85; // mặc định thép nếu không tìm thấy
  const PI = Math.PI;
  const r = n => Math.round(n * 1000) / 1000;

  let the_tich_sp = 0;   // cm³
  let the_tich_phoi = 0; // cm³
  const LUU_DU = 5;       // mm lưu dư mỗi phía

  const loai = (kieu_phoi || '').toLowerCase();

  if (loai.includes('tron') || loai.includes('tròn') || loai.includes('ong') || loai.includes('ống') || loai.includes('luc') || loai.includes('lục')) {
    // Tròn xoay: V = π * (D/2)² * L
    const D = kt.phi_lon || kt.cao_hoac_duong_kinh || 0;
    const d = kt.phi_nho || 0;
    const L = kt.dai || 0;

    if (D > 0 && L > 0) {
      if (d > 0 && loai.includes('ong')) {
        // Ống rỗng
        the_tich_sp = PI * ((D/2)**2 - (d/2)**2) * L / 1000; // mm³ → cm³
      } else {
        // Đặc
        the_tich_sp = PI * (D/2)**2 * L / 1000;
      }

      // Phôi: D + LUU_DU*2, L + LUU_DU*2
      const D_phoi = D + LUU_DU * 2;
      const L_phoi = L + LUU_DU * 2;
      the_tich_phoi = PI * (D_phoi/2)**2 * L_phoi / 1000;
    }

  } else if (loai.includes('tam') || loai.includes('tấm') || loai.includes('vuong') || loai.includes('vuông')) {
    // Hình tấm/hộp: V = L * W * H
    const L = kt.dai || 0;
    const W = kt.rong || 0;
    const H = kt.cao_hoac_duong_kinh || 0;

    if (L > 0 && W > 0 && H > 0) {
      the_tich_sp = L * W * H / 1000;
      the_tich_phoi = (L + LUU_DU*2) * (W + LUU_DU*2) * (H + LUU_DU*2) / 1000;
    }
  }

  if (the_tich_sp === 0) {
    return { kl_sp_kg: null, kl_phoi_kg: null, ghi_chu: 'Thiếu kích thước để tính' };
  }

  const kl_sp   = r(the_tich_sp * rho / 1000);   // kg
  const kl_phoi = r(the_tich_phoi * rho / 1000);  // kg

  return {
    kl_sp_kg:   kl_sp,
    kl_phoi_kg: kl_phoi,
    trong_luong_rieng: rho,
    don_vi: 'kg',
    ghi_chu: `ρ=${rho} g/cm³ | SP: ${r(the_tich_sp)} cm³ | Phôi: ${r(the_tich_phoi)} cm³`,
  };
}

// ── CHỌN MÃ QUY TRÌNH F3 ─────────────────────────────────────────────────────
/**
 * Chọn mã quy trình theo logic VNT
 * Logic từ PT_BÁO_GIÁ__VNT.xlsx sheet TH, row 7:
 * TRON/ONG/LUC GIAC → QT1xx
 * Nhôm/Nhựa/Đồng dạng tấm nhỏ (<50mm) → QT2xx
 * Tấm lớn (>200mm) → QT4xx  
 * Tấm trung bình (50-200mm) → QT6xx
 * Số lỗ mặt → quyết định xx (số nguyên công phay)
 *
 * @param {string} kieu_phoi
 * @param {string} loai_vl - Nhôm | Thép | Inox | Đồng | Nhựa
 * @param {number} kich_thuoc_max - kích thước lớn nhất (mm)
 * @param {number} so_mat_gia_cong - số mặt cần gia công (từ nguyen_cong_cnc)
 * @param {number} so_lo_ren - số lỗ ren (tổng)
 * @returns {object} { ma_qt, ten_qt, danh_sach_nguyen_cong, mo_ta }
 */
export function chonQuyTrinh(kieu_phoi, loai_vl, kich_thuoc_max, so_mat_gia_cong, so_lo_ren = 0) {
  const loai = (kieu_phoi || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  const vl   = (loai_vl || '').toLowerCase();

  // Số nguyên công phay (1-6) — dựa trên số mặt gia công
  // 1 mặt = MC11, 2 mặt = MC11+MC12, ...
  const so_mat = Math.max(1, Math.min(6, so_mat_gia_cong || 1));

  let nhom = '';
  let mo_ta = '';

  // ── Nhóm 1: Tròn xoay ──
  if (loai.includes('tron') || loai.includes('ong') || loai.includes('luc giac')) {
    nhom = '1';
    mo_ta = 'Tiện CNC (tròn xoay/ống/lục giác)';
  }
  // ── Nhóm 2: Phay CNC nhỏ (<50mm) ──
  else if (kich_thuoc_max < 50) {
    nhom = '2';
    mo_ta = `Phay CNC nhỏ (<50mm), ${vl}`;
  }
  // ── Nhóm 4: Phay CNC lớn (>200mm) ──
  else if (kich_thuoc_max > 200) {
    nhom = '4';
    mo_ta = `Phay CNC lớn (>200mm), có mài phẳng MI4`;
  }
  // ── Nhóm 6: Phay CNC trung bình (50-200mm) ──
  else {
    nhom = '6';
    mo_ta = `Phay CNC trung bình (50-200mm), có mài phẳng MI6`;
  }

  const ma_qt = `QT${nhom}1${so_mat}`;
  const nguyen_cong = QUY_TRINH[ma_qt] || QUY_TRINH[`QT${nhom}11`] || [];

  return {
    ma_qt,
    ten_qt: mo_ta,
    danh_sach_nguyen_cong: nguyen_cong,
    so_mat_gia_cong: so_mat,
    nhom_qt: nhom,
    ghi_chu: `${nguyen_cong.length} nguyên công | ${so_lo_ren > 0 ? `${so_lo_ren} lỗ ren` : 'không có ren'}`,
  };
}

// ── HÀM TỔNG HỢP: Bổ sung Field 7 + Field 8 vào kết quả AI ──────────────────
/**
 * Bổ sung khối lượng và mã quy trình vào JSON từ AI
 * @param {object} aiData - kết quả từ analyzDrawing()
 * @returns {object} aiData đã bổ sung
 */
export function enrichWithF7F8(aiData) {
  if (!aiData) return aiData;

  const d = aiData;
  const kt = d.kich_thuoc_bao || {};
  const vl = d.vat_lieu || {};
  const hd = d.hinh_dang || {};

  // ── Field 7: Khối lượng ──
  const kl = tinhKhoiLuong(
    hd.kieu_phoi || hd.loai,
    {
      dai: kt.dai,
      rong: kt.rong,
      cao_hoac_duong_kinh: kt.cao_hoac_duong_kinh,
      phi_lon: kt.phi_lon,
      phi_nho: kt.phi_nho,
    },
    vl.ma
  );
  d.khoi_luong = kl;

  // ── Field 8: Mã quy trình ──
  // Xác định kích thước max
  const kich_thuoc_max = (() => {
    const c = kt.don_vi === 'inch' ? 25.4 : 1;
    const vals = [kt.dai, kt.rong, kt.cao_hoac_duong_kinh, kt.phi_lon].filter(Boolean).map(v => v * c);
    return vals.length ? Math.max(...vals) : 0;
  })();

  // Đếm số mặt gia công từ nguyen_cong_cnc
  const so_mat = (d.nguyen_cong_cnc || []).filter(nc => {
    const ten = (nc.ten || '').toLowerCase();
    return ten.includes('phay') || ten.includes('tiện') || ten.includes('mặt');
  }).length || Math.ceil((d.nguyen_cong_cnc || []).length / 2) || 1;

  // Đếm lỗ ren
  const so_lo_ren = (d.be_mat_gia_cong || []).filter(b => {
    const l = (b.loai || '').toLowerCase();
    return l.includes('ren') || l.includes('taro');
  }).length;

  const qt = chonQuyTrinh(
    hd.kieu_phoi || hd.loai,
    vl.loai,
    kich_thuoc_max,
    so_mat,
    so_lo_ren
  );
  d.ma_quy_trinh = qt.ma_qt;
  d.quy_trinh_chi_tiet = qt;

  return d;
}

// ── LOOKUP THÔNG TIN NGUYÊN CÔNG ─────────────────────────────────────────────
// Bảng đơn giá/thời gian từ operation.xlsx (đã đọc trước)
export const OPERATION_INFO = {
  MAL:  { ten: 'Nguyên liệu',            dvt: 'PCS',  don_gia: 0,     tg: 6   },
  LC11: { ten: 'Tiện CNC lần 1',          dvt: 'Phút', don_gia: 4500,  tg: 15  },
  LC12: { ten: 'Tiện CNC lần 2',          dvt: 'Phút', don_gia: 4500,  tg: 15  },
  MC11: { ten: 'Phay CNC1 mặt 1',        dvt: 'Phút', don_gia: 3700,  tg: 15  },
  MC12: { ten: 'Phay CNC1 mặt 2',        dvt: 'Phút', don_gia: 3700,  tg: 15  },
  MC13: { ten: 'Phay CNC1 mặt 3',        dvt: 'Phút', don_gia: 3700,  tg: 15  },
  MC14: { ten: 'Phay CNC1 mặt 4',        dvt: 'Phút', don_gia: 3700,  tg: 15  },
  MC15: { ten: 'Phay CNC1 mặt 5',        dvt: 'Phút', don_gia: 3700,  tg: 15  },
  MC16: { ten: 'Phay CNC1 mặt 6',        dvt: 'Phút', don_gia: 3700,  tg: 15  },
  MC21: { ten: 'Phay CNC4 mặt 1',        dvt: 'Phút', don_gia: 4200,  tg: 15  },
  MC22: { ten: 'Phay CNC4 mặt 2',        dvt: 'Phút', don_gia: 4200,  tg: 15  },
  MC23: { ten: 'Phay CNC4 mặt 3',        dvt: 'Phút', don_gia: 4200,  tg: 15  },
  MC24: { ten: 'Phay CNC4 mặt 4',        dvt: 'Phút', don_gia: 4200,  tg: 15  },
  MC25: { ten: 'Phay CNC4 mặt 5',        dvt: 'Phút', don_gia: 4200,  tg: 15  },
  MC26: { ten: 'Phay CNC4 mặt 6',        dvt: 'Phút', don_gia: 4200,  tg: 15  },
  MC41: { ten: 'Phay CNC4 trục mặt 1',   dvt: 'Phút', don_gia: 4200,  tg: 15  },
  MC42: { ten: 'Phay CNC4 trục mặt 2',   dvt: 'Phút', don_gia: 4200,  tg: 15  },
  MC485:{ ten: 'GC 5 trục máy 1',        dvt: 'Phút', don_gia: 5500,  tg: 30  },
  MC415:{ ten: 'GC 5 trục máy 1',        dvt: 'Phút', don_gia: 5500,  tg: 30  },
  MI2:  { ten: 'Mài phẳng 2 mặt',        dvt: 'Phút', don_gia: 3000,  tg: 20  },
  MI4:  { ten: 'Mài phẳng 4 mặt',        dvt: 'Phút', don_gia: 3000,  tg: 20  },
  MI6:  { ten: 'Mài phẳng 6 mặt',        dvt: 'Phút', don_gia: 3000,  tg: 20  },
  GF2:  { ten: 'Mài phẳng 2 mặt',        dvt: 'Phút', don_gia: 3000,  tg: 15  },
  GF6:  { ten: 'Mài phẳng 6 mặt',        dvt: 'Phút', don_gia: 3000,  tg: 15  },
  XLN:  { ten: 'Xử lý nguội',            dvt: 'Phút', don_gia: 2200,  tg: 15  },
  QC:   { ten: 'Kiểm tra',               dvt: 'Phút', don_gia: 2200,  tg: 15  },
  ĐGTP: { ten: 'Đóng gói thành phẩm',    dvt: 'PCS',  don_gia: 2200,  tg: 3   },
  NK:   { ten: 'Nhập kho',               dvt: 'PCS',  don_gia: 0,     tg: 0   },
  'HA-AL': { ten: 'Hàn nhôm',           dvt: 'PCS',  don_gia: 70000, tg: 1   },
  'HA-SUS':{ ten: 'Hàn inox',           dvt: 'PCS',  don_gia: 60000, tg: 1   },
};

// ── FIELD 9: PHÂN TÍCH ĐỘ PHỨC TẠP (từ PT_BÁO_GIÁ__VNT.xlsx DATA sheet) ─────

// Bảng phân loại kích thước (theo kích thước lớn nhất mm)
const BANG_KICH_THUOC = [
  { den: 50,   loai: 'Nhỏ 1',    he_so: 1.0 },
  { den: 100,  loai: 'Nhỏ 2',    he_so: 1.0 },
  { den: 200,  loai: 'T. Bình 1',he_so: 1.0 },
  { den: 300,  loai: 'T. Bình 2',he_so: 1.2 },
  { den: 500,  loai: 'Lớn 1',    he_so: 1.5 },
  { den: 800,  loai: 'Lớn 2',    he_so: 2.0 },
  { den: 1050, loai: 'Lớn 3',    he_so: 2.5 },
  { den: 9999, loai: 'Đặc Biệt', he_so: 3.0 },
];

// Bảng phân loại khối lượng (kg)
const BANG_KHOI_LUONG = [
  { den: 1,   loai: 'Nhẹ 1',    he_so: 1.0 },
  { den: 3,   loai: 'Nhẹ 2',    he_so: 1.0 },
  { den: 5,   loai: 'T. Bình 1',he_so: 1.0 },
  { den: 10,  loai: 'T. Bình 2',he_so: 1.1 },
  { den: 20,  loai: 'Nặng 1',   he_so: 1.2 },
  { den: 50,  loai: 'Nặng 2',   he_so: 1.3 },
  { den: 9999,loai: 'Đặc Biệt', he_so: 1.5 },
];

// Hệ số vật liệu
const HE_SO_VL = {
  'Thép Thường': { loai: 'Thép Thường', he_so: 1.0 },
  'Thép Carbon': { loai: 'Thép Cabon',  he_so: 1.0 },
  'Thép HK':     { loai: 'Thép HK',     he_so: 1.2 },
  'Inox':        { loai: 'Inox thường', he_so: 1.4 },
  'Inox ĐB':     { loai: 'Inox ĐB',    he_so: 1.6 },
  'Nhôm':        { loai: 'Nhôm',        he_so: 0.8 },
  'Đồng':        { loai: 'Đồng',        he_so: 0.8 },
  'Nhựa':        { loai: 'Nhựa',        he_so: 1.0 },
};

// Bảng hàn
const BANG_HAN = {
  'KO':         { loai: 'Không',      he_so: 1.0 },
  'ĐƠN GIẢN':  { loai: 'Đơn giản',   he_so: 1.5 },
  'TRUNG BÌNH':{ loai: 'Trung bình',  he_so: 1.75 },
  'KHÓ':       { loai: 'Khó',         he_so: 2.0 },
  'ĐẶC BIỆT':  { loai: 'Đặc biệt',   he_so: 3.0 },
};

// Phân loại dung sai (Cấp 1=khó nhất, Cấp 5=dễ nhất)
// Cấp 1: có dung sai <0.01 hoặc H5/H6
// Cấp 2: dung sai 0.01-0.02 hoặc H7
// Cấp 3: dung sai 0.02-0.05
// Cấp 4: dung sai 0.05-0.1
// Cấp 5: dung sai >0.1 hoặc không có
const BANG_DUNG_SAI = {
  'CẤP 1': { he_so: 2.0 },
  'CẤP 2': { he_so: 1.5 },
  'CẤP 3': { he_so: 1.2 },
  'CẤP 4': { he_so: 1.0 },
  'CẤP 5': { he_so: 1.0 },
};

// Độ khó hình dạng + sentup cơ bản (phút)
const BANG_DO_KHO = {
  'RẤT DỄ':        { ma: 'STW01', tg_sentup: 3,  he_so: 1.0 },
  'DỄ':            { ma: 'STW02', tg_sentup: 4,  he_so: 1.0 },
  'TRUNG BÌNH':    { ma: 'STW03', tg_sentup: 5,  he_so: 1.1 },
  'TRUNG BÌNH KHÓ':{ ma: 'STW04', tg_sentup: 8,  he_so: 1.5 },
  'KHÓ':           { ma: 'STW05', tg_sentup: 10, he_so: 2.0 },
  'RẤT KHÓ':       { ma: 'STW06', tg_sentup: 30, he_so: 2.5 },
  'ĐẶC BIỆT':      { ma: 'STW07', tg_sentup: 60, he_so: 3.0 },
};

// Hệ số số lượng
const BANG_SO_LUONG = [
  { den: 2,     loai: 'SL1',  he_so: 1.0  },
  { den: 5,     loai: 'SL2',  he_so: 0.9  },
  { den: 10,    loai: 'SL3',  he_so: 0.8  },
  { den: 20,    loai: 'SL4',  he_so: 0.7  },
  { den: 50,    loai: 'SL5',  he_so: 0.6  },
  { den: 100,   loai: 'SL6',  he_so: 0.5  },
  { den: 200,   loai: 'SL7',  he_so: 0.45 },
  { den: 500,   loai: 'SL8',  he_so: 0.4  },
  { den: 1000,  loai: 'SL9',  he_so: 0.35 },
  { den: 5000,  loai: 'SL10', he_so: 0.32 },
  { den: 99999, loai: 'SL11', he_so: 0.3  },
];

function lookupBang(bang, gia_tri) {
  for (const row of bang) {
    if (gia_tri <= row.den) return row;
  }
  return bang[bang.length - 1];
}

/**
 * Xác định loại vật liệu → nhóm hệ số
 */
function phanLoaiVL(ma_vl, loai_vl) {
  const ma = (ma_vl || '').toUpperCase();
  const loai = (loai_vl || '').toLowerCase();

  if (['POM','MIKA','TEFLON'].some(x => ma.includes(x)) || loai.includes('nhựa')) return HE_SO_VL['Nhựa'];
  if (['C1100','C3604','C3609'].some(x => ma.includes(x)) || loai.includes('đồng')) return HE_SO_VL['Đồng'];
  if (['A5052','A5056','A5083','A6060','A6061','A6063','A6082'].some(x => ma.includes(x))) return HE_SO_VL['Nhôm'];
  if (['A7075','A2017','A2024'].some(x => ma.includes(x))) return { loai: 'Nhôm HK', he_so: 1.0 };
  if (['SUS316','SUS316L','SUS440'].some(x => ma.includes(x))) return HE_SO_VL['Inox ĐB'];
  if (['SUS','INOX'].some(x => ma.includes(x)) || loai.includes('inox')) return HE_SO_VL['Inox'];
  if (['SKD','SKS','SCM','SK2','SK3','NAK'].some(x => ma.includes(x))) return HE_SO_VL['Thép HK'];
  if (['S45C','S50C','S55C'].some(x => ma.includes(x))) return HE_SO_VL['Thép Carbon'];
  return HE_SO_VL['Thép Thường'];
}

/**
 * Xác định cấp dung sai từ danh sách bề mặt gia công
 */
function phanLoaiDungSai(be_mat_gia_cong) {
  const bm = be_mat_gia_cong || [];
  let cap = 5; // mặc định dễ nhất

  for (const b of bm) {
    const ds = (b.dung_sai || '').toLowerCase();
    const loai = (b.loai || '').toLowerCase();
    const qc = (b.quy_cach || '').toLowerCase();

    // H5, H6, js5 → Cấp 1
    if (/h[45]|js[45]|g6/.test(ds) || /h[45]|js[45]/.test(qc)) { cap = Math.min(cap, 1); }
    // H7, k6, n6 → Cấp 2
    else if (/h7|k6|n6|m6/.test(ds) || /h7/.test(qc) || loai.includes('lắp ghép')) { cap = Math.min(cap, 2); }
    // ±0.02 → Cấp 3
    else if (/[±0][.,]0[1-2]/.test(ds)) { cap = Math.min(cap, 3); }
    // ±0.05 → Cấp 4
    else if (/[±0][.,]0[3-5]/.test(ds)) { cap = Math.min(cap, 4); }
  }

  const ten_cap = `CẤP ${cap}`;
  return { cap, ten_cap, he_so: BANG_DUNG_SAI[ten_cap]?.he_so ?? 1.0 };
}

/**
 * Xác định độ khó hình dạng
 * Dựa: loại hình, số mặt, có H7, có pocket/rãnh phức tạp
 */
function phanLoaiDoKho(hinh_dang, nguyen_cong_cnc, be_mat_gia_cong) {
  const hd = (hinh_dang?.loai || hinh_dang?.kieu_phoi || '').toLowerCase();
  const bm = be_mat_gia_cong || [];
  const nc = nguyen_cong_cnc || [];

  const co_H7 = bm.some(b => /h7|h6|lắp ghép/.test((b.dung_sai||b.loai||b.quy_cach||'').toLowerCase()));
  const co_pocket = bm.some(b => /pocket|rãnh|groove|slot|profile/.test((b.loai||b.quy_cach||b.ghi_chu||'').toLowerCase()));
  const so_mat = nc.filter(n => (n.ten||'').toLowerCase().includes('mặt')).length || Math.ceil(nc.length / 2);
  const la_tron = /tròn|xoay|ống/.test(hd);
  const la_hon_hop = /hỗn hợp/.test(hd);

  let diem = 0;
  if (la_tron && !co_H7 && !co_pocket) diem = 0;       // Rất dễ
  else if (la_tron && co_H7) diem = 1;                  // Dễ
  else if (!la_tron && so_mat <= 2 && !co_H7) diem = 2; // Trung bình
  else if (!la_tron && so_mat <= 3 && co_H7) diem = 3;  // Trung bình khó
  else if (so_mat >= 4 && co_H7) diem = 4;              // Khó
  else if (la_hon_hop || co_pocket || so_mat >= 5) diem = 5; // Rất khó
  else diem = 2;

  const cap_do_kho = ['RẤT DỄ','DỄ','TRUNG BÌNH','TRUNG BÌNH KHÓ','KHÓ','RẤT KHÓ'][diem];
  return { ten: cap_do_kho, ...BANG_DO_KHO[cap_do_kho] };
}

/**
 * Phát hiện nguyên công đặc biệt từ bản vẽ
 */
function phatHienNCDacBiet(nguyen_cong_cnc, be_mat_gia_cong) {
  const nc_str = (nguyen_cong_cnc || []).map(n => (n.ten||n.may||'').toLowerCase()).join(' ');
  const bm_str = (be_mat_gia_cong || []).map(b => (b.loai||b.quy_cach||b.ghi_chu||'').toLowerCase()).join(' ');
  const all = nc_str + ' ' + bm_str;

  return {
    WC:      /cắt dây|wire cut|wc/.test(all),
    GF:      /mài phẳng|grinding|gf/.test(all),
    LF:      /laser|lf/.test(all),
    HAN:     /hàn|weld|ha-al|ha-sus/.test(all),
    CAYREN:  /cấy ren|insert|cayren/.test(all),
    DONGPIN: /đóng pin|dong pin|pin/.test(all),
    TOOL:    /dao đặc biệt|special tool/.test(all),
  };
}

/**
 * Field 9: Phân tích độ phức tạp đầy đủ
 */
export function phanTichDoPhucTap(aiData) {
  if (!aiData) return null;

  const kt = aiData.kich_thuoc_bao || {};
  const vl = aiData.vat_lieu || {};
  const kl = aiData.khoi_luong || {};
  const hd = aiData.hinh_dang || {};
  const nc = aiData.nguyen_cong_cnc || [];
  const bm = aiData.be_mat_gia_cong || [];
  const sl = aiData.san_xuat?.so_luong || 1;

  // Kích thước lớn nhất
  const c = kt.don_vi === 'inch' ? 25.4 : 1;
  const kt_max = Math.max(
    (kt.dai || 0) * c,
    (kt.rong || 0) * c,
    (kt.cao_hoac_duong_kinh || 0) * c,
    (kt.phi_lon || 0) * c
  );

  const r_kt  = lookupBang(BANG_KICH_THUOC, kt_max);
  const r_kl  = lookupBang(BANG_KHOI_LUONG, kl.kl_phoi_kg || 0);
  const r_vl  = phanLoaiVL(vl.ma, vl.loai);
  const r_ds  = phanLoaiDungSai(bm);
  const r_hd  = phanLoaiDoKho(hd, nc, bm);
  const r_sl  = lookupBang(BANG_SO_LUONG, sl);

  // Hàn
  const co_han = nc.some(n => /hàn|weld|ha-/.test((n.ten||'').toLowerCase()));
  const r_han  = co_han ? BANG_HAN['ĐƠN GIẢN'] : BANG_HAN['KO'];

  // Nguyên công đặc biệt
  const nc_dac_biet = phatHienNCDacBiet(nc, bm);

  // Tổng hệ số phức tạp
  const he_so_tong = r_kt.he_so * r_kl.he_so * r_vl.he_so * r_ds.he_so * r_hd.he_so * r_han.he_so;

  return {
    kich_thuoc:    { gia_tri: Math.round(kt_max), loai: r_kt.loai, he_so: r_kt.he_so },
    khoi_luong:    { gia_tri: kl.kl_phoi_kg, loai: r_kl.loai, he_so: r_kl.he_so },
    loai_vat_lieu: { loai: r_vl.loai, he_so: r_vl.he_so },
    nguyen_cong_han:{ loai: r_han.loai, he_so: r_han.he_so },
    do_kho_dung_sai:{ cap: r_ds.ten_cap, he_so: r_ds.he_so },
    hinh_dang:     { ten: r_hd.ten, ma: r_hd.ma, tg_sentup: r_hd.tg_sentup, he_so: r_hd.he_so },
    so_luong:      { gia_tri: sl, loai: r_sl.loai, he_so: r_sl.he_so },
    nc_dac_biet,
    he_so_phuc_tap: Math.round(he_so_tong * 100) / 100,
  };
}

// Bổ sung vào enrichWithF7F8
const _origEnrich = enrichWithF7F8;
export function enrichWithF7F8Full(aiData) {
  const d = enrichWithF7F8(aiData);
  if (d) d.do_phuc_tap = phanTichDoPhucTap(d);
  return d;
}


// Alias — analyzer.js dùng tên này
export { phanTichDoPhucTap as analyzePhanTichDocBiet };
