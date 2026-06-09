/**
 * Email pre-filter — rule-based classification BEFORE AI.
 * Catches obvious non-RFQ patterns to skip expensive AI classify call.
 *
 * Returns: { shouldSkip: boolean, reason: string, classify?: object }
 * When shouldSkip=true, caller should skip AI classify entirely.
 * When classify is set, use it directly instead of calling AI.
 */

// Patterns báo hiệu email không phải RFQ — không cần AI
const SPAM_PATTERNS = [
  /newsletter/i,
  /no\s*reply/i,
  /unsubscribe/i,
  /advertisement/i,
  /marketing/i,
  /^auto[_-]?reply/i,
  /^out\s*of\s*office/i,
  /^vacation/i,
  /^(do\s*not\s*reply|no\s*reply|absent)/i,
  /催款单|支払督促|invoice\s+overdue|overdue\s+payment/i,
];

const RFQ_KEYWORDS = [
  "見積依頼", "見積", "报价", "bao giá", "bao_gia",
  "quotation", "quote", "rfq", "request for quote",
  "加工依頼", "、加工", "切削依頼",
  "báo giá", "request quotation",
  "pricing", " ценовое предложение",
];

const REPLY_INDICATORS = [
  /^re:\s*/i, /^fw:\s*/i, /^trả lời:\s*/i, /^答复:\s*/i,
  /^fwd:\s*/i, /^trả lời\s/i,
];

// Acknowledgment-only patterns — not new RFQ
const ACKNOWLEDGE_PATTERNS = [
  /^(ok|okay|cảm ơn|thank|received|了解|承知|ありがとう|get\s*it|got\s*it|đã\s*nhận|đã\s*hiểu|done|đồng\s*ý|agree)$/i,
  /^cảm\s*ơn\s*bạn/i,
  /^thank\s*you\s*(so|very)\s*(much|much)/i,
  /^đã\s*(nhận|hiểu|xem)/i,
  /^ok[\s,、.。!！]*$/i,
  /^rất\s*tốt/i,
  /^no\s*problem/i,
];

// Reply-only body patterns
const QUOTED_REPLY_PATTERNS = [
  /^>/m,
  /^on \d/i,
  /^-{3,}$/m, // signature dash
  /^from:/m,
  /^sent:/m,
  /^date:/m,
];

// Thresholds
const MIN_BODY_CHARS_FOR_RFQ = 20;
const MAX_SUBJECT_CHARS = 300;

/**
 * Pre-filter an email before AI classification.
 * @param {object} emailData — { from, subject, body, attachments }
 * @returns {{ shouldSkip: boolean, reason: string, classify: object|null }}
 */
export function prefilterEmail(emailData) {
  const { from = "", subject = "", body = "", attachments = [] } = emailData;

  // 1. SPAM / AUTO-REPLY detection
  for (const pat of SPAM_PATTERNS) {
    if (pat.test(subject) || pat.test(from)) {
      return {
        shouldSkip: true,
        reason: `spam_pattern: ${pat.source}`,
        classify: {
          loai: "spam",
          ly_do: `Email match spam pattern: ${pat.source}`,
          ngon_ngu: detectLang(body),
          _prefiltered: true,
        },
      };
    }
  }

  // 2. SUBJECT: empty or gibberish → skip
  const cleanSubject = subject.trim();
  if (cleanSubject.length < 3) {
    return {
      shouldSkip: true,
      reason: "subject_too_short",
      classify: {
        loai: "hoi_tham",
        ly_do: "Subject quá ngắn, không phải RFQ",
        _prefiltered: true,
      },
    };
  }

  // 3. SUBJECT: truncation safety
  if (cleanSubject.length > MAX_SUBJECT_CHARS) {
    // Truncate but note it
  }

  // 4. REPLY detection — check subject first
  const isReplySubject = REPLY_INDICATORS.some((p) => p.test(cleanSubject));

  // 5. BODY: acknowledgment only → not RFQ (no AI needed)
  if (isReplySubject) {
    const stripped = stripQuotedAndSignature(body);
    const strippedClean = stripped.trim();

    // Check if stripped body is only acknowledgment
    for (const ack of ACKNOWLEDGE_PATTERNS) {
      if (ack.test(strippedClean)) {
        return {
          shouldSkip: true,
          reason: "ack_reply_only",
          classify: {
            loai: "hoi_tham",
            ly_do: "Reply chỉ là xác nhận, không có yêu cầu mới",
            ngon_ngu: detectLang(strippedClean),
            _prefiltered: true,
          },
        };
      }
    }

    // If body has no new meaningful content after stripping quoted parts
    if (strippedClean.length < MIN_BODY_CHARS_FOR_RFQ) {
      return {
        shouldSkip: true,
        reason: "reply_no_new_content",
        classify: {
          loai: "hoi_tham",
          ly_do: "Reply không có nội dung mới",
          ngon_ngu: detectLang(body),
          _prefiltered: true,
        },
      };
    }
  }

  // 6. BODY: no PDF attachment + not obvious RFQ keyword in subject → cheap pass-through
  const hasPdf = attachments.some((a) => String(a.name || "").toLowerCase().endsWith(".pdf"));
  const hasRfqKeyword = RFQ_KEYWORDS.some((kw) => {
    const s = cleanSubject.toLowerCase();
    return s.includes(kw.toLowerCase());
  });

  // No PDF + no RFQ keyword → likely not RFQ, still classify but lightweight
  // Flag as low-priority so classifier can deprioritize
  const lowPriority =
    !hasPdf && !hasRfqKeyword && body.trim().length < 100;

  if (lowPriority) {
    return {
      shouldSkip: false,
      reason: "low_priority_no_pdf",
      classify: {
        loai: "hoi_tham",
        ly_do: "Không có PDF và không có từ khóa RFQ, có thể hỏi thăm",
        ngon_ngu: detectLang(body),
        _prefiltered: true,
        _low_priority: true,
      },
    };
  }

  // 7. All checks pass — needs AI classification
  return {
    shouldSkip: false,
    reason: "needs_ai",
    classify: null,
  };
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

/** Strip quoted reply blocks and signature from email body */
function stripQuotedAndSignature(body) {
  if (!body) return "";
  let text = body;

  // Remove quoted lines (start with >)
  text = text
    .split("\n")
    .filter((l) => !l.trim().startsWith(">"))
    .join("\n");

  // Remove signature block
  const sigIdx = text.search(/^--\s*$/m);
  if (sigIdx !== -1) {
    text = text.slice(0, sigIdx).trim();
  }

  // Remove "On ... wrote:" blocks
  text = text.replace(/^on .+ wrote:.*$/gim, "");

  return text.trim();
}

/** Simple language detection for Vietnamese/Japanese/English */
function detectLang(text) {
  const t = text || "";
  // Japanese: Hanzi tự + katakana/hiragana
  if (/[會社會株丸形樣致す]/.test(t) || /[あ-んア-ン]/.test(t)) {
    return "ja";
  }
  // Vietnamese: dấu tiếng Việt
  if (/[ăâđêôơư]/i.test(t)) {
    return "vi";
  }
  return "en";
}

/**
 * Quick market detection for prefilter (no AI needed).
 * Returns VN | JP | US | EU | null
 */
export function prefilterMarket(emailData) {
  const { from = "", subject = "", body = "" } = emailData;
  const text = `${from} ${subject} ${body}`.toLowerCase();

  if (/@(gmail|yahoo|hotmail|outlook)\.(com|co\.jp|jp)/i.test(from)) {
    // Free email domain — try to infer from domain
    if (/\.co\.jp$|\.jp$/i.test(from)) return "JP";
    if (/\.vn$/i.test(from)) return "VN";
    return null;
  }

  // Japanese company patterns
  if (/株式会社|\.jp$|\.co\.jp$/i.test(text)) return "JP";

  // Vietnam patterns
  if (/\.vn$/i.test(text) || /việt nam|vietnam|hn?|hồ chí minh/i.test(text)) {
    return "VN";
  }

  return null;
}
