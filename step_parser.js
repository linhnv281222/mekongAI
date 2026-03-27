/**
 * step_parser.js
 * Trích xuất kích thước từ file STEP (ISO-10303-21)
 * Hỗ trợ: CYLINDRICAL_SURFACE, CIRCLE, CARTESIAN_POINT, CONICAL_SURFACE
 */

import fs from "fs";

/**
 * Parse file STEP, trả về kích thước chi tiết
 * @param {string} stepPath - đường dẫn file .stp hoặc .step
 * @returns {object} kích_thước đã trích xuất
 */
export function parseStep(stepPath) {
  const content = fs.readFileSync(stepPath, "utf-8");
  return parseStepContent(content);
}

/**
 * Parse nội dung STEP string
 * @param {string} content
 * @returns {object}
 */
export function parseStepContent(content) {
  const result = {
    ma_chi_tiet: null,
    don_vi: "mm",
    kich_thuoc: {
      chieu_dai_mm: null,
      phi_lon_mm: null,
      phi_nho_mm: null,
      chieu_rong_mm: null,
      chieu_cao_mm: null,
    },
    hinh_dang: null,
    lo_va_be_mat: [],
    bounding_box: null,
  };

  // ── Mã chi tiết ────────────────────────────────────────────────────────────
  const prodMatch = content.match(/PRODUCT\('([^']+)','([^']+)'/);
  if (prodMatch) result.ma_chi_tiet = prodMatch[1];

  // ── Đơn vị ─────────────────────────────────────────────────────────────────
  if (content.includes("INCH") || content.includes("inch")) result.don_vi = "inch";
  else result.don_vi = "mm";

  // ── Bounding box từ CARTESIAN_POINT ────────────────────────────────────────
  const ptRegex = /CARTESIAN_POINT\('[^']*',\(([-\d.,E+\-]+)\)\)/g;
  let match;
  const xs = [], ys = [], zs = [];
  while ((match = ptRegex.exec(content)) !== null) {
    const coords = match[1].split(",").map(Number);
    if (coords.length === 3 && coords.every(n => !isNaN(n))) {
      xs.push(coords[0]);
      ys.push(coords[1]);
      zs.push(coords[2]);
    }
  }

  if (xs.length > 0) {
    const bbox = {
      x_min: Math.min(...xs), x_max: Math.max(...xs),
      y_min: Math.min(...ys), y_max: Math.max(...ys),
      z_min: Math.min(...zs), z_max: Math.max(...zs),
    };
    bbox.dx = round(bbox.x_max - bbox.x_min);
    bbox.dy = round(bbox.y_max - bbox.y_min);
    bbox.dz = round(bbox.z_max - bbox.z_min);
    result.bounding_box = bbox;
  }

  // ── Thu thập tất cả radii ───────────────────────────────────────────────────
  const cylRadii = [...content.matchAll(/CYLINDRICAL_SURFACE\('[^']*',#\d+,([\d.E+\-]+)\)/g)]
    .map(m => parseFloat(m[1]));
  const circleRadii = [...content.matchAll(/CIRCLE\('[^']*',#\d+,([\d.E+\-]+)\)/g)]
    .map(m => parseFloat(m[1]));

  const allRadii = [...new Set([...cylRadii, ...circleRadii].map(r => round(r, 4)))]
    .filter(r => r > 0)
    .sort((a, b) => a - b);

  const allDiameters = [...new Set(allRadii.map(r => round(r * 2, 3)))].sort((a, b) => a - b);

  // ── Nhận diện hình dạng ─────────────────────────────────────────────────────
  const hasSurfaceOfRevolution = content.includes("SURFACE_OF_REVOLUTION");
  const hasPlane = (content.match(/\bPLANE\b/g) || []).length;
  const hasCylindrical = cylRadii.length > 0;

  if (hasSurfaceOfRevolution || hasCylindrical) {
    result.hinh_dang = "Tròn xoay";
  } else if (hasPlane > 4) {
    result.hinh_dang = "Vuông cạnh";
  } else {
    result.hinh_dang = "Hỗn hợp";
  }

  // ── Kích thước tròn xoay ───────────────────────────────────────────────────
  if (result.hinh_dang === "Tròn xoay" && allDiameters.length > 0) {
    const phi_lon = allDiameters[allDiameters.length - 1];
    const phi_nho = allDiameters[0];

    // Chiều dài = chiều dài lớn nhất của bounding box
    const bb = result.bounding_box;
    if (bb) {
      const dims = [bb.dx, bb.dy, bb.dz].sort((a, b) => b - a);
      result.kich_thuoc.chieu_dai_mm = dims[0];
    }

    result.kich_thuoc.phi_lon_mm = phi_lon;
    result.kich_thuoc.phi_nho_mm = phi_nho;

  } else if (result.hinh_dang === "Vuông cạnh" && result.bounding_box) {
    // Vuông cạnh: lấy từ bounding box, sắp xếp L >= W >= H
    const bb = result.bounding_box;
    const dims = [bb.dx, bb.dy, bb.dz].sort((a, b) => b - a);
    result.kich_thuoc.chieu_dai_mm  = dims[0];
    result.kich_thuoc.chieu_rong_mm = dims[1];
    result.kich_thuoc.chieu_cao_mm  = dims[2];
  }

  // ── Lỗ và bề mặt đặc biệt ─────────────────────────────────────────────────
  // Conical surface → lỗ CSK
  const cones = [...content.matchAll(/CONICAL_SURFACE\('[^']*',#\d+,([\d.E+\-]+),([\d.E+\-]+)\)/g)];
  const uniqueConeAngles = [...new Set(cones.map(m => round(parseFloat(m[2]), 1)))];
  if (uniqueConeAngles.length > 0) {
    uniqueConeAngles.forEach(angle => {
      const included = round(angle * 2, 0);
      result.lo_va_be_mat.push({
        loai: "CSK / Côn",
        mo_ta: `Lỗ côn góc ${included}° (half-angle ${angle}°)`,
        so_luong: cones.filter(m => round(parseFloat(m[2]), 1) === angle).length,
      });
    });
  }

  // Thống kê lỗ tròn theo nhóm đường kính
  const holeDiams = allDiameters.filter(d => d < 20); // lỗ nhỏ hơn 20mm
  if (holeDiams.length > 0) {
    holeDiams.forEach(d => {
      const count = [...content.matchAll(/CYLINDRICAL_SURFACE\('[^']*',#\d+,([\d.E+\-]+)\)/g)]
        .filter(m => round(parseFloat(m[1]) * 2, 3) === d).length;
      if (count > 0) {
        result.lo_va_be_mat.push({
          loai: "Lỗ trụ",
          mo_ta: `Ø${d}mm`,
          so_luong: count,
        });
      }
    });
  }

  return result;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function round(n, decimals = 3) {
  return Math.round(n * Math.pow(10, decimals)) / Math.pow(10, decimals);
}
