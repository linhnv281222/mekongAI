const { useState, useRef, useEffect, useLayoutEffect } = React;
const API = "";

/** Tự làm mới danh sách job (nhẹ hơn WebSocket; đủ cho agent vài chục giây/lần quét) */
const JOBS_POLL_MS = 8000;

// Không dùng mock — chỉ lấy data từ backend

// ── Date formatters ──
function fmtDDMMHHmm(iso) {
  const d = iso != null ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function fmtDDMM(iso) {
  const d = iso != null ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** Giá trị cho <input type="date"> (bắt buộc YYYY-MM-DD). */
function toDateInputValue(raw) {
  if (raw == null || raw === "") return "";
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const yyyy = parseInt(m[3], 10);
    const dt = new Date(yyyy, mm - 1, dd);
    if (!Number.isNaN(dt.getTime())) {
      return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(
        2,
        "0"
      )}`;
    }
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function parseHanGiaoToDate(raw) {
  const iso = toDateInputValue(raw);
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  return new Date(y, m - 1, d);
}

/** Thời hạn báo giá: Flatpickr — dd/mm/yyyy + lịch (không dùng input type=date native). */
function HanGiaoFlatpickr({ email }) {
  const inputRef = useRef(null);
  const fpRef = useRef(null);

  useEffect(() => {
    if (typeof window.flatpickr !== "function") return;
    const el = inputRef.current;
    if (!el) return;

    if (fpRef.current) {
      fpRef.current.destroy();
      fpRef.current = null;
    }

    const defaultDate = parseHanGiaoToDate(email.han_giao);
    const locale =
      window.flatpickr.l10ns && window.flatpickr.l10ns.vn
        ? window.flatpickr.l10ns.vn
        : undefined;

    fpRef.current = window.flatpickr(el, {
      dateFormat: "d/m/Y",
      defaultDate: defaultDate || undefined,
      allowInput: true,
      disableMobile: true,
      locale,
    });

    return () => {
      if (fpRef.current) {
        fpRef.current.destroy();
        fpRef.current = null;
      }
    };
  }, [email.jobId, email.id, email.han_giao]);

  return (
    <div className="f">
      <label>
        Thời hạn báo giá <span className="ai-mark">AI</span>
      </label>
      <input
        ref={inputRef}
        type="text"
        className="ai"
        placeholder="dd/mm/yyyy"
        autoComplete="off"
      />
    </div>
  );
}

/** Một dòng bảng từ kết quả /drawings hoặc drawings trong job (API dùng klPhoiKg hoặc kl_phoi_kg). */
function drawingToLine(r, indexHint) {
  const d = r.data || {};
  const kl = d.khoi_luong || {};
  const klRaw = kl.kl_phoi_kg ?? kl.klPhoiKg;
  let klNum = null;
  if (klRaw != null && klRaw !== "") {
    const n =
      typeof klRaw === "number"
        ? klRaw
        : parseFloat(String(klRaw).replace(",", "."));
    if (!Number.isNaN(n)) klNum = n;
  }
  return {
    id: r.id != null ? r.id : Date.now() + indexHint,
    page: r.page != null ? r.page : indexHint + 1,
    ma_ban_ve: d.ban_ve?.ma_ban_ve || (r.page != null ? `Trang ${r.page}` : ""),
    so_luong: d.san_xuat?.so_luong ?? 1,
    ma_nvl: d.vat_lieu?.ma || "",
    kl_phoi: klNum,
  };
}

function formatKlCell(v) {
  if (v == null || v === "") return "—";
  const n = typeof v === "number" ? v : parseFloat(v);
  if (Number.isNaN(n)) return "—";
  return n.toFixed(3);
}

function inferClassifyOutputFromJob(j) {
  if (!j || typeof j !== "object") return null;
  const o = {};
  if (j.classify != null && j.classify !== "") o.loai = j.classify;
  if (j.ngon_ngu != null && j.ngon_ngu !== "") o.ngon_ngu = j.ngon_ngu;
  if (j.han_giao != null && j.han_giao !== "") o.han_giao_hang = j.han_giao;
  if (j.hinh_thuc_giao != null && j.hinh_thuc_giao !== "") {
    o.hinh_thuc_giao = j.hinh_thuc_giao;
  }
  if (j.xu_ly_be_mat !== undefined && j.xu_ly_be_mat !== null) {
    o.xu_ly_be_mat = j.xu_ly_be_mat;
  }
  if (j.vat_lieu_chung_nhan !== undefined && j.vat_lieu_chung_nhan !== null) {
    o.vat_lieu_chung_nhan = j.vat_lieu_chung_nhan;
  }
  const ten = j.ten_cong_ty ?? j.ten_kh;
  if (ten != null && ten !== "") o.ten_cong_ty = ten;
  const ghi = j.ghi_chu ?? j.body;
  if (ghi != null && ghi !== "") o.ghi_chu = ghi;
  return Object.keys(o).length ? o : null;
}

function normalizeClassifyOutputFromJob(j) {
  let raw = j?.classify_output;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw;
  }
  return inferClassifyOutputFromJob(j);
}

function mapJobRowToEmail(j) {
  return {
    id: j.id,
    from: j.sender || "Agent",
    email: j.sender_email || "",
    subject: j.subject,
    preview: j.preview_label || `${j.lines_count || 0} trang đã đọc`,
    body: "",
    time: (() => {
      const d = j.created_at != null ? new Date(j.created_at) : null;
      return d && !Number.isNaN(d.getTime())
        ? d.toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "—";
    })(),
    date: fmtDDMMHHmm(j.created_at),
    created_at: j.created_at,
    attachments: j.attachments || [],
    classify: j.classify,
    ngon_ngu: j.ngon_ngu,
    ten_kh: j.ten_cong_ty || j.sender || "",
    han_giao: j.han_giao != null && j.han_giao !== "" ? j.han_giao : null,
    hinh_thuc_giao: j.hinh_thuc_giao || null,
    xu_ly_be_mat: j.xu_ly_be_mat ?? null,
    vat_lieu_chung_nhan: j.vat_lieu_chung_nhan ?? null,
    classify_output: normalizeClassifyOutputFromJob(j),
    drawings: [],
    jobId: j.id,
    unread: j.status === "pending_review",
    _agent: true,
    _needLoad: true,
  };
}

function mergeAgentIntoInbox(agentEmails, prev) {
  const nonAgent = prev.filter((e) => !e._agent);
  const loadedById = new Map();
  for (const e of prev) {
    if (e._agent && !e._needLoad && (e.jobId || e.id)) {
      loadedById.set(e.jobId || e.id, e);
    }
  }
  const merged = agentEmails.map((a) => {
    const kept = loadedById.get(a.jobId);
    if (!kept) return a;
    return {
      ...kept,
      preview: a.preview,
      time: a.time,
      date: a.date,
      unread: a.unread,
      attachments: a.attachments?.length > 0 ? a.attachments : kept.attachments,
    };
  });
  return [...merged, ...nonAgent];
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function LTag({ lg }) {
  const m = {
    ja: ["🇯🇵 Nhật", "t-ja"],
    vi: ["🇻🇳 Việt", "t-vi"],
    en: ["🇺🇸 Anh", "t-en"],
  };
  const [l, c] = m[lg] || ["?", "t-skip"];
  return <span className={`tag ${c}`}>{l}</span>;
}

function GuidePanel({ inboxEmail }) {
  /* Mặc định thu gọn — ưu tiên danh sách mail; mở rộng khi user bấm (nhớ theo phiên) */
  const [open, setOpen] = useState(
    () => sessionStorage.getItem("v3guideExpanded") === "1"
  );
  const [toast, setToast] = useState(false);

  function toggle() {
    const n = !open;
    setOpen(n);
    sessionStorage.setItem("v3guideExpanded", n ? "1" : "0");
  }

  async function copyEmail(e) {
    e.stopPropagation();
    if (!inboxEmail) return;
    try {
      await navigator.clipboard.writeText(inboxEmail);
      setToast(true);
      setTimeout(() => setToast(false), 2200);
    } catch (_) {}
  }

  return (
    <>
      <div className={`guide-card${open ? "" : " guide-card--closed"}`}>
        <div
          className="guide-card-hd"
          onClick={toggle}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggle();
            }
          }}
          role="button"
          tabIndex={0}
          aria-expanded={open}
        >
          <div className="guide-card-title">
            <span aria-hidden="true">📬</span>
            Cách gửi yêu cầu báo giá
          </div>
          <span className={`guide-chevron${open ? " is-open" : ""}`}>▼</span>
        </div>
        <div className={`guide-card-body${open ? "" : " is-collapsed"}`}>
          <p className="guide-lead">
            Gửi email <strong>tới hộp thư</strong> bên dưới. Agent đọc mail,
            phân loại RFQ và trích xuất dữ liệu bản vẽ — kết quả hiện trong danh
            sách bên dưới.
          </p>
          <div className="guide-email-row">
            <span
              className={
                inboxEmail
                  ? "guide-email"
                  : "guide-email guide-email-placeholder"
              }
            >
              {inboxEmail || "Chưa cấu hình GMAIL_USER trên server"}
            </span>
            {inboxEmail ? (
              <button type="button" className="btn-copy" onClick={copyEmail}>
                Sao chép
              </button>
            ) : null}
          </div>
          <ol className="guide-steps">
            <li>
              Đặt tiêu đề rõ ràng (vd: <em>Yêu cầu báo giá — mã chi tiết</em>).
            </li>
            <li>
              <strong>Đính kèm PDF bản vẽ</strong> (nhiều file hoặc nhiều trang
              trong một file đều được).
            </li>
            <li>
              Mail cần <strong>chưa đọc</strong> và có đính kèm. Hệ thống quét
              định kỳ — thường vài chục giây sẽ thấy mục mới.
            </li>
            <li>
              Gửi đúng địa chỉ <strong>To</strong> như trên (theo cấu hình Gmail
              nhận).
            </li>
          </ol>
          <p className="guide-footnote">
            Kiểm tra tab <strong>Thông tin chung</strong> và{" "}
            <strong>Danh sách bản vẽ</strong>, chỉnh sửa nếu cần, rồi xác nhận
            hoặc Push ERP.
          </p>
        </div>
      </div>
      <div className={`toast-copy${toast ? " is-on" : ""}`} role="status">
        Đã sao chép địa chỉ email
      </div>
    </>
  );
}

// ── MAILBOX ───────────────────────────────────────────────────────────────────
function Mailbox({ emails, active, onSelect }) {
  const [q, setQ] = useState("");
  const list = emails.filter(
    (e) =>
      !q ||
      e.from.toLowerCase().includes(q.toLowerCase()) ||
      e.subject.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <div className="mailbox">
      <div className="mb-hd">
        <div className="mb-title">
          Yêu cầu gần đây
          <span className="mb-cnt">
            {emails.filter((e) => e.unread).length}
          </span>
        </div>
      </div>
      <div className="mb-search">
        <input
          placeholder="Tìm email..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="mb-list">
        {list.map((e) => (
          <div
            key={e.jobId || e.id}
            className={`ei${active?.id === e.id ? " active" : ""}`}
            onClick={() => onSelect(e)}
          >
            <div className="ei-r1">
              {e.unread && <div className="ei-dot" />}
              <div className="ei-from">{e.from}</div>
              <div className="ei-time">{e.time}</div>
            </div>
            <div className="ei-subj">{e.subject}</div>
            <div className="ei-prev">{e.preview}</div>
            <div className="ei-tags">
              {e.classify === "rfq" ? (
                <span className="tag t-rfq">✓ RFQ</span>
              ) : (
                <span className="tag t-skip">{e.classify}</span>
              )}
              <LTag lg={e.ngon_ngu} />
              {e.attachments?.length > 0 && (
                <span className="tag t-pdf">📎 {e.attachments.length}</span>
              )}
              {e._agent && <span className="tag t-agent">⚡ Agent</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Giá trị hiển thị: ưu tiên JSON phân loại (classify_output), fallback cột job cũ ──
function resolveClassifyValue(email, key, defaultValue) {
  const co = email.classify_output;
  if (co && Object.prototype.hasOwnProperty.call(co, key)) {
    return co[key];
  }
  if (
    key === "han_giao_hang" &&
    email.han_giao != null &&
    email.han_giao !== ""
  ) {
    return email.han_giao;
  }
  if (key === "hinh_thuc_giao" && email.hinh_thuc_giao != null) {
    return email.hinh_thuc_giao;
  }
  if (key === "xu_ly_be_mat" && email.xu_ly_be_mat != null) {
    return email.xu_ly_be_mat;
  }
  return defaultValue;
}

function humanizeClassifyKey(k) {
  if (!k || typeof k !== "string") return k;
  return k
    .split("_")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join(" ");
}

function collectSchemaKeys(generalRows) {
  const keys = new Set();
  for (const row of generalRows || []) {
    for (const cell of row.cells || []) {
      if (cell.key) keys.add(cell.key);
      if (cell.showWhenKey) keys.add(cell.showWhenKey);
    }
  }
  return keys;
}

function truthyClassify(v) {
  if (v == null || v === false) return false;
  if (typeof v === "string") return v.trim().length > 0;
  return true;
}

function inferExtraFieldType(val) {
  if (typeof val === "boolean") return "boolean";
  if (typeof val === "number" && Number.isFinite(val)) return "number";
  if (val != null && typeof val === "object") return "json";
  const s = val == null ? "" : String(val);
  if (s.length > 120) return "textarea";
  return "text";
}

/** Phần 1 Thông tin chung — theo schema + field thừa trong classify_output */
function ClassifyGeneralBody({ email, schema, F }) {
  const rows = schema?.generalRows;
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const hidden = new Set(schema.hiddenKeys || []);
  const schemaKeys = collectSchemaKeys(rows);
  const co =
    email.classify_output && typeof email.classify_output === "object"
      ? email.classify_output
      : null;

  function renderCell(cell, rowIdx, cellIdx) {
    const rk = `${rowIdx}_${cellIdx}`;
    if (cell.kind === "builtin" && cell.id === "received_at") {
      return (
        <F
          key={rk}
          label="Thời điểm nhận yêu cầu"
          val={email.date}
          ai
          type="text"
          ro
        />
      );
    }
    if (cell.kind === "date_han_giao") {
      return <HanGiaoFlatpickr key={rk} email={email} />;
    }
    if (
      cell.showWhenKey &&
      !truthyClassify(resolveClassifyValue(email, cell.showWhenKey))
    ) {
      return null;
    }
    const defVal =
      cell.defaultValue !== undefined ? cell.defaultValue : undefined;
    const rawVal = resolveClassifyValue(email, cell.key, defVal);
    if (cell.hideIfEmpty && (rawVal == null || rawVal === "")) {
      return null;
    }

    const showAi =
      cell.ai === true ||
      (cell.ai === "auto" &&
        co &&
        Object.prototype.hasOwnProperty.call(co, cell.key) &&
        co[cell.key] != null &&
        co[cell.key] !== "");

    if (cell.type === "shipping") {
      const hasShip = truthyClassify(rawVal);
      return (
        <div className="f" key={rk}>
          <label>
            {cell.label} {showAi ? <span className="ai-mark">AI</span> : null}
          </label>
          <div className="radio-row">
            <label>
              <input
                type="radio"
                name={`vc_${email.id}_${rowIdx}`}
                defaultChecked={hasShip}
              />{" "}
              Có
            </label>
            <label>
              <input
                type="radio"
                name={`vc_${email.id}_${rowIdx}`}
                defaultChecked={!hasShip}
              />{" "}
              Không
            </label>
          </div>
        </div>
      );
    }

    if (cell.type === "boolean") {
      const isTrue = rawVal === true;
      const name = `bool_${cell.key}_${email.id}_${rowIdx}_${cellIdx}`;
      return (
        <div className="f" key={rk}>
          <label>
            {cell.label} {showAi ? <span className="ai-mark">AI</span> : null}
          </label>
          <div className="radio-row">
            <label>
              <input type="radio" name={name} defaultChecked={isTrue} /> Có
            </label>
            <label>
              <input type="radio" name={name} defaultChecked={!isTrue} /> Không
            </label>
          </div>
        </div>
      );
    }

    if (cell.type === "select") {
      const opts = ["", ...(cell.options || [])];
      const optObjs = opts.map((o) =>
        typeof o === "string" ? { v: o, l: o || "— Chọn —" } : o
      );
      return (
        <F
          key={rk}
          label={cell.label}
          val={rawVal || ""}
          ai={showAi}
          type="select"
          opts={optObjs}
        />
      );
    }

    if (cell.type === "textarea") {
      return (
        <div className="f" key={rk}>
          <label>
            {cell.label}
            {showAi ? <span className="ai-mark">AI</span> : null}
          </label>
          <textarea
            className={`ta-field ta-field--notes${showAi ? " ai" : ""}`}
            rows={cell.rows || 3}
            defaultValue={rawVal == null ? "" : String(rawVal)}
          />
        </div>
      );
    }

    const strVal =
      rawVal == null || rawVal === ""
        ? ""
        : typeof rawVal === "object"
        ? JSON.stringify(rawVal, null, 2)
        : String(rawVal);
    return (
      <F
        key={rk}
        label={cell.label}
        val={strVal}
        ai={showAi}
        type={cell.type === "number" ? "number" : "text"}
      />
    );
  }

  const out = [];
  rows.forEach((row, ri) => {
    const layout = row.layout || "fg-1";
    const cells = (row.cells || [])
      .map((c, ci) => renderCell(c, ri, ci))
      .filter(Boolean);
    if (cells.length === 0) return;
    out.push(
      <div
        key={`row_${ri}`}
        className={`fg ${layout}`}
        style={{ marginBottom: 12 }}
      >
        {cells}
      </div>
    );
  });

  if (schema.appendUnknownClassifyKeys && co) {
    const extraKeys = Object.keys(co)
      .filter((k) => !hidden.has(k) && !schemaKeys.has(k))
      .sort();
    extraKeys.forEach((key) => {
      const val = co[key];
      const t = inferExtraFieldType(val);
      const label = humanizeClassifyKey(key);
      const ek = `extra_${key}`;
      if (t === "boolean") {
        const isTrue = val === true;
        out.push(
          <div key={ek} className="fg fg-1" style={{ marginBottom: 12 }}>
            <div className="f">
              <label>
                {label} <span className="ai-mark">AI</span>
              </label>
              <div className="radio-row">
                <label>
                  <input
                    type="radio"
                    name={`ex_${key}_${email.id}`}
                    defaultChecked={isTrue}
                  />{" "}
                  Có
                </label>
                <label>
                  <input
                    type="radio"
                    name={`ex_${key}_${email.id}`}
                    defaultChecked={!isTrue}
                  />{" "}
                  Không
                </label>
              </div>
            </div>
          </div>
        );
        return;
      }
      if (t === "json" || t === "textarea") {
        const txt =
          t === "json" ? JSON.stringify(val, null, 2) : String(val ?? "");
        out.push(
          <div key={ek} className="fg fg-1" style={{ marginBottom: 12 }}>
            <div className="f">
              <label>
                {label} <span className="ai-mark">AI</span>
              </label>
              <textarea
                className="ta-field ta-field--notes ai"
                rows={6}
                defaultValue={txt}
              />
            </div>
          </div>
        );
        return;
      }
      out.push(
        <div key={ek} className="fg fg-1" style={{ marginBottom: 12 }}>
          <F
            label={label}
            val={val == null ? "" : String(val)}
            ai
            type={t === "number" ? "number" : "text"}
          />
        </div>
      );
    });
  }

  return <>{out}</>;
}

// ── TAB 1: THÔNG TIN CHUNG ───────────────────────────────────────────────────
function Tab1({ email, classifyUiSchema }) {
  const F = ({ label, val, ai, type = "text", opts, ro }) => (
    <div className="f">
      <label>
        {label}
        {ai && <span className="ai-mark">AI</span>}
      </label>
      {type === "select" ? (
        <select className={ai && val ? "ai" : ""} defaultValue={val || ""}>
          {opts?.map((o) => (
            <option key={o.v || o}>{o.l || o}</option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          className={`${ai && val ? "ai" : ""}${ro ? " ro" : ""}`}
          defaultValue={val || ""}
          readOnly={ro}
        />
      )}
    </div>
  );

  return (
    <div className="form-wrap" key={email.jobId || email.id}>
      {/* Thông tin chung */}
      <div className="section">
        <div className="sec-hd">
          <span className="sec-num">1</span>
          <span className="sec-title">Thông tin chung</span>
        </div>
        <div className="sec-body">
          {classifyUiSchema?.generalRows?.length ? (
            <ClassifyGeneralBody
              email={email}
              schema={classifyUiSchema}
              F={F}
            />
          ) : (
            <>
              <div className="fg fg-2" style={{ marginBottom: 12 }}>
                <F
                  label="Thời điểm nhận yêu cầu"
                  val={email.date}
                  ai
                  type="text"
                  ro
                />
                <HanGiaoFlatpickr email={email} />
              </div>
              <div className="fg fg-3" style={{ marginBottom: 12 }}>
                <div className="f">
                  <label>
                    Vận chuyển <span className="ai-mark">AI</span>
                  </label>
                  <div className="radio-row">
                    <label>
                      <input
                        type="radio"
                        name={`vc_${email.id}`}
                        defaultChecked={!!email.hinh_thuc_giao}
                      />{" "}
                      Có
                    </label>
                    <label>
                      <input
                        type="radio"
                        name={`vc_${email.id}`}
                        defaultChecked={!email.hinh_thuc_giao}
                      />{" "}
                      Không
                    </label>
                  </div>
                </div>
                <div className="f">
                  <label>
                    Xử lý bề mặt <span className="ai-mark">AI</span>
                  </label>
                  <div className="radio-row">
                    <label>
                      <input
                        type="radio"
                        name={`xlbm_${email.id}`}
                        defaultChecked={email.xu_ly_be_mat === true}
                      />{" "}
                      Có
                    </label>
                    <label>
                      <input
                        type="radio"
                        name={`xlbm_${email.id}`}
                        defaultChecked={email.xu_ly_be_mat !== true}
                      />{" "}
                      Không
                    </label>
                  </div>
                </div>
                <div className="f">
                  <label>VAT</label>
                  <div className="radio-row">
                    <label>
                      <input
                        type="radio"
                        name={`vat_${email.id}`}
                        defaultChecked
                      />{" "}
                      Có
                    </label>
                    <label>
                      <input type="radio" name={`vat_${email.id}`} /> Không
                    </label>
                  </div>
                </div>
              </div>
              {email.hinh_thuc_giao && (
                <F
                  label="Phương thức vận chuyển"
                  val={email.hinh_thuc_giao}
                  ai
                  type="select"
                  opts={[
                    "",
                    "FedEx International Economy",
                    "FedEx International Priority",
                    "DHL",
                    "Tự vận chuyển",
                  ]}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Khách hàng */}
      <div className="section">
        <div className="sec-hd">
          <span className="sec-num">2</span>
          <span className="sec-title">Thông tin khách hàng</span>
        </div>
        <div className="sec-body">
          <div className="fg fg-2">
            <F label="Tên khách hàng" val={email.ten_kh || email.from} ai />
            <F label="Email" val={email.email} ai />
          </div>
        </div>
      </div>

      {/* Ghi chú */}
      <div className="section">
        <div className="sec-hd">
          <span className="sec-num">3</span>
          <span className="sec-title">Ghi chú</span>
        </div>
        <div className="sec-body">
          <div className="fg fg-2">
            <div className="f">
              <label>
                Nội dung email <span className="ai-mark">AI</span>
              </label>
              <textarea
                className="ta-field ta-field--notes ai"
                rows={7}
                defaultValue={email.body}
              />
            </div>
            <div className="f">
              <label>Ghi chú nội bộ</label>
              <textarea
                className="ta-field ta-field--notes"
                rows={7}
                defaultValue={`Tạo tự động bởi Mekong AI — ${new Date().toLocaleString(
                  "vi-VN"
                )}`}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── TAB 2: DANH SÁCH BẢN VẼ ──────────────────────────────────────────────────
function Tab2({
  lines,
  setLines,
  processing,
  progress,
  onUpload,
  onPreviewFile,
  previewSrc,
  previewName,
  previewLoading,
}) {
  const fileRef = useRef(null);
  const bvSplitRef = useRef(null);
  const bvMainRef = useRef(null);
  const bvPreviewRef = useRef(null);

  /** Split.js — kéo ranh giới bảng (trái) | xem trước (phải); chỉ layout ngang ≥961px */
  useLayoutEffect(() => {
    const mq = window.matchMedia("(min-width: 961px)");
    let cancelled = false;

    function bindBvSplit() {
      if (bvSplitRef.current) {
        bvSplitRef.current.destroy();
        bvSplitRef.current = null;
      }
      if (
        !mq.matches ||
        typeof window.Split !== "function" ||
        !bvMainRef.current ||
        !bvPreviewRef.current
      ) {
        return;
      }
      bvSplitRef.current = window.Split(
        [bvMainRef.current, bvPreviewRef.current],
        {
          sizes: [58, 42],
          minSize: [220, 240],
          gutterSize: 6,
          cursor: "col-resize",
          snapOffset: 0,
          dragInterval: 1,
        }
      );
    }

    function scheduleBind() {
      requestAnimationFrame(() => {
        if (cancelled) return;
        requestAnimationFrame(() => {
          if (!cancelled) bindBvSplit();
        });
      });
    }

    scheduleBind();
    mq.addEventListener("change", scheduleBind);
    return () => {
      cancelled = true;
      mq.removeEventListener("change", scheduleBind);
      if (bvSplitRef.current) {
        bvSplitRef.current.destroy();
        bvSplitRef.current = null;
      }
    };
  }, [lines.length]);

  const totalSL = lines.reduce(
    (s, l) => s + (parseInt(l.so_luong, 10) || 0),
    0
  );
  const totalKL = lines
    .reduce((s, l) => {
      const n = parseFloat(l.kl_phoi);
      return s + (Number.isNaN(n) ? 0 : n);
    }, 0)
    .toFixed(3);

  function onFileInputChange(e) {
    const f = e.target.files[0];
    if (f) {
      onPreviewFile?.(f);
      onUpload(f);
    }
    e.target.value = "";
  }

  return (
    <div className="bv-wrap">
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,application/pdf,image/*"
        style={{ display: "none" }}
        onChange={onFileInputChange}
      />
      {/* Toolbar */}
      <div className="bv-toolbar">
        <button className="btn btn-o" onClick={() => fileRef.current?.click()}>
          📎 Upload PDF / ảnh bản vẽ
        </button>
        {processing && (
          <span style={{ fontSize: 12, color: "var(--v3-brand2)" }}>
            <span className="spin">⟳</span> AI đang đọc bản vẽ...
          </span>
        )}
        <div
          style={{ marginLeft: "auto", fontSize: 12, color: "var(--v3-muted)" }}
        >
          Mỗi trang PDF = 1 bản vẽ · AI tự động đọc
        </div>
      </div>

      {/* Progress */}
      {processing && (
        <div className="prog-wrap">
          <div className="prog-txt">
            <span className="spin">⟳</span>
            Đang phân tích... {progress}%
          </div>
          <div className="prog-bar">
            <div className="prog-fill" style={{ width: progress + "%" }} />
          </div>
        </div>
      )}

      {/* Summary */}
      {lines.length > 0 && (
        <div className="sum-bar">
          <span>
            <b>{lines.length}</b> bản vẽ
          </span>
          <span>·</span>
          <span>
            Tổng SL: <b>{totalSL.toLocaleString()} PCS</b>
          </span>
          <span>·</span>
          <span>
            Tổng KL phôi:{" "}
            <b style={{ color: "var(--v3-brand2)" }}>{totalKL} KG</b>
          </span>
        </div>
      )}

      <div className="bv-split">
        <div ref={bvMainRef} className="bv-split-main">
          {/* Table hoặc upload zone */}
          <div className="bv-table-wrap">
            {lines.length === 0 ? (
              <div
                className="upload-zone"
                onClick={() => fileRef.current?.click()}
              >
                <div style={{ fontSize: 36, marginBottom: 10 }}>📄</div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--v3-muted)",
                    marginBottom: 5,
                  }}
                >
                  Upload PDF / ảnh bản vẽ
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--v3-faint)",
                    marginBottom: 4,
                  }}
                >
                  PDF nhiều trang — mỗi trang = 1 bản vẽ · ảnh xem trước bên
                  phải
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--v3-brand2)",
                    fontWeight: 500,
                  }}
                >
                  ⚡ AI tự động đọc và bóc tách dữ liệu
                </div>
              </div>
            ) : (
              <table className="bv-tbl">
                <thead>
                  <tr>
                    <th style={{ width: 42, textAlign: "center" }}>STT</th>
                    <th style={{ width: 42, textAlign: "center" }}>Trang</th>
                    <th>Mã bản vẽ</th>
                    <th style={{ width: 90, textAlign: "right" }}>Số lượng</th>
                    <th style={{ width: 130 }}>Mã NVL</th>
                    <th style={{ width: 90, textAlign: "right" }}>
                      KL phôi (kg)
                    </th>
                    <th style={{ width: 50 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={l.id || i}>
                      <td className="cell-num">{i + 1}</td>
                      <td className="cell-num">{l.page || "—"}</td>
                      <td>
                        <input
                          style={{
                            border: "none",
                            background: "transparent",
                            fontFamily: "var(--v3-mono)",
                            fontSize: 12.5,
                            fontWeight: 700,
                            color: "var(--v3-brand2)",
                            outline: "none",
                            width: "100%",
                            padding: "2px 0",
                          }}
                          defaultValue={l.ma_ban_ve}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((x, j) =>
                                j === i
                                  ? { ...x, ma_ban_ve: e.target.value }
                                  : x
                              )
                            )
                          }
                        />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <input
                          type="number"
                          style={{
                            border: "none",
                            background: "transparent",
                            fontSize: 12.5,
                            fontWeight: 600,
                            color: "var(--v3-ink)",
                            textAlign: "right",
                            outline: "none",
                            width: "100%",
                            padding: "2px 0",
                          }}
                          defaultValue={l.so_luong}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((x, j) =>
                                j === i ? { ...x, so_luong: e.target.value } : x
                              )
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          style={{
                            border: "none",
                            background: "transparent",
                            fontFamily: "var(--v3-mono)",
                            fontSize: 12.5,
                            fontWeight: 700,
                            color: "var(--v3-green)",
                            outline: "none",
                            width: "100%",
                            padding: "2px 0",
                          }}
                          defaultValue={l.ma_nvl}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((x, j) =>
                                j === i ? { ...x, ma_nvl: e.target.value } : x
                              )
                            )
                          }
                        />
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          fontFamily: "var(--v3-mono)",
                          fontSize: 12,
                          color: "var(--v3-amber)",
                        }}
                      >
                        {formatKlCell(l.kl_phoi)}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--v3-red)",
                            cursor: "pointer",
                            fontSize: 14,
                          }}
                          onClick={() =>
                            setLines((prev) => prev.filter((_, j) => j !== i))
                          }
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <aside
          ref={bvPreviewRef}
          className="bv-split-preview"
          aria-label="Xem trước file đính kèm"
          aria-busy={previewLoading ? "true" : "false"}
        >
          <div className="bv-preview-header">
            {previewName ? (
              <span className="bv-preview-filename" title={previewName}>
                📄 {previewName}
              </span>
            ) : (
              <span className="bv-preview-filename bv-preview-filename--empty">
                Chưa chọn file
              </span>
            )}
          </div>
          <div className="bv-preview-body">
            {previewLoading && (
              <div className="bv-preview-loading" role="status">
                <span
                  className="bv-preview-loading-spin spin"
                  aria-hidden="true"
                >
                  ⟳
                </span>
                <span>Đang tải bản xem trước…</span>
              </div>
            )}
            {previewSrc ? (
              <iframe
                title={previewName || "Xem trước PDF hoặc ảnh"}
                className="bv-preview-frame"
                src={previewSrc}
              />
            ) : (
              !previewLoading && (
                <div className="bv-preview-empty">
                  <div>
                    Bấm <strong>📎</strong> trên tag file ở đầu email để xem
                    trực tiếp trên Gmail.
                    <br />
                    Hoặc <strong>Upload</strong> PDF/ảnh để xem tại đây.
                  </div>
                </div>
              )
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ── RIGHT PANEL ───────────────────────────────────────────────────────────────
function Right({ email, setEmails, classifyUiSchema }) {
  const [tab, setTab] = useState(0);
  const [lines, setLines] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [previewSrc, setPreviewSrc] = useState(null);
  const [previewName, setPreviewName] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewLoadGen = useRef(0);

  // Reset tab + xóa preview blob khi chọn job khác
  useEffect(() => {
    setTab(0);
    previewLoadGen.current += 1;
    setPreviewLoading(false);
    setPreviewSrc((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    setPreviewName(null);
  }, [email?.id]);

  function onPreviewFile(file) {
    if (!file) return;
    const ok =
      file.type === "application/pdf" || file.type.startsWith("image/");
    if (!ok) return;
    setPreviewLoading(false);
    setPreviewSrc((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setPreviewName(file.name);
  }

  function onSelectGmailAttachment(att) {
    const name = typeof att === "string" ? att : att.name;
    setPreviewName(name);
    const url = `${API}/jobs/${email.jobId}/attachment-preview`;
    const gen = ++previewLoadGen.current;
    setPreviewLoading(true);
    setPreviewSrc((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });

    /**
     * POST + JSON { b64 } — IDM thường chặn mọi GET/fetch trả application/pdf (204 Intercepted).
     * Phản hồi là application/json nên extension không bắt “tải file”.
     */
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ f: name }),
    })
      .then(async (r) => {
        if (gen !== previewLoadGen.current) return;
        const updated = r.headers.get("X-Job-Attachments");
        if (updated) {
          try {
            const attachments = JSON.parse(decodeURIComponent(updated));
            setEmails((prev) =>
              prev.map((e) => (e.id === email.id ? { ...e, attachments } : e))
            );
          } catch (_) {
            /* ignore */
          }
        }
        if (!r.ok) return;
        const ct = (r.headers.get("Content-Type") || "").toLowerCase();
        if (!ct.includes("application/json")) return;
        const data = await r.json();
        if (gen !== previewLoadGen.current) return;
        if (!data.ok || typeof data.b64 !== "string" || !data.b64.length)
          return;
        const bin = atob(data.b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], {
          type: data.mime || "application/pdf",
        });
        setPreviewSrc(URL.createObjectURL(blob));
      })
      .catch(() => {})
      .finally(() => {
        if (gen === previewLoadGen.current) setPreviewLoading(false);
      });
  }

  /**
   * Đồng bộ bảng bản vẽ từ server.
   * Phải phụ thuộc cả drawings / _needLoad: lúc mới click, job mỏng có cùng id với job sau fetch —
   * nếu chỉ [email?.id] thì effect không chạy lại → lines vẫn [] → mãi thấy upload.
   */
  useEffect(() => {
    if (!email) {
      setLines([]);
      return;
    }
    if (email.drawings?.length > 0) {
      setLines(email.drawings.map((r, i) => drawingToLine(r, i)));
    } else {
      setLines([]);
    }
  }, [email?.id, email?.drawings?.length, email?._needLoad]);

  async function handleUpload(file) {
    if (!file) return;
    setProcessing(true);
    setProgress(5);
    try {
      const form = new FormData();
      form.append("file", file);
      setProgress(20);
      const res = await fetch(`${API}/drawings/batch`, {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Lỗi");
      const { results = [] } = json;
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        setLines((prev) => [...prev, drawingToLine(r, prev.length + i)]);
        setProgress(Math.round(20 + ((i + 1) / results.length) * 75));
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      setProgress(100);
      setTimeout(() => {
        setProcessing(false);
        setProgress(0);
      }, 500);
    } catch (e) {
      console.error(e);
      setProcessing(false);
      setProgress(0);
    }
  }

  if (!email)
    return (
      <div className="right">
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">
            ✉
          </div>
          <div className="empty-title">Chọn một yêu cầu</div>
          <div className="empty-hint">
            Hoặc gửi email RFQ kèm PDF tới hộp thư đã hướng dẫn ở cột trái — mục
            mới thường xuất hiện sau vài chục giây.
          </div>
        </div>
      </div>
    );

  if (email.classify !== "rfq")
    return (
      <div className="right">
        <div className="e-header e-header--compact">
          <div className="e-subj">{email.subject}</div>
          <div className="e-meta">
            <span>
              Từ: <b>{email.from}</b>
            </span>
            <span>
              📅 <b>{email.date}</b>
            </span>
          </div>
          <div className="e-tags">
            <span className="tag t-skip">{email.classify}</span>
            <LTag lg={email.ngon_ngu} />
          </div>
        </div>
        <div className="not-rfq">
          <div style={{ fontSize: 36, opacity: 0.25 }}>💬</div>
          <div style={{ fontSize: 13, color: "var(--v3-muted)" }}>
            Không phải RFQ — không tạo phiếu báo giá
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              color: "var(--v3-faint)",
              maxWidth: 420,
              textAlign: "center",
              lineHeight: 1.7,
            }}
          >
            {email.body}
          </div>
        </div>
      </div>
    );

  return (
    <div className="right">
      <div className="e-header e-header--compact">
        <div className="e-subj">{email.subject}</div>
        <div className="e-meta">
          <span>
            Từ: <b>{email.from}</b>
          </span>
          <span className="e-meta-sep">·</span>
          <span>
            <b>{email.email}</b>
          </span>
          <span className="e-meta-sep">·</span>
          <span>
            <b>{email.date}</b>
          </span>
          {email.han_giao && (
            <>
              <span className="e-meta-sep">·</span>
              <span>
                Hạn giao:{" "}
                <b style={{ color: "var(--v3-red)" }}>
                  {fmtDDMM(email.han_giao) || email.han_giao}
                </b>
              </span>
            </>
          )}
        </div>
        <div className="e-tags">
          <span className="tag t-rfq">✓ RFQ</span>
          <LTag lg={email.ngon_ngu} />
          {email.attachments?.map((a, i) => {
            const name = typeof a === "string" ? a : a.name;
            const att = typeof a === "object" ? a : null;
            const isActive = previewName === name;
            return (
              <button
                key={i}
                type="button"
                title={att ? "Xem trước file đính kèm (iframe)" : name}
                className={`tag tag-pdf-btn${
                  isActive ? " tag-pdf-btn--active" : ""
                }`}
                onClick={() => onSelectGmailAttachment(att ?? name)}
              >
                {isActive ? "📖" : "📎"} {name}
              </button>
            );
          })}
          {email._agent && <span className="tag t-agent">⚡ Agent</span>}
        </div>
      </div>

      <div className="main-panel">
        <div
          className="tabs tabs--main"
          role="tablist"
          aria-label="Nội dung phiếu"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 0}
            className={`tab${tab === 0 ? " active" : ""}`}
            onClick={() => setTab(0)}
          >
            Thông tin chung
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 1}
            className={`tab${tab === 1 ? " active" : ""}`}
            onClick={() => setTab(1)}
          >
            Danh sách bản vẽ{lines.length > 0 ? ` (${lines.length})` : ""}
          </button>
        </div>
        <div className="tcontent">
          {tab === 0 && (
            <Tab1 email={email} classifyUiSchema={classifyUiSchema} />
          )}
          {tab === 1 && (
            <Tab2
              lines={lines}
              previewName={previewName}
              previewSrc={previewSrc}
              previewLoading={previewLoading}
              onUpload={handleUpload}
              onPreviewFile={onPreviewFile}
              setLines={setLines}
              processing={processing}
              progress={progress}
            />
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="footer">
        <button type="button" className="btn btn-p">
          Lưu phiếu
        </button>
        <button type="button" className="btn btn-g">
          Xác nhận
        </button>
        <button type="button" className="btn btn-o">
          In PBG
        </button>
        {email.jobId && (
          <button
            className="btn btn-p btn-erp"
            onClick={async () => {
              await fetch(`/jobs/${email.jobId}/push-erp`, { method: "POST" });
              alert("✓ Đã push ERP!");
            }}
          >
            Push ERP
          </button>
        )}
        <button
          className="btn btn-o"
          style={{
            marginLeft: email.jobId ? "0" : "auto",
            color: "var(--v3-red)",
          }}
        >
          Hủy
        </button>
      </div>
    </div>
  );
}

// ── APP ───────────────────────────────────────────────────────────────────────
function App() {
  const [emails, setEmails] = useState([]);
  const [active, setActive] = useState(null);
  const [inboxHint, setInboxHint] = useState("");
  const [classifyUiSchema, setClassifyUiSchema] = useState(null);
  const sidebarRef = useRef(null);
  const mainRef = useRef(null);
  const splitPaneRef = useRef(null);

  useEffect(() => {
    fetch("/api/demo-hint")
      .then((r) => r.json())
      .then((d) => setInboxHint(d.inboxEmail || ""))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`${API}/api/email-classify-ui-schema`)
      .then((r) => r.json())
      .then((d) => {
        if (d && Array.isArray(d.generalRows)) setClassifyUiSchema(d);
      })
      .catch(() => setClassifyUiSchema(null));
  }, []);

  /** Split.js — kéo ranh giới cột mail (trái) | chi tiết (phải); chỉ màn hình ≥769px */
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 769px)");

    function bindSplit() {
      if (splitPaneRef.current) {
        splitPaneRef.current.destroy();
        splitPaneRef.current = null;
      }
      if (
        !mq.matches ||
        typeof window.Split !== "function" ||
        !sidebarRef.current ||
        !mainRef.current
      ) {
        return;
      }
      splitPaneRef.current = window.Split(
        [sidebarRef.current, mainRef.current],
        {
          sizes: [20, 80],
          minSize: [240, 320],
          gutterSize: 6,
          cursor: "col-resize",
          snapOffset: 0,
          dragInterval: 1,
        }
      );
    }

    bindSplit();
    mq.addEventListener("change", bindSplit);
    return () => {
      mq.removeEventListener("change", bindSplit);
      if (splitPaneRef.current) {
        splitPaneRef.current.destroy();
        splitPaneRef.current = null;
      }
    };
  }, []);

  // Polling /jobs — thay thế toàn bộ mục Agent trong state (không append → không trùng khi refresh/React Strict Mode)
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      fetch("/jobs")
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          if (!data.data?.length) {
            setEmails((prev) => prev.filter((e) => !e._agent));
            return;
          }
          const agentEmails = data.data.map(mapJobRowToEmail);
          setEmails((prev) => mergeAgentIntoInbox(agentEmails, prev));
          setActive((cur) => {
            if (!cur?.jobId) return cur;
            const fresh = agentEmails.find(
              (x) => x.jobId === cur.jobId || x.id === cur.id
            );
            if (!fresh) return cur;
            if (cur._needLoad) return fresh;
            return {
              ...cur,
              preview: fresh.preview,
              time: fresh.time,
              date: fresh.date,
              unread: fresh.unread,
              classify_output: normalizeClassifyOutputFromJob({
                classify_output:
                  fresh.classify_output != null
                    ? fresh.classify_output
                    : cur.classify_output,
                classify: fresh.classify ?? cur.classify,
                ngon_ngu: fresh.ngon_ngu ?? cur.ngon_ngu,
                han_giao: cur.han_giao,
                hinh_thuc_giao: cur.hinh_thuc_giao,
                xu_ly_be_mat: cur.xu_ly_be_mat,
                vat_lieu_chung_nhan:
                  cur.vat_lieu_chung_nhan ??
                  cur.classify_output?.vat_lieu_chung_nhan,
                ten_kh: cur.ten_kh,
                body: cur.body,
              }),
              attachments:
                fresh.attachments?.length > 0
                  ? fresh.attachments
                  : cur.attachments,
            };
          });
        })
        .catch(() => {});
    };
    tick();
    const id = setInterval(tick, JOBS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Mở thẳng 1 job từ URL ?job=
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const jobId = p.get("job");
    if (!jobId) return;
    fetch(`/jobs/${jobId}`)
      .then((r) => r.json())
      .then((job) => {
        const d = job.created_at != null ? new Date(job.created_at) : null;
        const ok = d && !Number.isNaN(d.getTime());
        const e = {
          id: job.id,
          from: job.sender,
          email: job.sender_email || "",
          subject: job.subject,
          preview: "",
          body: job.ghi_chu || "",
          time: ok
            ? d.toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—",
          date: fmtDDMMHHmm(job.created_at),
          created_at: job.created_at,
          attachments: job.attachments || [],
          classify: job.classify,
          ngon_ngu: job.ngon_ngu,
          ten_kh: job.ten_cong_ty || job.sender || "",
          han_giao:
            job.han_giao != null && job.han_giao !== "" ? job.han_giao : null,
          hinh_thuc_giao: job.hinh_thuc_giao || null,
          xu_ly_be_mat: job.xu_ly_be_mat ?? null,
          vat_lieu_chung_nhan: job.vat_lieu_chung_nhan ?? null,
          classify_output: normalizeClassifyOutputFromJob(job),
          drawings: job.drawings || [],
          jobId: job.id,
          unread: false,
          _agent: true,
          _needLoad: false,
        };
        setEmails((prev) => [e, ...prev.filter((x) => x.id !== e.id)]);
        setActive(e);
        window.history.replaceState({}, "", window.location.pathname);
      })
      .catch(() => {});
  }, []);

  async function selectEmail(e) {
    if (e._needLoad && e.jobId) {
      const res = await fetch(`/jobs/${e.jobId}`);
      const job = await res.json();
      const full = {
        ...e,
        body: job.ghi_chu || "",
        attachments: job.attachments || [],
        date: fmtDDMMHHmm(job.created_at ?? e.created_at),
        han_giao:
          job.han_giao != null && job.han_giao !== "" ? job.han_giao : null,
        hinh_thuc_giao: job.hinh_thuc_giao || null,
        xu_ly_be_mat: job.xu_ly_be_mat ?? null,
        vat_lieu_chung_nhan: job.vat_lieu_chung_nhan ?? null,
        classify_output: normalizeClassifyOutputFromJob(job),
        ten_kh: job.ten_cong_ty || job.sender || "",
        drawings: job.drawings || [],
        _needLoad: false,
      };
      setEmails((prev) => prev.map((x) => (x.id === e.id ? full : x)));
      setActive(full);
    } else {
      setActive(e);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand-mark" aria-hidden="true">
          M
        </div>
        <div className="app-brand-text">
          <div className="app-brand-title">Mekong AI</div>
          <div className="app-brand-sub">
            Soạn thảo báo giá từ email tự động
          </div>
        </div>
        <div className="app-header-spacer" />
        <div className="app-live">
          <span className="app-live-dot" aria-hidden="true" />
          Đang kết nối
        </div>
        <nav className="app-nav" aria-label="Điều hướng">
          <a
            href="/src/web/demoV3.html"
            className="nav-link nav-link--active"
            title="Phiếu báo giá RFQ"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
              <rect x="9" y="3" width="6" height="4" rx="1" />
              <path d="M9 12h6M9 16h4" />
            </svg>
            Phiếu báo giá
          </a>
          <a
            href="/src/web/admin-prompts.html"
            className="nav-link"
            title="Cấu hình prompt & kiến thức AI"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            Cấu hình AI
          </a>
        </nav>
      </header>
      <div className="app-body app-body--split">
        <aside ref={sidebarRef} className="app-sidebar">
          <GuidePanel inboxEmail={inboxHint} />
          <Mailbox emails={emails} active={active} onSelect={selectEmail} />
        </aside>
        <div ref={mainRef} className="app-detail">
          <Right
            email={active}
            setEmails={setEmails}
            classifyUiSchema={classifyUiSchema}
          />
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
