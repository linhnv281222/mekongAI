const { useState, useRef, useEffect } = React;
const API = "";

const JOBS_POLL_MS = 8000;

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
    date: (() => {
      const d = j.created_at != null ? new Date(j.created_at) : null;
      return d && !Number.isNaN(d.getTime())
        ? d.toLocaleDateString("vi-VN")
        : "—";
    })(),
    created_at: j.created_at,
    attachments: j.attachments || [],
    classify: j.classify,
    ngon_ngu: j.ngon_ngu,
    ten_kh: j.ten_cong_ty || j.sender || "",
    han_giao: j.han_giao || null,
    hinh_thuc_giao: j.hinh_thuc_giao || null,
    xu_ly_be_mat: j.xu_ly_be_mat ?? null,
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
      attachments:
        a.attachments?.length > 0 ? a.attachments : kept.attachments,
    };
  });
  return [...merged, ...nonAgent];
}

// Không dùng mock — chỉ lấy data từ backend

// ── HELPERS ───────────────────────────────────────────────────────────────────
function toDateInput(val) {
  if (!val) return "";
  if (typeof val === "number") return new Date(val).toISOString().slice(0, 10);
  if (typeof val === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
      const [d, m, y] = val.split("/");
      return `${y}-${m}-${d}`;
    }
    try {
      return new Date(val).toISOString().slice(0, 10);
    } catch (e) {}
  }
  return "";
}

function LTag({ lg }) {
  const m = {
    ja: ["🇯🇵 Nhật", "t-ja"],
    vi: ["🇻🇳 Việt", "t-vi"],
    en: ["🇺🇸 Anh", "t-en"],
  };
  const [l, c] = m[lg] || ["?", "t-skip"];
  return <span className={`tag ${c}`}>{l}</span>;
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
          📧 Hộp thư
          <span className="mb-cnt">
            {emails.filter((e) => e.unread).length}
          </span>
        </div>
        <div className="live" />
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

// ── TAB 1: THÔNG TIN CHUNG ───────────────────────────────────────────────────
function Tab1({ email }) {
  const F = ({ label, val, ai, type = "text", opts }) => (
    <div className="f">
      <label>
        {label}
        {ai && <span className="ai-mark">⚡AI</span>}
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
          className={`${ai && val ? "ai" : ""}`}
          defaultValue={val || ""}
        />
      )}
    </div>
  );

  return (
    <div className="form-wrap">
      <div className="section">
        <div className="sec-hd">
          <span className="sec-num">1</span>
          <span className="sec-title">Thông tin chung</span>
        </div>
        <div className="sec-body">
          <div className="fg fg-2" style={{ marginBottom: 12 }}>
            <F
              label="Thời điểm nhận yêu cầu"
              val={toDateInput(email.date || email.created_at)}
              ai
              type="date"
            />
            <F
              label="Thời hạn báo giá"
              val={toDateInput(email.han_giao)}
              ai
              type="date"
            />
          </div>
          <div className="fg fg-3" style={{ marginBottom: 12 }}>
            <div className="f">
              <label>
                Vận chuyển <span className="ai-mark">⚡AI</span>
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
                Xử lý bề mặt <span className="ai-mark">⚡AI</span>
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
                  <input type="radio" name={`vat_${email.id}`} defaultChecked />{" "}
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
        </div>
      </div>
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
      <div className="section">
        <div className="sec-hd">
          <span className="sec-num">3</span>
          <span className="sec-title">Ghi chú</span>
        </div>
        <div className="sec-body">
          <div className="fg fg-2">
            <div className="f">
              <label>
                Nội dung email <span className="ai-mark">⚡AI</span>
              </label>
              <textarea
                className="ai"
                rows={4}
                defaultValue={email.body}
                style={{
                  border: "1px solid var(--accent-bd)",
                  borderRadius: 5,
                  padding: "7px 10px",
                  fontSize: 12,
                  fontFamily: "var(--sans)",
                  background: "var(--accent-bg)",
                  color: "var(--accent2)",
                  outline: "none",
                  resize: "none",
                  lineHeight: 1.6,
                }}
              />
            </div>
            <div className="f">
              <label>Ghi chú nội bộ</label>
              <textarea
                rows={4}
                defaultValue={`Tạo tự động bởi Mekong AI — ${new Date().toLocaleString(
                  "vi-VN"
                )}`}
                style={{
                  border: "1px solid var(--border2)",
                  borderRadius: 5,
                  padding: "7px 10px",
                  fontSize: 12,
                  fontFamily: "var(--sans)",
                  outline: "none",
                  resize: "none",
                  lineHeight: 1.6,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── TAB 2: DANH SÁCH BẢN VẼ ──────────────────────────────────────────────────
function Tab2({ email, lines, setLines, processing, progress, onUpload }) {
  const fileRef = useRef(null);
  const totalSL = lines.reduce((s, l) => s + (parseInt(l.so_luong) || 0), 0);
  const totalKL = lines
    .reduce((s, l) => s + (parseFloat(l.kl_phoi) || 0), 0)
    .toFixed(3);

  const CellInput = ({ val, cls, onChange, type = "text" }) => (
    <input
      type={type}
      style={{
        border: "none",
        background: "transparent",
        fontSize: 12.5,
        outline: "none",
        width: "100%",
        padding: "2px 0",
      }}
      className={cls}
      defaultValue={val}
      onChange={(e) =>
        onChange((prev) =>
          prev.map((x, j) =>
            j === i ? { ...x, [e.target.dataset.field]: e.target.value } : x
          )
        )
      }
    />
  );

  return (
    <div className="bv-wrap">
      <div className="bv-toolbar">
        <button className="btn btn-o" onClick={() => fileRef.current?.click()}>
          📎 Upload PDF bản vẽ
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf"
          style={{ display: "none" }}
          onChange={(e) => {
            onUpload(e.target.files[0]);
            e.target.value = "";
          }}
        />
        {processing && (
          <span style={{ fontSize: 12, color: "var(--accent)" }}>
            <span className="spin">⟳</span> AI đang đọc bản vẽ...
          </span>
        )}
        <div
          style={{ marginLeft: "auto", fontSize: 12, color: "var(--text3)" }}
        >
          Mỗi trang PDF = 1 bản vẽ · AI tự động đọc
        </div>
      </div>
      {processing && (
        <div className="prog-wrap">
          <div className="prog-txt">
            <span className="spin">⟳</span> Đang phân tích... {progress}%
          </div>
          <div className="prog-bar">
            <div className="prog-fill" style={{ width: progress + "%" }} />
          </div>
        </div>
      )}
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
            Tổng KL phôi: <b style={{ color: "var(--accent)" }}>{totalKL} KG</b>
          </span>
        </div>
      )}
      <div className="bv-table-wrap">
        {lines.length === 0 ? (
          <div className="upload-zone" onClick={() => fileRef.current?.click()}>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              style={{ display: "none" }}
              onChange={(e) => {
                onUpload(e.target.files[0]);
                e.target.value = "";
              }}
            />
            <div style={{ fontSize: 36, marginBottom: 10 }}>📄</div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text2)",
                marginBottom: 5,
              }}
            >
              Upload PDF bản vẽ
            </div>
            <div
              style={{ fontSize: 12, color: "var(--text3)", marginBottom: 4 }}
            >
              Hỗ trợ PDF nhiều trang — mỗi trang = 1 bản vẽ
            </div>
            <div
              style={{ fontSize: 12, color: "var(--accent)", fontWeight: 500 }}
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
                <th style={{ width: 90, textAlign: "right" }}>KL phôi (kg)</th>
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
                        fontFamily: "var(--mono)",
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: "var(--accent2)",
                        outline: "none",
                        width: "100%",
                        padding: "2px 0",
                      }}
                      defaultValue={l.ma_ban_ve}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((x, j) =>
                            j === i ? { ...x, ma_ban_ve: e.target.value } : x
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
                        color: "var(--text)",
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
                        fontFamily: "var(--mono)",
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: "var(--green)",
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
                      fontFamily: "var(--mono)",
                      fontSize: 12,
                      color: "var(--amber)",
                    }}
                  >
                    {l.kl_phoi || "—"}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <button
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--red)",
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
  );
}

// ── RIGHT PANEL ───────────────────────────────────────────────────────────────
function Right({ email }) {
  const [tab, setTab] = useState(0);
  const [lines, setLines] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setTab(0);
    if (email?.drawings?.length > 0) {
      setLines(
        email.drawings.map((r, i) => {
          const d = r.data || {};
          return {
            id: r.id || i,
            page: r.page || i + 1,
            ma_ban_ve: d.ban_ve?.ma_ban_ve || "",
            so_luong: d.san_xuat?.so_luong || 1,
            ma_nvl: d.vat_lieu?.ma || "",
            kl_phoi: d.khoi_luong?.kl_phoi_kg || 0,
          };
        })
      );
    } else {
      setLines([]);
    }
  }, [email?.id]);

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
        const d = r.data || {};
        setLines((prev) => [
          ...prev,
          {
            id: r.id || Date.now() + i,
            page: r.page || i + 1,
            ma_ban_ve: d.ban_ve?.ma_ban_ve || `Trang ${r.page}`,
            so_luong: d.san_xuat?.so_luong || 1,
            ma_nvl: d.vat_lieu?.ma || "",
            kl_phoi: d.khoi_luong?.kl_phoi_kg || 0,
          },
        ]);
        setProgress(Math.round(20 + ((i + 1) / results.length) * 75));
        await new Promise((r) => setTimeout(r, 60));
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
          <div className="empty-icon">📧</div>
          <div style={{ fontSize: 13, color: "var(--text2)" }}>
            Chọn email để xem chi tiết
          </div>
        </div>
      </div>
    );

  if (email.classify !== "rfq")
    return (
      <div className="right">
        <div className="e-header">
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
          <div style={{ fontSize: 13, color: "var(--text2)" }}>
            Không phải RFQ — không tạo phiếu báo giá
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              color: "var(--text3)",
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
      <div className="e-header">
        <div className="e-subj">{email.subject}</div>
        <div className="e-meta">
          <span>
            Từ: <b>{email.from}</b>
          </span>
          <span>
            📧 <b>{email.email}</b>
          </span>
          <span>
            📅{" "}
            <b>
              {email.date} {email.time}
            </b>
          </span>
          {email.han_giao && (
            <span>
              🗓 Hạn giao:{" "}
              <b style={{ color: "var(--red)" }}>{email.han_giao}</b>
            </span>
          )}
        </div>
        <div className="e-tags">
          <span className="tag t-rfq">✓ RFQ</span>
          <LTag lg={email.ngon_ngu} />
          {email.attachments?.map((a, i) => (
            <span key={i} className="tag t-pdf">
              📎 {a}
            </span>
          ))}
          {email._agent && <span className="tag t-agent">⚡ Agent</span>}
        </div>
      </div>
      <div className="tabs">
        <div
          className={`tab${tab === 0 ? " active" : ""}`}
          onClick={() => setTab(0)}
        >
          Thông tin chung
        </div>
        <div
          className={`tab${tab === 1 ? " active" : ""}`}
          onClick={() => setTab(1)}
        >
          Danh sách bản vẽ{lines.length > 0 ? ` (${lines.length})` : ""}
        </div>
      </div>
      <div className="tcontent">
        {tab === 0 && <Tab1 email={email} />}
        {tab === 1 && (
          <Tab2
            email={email}
            lines={lines}
            setLines={setLines}
            processing={processing}
            progress={progress}
            onUpload={handleUpload}
          />
        )}
      </div>
      <div className="footer">
        <button className="btn btn-p">💾 Lưu phiếu</button>
        <button className="btn btn-g">✓ Xác nhận</button>
        <button className="btn btn-o">🖨 In PBG</button>
        {email.jobId && (
          <button
            className="btn btn-p"
            style={{
              marginLeft: "auto",
              background: "#7C3AED",
              borderColor: "#7C3AED",
            }}
            onClick={async () => {
              await fetch(`/jobs/${email.jobId}/push-erp`, { method: "POST" });
              alert("✓ Đã push ERP!");
            }}
          >
            🚀 Push ERP
          </button>
        )}
        <button
          className="btn btn-o"
          style={{
            marginLeft: email.jobId ? "0" : "auto",
            color: "var(--red)",
          }}
        >
          ✕ Hủy
        </button>
      </div>
    </div>
  );
}

// ── APP ───────────────────────────────────────────────────────────────────────
function App() {
  const [emails, setEmails] = useState([]);
  const [active, setActive] = useState(null);

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
          date: ok ? d.toLocaleDateString("vi-VN") : "—",
          created_at: job.created_at,
          attachments: job.attachments || [],
          classify: job.classify,
          ngon_ngu: job.ngon_ngu,
          ten_kh: job.ten_cong_ty || job.sender || "",
          han_giao: job.han_giao || null,
          hinh_thuc_giao: job.hinh_thuc_giao || null,
          xu_ly_be_mat: job.xu_ly_be_mat ?? null,
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
        han_giao: job.han_giao || null,
        hinh_thuc_giao: job.hinh_thuc_giao || null,
        xu_ly_be_mat: job.xu_ly_be_mat ?? null,
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
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div className="topbar">
        <div className="t-logo">⬡ Mekong AI</div>
        <span className="t-sep">|</span>
        <div className="t-sub">Agent Báo Giá Tự Động</div>
        <div className="t-right">
          <span className="ai-pill">⚡ LIVE</span>
          <div className="live" />
        </div>
      </div>
      <div className="layout">
        <Mailbox emails={emails} active={active} onSelect={selectEmail} />
        <Right email={active} />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
