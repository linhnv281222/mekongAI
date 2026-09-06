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

// ── FEATURE PATTERNS ─────────────────────────────────────────────────────────

const FEATURE_PATTERNS = {
  // Standard holes: φ9×15, Ø12 depth 20, D9×15
  lo_thuong: [
    [/(?:φ|Ø|⌀|D)(\d+(?:\.\d+)?)\s*(?:×|x|depth|深さ)?\s*(\d+(?:\.\d+)?)/gi,
     (m) => ({
       type: 'lo_thuong',
       code: `D${Math.round(parseFloat(m[1]))}`,
       diameter: parseFloat(m[1]),
       depth: parseFloat(m[2])
     })],
  ],

  // Tapped holes: M6×1.0 depth 12, M8-6H
  lo_taro: [
    [/(M\d+)(?:×|x)?(\d+(?:\.\d+)?)?\s*(?:depth|深さ)?\s*(\d+(?:\.\d+)?)?/gi,
     (m) => ({
       type: 'lo_taro',
       code: m[1],
       diameter: parseInt(m[1].slice(1), 10),
       thread_pitch: m[2] ? parseFloat(m[2]) : null,
       depth: m[3] ? parseFloat(m[3]) : null
     })],
  ],

  // Tolerance holes: φ10H7, P6H7
  lo_dung_sai: [
    [/(?:φ|Ø|P)(\d+)([H|h|P|p]\d+)/gi,
     (m) => ({
       type: 'lo_dung_sai',
       code: `P${m[1]}${m[2].toUpperCase()}`,
       diameter: parseFloat(m[1]),
       tolerance: m[2].toUpperCase()
     })],
  ],

  // Counterbore: φ12×8 / φ8×20 (detect two-stage pattern)
  lo_bac: [
    [/(?:φ|Ø)(\d+(?:\.\d+)?)\s*×\s*(\d+(?:\.\d+)?)\s*\/\s*(?:φ|Ø)(\d+(?:\.\d+)?)\s*×\s*(\d+(?:\.\d+)?)/gi,
     (m) => ({
       type: 'lo_bac',
       code: `D${Math.round(parseFloat(m[1]))}B`,
       diameter_outer: parseFloat(m[1]),
       depth_outer: parseFloat(m[2]),
       diameter_inner: parseFloat(m[3]),
       depth_inner: parseFloat(m[4])
     })],
  ],

  // Countersink: ⌴φ10×90°
  lo_chim: [
    [/[⌴⌵](?:φ|Ø)?(\d+(?:\.\d+)?)\s*(?:×|x)?\s*(\d+)°?/gi,
     (m) => ({
       type: 'lo_chim',
       code: `D${Math.round(parseFloat(m[1]))}C`,
       diameter_outer: parseFloat(m[1]),
       angle: parseFloat(m[2])
     })],
  ],

  // Chamfers: C0.5, C1×45°
  vat_mep: [
    [/\bC(\d+(?:\.\d+)?)\s*(?:×|x)?\s*(\d+)?°?/gi,
     (m) => ({
       type: 'vat_mep',
       code: `C${m[1]}`,
       size: parseFloat(m[1]),
       angle: m[2] ? parseFloat(m[2]) : 45
     })],
    // Reverse notation: 0.5C
    [/(\d+(?:\.\d+)?)\s*C\b/gi,
     (m) => ({
       type: 'vat_mep',
       code: `C${m[1]}`,
       size: parseFloat(m[1]),
       angle: 45
     })],
  ],

  // Fillets: R2, R5
  bo_goc: [
    [/\bR(\d+(?:\.\d+)?)\b/gi,
     (m) => ({
       type: 'bo_goc',
       code: `R${m[1]}`,
       radius: parseFloat(m[1])
     })],
  ],

  // Surface finish: Ra3.2, Ra1.6
  surface_finish: [
    [/\bRa\s*(\d+(?:\.\d+)?)\b/gi,
     (m) => ({
       type: 'surface_finish',
       code: `Ra${m[1]}`,
       ra_value: parseFloat(m[1])
     })],
    [/\bRz\s*(\d+(?:\.\d+)?)\b/gi,
     (m) => ({
       type: 'surface_finish',
       code: `Rz${m[1]}`,
       rz_value: parseFloat(m[1])
     })],
    // Triangle symbols: ▽ = Ra12.5, ▽▽ = Ra6.3, ▽▽▽ = Ra3.2, ▽▽▽▽ = Ra1.6
    [/▽{1,4}/g,
     (m) => {
       const count = m[0].length;
       const raMap = { 1: 12.5, 2: 6.3, 3: 3.2, 4: 1.6 };
       return {
         type: 'surface_finish',
         code: `Ra${raMap[count]}`,
         ra_value: raMap[count]
       };
     }],
  ],

  // Keyway: Keyway 6×6×30, Then 8×7×50
  ranh_then: [
    [/(?:keyway|then|key)\s*(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)/gi,
     (m) => ({
       type: 'ranh_then',
       code: `KEY${Math.round(parseFloat(m[1]))}`,
       width: parseFloat(m[1]),
       depth: parseFloat(m[2]),
       length: parseFloat(m[3])
     })],
  ],

  // Pocket: Pocket 20×15×5
  pocket: [
    [/pocket\s*(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)/gi,
     (m) => ({
       type: 'pocket',
       code: 'PKT',
       length: parseFloat(m[1]),
       width: parseFloat(m[2]),
       depth: parseFloat(m[3]),
       shape: 'rectangular'
     })],
  ],

  // GD&T symbols: ⌖φ0.05 A, ⊥0.02 A
  gdt: [
    [/([⌖⊕⊥∥∠])(?:φ|Ø)?(\d+(?:\.\d+)?)\s*([A-Z])?/gi,
     (m) => {
       const symbolMap = {
         '⌖': 'position',
         '⊕': 'concentricity',
         '⊥': 'perpendicularity',
         '∥': 'parallelism',
         '∠': 'angularity'
       };
       return {
         type: 'gdt',
         symbol: m[1],
         symbol_name: symbolMap[m[1]] || 'unknown',
         tolerance: parseFloat(m[2]),
         datum: m[3] || null
       };
     }],
  ],
};

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

// ── FEATURE EXTRACTION API ──────────────────────────────────────────────────

/**
 * Extract CNC features from raw drawing text.
 * Used to: fill missing features, validate AI output.
 *
 * @param {string} rawText — raw text from drawing
 * @returns {{ features: object[], totalFound: number }}
 */
export function extractFeatures(rawText) {
  const features = [];
  const seenFeatures = new Set(); // Deduplicate by code+diameter+depth

  for (const [featureType, patterns] of Object.entries(FEATURE_PATTERNS)) {
    for (const [pattern, resolver] of patterns) {
      // Use matchAll for global patterns
      const matches = [...rawText.matchAll(pattern)];
      for (const m of matches) {
        try {
          const feature = resolver(m);
          if (feature) {
            // Deduplicate: same code+diameter+depth = same feature
            const key = `${feature.code || featureType}_${feature.diameter || 0}_${feature.depth || 0}_${feature.size || 0}_${feature.radius || 0}`;
            if (!seenFeatures.has(key)) {
              seenFeatures.add(key);
              features.push({
                ...feature,
                quantity: 1, // Default, AI should override with actual count
                lan_ga: null, // To be filled by AI or inference
                location: null, // To be filled by AI
              });
            }
          }
        } catch (e) {
          console.warn(`[extractFeatures] Pattern error for ${featureType}:`, e.message);
        }
      }
    }
  }

  return {
    features,
    totalFound: features.length,
  };
}

/**
 * Merge AI features with rule-extracted features.
 * Priority: AI > Rules (only fill missing)
 *
 * @param {object[]} aiFeatures — features from AI
 * @param {object[]} ruleFeatures — features from rules
 * @returns {object[]} merged features
 */
export function mergeFeatures(aiFeatures = [], ruleFeatures = []) {
  const merged = [...aiFeatures];
  const aiCodes = new Set(aiFeatures.map(f => f.code).filter(Boolean));

  // Add rule features that AI didn't find
  for (const ruleFeature of ruleFeatures) {
    if (!aiCodes.has(ruleFeature.code)) {
      merged.push({
        ...ruleFeature,
        source: 'rule_extraction',
      });
    }
  }

  return merged;
}

// ── MAIN EXTRACTION API ─────────────────────────────────────────────────────

/**
 * Extract all rule-based fields from raw drawing text.
 * Used to: fill missing fields, validate AI output, measure confidence.
 *
 * @param {string} rawText — raw text from drawing (not AI result)
 * @param {object} aiResult — existing AI-parsed result (may have empty fields)
 * @returns {{ extracted: object, missing: string[], confidence: number, features: object[] }}
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

  // Extract features from raw text
  const { features: ruleFeatures } = extractFeatures(rawText);

  // Merge with AI features if present
  const aiFeatures = extracted.features_cnc || [];
  const mergedFeatures = mergeFeatures(aiFeatures, ruleFeatures);

  if (mergedFeatures.length > 0) {
    extracted.features_cnc = mergedFeatures;
    confidence += Math.min(3, Math.floor(mergedFeatures.length / 2)); // Bonus for features
    fieldsFound += mergedFeatures.length;
  }

  // Confidence score: 0-10
  // 7+ → high confidence (AI mostly agrees with rules)
  // 4-6 → medium (some fields missing or uncertain)
  // <4 → low (many fields missing, may need retry)
  const maxPossible = 11; // Updated to account for features bonus
  const confidenceScore = Math.min(10, Math.round((confidence / maxPossible) * 10));

  return {
    extracted,
    missing,
    confidence: confidenceScore,
    fieldsFound,
    fieldsTotal: missing.length + fieldsFound,
    features: mergedFeatures,
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
