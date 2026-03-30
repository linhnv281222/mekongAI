const { useState, useRef, useEffect, useCallback } = React;

const API = "";

function tagClass(loai) {
  if (!loai) return "tag tag-other";
  const l = loai.toLowerCase();
  if (l.includes("ren")) return "tag tag-ren";
  if (l.includes("tr") && l.includes("n")) return "tag tag-tron";
  if (l.includes("csk") || l.includes("cham")) return "tag tag-csk";
  return "tag tag-other";
}

function TokenBar({ usage }) {
  if (!usage) return null;
  return (
    <div className="token-bar">
      <span>
        input <strong>{usage.input_tokens}</strong>
      </span>
      {usage.cache_write_tokens > 0 && (
        <span>
          cache_write <strong>{usage.cache_write_tokens}</strong>
        </span>
      )}
      {usage.cache_read_tokens > 0 && (
        <span className="token-cache">
          cache_hit <strong>{usage.cache_read_tokens}</strong> (
          {usage.cache_hit_ratio_pct}%)
        </span>
      )}
      <span>
        output <strong>{usage.output_tokens}</strong>
      </span>
    </div>
  );
}

function ptBadgeClass(idx) {
  return `pt-badge pt-badge-${Math.min(5, Math.max(1, idx || 3))}`;
}

function PhanTichCard({ data }) {
  if (!data) return null;
  const pt = data.phan_tich_do_phuc_tap;
  if (!pt) return null;
  const nc = pt.nc_dac_biet || {};
  const bp = pt.bang_phan_tich || {};
  const NC_LIST = ["WC", "GF", "LF", "HAN", "CAYREN", "DONGPIN", "TOOL"];
  const rows = [
    ["Kích thước", bp.kich_thuoc],
    ["Khối lượng", bp.khoi_luong],
    ["Loại vật liệu", bp.vat_lieu],
    ["Nguyên công hàn", bp.nguyen_cong_han],
    ["Độ khó dung sai", bp.do_kho_dung_sai],
    ["Hình dạng", bp.hinh_dang],
  ];
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-dot dot-purple" />
        <span className="card-title">9 — Phân tích độ phức tạp</span>
      </div>
      <div className="pt-nc-row">
        {NC_LIST.map((n) => (
          <div key={n} className={`pt-nc-chip${nc[n] ? " active" : ""}`}>
            <span className="dot" />
            {n}
          </div>
        ))}
      </div>
      <table className="pt-table">
        <thead>
          <tr>
            <th>Danh mục</th>
            <th>Loại</th>
            <th>Index</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([cat, val]) =>
            val ? (
              <tr key={cat}>
                <td className="cat">{cat}</td>
                <td>
                  <span className={ptBadgeClass(val.idx)}>{val.loai}</span>
                </td>
                <td>
                  <span className="pt-idx">{val.idx}</span>
                </td>
              </tr>
            ) : null
          )}
        </tbody>
      </table>
    </div>
  );
}

function ResultPanel({ drawing }) {
  const d = drawing.full_data || drawing.data;
  if (!d) return null;

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div className="card-dot dot-blue" />
          <span className="card-title">1 — Khung tên</span>
        </div>
        <div className="grid-2">
          {[
            ["Mã bản vẽ", d.ban_ve?.ma_ban_ve ?? "—", "kv-v mono accent"],
            ["Revision", d.ban_ve?.revision ?? "—", "kv-v mono"],
            ["Tên chi tiết", d.ban_ve?.ten_chi_tiet ?? "—", "kv-v"],
            ["Số lượng", `${d.san_xuat?.so_luong ?? "—"} cái`, "kv-v green"],
            ["Nguyên vật liệu", d.vat_lieu?.ma ?? "—", "kv-v mono"],
            ["Loại", d.vat_lieu?.loai ?? "—", "kv-v"],
            ["Xử lý nhiệt", d.vat_lieu?.nhiet_luyen ?? "Không", "kv-v"],
            ["Tiêu chuẩn", d.san_xuat?.tieu_chuan ?? "—", "kv-v"],
          ].map(([label, val, cls]) => (
            <div className="kv" key={label}>
              <div className="kv-l">{label}</div>
              <div className={cls}>{val}</div>
            </div>
          ))}
        </div>
        {d.xu_ly?.be_mat?.length > 0 && (
          <div
            style={{
              padding: "12px 16px 14px",
              borderTop: "1px solid var(--border)",
            }}
          >
            <div className="kv-l" style={{ marginBottom: 8 }}>
              Xử lý bề mặt
            </div>
            {d.xu_ly.be_mat.map((x, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 10,
                  marginBottom: 6,
                  alignItems: "flex-start",
                }}
              >
                <span
                  style={{
                    background: "rgba(46,196,182,.15)",
                    color: "var(--teal)",
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "2px 7px",
                    borderRadius: 4,
                    flexShrink: 0,
                  }}
                >
                  B{x.buoc}
                </span>
                <div>
                  <div style={{ fontSize: 13, color: "var(--text)" }}>
                    {x.ten}
                  </div>
                  {x.tieu_chuan && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text3)",
                        marginTop: 2,
                      }}
                    >
                      {x.tieu_chuan}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-dot dot-teal" />
          <span className="card-title">2 — Hình dạng & gia công</span>
        </div>
        <div className="grid-2">
          <div className="kv">
            <div className="kv-l">Loại</div>
            <div className="kv-v">{d.hinh_dang?.loai ?? "—"}</div>
          </div>
          <div className="kv">
            <div className="kv-l">Phương án</div>
            <div className="kv-v accent">
              {d.hinh_dang?.phuong_an_gia_cong ?? "—"}
            </div>
          </div>
        </div>
        {d.hinh_dang?.mo_ta?.length > 0 && (
          <div
            style={{
              padding: "8px 16px 12px",
              borderTop: "1px solid var(--border)",
            }}
          >
            {d.hinh_dang.mo_ta.map((m, i) => (
              <div
                key={i}
                style={{
                  fontSize: 12,
                  color: "var(--text2)",
                  padding: "3px 0",
                  display: "flex",
                  gap: 8,
                }}
              >
                <span style={{ color: "var(--text3)" }}>—</span>
                {m}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-dot dot-amber" />
          <span className="card-title">3 — Kích thước bao</span>
        </div>
        <div className="grid-3">
          {[
            ["Dài (L)", d.kich_thuoc_bao?.dai],
            ["Rộng (W)", d.kich_thuoc_bao?.rong],
            ["Cao / Ø", d.kich_thuoc_bao?.cao_hoac_duong_kinh],
          ].map(([label, val]) => (
            <div
              className="kv"
              key={label}
              style={{ borderRight: "1px solid var(--border)" }}
            >
              <div className="kv-l">{label}</div>
              <div className="kv-v mono" style={{ fontSize: 15 }}>
                {val ?? "—"}
                <span
                  style={{ fontSize: 10, color: "var(--text3)", marginLeft: 3 }}
                >
                  {d.kich_thuoc_bao?.don_vi}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            padding: "8px 16px 10px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 11, color: "var(--text3)" }}>
            Phân loại:
          </span>
          <span
            style={{ fontSize: 12, fontWeight: 500, color: "var(--amber)" }}
          >
            {d.kich_thuoc_bao?.phan_loai_do_lon ?? "—"}
          </span>
        </div>
      </div>

      {d.nguyen_cong_cnc?.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="card-dot dot-blue" />
            <span className="card-title">4 — Nguyên công CNC</span>
          </div>
          <div className="step-list">
            {d.nguyen_cong_cnc.map((nc) => (
              <div className="step-row" key={nc.stt}>
                <div className="step-num">{nc.stt}</div>
                <div>
                  <div className="step-name">{nc.ten}</div>
                  <div className="step-meta">
                    {nc.may}
                    {nc.ghi_chu ? ` · ${nc.ghi_chu}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {d.be_mat_gia_cong?.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="card-dot dot-red" />
            <span className="card-title">5 — Bề mặt & lỗ gia công</span>
          </div>
          <table className="lo-table">
            <thead>
              <tr>
                <th>Bề mặt</th>
                <th>Loại</th>
                <th>Quy cách</th>
                <th>Kích thước / DT</th>
                <th>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {d.be_mat_gia_cong.map((b, i) => (
                <tr key={i} className={b.critical ? "critical" : ""}>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 11 }}>
                    {b.be_mat}
                  </td>
                  <td>
                    <span className={tagClass(b.loai)}>{b.loai ?? "—"}</span>
                  </td>
                  <td
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 11,
                      color: "var(--accent)",
                    }}
                  >
                    {b.quy_cach ?? "—"}
                  </td>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 11 }}>
                    {b.sau_hoac_kich_thuoc ?? "—"}
                    {b.dung_sai && (
                      <span style={{ color: "var(--amber)", marginLeft: 4 }}>
                        {b.dung_sai}
                      </span>
                    )}
                  </td>
                  <td style={{ color: "var(--text3)" }}>
                    {b.ghi_chu ?? ""}
                    {b.critical && (
                      <span
                        style={{
                          color: "var(--amber)",
                          marginLeft: 4,
                          fontWeight: 600,
                        }}
                      >
                        ⚑ CRITICAL
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {d.quy_trinh_tong_the?.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="card-dot dot-green" />
            <span className="card-title">Quy trình tổng thể</span>
          </div>
          <div className="flow-row">
            {d.quy_trinh_tong_the.map((s, i) => (
              <React.Fragment key={i}>
                <div className="flow-item">{s}</div>
                {i < d.quy_trinh_tong_the.length - 1 && (
                  <div className="flow-arrow">›</div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      <PhanTichCard data={d} />
      <TokenBar usage={drawing.tokens_used || drawing.usage} />
      <div style={{ height: 8 }} />
    </>
  );
}

function App() {
  const [drawings, setDrawings] = useState([]);
  const [selected, setSelected] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/drawings?limit=50`)
      .then((r) => r.json())
      .then((r) => setDrawings(r.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMsgs]);

  const uploadFile = useCallback(async (file) => {
    if (!file || file.type !== "application/pdf") return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`${API}/drawings`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi upload");
      const item = {
        id: data.id,
        ma_ban_ve: data.data?.ban_ve?.ma_ban_ve,
        ten_chi_tiet: data.data?.ban_ve?.ten_chi_tiet,
        status: "pending",
        full_data: data.data,
        tokens_used: data.tokens_used,
      };
      setDrawings((prev) => [item, ...prev]);
      setSelected(item);
      setChatMsgs([
        {
          role: "ai",
          text: `Đã phân tích xong "${file.name}". Nếu có thông tin sai, gõ vào đây để tôi sửa lại.`,
        },
      ]);
    } catch (e) {
      alert("Lỗi: " + e.message);
    } finally {
      setUploading(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDrag(false);
      const file = e.dataTransfer.files[0];
      if (file) uploadFile(file);
    },
    [uploadFile]
  );

  const selectDrawing = async (item) => {
    if (selected?.id === item.id) return;
    const res = await fetch(`${API}/drawings/${item.id}`);
    const data = await res.json();
    setSelected(data);
    setChatMsgs([
      {
        role: "ai",
        text: `Bản vẽ "${
          data.ma_ban_ve || data.filename
        }". Gõ để sửa nếu AI đọc sai.`,
      },
    ]);
  };

  const sendCorrection = async () => {
    if (!chatInput.trim() || !selected || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChatMsgs((prev) => [
      ...prev,
      { role: "user", text: msg },
      { role: "ai", text: "Đang cập nhật...", thinking: true },
    ]);
    setChatLoading(true);
    try {
      const res = await fetch(`${API}/drawings/${selected.id}/correct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi");
      const updated = {
        ...selected,
        full_data: data.data,
        tokens_used: data.tokens_used,
        status: "reviewed",
      };
      setSelected(updated);
      setDrawings((prev) =>
        prev.map((d) =>
          d.id === selected.id ? { ...d, status: "reviewed" } : d
        )
      );
      setChatMsgs((prev) => [
        ...prev.slice(0, -1),
        { role: "ai", text: "Đã cập nhật kết quả theo yêu cầu của bạn." },
      ]);
    } catch (e) {
      setChatMsgs((prev) => [
        ...prev.slice(0, -1),
        { role: "ai", text: "Lỗi: " + e.message },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const approve = async () => {
    if (!selected) return;
    await fetch(`${API}/drawings/${selected.id}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });
    setSelected((s) => ({ ...s, status: "approved" }));
    setDrawings((prev) =>
      prev.map((d) => (d.id === selected.id ? { ...d, status: "approved" } : d))
    );
  };

  return (
    <div className="layout">
      <div className="left">
        <div className="left-header">
          <div className="logo">⬡ Mechanical AI</div>
          <div className="logo-sub">Đọc bản vẽ kỹ thuật</div>
          <nav className="app-nav" aria-label="Trang khác">
            <a href="/src/web/demo.html">Demo</a>
            <a href="/src/web/demoV3.html">Demo V3</a>
            <a href="/src/web/sheetBaoGia.html">Sheet báo giá</a>
            <a href="/src/web/admin-prompts.html">Admin prompt</a>
          </nav>
        </div>

        <div
          className={`drop-zone${drag ? " drag" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".pdf"
            onChange={(e) => uploadFile(e.target.files[0])}
          />
          <span className="drop-icon">📄</span>
          <div className="drop-text">
            <strong>Kéo thả PDF vào đây</strong>
            hoặc click để chọn file
          </div>
        </div>

        {uploading && (
          <div className="uploading">
            <span className="spin">⟳</span> Đang phân tích bản vẽ...
          </div>
        )}

        <div className="list-header">Bản vẽ ({drawings.length})</div>
        <div className="drawing-list">
          {drawings.map((d) => (
            <div
              key={d.id}
              className={`drawing-item${
                selected?.id === d.id ? " active" : ""
              }`}
              onClick={() => selectDrawing(d)}
            >
              <div className="drawing-item-top">
                <div className="drawing-code">
                  {d.ma_ban_ve || d.filename || `#${d.id}`}
                </div>
                <span className={`badge badge-${d.status || "pending"}`}>
                  {d.status || "pending"}
                </span>
              </div>
              <div className="drawing-name">{d.ten_chi_tiet || "—"}</div>
            </div>
          ))}
          {drawings.length === 0 && !uploading && (
            <div
              style={{
                padding: "24px 12px",
                textAlign: "center",
                color: "var(--text3)",
                fontSize: 12,
              }}
            >
              Chưa có bản vẽ nào.
              <br />
              Upload PDF để bắt đầu.
            </div>
          )}
        </div>
      </div>

      <div className="right">
        {!selected ? (
          <div className="empty">
            <div className="empty-icon">⬡</div>
            <p>Chọn bản vẽ hoặc upload PDF mới</p>
          </div>
        ) : (
          <>
            <div className="right-header">
              <div>
                <div className="drawing-title">
                  {selected.ma_ban_ve || selected.filename}
                </div>
                <div className="drawing-title-sub">
                  {selected.ten_chi_tiet || "—"} ·{" "}
                  {selected.vat_lieu || selected.full_data?.vat_lieu?.ma || "—"}
                </div>
              </div>
              {selected.status !== "approved" ? (
                <button className="approve-btn" onClick={approve}>
                  ✓ Approve
                </button>
              ) : (
                <span
                  className="badge badge-approved"
                  style={{ fontSize: 12, padding: "6px 14px" }}
                >
                  ✓ Approved
                </span>
              )}
            </div>
            <div className="right-body">
              <ResultPanel drawing={selected} />
            </div>
            <div className="chat-panel">
              <div className="chat-hint">
                Gõ để sửa nếu AI đọc sai — ví dụ: "vật liệu là S45C không phải
                AL6061"
              </div>
              {chatMsgs.length > 0 && (
                <div className="chat-messages">
                  {chatMsgs.map((m, i) => (
                    <div
                      key={i}
                      className={`chat-msg ${m.role}${
                        m.thinking ? " thinking" : ""
                      }`}
                    >
                      <div className="chat-bubble">{m.text}</div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
              )}
              <div className="chat-input-row">
                <input
                  className="chat-input"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendCorrection()}
                  placeholder="Nhập yêu cầu sửa..."
                  disabled={chatLoading}
                />
                <button
                  className="chat-send"
                  onClick={sendCorrection}
                  disabled={chatLoading || !chatInput.trim()}
                >
                  {chatLoading ? "..." : "Gửi"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
