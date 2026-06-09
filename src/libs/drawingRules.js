/**
 * Local extraction rules — regex-based field extraction for drawing data.
 *
 * Use case: When AI returns a drawing result, apply local rules to:
 * 1. Fill in missing fields (confidence boost)
 * 2. Validate/correct AI output (sanity check)
 * 3. Determine confidence level (decide if retry is needed)
 *
 * Fields that are rule-extractable:
 * - vat_lieu: material codes (AL/SUS/S/C + number)
 * - so_luong: quantities from common formats
 * - hinh_dang: shape from dimension patterns
 * - xu_ly_be_mat: common surface treatment codes
 * - xu_ly_nhiet: common heat treatment codes
 * - dung_sai_chung: tolerance standards (JIS/ISO/ANSI)
 */

// ── MATERIAL CODES ─────────────────────────────────────────────────────────────

const MATERIAL_PATTERNS = [
  // Aluminum
  [/A-?(\d{4})\b/i, (m) => `A${m[1]}`],
  [/AL-?(\d{4})\b/i, (m) => `AL${m[1]}`],
  [/\bA5052\b/i, () => "A5052"],
  [/\bA6061\b/i, () => "A6061"],
  [/\bA2017\b/i, () => "A2017"],
  [/\bAL6061\b/i, () => "A6061"],
  [/\bAL5052\b/i, () => "A5052"],
  [/\bAL2017\b/i, () => "A2017"],

  // Steel
  [/\bS45C\b/i, () => "S45C"],
  [/\bS50C\b/i, () => "S50C"],
  [/\bSS400\b/i, () => "SS400"],
  [/\bSS41\b/i, () => "SS41"],
  [/\bSKS3\b/i, () => "SKS3"],
  [/\bSKD11\b/i, () => "SKD11"],
  [/\bSKD61\b/i, () => "SKD61"],
  [/\bSCM415\b/i, () => "SCM415"],
  [/\bSCM420\b/i, () => "SCM420"],
  [/\bSCM435\b/i, () => "SCM435"],
  [/\bSCM440\b/i, () => "SCM440"],
  [/\bS25C\b/i, () => "S25C"],
  [/\bS15C\b/i, () => "S15C"],
  [/\bS20C\b/i, () => "S20C"],

  // Stainless
  [/\bSUS304\b/i, () => "SUS304"],
  [/\bSUS316\b/i, () => "SUS316"],
  [/\bSUS303\b/i, () => "SUS303"],
  [/\bSUS430\b/i, () => "SUS430"],
  [/\bSUS301\b/i, () => "SUS301"],

  // Brass/Copper
  [/\bC3604\b/i, () => "C3604"],
  [/\bC3771\b/i, () => "C3771"],
  [/\bC2801\b/i, () => "C2801"],
  [/\bC2700\b/i, () => "C2700"],

  // Plastics
  [/\bPOM\b/i, () => "POM"],
  [/\bPA6\b/i, () => "PA6"],
  [/\bPA66\b/i, () => "PA66"],
  [/\bPEEK\b/i, () => "PEEK"],
  [/\bMC[_-]?NYLON\b/i, () => "MC Nylon"],
  [/\bMC\b(?![\w]*[A-Z])/i, () => null], // avoid false "MC" alone

  // Cast iron
  [/\bFC[\s-]?(\d{3})\b/i, (m) => `FC-${m[1]}`],
  [/\bFCD[\s-]?(\d{3})\b/i, (m) => `FCD-${m[1]}`],
  [/\bQT-?(\d{3})\b/i, (m) => `QT${m[1]}`],

  // Titanium
  [/\bTi-?6Al-?4V\b/i, () => "Ti-6Al-4V"],
  [/\bTC4\b/i, () => "Ti-6Al-4V"],
];

// ── QUANTITY ─────────────────────────────────────────────────────────────────

const QUANTITY_PATTERNS = [
  // QTY or 数量 format
  [/(?:qty|quantity|数量|數量)\s*[:\s]*(\d+)/i, (m) => parseInt(m[1], 10)],
  // Standalone number with unit
  [/\b(\d+)\s*(?:pcs?|個|ヶ|pcs|pc|個|コ)/i, (m) => parseInt(m[1], 10)],
  // "X items" format
  [/(\d+)\s*(?:items?|sets?|loại|lot|batch)/i, (m) => parseInt(m[1], 10)],
];

// ── SHAPE ────────────────────────────────────────────────────────────────────

/**
 * Infer shape from dimension format.
 * @param {string} dims — dimension string e.g. "Ø35×74.5" or "80×50×10"
 */
export function inferShape(dims) {
  if (!dims) return null;
  const d = dims.trim();

  // Diameter pattern: starts with Ø or ⌀ or "Dia"
  if (/^(?:Ø|⌀|Dia|DIA)\s*[\d\.]/i.test(d)) {
    return "Tròn xoay";
  }

  // L×W×H pattern (3 dimensions) → block/rectangular
  const lwhMatch = d.match(/^(\d+)\s*[×xX]\s*(\d+)\s*[×xX]\s*(\d+)/);
  if (lwhMatch) {
    const [, l, w, h] = lwhMatch.map(Number);
    // If all 3 are roughly similar → cube/block
    // If 2 are small, 1 is large → plate/slab
    const ratio = Math.max(l, w, h) / Math.min(l, w, h);
    if (ratio > 5) {
      return "Hình tấm";
    }
    return "Khối";
  }

  // L×W pattern (2 dimensions) → plate
  if (/^\d+\s*[×xX]\s*\d+$/.test(d)) {
    return "Hình tấm";
  }

  return null;
}

// ── SURFACE TREATMENT ────────────────────────────────────────────────────────

const SURFACE_PATTERNS = [
  [/\b無电解|（無）|（无）$/i, () => "Không điện giải (無電解)"],
  [/\b三価?[黒铬]|BLACK\s*CR|NC\s*BLK/i, () => "三価黒クロム (NC-Black)"],
  [/\bCr\(0\)|CR$/i, () => "Cr (三価クロム)"],
  [/\bSW\+|SW\s*\+|表面.white/i, () => "SW+ (白)"],
  [/\bDAC[\s-]?(\d+)?/i, (m) => `DAC${m[1] ? '-' + m[1] : ''}`],
  [/\bDLC\b/i, () => "DLC (Diamond-Like Carbon)"],
  [/\bPVD\b/i, () => "PVD"],
  [/\bCVD\b/i, () => "CVD"],
  [/\b陽極|アノライズ|ALODINE/i, () => "陽極処理 (Alodine/Anodize)"],
  [/\b染め|ろいろ|黒染め/i, () => "染め (黒染め)"],
  [/\bニッケル|Nickel\s*Plate/i, () => "Ni (ニッケル鍍金)"],
  [/\bクロム|Chrome\s*Plating/i, () => "Cr (クロム鍍金)"],
  [/\bDW[\s-]?PW\b/i, () => "DW-PW"],
  [/\bTUFTRID/i, () => "TUFTRIDING"],
  [/\bQPQ\b/i, () => "QPQ"],
];

// ── HEAT TREATMENT ──────────────────────────────────────────────────────────

const HEAT_TREAT_PATTERNS = [
  [/\bQT-?(\d+)\b/i, (m) => `QT${m[1]}`],
  [/\bQuenching\s*(?:&|and)\s*Temper/i, () => "QT"],
  [/\b浸炭焼入れ|case\s*hard/i, () => "浸炭 (Carburizing)"],
  [/\b高周波| Induction\s*hard/i, () => "高周波 (Induction Hardening)"],
  [/\b焼ならし|Normalizing/i, () => "焼ならし (Normalizing)"],
  [/\b焼もどし|Tempering/i, () => "焼もどし (Tempering)"],
  [/\b焼入れ|Hardening/i, () => "焼入れ (Hardening)"],
  [/\b浸炭焼入れ|Carburizing/i, () => "浸炭焼入れ (Carburizing & Hardening)"],
  [/\b窒化|Nitriding/i, () => "窒化 (Nitriding)"],
  [/\bサブ\temper|subtemper/i, () => "サブテンパー (Sub-Temper)"],
  [/\bHRC\s*(\d+)\b/i, (m) => `HRC ${m[1]}`],
];

// ── TOLERANCE STANDARDS ─────────────────────────────────────────────────────

const TOLERANCE_PATTERNS = [
  [/\bJIS\s*B\s*0?4\d\d\b/i, () => "JIS B 0405"],
  [/\bISO\s*2768[_-]?m\b/i, () => "ISO 2768-m"],
  [/\bISO\s*2768[_-]?f\b/i, () => "ISO 2768-f"],
  [/\bANSI\s*Y14[\.\d]+\b/i, (m) => m[0].toUpperCase()],
  [/\bJIS\s*B\s*0?5\d\d\b/i, () => "JIS B 0419"],
  [/\b±\s*IT(\d+)\b/i, (m) => `±IT${m[1]}`],
  [/\b公差等级\s*([\w]+)\b/i, (m) => `公差 ${m[1]}`],
];

// ── PROCESS CODES ────────────────────────────────────────────────────────────

/**
 * Infer process code from shape + material + dimensions.
 * @param {object} partialData — drawing data with partial fields
 * @returns {{ ma_quy_trinh: string, reason: string }}
 */
export function inferProcessCode(partialData) {
  const { hinh_dang, vat_lieu, kich_thuoc, dung_sai_chung } = partialData;

  // Tròn xoay → QT1
  if (hinh_dang === "Tròn xoay") {
    return { ma_quy_trinh: "QT1110", reason: "tròn xoay mặc định 1 tiện 0 phay" };
  }

  // Tấm/Khối
  if (hinh_dang === "Hình tấm" || hinh_dang === "Khối") {
    // Extract dimension for size check
    const dims = kich_thuoc || "";
    const sizeMatch = dims.match(/(\d+)/g);
    const maxDim = sizeMatch ? Math.max(...sizeMatch.map(Number)) : 100;

    const isAluminum = /^(A|AL)/.test(vat_lieu || "");
    const isSteel = /^(S|SUS|SS|F[CQ])/.test(vat_lieu || "");

    // Small + soft material → QT2
    if (isAluminum || maxDim <= 50) {
      return { ma_quy_trinh: "QT2TN", reason: "nhôm hoặc kích thước nhỏ ≤50mm" };
    }

    // Medium steel → QT6
    if (isSteel && maxDim > 50 && maxDim <= 200) {
      return { ma_quy_trinh: "QT6TN", reason: "thép kích thước 50–200mm" };
    }

    // Large steel → QT4
    if (isSteel && maxDim > 200) {
      return { ma_quy_trinh: "QT4TN", reason: "thép kích thước >200mm" };
    }

    return { ma_quy_trinh: "QT6TN", reason: "mặc định tấm/khối" };
  }

  return { ma_quy_trinh: "", reason: "không xác định được hình dạng" };
}

// ── MAIN EXTRACTION API ─────────────────────────────────────────────────────

/**
 * Extract all rule-based fields from raw drawing text.
 * Used to: fill missing fields, validate AI output, measure confidence.
 *
 * @param {string} rawText — raw text from drawing (not AI result)
 * @param {object} aiResult — existing AI-parsed result (may have empty fields)
 * @returns {{ extracted: object, missing: string[], confidence: number }}
 */
export function extractWithRules(rawText, aiResult = {}) {
  const extracted = { ...aiResult };
  const missing = [];
  let confidence = 0;
  let fieldsFound = 0;

  // vat_lieu
  if (!extracted.vat_lieu || extracted.vat_lieu === "Không ghi trên bản vẽ") {
    for (const [pattern, resolver] of MATERIAL_PATTERNS) {
      const m = rawText.match(pattern);
      if (m) {
        const val = resolver(m);
        if (val) {
          extracted.vat_lieu = val;
          confidence += 2;
          fieldsFound++;
          break;
        }
      }
    }
  }

  if (!extracted.vat_lieu) missing.push("vat_lieu");

  // so_luong
  if (!extracted.so_luong || extracted.so_luong === 1) {
    for (const [pattern, resolver] of QUANTITY_PATTERNS) {
      const m = rawText.match(pattern);
      if (m) {
        const val = resolver(m);
        if (val && val > 0) {
          extracted.so_luong = val;
          confidence += 1;
          fieldsFound++;
          break;
        }
      }
    }
  }

  if (!extracted.so_luong) missing.push("so_luong");

  // xu_ly_be_mat
  if (!extracted.xu_ly_be_mat) {
    for (const [pattern, resolver] of SURFACE_PATTERNS) {
      if (pattern.test(rawText)) {
        extracted.xu_ly_be_mat = resolver();
        confidence += 1;
        fieldsFound++;
        break;
      }
    }
  }

  if (!extracted.xu_ly_be_mat) missing.push("xu_ly_be_mat");

  // xu_ly_nhiet
  if (!extracted.xu_ly_nhiet) {
    for (const [pattern, resolver] of HEAT_TREAT_PATTERNS) {
      if (pattern.test(rawText)) {
        extracted.xu_ly_nhiet = resolver();
        confidence += 1;
        fieldsFound++;
        break;
      }
    }
  }

  if (!extracted.xu_ly_nhiet) missing.push("xu_ly_nhiet");

  // dung_sai_chung
  if (!extracted.dung_sai_chung) {
    for (const [pattern, resolver] of TOLERANCE_PATTERNS) {
      if (pattern.test(rawText)) {
        extracted.dung_sai_chung = resolver();
        confidence += 1;
        fieldsFound++;
        break;
      }
    }
  }

  if (!extracted.dung_sai_chung) missing.push("dung_sai_chung");

  // hinh_dang — infer from dimension pattern
  if (!extracted.hinh_dang && extracted.kich_thuoc) {
    const shape = inferShape(extracted.kich_thuoc);
    if (shape) {
      extracted.hinh_dang = shape;
      confidence += 1;
      fieldsFound++;
    }
  }

  if (!extracted.hinh_dang) missing.push("hinh_dang");

  // Confidence score: 0-10
  // 7+ → high confidence (AI mostly agrees with rules)
  // 4-6 → medium (some fields missing or uncertain)
  // <4 → low (many fields missing, may need retry)
  const maxPossible = 8;
  const confidenceScore = Math.min(10, Math.round((confidence / maxPossible) * 10));

  return {
    extracted,
    missing,
    confidence: confidenceScore,
    fieldsFound,
    fieldsTotal: missing.length + fieldsFound,
  };
}

/**
 * Decide whether to retry with another AI model based on confidence.
 * @param {{ confidence: number, missing: string[] }} ruleResult
 * @returns {{ shouldRetry: boolean, reason: string }}
 */
export function shouldRetryWithAltModel(ruleResult) {
  const { confidence, missing } = ruleResult;

  // Always retry if core fields missing
  const criticalMissing = missing.filter((f) =>
    ["vat_lieu", "so_luong", "hinh_dang"].includes(f)
  );

  if (criticalMissing.length > 0) {
    return {
      shouldRetry: true,
      reason: `critical_missing:${criticalMissing.join(",")}`,
    };
  }

  // Retry if very low confidence
  if (confidence < 3) {
    return {
      shouldRetry: true,
      reason: `low_confidence:${confidence}`,
    };
  }

  // No retry needed
  return {
    shouldRetry: false,
    reason: "sufficient_confidence",
  };
}
