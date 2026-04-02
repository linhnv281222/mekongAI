const API = "/admin/prompts";

/** Tên hiển thị tiếng Việt (ưu tiên hơn tên tiếng Anh từ API) */
const PROMPT_LABELS_VI = {
  "drawing-system": "Phân tích bản vẽ — Prompt hệ thống",
  "drawing-correction": "Sửa kết quả phân tích — Prompt hệ thống",
  "email-classify": "Phân loại email — Prompt",
  "gemini-drawing": "Phân tích bản vẽ (Gemini) — Prompt",
};
const KNOWLEDGE_LABELS_VI = {
  "vnt-materials": "Bảng quy đổi vật liệu VNT",
  "vnt-heat-treat": "Bảng xử lý nhiệt VNT",
  "vnt-surface": "Bảng xử lý bề mặt VNT",
  "vnt-shapes": "Bảng phân loại hình dạng VNT",
  "vnt-knowledge": "Kiến thức nội bộ VNT (Gemini)",
};
const PROMPT_DESC_VI = {
  "drawing-system":
    "Prompt hệ thống chính cho Claude Sonnet 4.6 — phân tích bản vẽ",
  "drawing-correction":
    "Prompt hệ thống cho chỉnh sửa kết quả phân tích qua chat",
  "email-classify": "Prompt phân loại email đến (Haiku)",
  "gemini-drawing": "Prompt phân tích bản vẽ dự phòng bằng Gemini 2.5",
};
const KNOWLEDGE_DESC_VI = {
  "vnt-materials":
    "Quy đổi tiêu chuẩn vật liệu (DIN/AISI/JIS) sang mã JIS nội bộ VNT",
  "vnt-heat-treat": "Ký hiệu xử lý nhiệt (JP/EN/FR) sang tên tiếng Việt VNT",
  "vnt-surface": "Ký hiệu xử lý bề mặt (JP/EN) sang tên tiếng Việt VNT",
  "vnt-shapes": "Phân loại phôi và hướng gia công",
  "vnt-knowledge": "Tóm tắt kiến thức cho bộ phân tích Gemini dự phòng",
};
function labelVi(key, fallback) {
  return PROMPT_LABELS_VI[key] || KNOWLEDGE_LABELS_VI[key] || fallback;
}
function descVi(key, fallback) {
  return PROMPT_DESC_VI[key] || KNOWLEDGE_DESC_VI[key] || fallback;
}

// ── State ──────────────────────────────────────────────────────────────
let currentView = { type: "overview" };
let promptData = [];
let knowledgeData = [];
let activePromptKey = null;
let editorContent = {};
let isDirty = false;
/** Bản đầy đủ từ GET /versions — đổi dropdown không cần fetch lại */
let currentPromptVersions = [];

// ── Init ───────────────────────────────────────────────────────────────
async function init() {
  await checkHealth();
  await loadAll();
  showOverview();
}

// ── API helpers ─────────────────────────────────────────────────────────
async function checkHealth() {
  const dot = document.getElementById("statusDot");
  const text = document.getElementById("statusText");
  try {
    const r = await fetch("/health");
    if (r.ok) {
      dot.className = "app-live-dot";
      text.textContent = "Đang kết nối";
    } else {
      dot.className = "app-live-dot app-live-dot--err";
      text.textContent = "Lỗi máy chủ";
    }
  } catch {
    dot.className = "app-live-dot app-live-dot--err";
    text.textContent = "Không kết nối";
  }
}

async function loadAll() {
  try {
    const [promptsRes, kbRes] = await Promise.all([
      fetch(API),
      fetch(`${API}/knowledge/list`),
    ]);
    const pd = await promptsRes.json();
    const kd = await kbRes.json();
    promptData = pd.data || [];
    knowledgeData = kd.data || [];
    renderSidebar();
  } catch (e) {
    toast("Không tải được cấu hình: " + e.message, "err");
  }
}

/** Cập nhật nội dung đúng số phiên bản đang chọn (không tạo v mới). */
async function savePromptVersionUpdate(key, version, content, note) {
  const res = await fetch(`${API}/${key}/versions/${version}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, note, created_by: "admin" }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || res.statusText);
  await loadAll();
  toast(`Đã lưu thay đổi cho v${version}`, "ok");
  return d;
}

/** Tạo phiên bản mới (số tăng). `activate`: có kích hoạt luôn không. */
async function savePromptVersionCreate(key, content, note, activate) {
  const res = await fetch(`${API}/${key}/versions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content,
      note,
      created_by: "admin",
      activate: !!activate,
    }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || res.statusText);
  await loadAll();
  if (d.version != null) {
    toast(
      `Đã tạo v${d.version}${d.activated ? " (đã kích hoạt)" : " (chưa kích hoạt — bấm «Dùng bản này» để áp dụng)"}`,
      "ok"
    );
  } else {
    toast(d.message || "Đã ghi tệp", "ok");
  }
  return d;
}

async function activatePromptVersion(key, version) {
  const res = await fetch(`${API}/${key}/versions/${version}/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || d.code || res.statusText);
  await loadAll();
  toast(`Đang dùng v${version} cho runtime`, "ok");
  return d;
}

async function saveKnowledge(key, content) {
  const res = await fetch(`${API}/knowledge/${key}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const d = await res.json();
    throw new Error(d.error);
  }
  await loadAll();
  toast("Đã lưu: " + key, "ok");
}

async function testPrompt(key, variables) {
  const res = await fetch(`${API}/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, variables }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error);
  return d.data;
}

// ── Render sidebar ──────────────────────────────────────────────────────
function renderSidebar() {
  const promptNav = document.getElementById("promptNav");
  const knowledgeNav = document.getElementById("knowledgeNav");

  promptNav.innerHTML = promptData
    .map((t) => {
      const ver = t.active_version ? `v${t.active_version}` : "—";
      const icon = t.key.includes("email")
        ? "&#9993;"
        : t.key.includes("gemini")
        ? "&#9729;"
        : t.key.includes("correct")
        ? "&#9998;"
        : "&#128196;";
      return `<div class="nav-item${
        currentView.type === "prompt" && activePromptKey === t.key
          ? " active"
          : ""
      }"
                 onclick="showPrompt('${t.key}')">
      <div class="nav-icon">${icon}</div>
      <span class="nav-label">${escapeHtml(labelVi(t.key, t.name))}</span>
      <span class="nav-version">${ver}</span>
    </div>`;
    })
    .join("");

  knowledgeNav.innerHTML = knowledgeData
    .map((k) => {
      const icon = k.key.includes("material")
        ? "&#9881;"
        : k.key.includes("heat")
        ? "&#128293;"
        : k.key.includes("surface")
        ? "&#128396;"
        : k.key.includes("shape")
        ? "&#128208;"
        : "&#128220;";
      return `<div class="nav-item${
        currentView.type === "knowledge" && activePromptKey === k.key
          ? " active"
          : ""
      }"
                 onclick="showKnowledge('${k.key}')">
      <div class="nav-icon">${icon}</div>
      <span class="nav-label">${escapeHtml(labelVi(k.key, k.name))}</span>
    </div>`;
    })
    .join("");
}

// ── Overview ────────────────────────────────────────────────────────────
function showOverview() {
  currentView = { type: "overview" };
  activePromptKey = null;
  renderSidebar();
  const allPrompts = [...promptData];
  const allKB = [...knowledgeData];
  document.getElementById("contentArea").innerHTML = `
    <div class="content-header">
      <div>
        <h2>Tổng quan cấu hình prompt</h2>
        <div class="meta">${allPrompts.length} mẫu prompt &middot; ${
    allKB.length
  } khối kiến thức</div>
      </div>
    </div>
    <table class="overview-table">
      <thead>
        <tr>
          <th>Tên</th><th>Mã</th><th>Phiên bản đang dùng</th><th>Biến</th><th>Nguồn</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${allPrompts
          .map(
            (t) => `
          <tr>
            <td><strong>${escapeHtml(labelVi(t.key, t.name))}</strong></td>
            <td><code style="color:var(--accent2);font-size:12px">${escapeHtml(
              t.key
            )}</code></td>
            <td>${
              t.active_version
                ? `<span class="tag active">v${t.active_version}</span>`
                : "<span class='tag fallback'>tệp</span>"
            }</td>
            <td>${(t.variables || [])
              .map(
                (v) =>
                  `<span class="var-chip" style="cursor:default">${escapeHtml(
                    v
                  )}</span>`
              )
              .join(" ")}</td>
            <td>${t.active_version ? "CSDL" : "mặc định"}</td>
            <td><button class="btn btn-sm btn-secondary" onclick="showPrompt('${
              t.key
            }')">Sửa</button></td>
          </tr>
        `
          )
          .join("")}
        ${allKB
          .map(
            (k) => `
          <tr>
            <td><strong>${escapeHtml(labelVi(k.key, k.name))}</strong></td>
            <td><code style="color:var(--accent2);font-size:12px">${escapeHtml(
              k.key
            )}</code></td>
            <td>—</td>
            <td><span class="tag draft">kiến thức</span></td>
            <td>${k.content ? "CSDL" : "mặc định"}</td>
            <td><button class="btn btn-sm btn-secondary" onclick="showKnowledge('${
              k.key
            }')">Sửa</button></td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

// ── Prompt Editor ────────────────────────────────────────────────────────
async function showPrompt(key) {
  currentView = { type: "prompt", key };
  activePromptKey = key;
  renderSidebar();

  const tpl = promptData.find((t) => t.key === key);
  if (!tpl) return;

  let versions = [];
  try {
    const r = await fetch(`${API}/${key}/versions`);
    if (r.ok) {
      const d = await r.json();
      versions = d.data || [];
    }
  } catch {}

  currentPromptVersions = versions;

  let fallbackContent = tpl.active_content || "";
  if (!fallbackContent) {
    try {
      const d = await testPrompt(key, {});
      fallbackContent = d.content || "";
    } catch {}
  }

  const fileMode = versions.length === 0;
  const activeV = tpl.active_version
    ? Number(tpl.active_version)
    : versions[0]
      ? Number(versions[0].version)
      : null;
  const defaultV = activeV != null && !Number.isNaN(activeV) ? activeV : null;
  const pickRow =
    defaultV != null
      ? versions.find((x) => Number(x.version) === defaultV)
      : null;
  const initialContent = pickRow?.content ?? fallbackContent;

  editorContent[key] = initialContent;
  const currentVars = detectVars(initialContent);

  const versionOptionsHtml = fileMode
    ? `<option value="__file__">Ghi vào tệp mặc định (không có phiên bản trong CSDL)</option>`
    : versions
        .map((v) => {
          const vn = Number(v.version);
          const star = v.is_active ? " ★ đang chạy" : "";
          return `<option value="${vn}"${vn === defaultV ? " selected" : ""}>v${vn} — ${escapeHtml(
            v.note || "không ghi chú"
          )} (${escapeHtml(v.created_by || "admin")})${star}</option>`;
        })
        .join("");

  document.getElementById("contentArea").innerHTML = `
    <div class="content-header">
      <div>
        <h2>${escapeHtml(labelVi(key, tpl.name))}</h2>
        <div class="meta">${escapeHtml(
          descVi(key, tpl.description || "")
        )} &middot; mã: <code style="color:var(--accent2)">${escapeHtml(
    key
  )}</code></div>
      </div>
      <div class="actions">
        <button class="btn btn-secondary" onclick="testCurrentPrompt()">Thử</button>
        <button class="btn btn-primary" onclick="saveCurrentPromptChanges()" title="Ghi đè nội dung đúng phiên bản đang chọn">Lưu thay đổi</button>
        <button class="btn btn-secondary" onclick="promptCreateNewVersion(false)" title="Thêm v tiếp theo, runtime vẫn giữ bản đang chạy">Tạo bản nháp mới</button>
        <button class="btn btn-secondary" onclick="promptCreateNewVersion(true)" title="Thêm v mới và chuyển runtime sang bản đó">Tạo &amp; kích hoạt</button>
        <button class="btn btn-secondary" id="btnActivateVersion" onclick="activateSelectedPromptVersion()" title="Chỉ đổi runtime sang phiên bản đang chọn (không đổi nội dung)">Dùng bản này</button>
      </div>
    </div>

    <div class="version-bar">
      <label>Phiên bản:</label>
      <select id="verSelect" data-file-mode="${fileMode ? "1" : "0"}" data-version-count="${
        versions.length
      }" data-active-version="${tpl.active_version ?? ""}" onchange="onVersionSelectChange()">
        ${versionOptionsHtml}
      </select>
      <button type="button" class="btn btn-sm btn-danger" id="btnDeleteVersion" onclick="deleteSelectedVersion()"
        title="Xóa phiên bản đang chọn (không xóa được nếu chỉ còn một bản trong CSDL).">
        Xóa phiên bản
      </button>
      <div class="version-meta" id="versionMetaLine">
        ${
          tpl.active_version
            ? `Runtime đang dùng: <strong>v${tpl.active_version}</strong> &middot; `
            : "Runtime: tệp mặc định &middot; "
        }
        ${fileMode ? "—" : `${versions.length} phiên bản trong CSDL`}
      </div>
    </div>
    <div class="editor-hint" style="margin-top:-6px;margin-bottom:10px">
      <strong>Lưu thay đổi</strong> — ghi đè đúng số v đang chọn.
      <strong>Tạo bản nháp mới</strong> — v+1, chưa kích hoạt.
      <strong>Tạo &amp; kích hoạt</strong> — v+1 và runtime dùng luôn bản đó.
      <strong>Dùng bản này</strong> — chỉ đổi runtime sang v đang chọn.
    </div>

    <div class="editor-hint">Biến trong mẫu (bấm để chèn):</div>
    <div class="variables-row" id="varChips">
      ${currentVars
        .map(
          (v) =>
            `<span class="var-chip" onclick="insertVar('${v}')">{{${v}}}</span>`
        )
        .join("")}
    </div>

    <input class="save-note" id="saveNote" placeholder="Ghi chú thay đổi, ví dụ: thêm quy tắc ren UNC-2B…" />

    <div class="editor-hint">Nội dung prompt (cú pháp {{TEN_BIEN}}):</div>
    <div class="editor-wrap">
      <textarea class="editor" id="promptEditor"
        oninput="markDirty()">${escapeHtml(editorContent[key] || "")}</textarea>
    </div>

    <div id="testPanel" style="display:none">
      <div class="test-panel">
        <h4>Thử kết quả render</h4>
        <div class="test-row">
          ${currentVars
            .map(
              (v) => `
            <div>
              <label>{{${v}}}</label>
              <textarea id="test_${v}" rows="2" placeholder="Nhập giá trị…">${getSampleValue(
                v
              )}</textarea>
            </div>
          `
            )
            .join("")}
        </div>
        <button class="btn btn-secondary btn-sm" onclick="runTest()">Chạy thử</button>
        <div id="testOutput" style="margin-top:12px">
          <div class="test-label">Kết quả sau khi thay biến:</div>
          <div class="test-output" id="testResult">—</div>
        </div>
      </div>
    </div>
  `;
  syncDeleteVersionButton();
  syncActivateButton();
}

function onVersionSelectChange() {
  switchVersion();
  syncDeleteVersionButton();
  syncActivateButton();
}

function syncDeleteVersionButton() {
  const sel = document.getElementById("verSelect");
  const btn = document.getElementById("btnDeleteVersion");
  if (!sel || !btn) return;
  const fileMode = sel.dataset.fileMode === "1";
  const n = parseInt(sel.dataset.versionCount || "0", 10);
  const picked = sel.value;
  const canDelete = !fileMode && picked !== "__file__" && n > 1;
  btn.disabled = !canDelete;
}

function syncActivateButton() {
  const sel = document.getElementById("verSelect");
  const btn = document.getElementById("btnActivateVersion");
  if (!sel || !btn) return;
  const fileMode = sel.dataset.fileMode === "1";
  if (fileMode) {
    btn.disabled = true;
    return;
  }
  const picked = parseInt(sel.value, 10);
  const raw = sel.dataset.activeVersion;
  let active = NaN;
  if (raw !== "" && raw != null && String(raw) !== "undefined") {
    active = parseInt(raw, 10);
  }
  const valid = !Number.isNaN(picked);
  if (!valid) {
    btn.disabled = true;
    return;
  }
  if (Number.isNaN(active)) {
    btn.disabled = false;
    return;
  }
  btn.disabled = picked === active;
}

async function deleteSelectedVersion() {
  const sel = document.getElementById("verSelect");
  if (!sel || sel.value === "__file__" || sel.dataset.fileMode === "1") return;
  const v = parseInt(sel.value, 10);
  if (Number.isNaN(v)) return;
  const key = currentView.key;
  if (!confirm(`Xóa vĩnh viễn phiên bản v${v}? Thao tác không hoàn tác.`))
    return;
  try {
    const res = await fetch(`${API}/${key}/versions/${v}`, {
      method: "DELETE",
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || res.statusText);
    toast(`Đã xóa phiên bản v${v}`, "ok");
    await loadAll();
    await showPrompt(key);
  } catch (e) {
    toast(e.message || "Xóa thất bại", "err");
  }
}

function detectVars(text) {
  const matches = [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
  return [...new Set(matches)];
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function markDirty() {
  isDirty = true;
}

function insertVar(name) {
  const ed = document.getElementById("promptEditor");
  const start = ed.selectionStart;
  const end = ed.selectionEnd;
  const text = ed.value;
  ed.value =
    text.substring(0, start) + "{{" + name + "}}" + text.substring(end);
  ed.focus();
  ed.selectionStart = ed.selectionEnd = start + name.length + 4;
  markDirty();
}

function switchVersion() {
  const selEl = document.getElementById("verSelect");
  const sel = selEl.value;
  const ed = document.getElementById("promptEditor");
  if (!ed) return;
  if (sel === "__file__") {
    ed.value = editorContent[currentView.key] || "";
    return;
  }
  const v = parseInt(sel, 10);
  if (Number.isNaN(v)) return;
  const row = currentPromptVersions.find((x) => Number(x.version) === v);
  ed.value = row?.content ?? "";
}

function testCurrentPrompt() {
  const panel = document.getElementById("testPanel");
  panel.style.display = panel.style.display === "none" ? "block" : "none";
  if (panel.style.display === "block") {
    const vars = detectVars(document.getElementById("promptEditor").value);
    const varChips = document.getElementById("varChips");
    varChips.innerHTML = vars
      .map(
        (v) =>
          `<span class="var-chip" onclick="insertVar('${v}')">{{${v}}}</span>`
      )
      .join("");
  }
}

async function runTest() {
  const vars = detectVars(document.getElementById("promptEditor").value);
  const variables = {};
  for (const v of vars) {
    const el = document.getElementById("test_" + v);
    if (el) variables[v] = el.value;
  }
  try {
    const result = await testPrompt(currentView.key, variables);
    document.getElementById("testResult").textContent =
      result.content || "(trống)";
  } catch (e) {
    document.getElementById("testResult").textContent = "Lỗi: " + e.message;
  }
}

async function saveCurrentPromptChanges() {
  const content = document.getElementById("promptEditor").value;
  const note = document.getElementById("saveNote").value;
  const sel = document.getElementById("verSelect");
  if (!content.trim()) {
    toast("Nội dung không được để trống", "warn");
    return;
  }
  try {
    if (sel?.dataset.fileMode === "1" || sel?.value === "__file__") {
      await savePromptVersionCreate(currentView.key, content, note, false);
    } else {
      const v = parseInt(sel.value, 10);
      if (Number.isNaN(v)) throw new Error("Chọn phiên bản hợp lệ");
      await savePromptVersionUpdate(currentView.key, v, content, note);
    }
    editorContent[currentView.key] = content;
    document.getElementById("saveNote").value = "";
    isDirty = false;
    await showPrompt(currentView.key);
  } catch (e) {
    toast("Lưu thất bại: " + e.message, "err");
  }
}

async function promptCreateNewVersion(activateAfter) {
  const content = document.getElementById("promptEditor").value;
  let note = document.getElementById("saveNote").value.trim();
  if (!content.trim()) {
    toast("Nội dung không được để trống", "warn");
    return;
  }
  if (!note) {
    note = activateAfter
      ? "Phiên bản mới (kích hoạt)"
      : "Phiên bản mới (bản nháp)";
  }
  try {
    await savePromptVersionCreate(currentView.key, content, note, !!activateAfter);
    document.getElementById("saveNote").value = "";
    isDirty = false;
    await showPrompt(currentView.key);
  } catch (e) {
    toast("Tạo phiên bản thất bại: " + e.message, "err");
  }
}

async function activateSelectedPromptVersion() {
  const sel = document.getElementById("verSelect");
  if (!sel || sel.dataset.fileMode === "1") return;
  const v = parseInt(sel.value, 10);
  if (Number.isNaN(v)) return;
  try {
    await activatePromptVersion(currentView.key, v);
    isDirty = false;
    await showPrompt(currentView.key);
  } catch (e) {
    toast("Kích hoạt thất bại: " + e.message, "err");
  }
}

function getSampleValue(v) {
  const samples = {
    DRAWING_SCHEMA: '{\\n  "ban_ve": { "ma_ban_ve": "string" }\\n}',
    VNT_MAT: "NHOM: AlCu4MgSi→A2017 | AL6061→A6061\\nTHEP: S45C→S45C",
    VNT_NHIET: "NHIET TOAN PHAN: 焼入れ焼戻し→Nhiệt toàn phần [HRC...]",
    VNT_BM: "ANOD NHOM: 白アルマイト→Anod trang",
    VNT_HINH: "Phi tron dac→Tien CNC",
    VNT_KNOWLEDGE: "BANGLUONGRIENG: A2017=2.8\\nVATLIEU: AL6061→A6061",
    emailFrom: "tanaka@example.jp",
    emailSubject: "見積依頼 — 精密部品見積もり",
    emailAttachments: "drawing.pdf",
    emailBody: "いつもお世話になっております。\\n見積依頼いたします。",
    CURRENT_JSON: '{"ban_ve":{"ma_ban_ve":"BV-001"}}',
    USER_REQUEST: "Đổi vật liệu thành SUS304",
  };
  return samples[v] || `Ví dụ cho {{${v}}}`;
}

// ── Knowledge Editor ──────────────────────────────────────────────────────
async function showKnowledge(key) {
  currentView = { type: "knowledge", key };
  activePromptKey = key;
  renderSidebar();

  const kb = knowledgeData.find((k) => k.key === key);
  if (!kb) return;

  document.getElementById("contentArea").innerHTML = `
    <div class="content-header">
      <div>
        <h2>${escapeHtml(labelVi(key, kb.name))}</h2>
        <div class="meta">${escapeHtml(
          descVi(key, kb.description || "")
        )} &middot; mã: <code style="color:var(--accent2)">${escapeHtml(
    key
  )}</code></div>
      </div>
      <div class="actions">
        <button class="btn btn-primary" onclick="saveCurrentKnowledge()">Lưu</button>
      </div>
    </div>
    <div class="editor-hint">Nội dung (văn bản thuần hoặc có cấu trúc — không cần cú pháp biến):</div>
    <textarea class="editor" id="kbEditor" style="min-height:300px">${escapeHtml(
      kb.content || ""
    )}</textarea>
    ${
      kb.updated_at
        ? `<div style="font-size:11px;color:var(--muted);margin-top:6px">Cập nhật lần cuối: ${new Date(
            kb.updated_at
          ).toLocaleString("vi-VN")}</div>`
        : ""
    }
    <div id="testPanel" style="display:none">
      <div class="test-panel">
        <h4>Thử kết quả render</h4>
        <button class="btn btn-secondary btn-sm" onclick="runKBTest()">Chạy thử</button>
        <div id="testOutput" style="margin-top:12px">
          <div class="test-label">Kết quả:</div>
          <div class="test-output" id="testResult">—</div>
        </div>
      </div>
    </div>
  `;
}

async function saveCurrentKnowledge() {
  const content = document.getElementById("kbEditor").value;
  if (!content.trim()) {
    toast("Nội dung không được để trống", "warn");
    return;
  }
  try {
    await saveKnowledge(currentView.key, content);
  } catch (e) {
    toast("Lưu thất bại: " + e.message, "err");
  }
}

async function runKBTest() {
  try {
    const result = await testPrompt("drawing-system", {
      VNT_MAT: document.getElementById("kbEditor").value,
      VNT_NHIET: "",
      VNT_BM: "",
      VNT_HINH: "",
    });
    document.getElementById("testResult").textContent =
      result.content?.substring(0, 1000) || "(trống)";
  } catch (e) {
    document.getElementById("testResult").textContent = "Lỗi: " + e.message;
  }
}

// ── Toast ───────────────────────────────────────────────────────────────
function toast(msg, type = "ok") {
  const container = document.getElementById("toastContainer");
  const el = document.createElement("div");
  el.className = "toast " + type;
  const icon =
    type === "ok" ? "&#10003;" : type === "err" ? "&#10007;" : "&#9888;";
  el.innerHTML = `<span>${icon}</span> ${msg}`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── Model Selector ─────────────────────────────────────────────────────────
async function loadCurrentProvider() {
  try {
    const r = await fetch("/admin/prompts/config");
    if (r.ok) {
      const d = await r.json();
      const provider = d.data?.provider || "claude";
      const sel = document.getElementById("modelSelect");
      if (sel) sel.value = provider;
      syncProviderStatus(provider);
    }
  } catch {}
}

function syncProviderStatus(provider) {
  const el = document.getElementById("modelStatus");
  if (!el) return;
  const icon = provider === "gemini" ? "&#9729;" : "&#128172;";
  el.innerHTML = `<span style="font-size:11px;color:var(--muted)">&#8594; ${icon} ${provider}</span>`;
}

async function onModelChange() {
  const sel = document.getElementById("modelSelect");
  if (!sel) return;
  const provider = sel.value;
  syncProviderStatus(provider);
  // Gửi kèm `model` để tương thích server cũ (từng bắt buộc cả hai trường)
  const modelLegacy =
    provider === "gemini"
      ? "gemini-3.1-pro-preview"
      : "claude-sonnet-4-6";
  try {
    const r = await fetch("/admin/prompts/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, model: modelLegacy }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      throw new Error(
        d.error || `Máy chủ trả lỗi HTTP ${r.status}`
      );
    }
    toast(
      `Đã đổi sang ${provider === "gemini" ? "Gemini" : "Claude"}`,
      "ok"
    );
  } catch (e) {
    toast("Lỗi: " + (e.message || "Không kết nối được máy chủ"), "err");
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────
async function init() {
  await checkHealth();
  await loadAll();
  await loadCurrentProvider();
  showOverview();
}
init();
