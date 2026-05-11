const API = "/admin/prompts";

// ── Knowledge variable config ────────────────────────────────────────────────
/** Map từ biến trong prompt → key knowledge block tương ứng */
const VAR_TO_KB = {
  VNT_KNOWLEDGE: "vnt-knowledge",
  MATERIAL: "vnt-materials",
  HEAT_TREAT: "vnt-heat-treat",
  SURFACE: "vnt-surface",
  SHAPE: "vnt-shapes",
};

/** Biến nào là "knowledge" (hiển thị chip xanh, click → mở bảng) */
const KNOWLEDGE_VARS = new Set([
  "VNT_KNOWLEDGE",
  "MATERIAL",
  "HEAT_TREAT",
  "SURFACE",
  "SHAPE",
]);

/** Mô tả ngắn cho từng biến knowledge (hiện trong tooltip/guide) */
const KB_VAR_LABELS = {
  VNT_KNOWLEDGE: "Bảng lượng riêng, mã vật liệu, hình dạng, mã qui trình VNT",
  MATERIAL: "Nguyên vật liệu — Map AISI 1045 → S45C, EN AW-6061 → A6061…",
  HEAT_TREAT: "Xử lý nhiệt — Map 焼入れ焼戻し → Nhiệt toàn phần [HRC…]",
  SURFACE: "Xử lý bề mặt — Map 白アルマイト → Anod trang, Hard Anodize…",
  SHAPE: "Phân loại hình dạng — Map hình dạng → phương án gia công",
};

/**
 * Xác định loại biến để render chip đúng màu.
 * @param {string} name — tên biến VD: "MATERIAL", "DRAWING_SCHEMA"
 * @returns {"knowledge"|"schema"|"prompt"}
 */
function detectVarType(name) {
  if (KNOWLEDGE_VARS.has(name)) return "knowledge";
  if (["DRAWING_SCHEMA", "CURRENT_JSON", "USER_REQUEST", "emailFrom", "emailSubject", "emailBody", "emailAttachments"].includes(name))
    return "schema";
  return "prompt";
}

/** Tên hiển thị tiếng Việt (ưu tiên hơn tên tiếng Anh từ API) */
const PROMPT_LABELS_VI = {
  "email-classify": "Phân loại email — Prompt",
  "gemini-drawing": "Phân tích bản vẽ (Gemini) — Prompt",
};
const KNOWLEDGE_LABELS_VI = {
  "vnt-knowledge": "Kiến thức nội bộ VNT (Gemini)",
};
const PROMPT_DESC_VI = {
  "email-classify": "Prompt phân loại email đến (Haiku)",
  "gemini-drawing": "Prompt phân tích bản vẽ dự phòng bằng Gemini 2.5",
};
const KNOWLEDGE_DESC_VI = {
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

async function saveKnowledge(key, payload) {
  // payload: string  (plain text)  hoặc  {format, headers, rows, content}
  const res = await fetch(`${API}/knowledge/${key}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  await loadAll();
  if (data.updated) {
    toast("Đã lưu: " + key, "ok");
  } else {
    toast("Lưu thất bại (DB: " + (data.error || "không khả dụng") + ")", "err");
  }
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

    <div class="knowledge-guide" id="kbGuidePanel">
      <details>
        <summary class="guide-summary">
          <span class="guide-icon">&#128218;</span> Hướng dẫn dùng kiến thức trong prompt
        </summary>
        <div class="guide-body">
          <p>Khi AI đọc bản vẽ, nó sẽ <strong>tự tra bảng</strong> để map về mã VNT nội bộ. Chèn biến kiến thức vào vị trí phù hợp trong prompt:</p>
          <table class="guide-table">
            <thead>
              <tr><th>Biến</th><th>Bảng kiến thức</th><th>Mục đích</th></tr>
            </thead>
            <tbody>
              <tr><td><code>{{MATERIAL}}</code></td><td>Nguyên vật liệu</td><td>Map AISI 1045 → S45C, EN AW-6061 → A6061…</td></tr>
              <tr><td><code>{{HEAT_TREAT}}</code></td><td>Xử lý nhiệt</td><td>Map 焼入れ焼戻し → Nhiệt toàn phần [HRC...]…</td></tr>
              <tr><td><code>{{SURFACE}}</code></td><td>Xử lý bề mặt</td><td>Map 白アルマイト → Anod trang, Hard Anodize…</td></tr>
              <tr><td><code>{{SHAPE}}</code></td><td>Phân loại hình dạng</td><td>Map hình dạng → phương án gia công</td></tr>
              <tr><td><code>{{VNT_KNOWLEDGE}}</code></td><td>Kiến thức nội bộ VNT</td><td>Bảng lượng riêng, mã vật liệu, hình dạng, mã qui trình</td></tr>
            </tbody>
          </table>
          <p class="guide-tip">&#9888; Chip <span class="chip-demo chip-knowledge">xanh dương</span> = biến kiến thức (bấm để xem bảng). Chip <span class="chip-demo chip-prompt">xám</span> = biến prompt thường (bấm để chèn).</p>
        </div>
      </details>
    </div>

    <div class="editor-hint">Biến trong mẫu (bấm chip để chèn hoặc xem bảng kiến thức):</div>
    <div class="variables-row" id="varChips">
      ${currentVars
        .map(
          (v) => {
            const type = detectVarType(v);
            const kbKey = VAR_TO_KB[v];
            const label = KB_VAR_LABELS[v] || "";
            const icon = KNOWLEDGE_VARS.has(v) ? "&#128203;" : "&#123;&#125;";
            const kb = kbKey ? knowledgeData.find((k) => k.key === kbKey) : null;
            if (type === "knowledge") {
              return `<span class="var-chip var-chip--knowledge"
                title="${escapeHtml(label)}&#10;Bấm để xem/sửa bảng"
                onclick="showKnowledge('${kbKey}')">
                <span class="chip-icon">${icon}</span>
                <span class="chip-name">{{${v}}}</span>
                <span class="chip-ref">${kbKey ? escapeHtml(kb?.name || kbKey) : ""}</span>
              </span>`;
            }
            return `<span class="var-chip var-chip--prompt"
              title="${escapeHtml(label)}"
              onclick="insertVar('${v}')">
              <span class="chip-icon">${icon}</span>
              <span class="chip-name">{{${v}}}</span>
            </span>`;
          }
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
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
    varChips.innerHTML = vars.map((v) => {
      const type = detectVarType(v);
      const kbKey = VAR_TO_KB[v];
      const label = KB_VAR_LABELS[v] || "";
      const icon = KNOWLEDGE_VARS.has(v) ? "&#128203;" : "&#123;&#125;";
      const kb = kbKey ? knowledgeData.find((k) => k.key === kbKey) : null;
      if (type === "knowledge") {
        return `<span class="var-chip var-chip--knowledge"
          title="${escapeHtml(label)}"
          onclick="showKnowledge('${kbKey}')">
          <span class="chip-icon">${icon}</span>
          <span class="chip-name">{{${v}}}</span>
          <span class="chip-ref">${kbKey ? escapeHtml(kb?.name || kbKey) : ""}</span>
        </span>`;
      }
      return `<span class="var-chip var-chip--prompt"
        title="${escapeHtml(label)}"
        onclick="insertVar('${v}')">
        <span class="chip-icon">${icon}</span>
        <span class="chip-name">{{${v}}}</span>
      </span>`;
    }).join("");
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

  const format = kb.format || "text";
  const headers = kb.headers || ["Mã gốc", "Mã VNT", "Ghi chú"];
  const rows = kb.rows || [];

  const isTableFormat = format === "table" && Array.isArray(rows) && rows.length > 0;

  document.getElementById("contentArea").innerHTML = `
    <div class="content-header">
      <div>
        <h2>${escapeHtml(labelVi(key, kb.name))}</h2>
        <div class="meta">
          ${escapeHtml(descVi(key, kb.description || ""))}
          &middot; mã: <code style="color:var(--accent2)">${escapeHtml(key)}</code>
          &middot; <span class="tag ${isTableFormat ? "active" : "draft"}">${isTableFormat ? "Bảng (" + rows.length + " dòng)" : "Text"}</span>
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-secondary" onclick="kbImportCSV()">&#128230; Import CSV</button>
        <button class="btn btn-secondary" onclick="kbExportCSV('${escapeHtml(key)}')">&#128229; Export CSV</button>
        <button class="btn btn-primary" onclick="saveCurrentKnowledge()">&#128190; Lưu</button>
      </div>
    </div>

    <!-- Table editor -->
    <div class="kb-table-container" id="kbTableContainer">
      <div class="kb-table-toolbar">
        <button class="btn btn-secondary" onclick="kbAddRow()">+ Thêm dòng</button>
        <button class="btn btn-secondary" onclick="kbDeleteSelectedRows()">&#128465; Xóa dòng đã chọn</button>
        <span class="kb-table-info">${rows.length} dòng</span>
      </div>
      <div class="kb-table-scroll">
        <table class="kb-table" id="kbTable">
          <thead>
            <tr>
              <th class="col-check"><input type="checkbox" id="kbSelectAll" onchange="kbToggleSelectAll()" title="Chọn tất cả"></th>
              ${headers.map((h, i) => `
              <th class="col-data">
                <div class="th-inner">
                  <span class="th-label" id="thLabel${i}">${escapeHtml(h)}</span>
                  <button class="th-edit-btn" onclick="kbEditHeader(${i})" title="Đổi tên cột">&#9998;</button>
                </div>
              </th>`).join("")}
              <th class="col-actions">Xóa</th>
            </tr>
          </thead>
          <tbody id="kbTableBody">
            ${renderKbTableRows(rows, headers)}
          </tbody>
        </table>
      </div>
    </div>

    ${
      kb.updated_at
        ? `<div style="font-size:11px;color:var(--muted);margin-top:8px">Cập nhật lần cuối: ${new Date(kb.updated_at).toLocaleString("vi-VN")}</div>`
        : ""
    }
  `;
}

function renderKbTableRows(rows, headers) {
  if (!Array.isArray(rows) || !rows.length) {
    return `<tr class="empty-row"><td colspan="${headers.length + 2}" style="text-align:center;color:var(--muted);padding:24px">
      Chưa có dữ liệu. Bấm <strong>+ Thêm dòng</strong> để bắt đầu.
    </td></tr>`;
  }
  return rows
    .map(
      (r, i) => `
      <tr data-row-index="${i}">
        <td class="col-check"><input type="checkbox" class="kb-row-check" data-idx="${i}"></td>
        ${headers.map((h, ci) => {
          const val = kbGetCellVal(r, h, ci);
          return `<td><input type="text" class="cell-input" value="${escapeHtml(val)}"
            onchange="kbOnCellChange(${i},${ci},this.value,'${escapeHtml(h.replace(/'/g, "\\'"))}')"></td>`;
        }).join("")}
        <td class="col-actions">
          <button class="btn-icon btn-icon--danger" onclick="kbDeleteRow(${i})" title="Xóa dòng">&#128465;</button>
        </td>
      </tr>`
    )
    .join("");
}

function kbEditHeader(colIndex) {
  const th = document.getElementById("thLabel" + colIndex);
  if (!th) return;
  const current = th.textContent;
  const input = document.createElement("input");
  input.type = "text";
  input.value = current;
  input.className = "th-edit-input";
  input.onblur = () => {
    th.textContent = input.value;
    input.remove();
    const kb = knowledgeData.find((k) => k.key === currentView.key);
    if (kb && kb.headers) kb.headers[colIndex] = input.value;
  };
  input.onkeydown = (e) => {
    if (e.key === "Enter") input.blur();
    if (e.key === "Escape") {
      th.textContent = current;
      input.remove();
    }
  };
  th.textContent = "";
  th.appendChild(input);
  input.focus();
  input.select();
}

function kbAddRow() {
  const kb = knowledgeData.find((k) => k.key === currentView.key);
  const headers = kb?.headers || ["Mã gốc", "Mã VNT", "Ghi chú"];
  const rows = kb?.rows || [];
  const newRow = { from: "", to: "", group: "", note: "" };
  rows.push(newRow);
  kb.rows = rows;
  const tbody = document.getElementById("kbTableBody");
  if (tbody) {
    tbody.innerHTML = renderKbTableRows(rows, headers);
    const newTr = tbody.querySelector(`tr[data-row-index="${rows.length - 1}"]`);
    if (newTr) newTr.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  document.querySelector(".kb-table-info").textContent = rows.length + " dòng";
}

function kbDeleteRow(rowIndex) {
  const kb = knowledgeData.find((k) => k.key === currentView.key);
  if (!kb || !kb.rows) return;
  kb.rows.splice(rowIndex, 1);
  const tbody = document.getElementById("kbTableBody");
  const headers = kb.headers || ["Mã gốc", "Mã VNT", "Ghi chú"];
  if (tbody) tbody.innerHTML = renderKbTableRows(kb.rows, headers);
  document.querySelector(".kb-table-info").textContent = kb.rows.length + " dòng";
}

function kbDeleteSelectedRows() {
  const checks = document.querySelectorAll(".kb-row-check:checked");
  if (!checks.length) {
    toast("Chọn ít nhất 1 dòng để xóa", "warn");
    return;
  }
  if (!confirm(`Xóa ${checks.length} dòng đã chọn?`)) return;
  const kb = knowledgeData.find((k) => k.key === currentView.key);
  if (!kb || !kb.rows) return;
  const idxs = [...checks].map((c) => parseInt(c.dataset.idx, 10)).sort((a, b) => b - a);
  for (const i of idxs) kb.rows.splice(i, 1);
  const tbody = document.getElementById("kbTableBody");
  const headers = kb.headers || ["Mã gốc", "Mã VNT", "Ghi chú"];
  if (tbody) tbody.innerHTML = renderKbTableRows(kb.rows, headers);
  document.querySelector(".kb-table-info").textContent = kb.rows.length + " dòng";
}

function kbToggleSelectAll() {
  const sel = document.getElementById("kbSelectAll");
  const checks = document.querySelectorAll(".kb-row-check");
  checks.forEach((c) => (c.checked = sel.checked));
}

function kbGetCellVal(row, h, colIndex) {
  if (!row) return "";
  // Cấu trúc 4 bảng knowledge: Nhóm(0) | Mã gốc(1) | Kết quả VNT(2) | Ghi chú(3)
  if (colIndex === 0) return row.group || "";
  if (colIndex === 1) return row.from || "";
  if (colIndex === 2) return row.to || "";
  return row.note || row[h] || "";
}

function kbOnCellChange(rowIndex, colIndex, value, header) {
  const kb = knowledgeData.find((k) => k.key === currentView.key);
  if (!kb || !kb.rows) return;
  const row = kb.rows[rowIndex];
  if (!row) return;
  if (colIndex === 0) row.group = value;
  else if (colIndex === 1) row.from = value;
  else if (colIndex === 2) row.to = value;
  else row.note = value;
}


async function kbImportCSV() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".csv,.txt";
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const kb = knowledgeData.find((k) => k.key === currentView.key);
    if (!kb) return;
    const headers = kb.headers || ["Mã gốc", "Mã VNT", "Ghi chú"];
    const newRows = parseCSVToRows(text, headers);
    if (!newRows.length) {
      toast("Không đọc được dữ liệu từ file CSV", "warn");
      return;
    }
    kb.rows = [...(kb.rows || []), ...newRows];
    const tbody = document.getElementById("kbTableBody");
    if (tbody) tbody.innerHTML = renderKbTableRows(kb.rows, headers);
    document.querySelector(".kb-table-info").textContent = kb.rows.length + " dòng";
    toast(`Đã thêm ${newRows.length} dòng từ CSV`, "ok");
  };
  input.click();
}

function kbExportCSV(key) {
  const kb = knowledgeData.find((k) => k.key === key);
  if (!kb || !kb.rows?.length) {
    toast("Không có dữ liệu để export", "warn");
    return;
  }
  const headers = kb.headers || ["Mã gốc", "Mã VNT", "Ghi chú"];
  const lines = [headers.join(",")];
  for (const row of kb.rows) {
    const vals = headers.map((h) => {
      let v = "";
      if (h === "Nhóm vật liệu" || h === "Nhóm xử lý" || h === "Loại phôi") v = row.group || "";
      else if (h === "Mã gốc (quốc tế)" || h === "Ký hiệu gốc" || h === "Đặc điểm") v = row.from || "";
      else if (h === "Mã VNT" || h === "Kết quả VNT" || h === "Phương án gia công") v = row.to || "";
      else v = row.note || "";
      return `"${String(v).replace(/"/g, '""')}"`;
    });
    lines.push(vals.join(","));
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${key}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`Đã export ${kb.rows.length} dòng`, "ok");
}

function parseCSVToRows(text, headers) {
  const rows = [];
  const lines = (text || "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(",").map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"').trim());
    if (cols.length < 2) continue;
    rows.push({ from: cols[0] || "", to: cols[1] || "", group: cols[2] || "", note: cols[3] || "" });
  }
  return rows;
}

async function saveCurrentKnowledge() {
  const kb = knowledgeData.find((k) => k.key === currentView.key);
  if (!kb) return;

  const thLabels = document.querySelectorAll(".th-label");
  const headers = [...thLabels].map((th) => th.textContent.trim());
  const rows = kb.rows || [];
  const textContent = renderKbToText(headers, rows);
  try {
    await saveKnowledge(currentView.key, { format: "table", headers, rows, content: textContent });
  } catch (e) {
    // saveKnowledge tự toast lỗi rồi
  }
}

function renderKbToText(headers, rows) {
  if (!Array.isArray(rows) || !rows.length) return "";
  const lines = [];
  lines.push(headers.join(" | "));
  lines.push(headers.map(() => "---").join(" | "));
  for (const r of rows) {
    const vals = headers.map((h, ci) => kbGetCellVal(r, h, ci));
    lines.push(vals.join(" | "));
  }
  return lines.join("\n");
}

async function runKBTest() {
  try {
    const kb = knowledgeData.find((k) => k.key === currentView.key);
    const headers = kb?.headers || ["Mã gốc", "Mã VNT"];
    const rows = kb?.rows || [];
    const text = renderKbToText(headers, rows);
    const result = await testPrompt("gemini-drawing", {
      VNT_KNOWLEDGE: text,
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
      ? "gemini-3-flash-preview"
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
