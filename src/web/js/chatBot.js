/* ============================================================
   Mekong AI Chat Bot Widget — React Component
   Mounts as floating widget outside React root (stable)
   State chat giữ khi ẩn panel (chỉ mất khi F5).
   ============================================================ */
const { useState, useRef, useEffect } = React;

const API = "/chat";

const INITIAL_BOT_MESSAGE = {
  id: 0,
  role: "bot",
  text: "Xin chào! Mekong AI Bot đây.\n\nTôi có thể:\n- Phân tích báo giá: dán nội dung email hoặc đính kèm file PDF bản vẽ.\n- Trả lời các câu hỏi về hệ thống.\n\nGửi tin nhắn để bắt đầu nhé!",
  time: new Date(),
  files: [],
};

function formatTime(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function isPdfFile(name) {
  if (!name) return false;
  return name.toLowerCase().endsWith(".pdf");
}

function FileChip({ name }) {
  const ext = name ? name.split(".").pop().toUpperCase() : "FILE";
  return (
    <div className="mekong-file-chip">
      <span className="chip-icon">
        {ext === "PDF" ? (
          <svg viewBox="0 0 24 24" width="13" height="13" style={{ display: "inline-block", verticalAlign: "middle" }}>
            <path fill="#ef4444" d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="13" height="13" style={{ display: "inline-block", verticalAlign: "middle" }}>
            <path fill="#2563eb" d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
          </svg>
        )}
      </span>
      <span>{name}</span>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="mekong-msg is-bot">
      <div className="mekong-msg-avatar">
        <svg viewBox="0 0 24 24" width="18" height="18" style={{ display: "block" }}>
          <path fill="#2563eb" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
        </svg>
      </div>
      <div>
        <div className="mekong-typing">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
  );
}

/** Panel chat — state do ChatApp truyền xuống để ẩn panel không xóa lịch sử */
function ChatPanel({
  onHide,
  messages,
  setMessages,
  input,
  setInput,
  files,
  setFiles,
  sending,
  setSending,
  typing,
  setTyping,
}) {
  const msgsEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 100) + "px";
    }
  }, [input]);

  function addBotMessage(text, msgFiles = []) {
    setMessages((prev) => [
      ...prev,
      { id: Date.now() + Math.random(), role: "bot", text, time: new Date(), files: msgFiles },
    ]);
  }

  async function handleSend(e) {
    e?.preventDefault();
    if (sending) return;

    const text = input.trim();
    if (!text && files.length === 0) return;

    const userMsg = { id: Date.now(), role: "user", text, time: new Date(), files: [...files] };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setFiles([]);
    setSending(true);
    setTyping(true);

    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const fd = new FormData();
      if (text) fd.append("message", text);
      if (files.length > 0) {
        files.forEach((f) => fd.append("files", f));
      }

      const res = await fetch(`${API}/message`, { method: "POST", body: fd });
      const data = await res.json();

      setTyping(false);

      if (data.reply) {
        addBotMessage(data.reply, []);
      } else if (data.error && !data.reply) {
        addBotMessage("❌ Đã xảy ra lỗi: " + data.error, []);
      } else {
        addBotMessage("Đã xử lý xong nhưng không có phản hồi từ server.", []);
      }
    } catch (err) {
      setTyping(false);
      addBotMessage("❌ Không thể kết nối server. Vui lòng kiểm tra kết nối mạng.", []);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleFileChange(e) {
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;
    setFiles((prev) => {
      const total = prev.length + selected.length;
      if (total > 20) {
        alert("Tối đa 20 file mỗi lần gửi.");
        return prev;
      }
      const oversized = selected.filter((f) => f.size > 100 * 1024 * 1024);
      if (oversized.length > 0) {
        alert(`File quá 100MB: ${oversized.map((f) => f.name).join(", ")}`);
        return prev;
      }
      return [...prev, ...selected];
    });
    e.target.value = "";
  }

  function removeFile(idx) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <div className="mekong-chat is-open">
      <div className="mekong-chat-hd">
        <div className="mekong-chat-hd-avatar">
          <svg viewBox="0 0 24 24" width="22" height="22" style={{ display: "block", stroke: "none" }}>
            <path fill="#fff" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
          </svg>
        </div>
        <div className="mekong-chat-hd-info">
          <div className="mekong-chat-hd-name">Mekong AI Bot</div>
          <div className="mekong-chat-hd-status">
            <span className="dot"></span>
            Online — sẵn sàng phân tích báo giá
          </div>
        </div>
        <div className="mekong-chat-hd-actions">
          <button className="mekong-chat-hd-btn" onClick={onHide} type="button" title="Ẩn cửa sổ chat (giữ lịch sử)">
            —
          </button>
        </div>
      </div>

      <div className="mekong-chat-msgs">
        {messages.map((msg) => (
          <div key={msg.id} className={`mekong-msg is-${msg.role}`}>
            <div className="mekong-msg-avatar">
              {msg.role === "bot" ? (
                <svg viewBox="0 0 24 24" width="18" height="18" style={{ display: "block" }}>
                  <path fill="#2563eb" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="18" height="18" style={{ display: "block" }}>
                  <path fill="#475569" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              )}
            </div>
            <div>
              <div
                className="mekong-msg-bubble"
                dangerouslySetInnerHTML={{
                  __html: msg.text
                    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
                    .replace(/\n/g, "<br/>"),
                }}
              />
              {msg.files.length > 0 && (
                <div className="mekong-msg-files">
                  {msg.files.map((f, i) => (
                    <FileChip key={i} name={f.name || f} />
                  ))}
                </div>
              )}
              <div className="mekong-msg-time">{formatTime(msg.time)}</div>
            </div>
          </div>
        ))}
        {typing && <TypingIndicator />}
        <div ref={msgsEndRef} />
      </div>

      <div className="mekong-chat-input-area">
        {files.length > 0 && (
          <div className="mekong-chat-att-preview">
            {files.map((f, i) => (
              <div key={i} className="mekong-chat-att-item">
                <div className={`mekong-chat-att-thumb${isPdfFile(f.name) ? " is-pdf" : ""}`}>
                  {isPdfFile(f.name) ? "PDF" : "IMG"}
                </div>
                <button type="button" className="mekong-chat-att-remove" onClick={() => removeFile(i)}>
                  ✕
                </button>
                <div className="mekong-chat-att-name">{f.name}</div>
              </div>
            ))}
          </div>
        )}

        <form className="mekong-chat-input-row" onSubmit={handleSend}>
          <input
            ref={fileInputRef}
            type="file"
            id="mekong-chat-file-input"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.bmp"
            multiple
            onChange={handleFileChange}
          />
          <button
            type="button"
            className="mekong-chat-attach-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Đính kèm file (PDF/ảnh, tối đa 100MB)"
          >
            <svg
              className="mekong-chat-icon"
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <textarea
            ref={textareaRef}
            className="mekong-chat-textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Dán nội dung email báo giá hoặc đính kèm file PDF..."
            rows={1}
          />
          <button
            type="submit"
            className="mekong-chat-send-btn"
            disabled={sending || (!input.trim() && files.length === 0)}
            title="Gửi"
          >
            <svg
              className="mekong-chat-icon"
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}

function BotFab({ hasNew, onClick }) {
  return (
    <button className={"mekong-fab" + (hasNew ? " has-new" : "")} onClick={onClick} type="button" title="Mekong AI Bot">
      <svg viewBox="0 0 24 24" width="28" height="28" style={{ display: "block", stroke: "none" }}>
        <path fill="#fff" d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 13H5.17L4 17.17V4h16v11z"/>
        <path fill="#fff" d="M7 9h10M7 12h7" stroke="#1565C0" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      <span className="fab-badge">1</span>
    </button>
  );
}

function ChatApp() {
  const [panelOpen, setPanelOpen] = useState(false);
  const [hasNew, setHasNew] = useState(false);
  const [messages, setMessages] = useState(() => [
    { ...INITIAL_BOT_MESSAGE, time: new Date(), id: 0 },
  ]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const lastSeenJobTimeRef = useRef(Date.now());

  useEffect(() => {
    const id = setInterval(async () => {
      if (panelOpen) return;
      try {
        const res = await fetch("/jobs");
        const data = await res.json();
        const jobs = data.data || [];
        const chatJobs = jobs.filter(
          (j) => j.id?.startsWith("chat_") && j.created_at > lastSeenJobTimeRef.current
        );
        if (chatJobs.length > 0) {
          const newest = Math.max(...chatJobs.map((j) => j.created_at || 0));
          lastSeenJobTimeRef.current = Math.max(lastSeenJobTimeRef.current, newest);
          setHasNew(true);
        }
      } catch (_) {}
    }, 15000);
    return () => clearInterval(id);
  }, [panelOpen]);

  function toggleFab() {
    if (panelOpen) {
      setPanelOpen(false);
    } else {
      setPanelOpen(true);
      setHasNew(false);
    }
  }

  return (
    <>
      {panelOpen && (
        <ChatPanel
          onHide={() => setPanelOpen(false)}
          messages={messages}
          setMessages={setMessages}
          input={input}
          setInput={setInput}
          files={files}
          setFiles={setFiles}
          sending={sending}
          setSending={setSending}
          typing={typing}
          setTyping={setTyping}
        />
      )}
      <BotFab hasNew={hasNew} onClick={toggleFab} />
    </>
  );
}

// ── Mount (một createRoot, không remount toàn cây) ───────────────────────────

let chatMounted = false;
let reactRoot = null;

function renderChatRoot() {
  const root = document.createElement("div");
  root.id = "mekong-chat-root";
  document.body.appendChild(root);
  return root;
}

function mountChatWidget() {
  if (chatMounted) return;
  chatMounted = true;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/src/web/css/chatBot.css";
  document.head.appendChild(link);

  const el = renderChatRoot();
  reactRoot = ReactDOM.createRoot(el);
  reactRoot.render(<ChatApp />);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountChatWidget);
} else {
  mountChatWidget();
}
