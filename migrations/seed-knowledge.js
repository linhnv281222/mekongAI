/**
 * Seed knowledge_blocks với dữ liệu JSON table (khởi tạo hoặc migrate từ text cũ).
 * Chạy 1 lần: node migrations/seed-knowledge.js
 */
import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { config } from "dotenv";

config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULTS_DIR = path.join(__dirname, "..", "src", "prompts", "defaults");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:admin@localhost:5432/mechanical_ai";

const pool = new pg.Pool({ connectionString: DB_URL });

// ── Parse vnt-materials.txt → JSON table ────────────────────────────────────
function parseMaterials(text) {
  const headers = ["Nhóm vật liệu", "Mã gốc (quốc tế)", "Mã VNT", "Ghi chú"];
  const rows = [];

  const groups = [
    { prefix: "NHOM:", label: "Nhôm" },
    { prefix: "THEP:", label: "Thép" },
    { prefix: "INOX:", label: "Inox" },
    { prefix: "DONG:", label: "Đồng" },
    { prefix: "NHUA:", label: "Nhựa" },
  ];

  for (const g of groups) {
    const line = text.split("\n").find((l) => l.trim().startsWith(g.prefix));
    if (!line) continue;
    const mappingPart = line.replace(g.prefix, "").trim();
    const entries = mappingPart
      .split("|")
      .map((e) => e.trim())
      .filter(Boolean);
    for (const entry of entries) {
      const [fromPart, to] = entry.split("→").map((s) => s.trim());
      if (!fromPart || !to) continue;
      const froms = fromPart.split("/").map((s) => s.trim());
      for (const from of froms) {
        if (!from) continue;
        rows.push({
          from,
          to,
          group: g.label,
          note: from === froms[0] ? "" : `alias:${froms[0]}`,
        });
      }
    }
  }
  return { headers, rows };
}

// ── Parse vnt-heat-treat.txt → JSON table ────────────────────────────────────
function parseHeatTreat(text) {
  const headers = ["Nhóm xử lý", "Ký hiệu gốc", "Kết quả VNT", "Ghi chú"];
  const rows = [];

  const groups = [
    { prefix: "NHIET TOAN PHAN:", label: "Nhiệt toàn phần" },
    { prefix: "NHIET MOT PHAN:", label: "Nhiệt một phần/cao tần" },
    { prefix: "DIEU CHAT:", label: "Điều chất" },
  ];

  for (const g of groups) {
    const line = text.split("\n").find((l) => l.trim().startsWith(g.prefix));
    if (!line) continue;
    const mappingPart = line.replace(g.prefix, "").trim();
    const entries = mappingPart.split("→").map((e) => e.trim());
    if (entries.length < 2) continue;

    const fromPart = entries.slice(0, -1).join(" | ");
    const to = entries[entries.length - 1];
    const froms = fromPart
      .split("|")
      .map((e) => e.trim())
      .filter(Boolean);
    for (const from of froms) {
      rows.push({ from, to, group: g.label, note: "" });
    }
  }
  return { headers, rows };
}

// ── Parse vnt-surface.txt → JSON table ───────────────────────────────────────
function parseSurface(text) {
  const headers = ["Nhóm xử lý", "Ký hiệu gốc", "Kết quả VNT", "Ghi chú"];
  const rows = [];

  const groups = [
    { prefix: "ANOD NHOM:", label: "Anod nhôm" },
    { prefix: "MA:", label: "Mạ" },
    { prefix: "KHONG XU LY:", label: "Không xử lý" },
  ];

  for (const g of groups) {
    const line = text.split("\n").find((l) => l.trim().startsWith(g.prefix));
    if (!line) continue;
    const mappingPart = line.replace(g.prefix, "").trim();
    const entries = mappingPart
      .split("|")
      .map((e) => e.trim())
      .filter(Boolean);
    for (const entry of entries) {
      const [fromPart, to] = entry.split("→").map((s) => s.trim());
      if (!fromPart || !to) continue;
      const froms = fromPart.split("/").map((s) => s.trim());
      for (const from of froms) {
        rows.push({ from, to, group: g.label, note: "" });
      }
    }
  }
  return { headers, rows };
}

// ── Parse vnt-shapes.txt → JSON table ────────────────────────────────────────
function parseShapes(text) {
  const headers = ["Loại phôi", "Đặc điểm", "Phương án gia công", "Ghi chú"];
  const rows = [];

  const groups = [
    { prefix: "Phi tron dac:", label: "Tròn đặc" },
    { prefix: "Phi tron ong:", label: "Tròn ống" },
    { prefix: "Hinh tam:", label: "Hình tấm" },
    { prefix: "Luc giac:", label: "Lục giác" },
    { prefix: "Hon hop:", label: "Hỗn hợp" },
  ];

  for (const g of groups) {
    const line = text.split("\n").find((l) => l.trim().startsWith(g.prefix));
    if (!line) continue;
    const mappingPart = line.replace(g.prefix, "").trim();
    const parts = mappingPart.split("→").map((s) => s.trim());
    rows.push({
      from: g.label,
      to: parts[parts.length - 1] || "",
      group: g.label,
      note: parts.length > 1 ? parts[0] : "",
    });
  }
  return { headers, rows };
}

// ── Parse vnt-knowledge.txt → JSON table ──────────────────────────────────────
function parseVntKnowledge(text) {
  const headers = ["Nhóm xử lý", "Ký hiệu gốc", "Kết quả VNT", "Ghi chú"];
  const rows = [];

  // BANGLUONGRIENG: key=val,key=val,...
  const blLine = text
    .split("\n")
    .find((l) => l.trim().startsWith("BANGLUONGRIENG:"));
  if (blLine) {
    const mappingPart = blLine.replace("BANGLUONGRIENG:", "").trim();
    const entries = mappingPart
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    for (const entry of entries) {
      const eqIdx = entry.indexOf("=");
      if (eqIdx === -1) continue;
      rows.push({
        group: "Bảng lượng riêng",
        from: entry.slice(0, eqIdx).trim(),
        to: entry.slice(eqIdx + 1).trim(),
        note: "",
      });
    }
  }

  // VATLIEU: code/code→vnt | code→vnt
  const vlLine = text.split("\n").find((l) => l.trim().startsWith("VATLIEU:"));
  if (vlLine) {
    const mappingPart = vlLine.replace("VATLIEU:", "").trim();
    const entries = mappingPart
      .split("|")
      .map((e) => e.trim())
      .filter(Boolean);
    for (const entry of entries) {
      const arrowIdx = entry.indexOf("→");
      if (arrowIdx === -1) continue;
      const fromPart = entry.slice(0, arrowIdx).trim();
      const to = entry.slice(arrowIdx + 1).trim();
      const froms = fromPart.split("/").map((s) => s.trim());
      for (const from of froms) {
        rows.push({ group: "Bảng vật liệu", from, to, note: "" });
      }
    }
  }

  // HINHDANG: shape→method
  const hdLine = text.split("\n").find((l) => l.trim().startsWith("HINHDANG:"));
  if (hdLine) {
    const mappingPart = hdLine.replace("HINHDANG:", "").trim();
    const entries = mappingPart
      .split("|")
      .map((e) => e.trim())
      .filter(Boolean);
    for (const entry of entries) {
      const arrowIdx = entry.indexOf("→");
      if (arrowIdx === -1) continue;
      rows.push({
        group: "Hình dạng",
        from: entry.slice(0, arrowIdx).trim(),
        to: entry.slice(arrowIdx + 1).trim(),
        note: "",
      });
    }
  }

  // MAQT: code=method
  const mqLine = text.split("\n").find((l) => l.trim().startsWith("MAQT:"));
  if (mqLine) {
    const mappingPart = mqLine.replace("MAQT:", "").trim();
    const entries = mappingPart
      .split("|")
      .map((e) => e.trim())
      .filter(Boolean);
    for (const entry of entries) {
      const eqIdx = entry.indexOf("=");
      if (eqIdx === -1) continue;
      rows.push({
        group: "Mã qui trình",
        from: entry.slice(0, eqIdx).trim(),
        to: entry.slice(eqIdx + 1).trim(),
        note: "",
      });
    }
  }

  return { headers, rows };
}

// ── Main ──────────────────────────────────────────────────────────────────────
const KNOWLEDGE_SEEDS = [
  {
    key: "vnt-materials",
    name: "Nguyên vật liệu",
    description: "Quy đổi mã vật liệu quốc tế sang mã VNT nội bộ",
    parser: parseMaterials,
  },
  {
    key: "vnt-heat-treat",
    name: "Xử lý nhiệt",
    description: "Ký hiệu xử lý nhiệt → tên tiếng Việt VNT",
    parser: parseHeatTreat,
  },
  {
    key: "vnt-surface",
    name: "Xử lý bề mặt",
    description: "Ký hiệu xử lý bề mặt → tên tiếng Việt VNT",
    parser: parseSurface,
  },
  {
    key: "vnt-shapes",
    name: "Phân loại hình dạng",
    description: "Phân loại hình dạng phôi và phương án gia công",
    parser: parseShapes,
  },
  {
    key: "vnt-knowledge",
    name: "Kiến thức nội bộ VNT",
    description: "Bảng lượng riêng, vật liệu, hình dạng, mã qui trình VNT",
    parser: parseVntKnowledge,
  },
];

async function main() {
  const client = await pool.connect();
  try {
    for (const seed of KNOWLEDGE_SEEDS) {
      const filePath = path.join(DEFAULTS_DIR, `${seed.key}.txt`);
      if (!fs.existsSync(filePath)) {
        console.warn(`  [skip] ${seed.key} — file not found`);
        continue;
      }
      const text = fs.readFileSync(filePath, "utf8");
      const { headers, rows } = seed.parser(text);

      // Render text để lưu vào content (backup)
      const textContent = renderTableText(seed.name, headers, rows);

      // Upsert với format=table (cột: key, name, description, content, format, headers, kb_rows, knowledge_key, updated_at)
      await client.query(
        `INSERT INTO knowledge_blocks (key, name, description, content, format, headers, kb_rows, knowledge_key, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$1,NOW())
         ON CONFLICT (key) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           content = EXCLUDED.content,
           format = EXCLUDED.format,
           headers = EXCLUDED.headers,
           kb_rows = EXCLUDED.kb_rows,
           updated_at = NOW()`,
        [
          seed.key,
          seed.name,
          seed.description,
          textContent,
          "table",
          JSON.stringify(headers),
          JSON.stringify(rows),
        ]
      );
    }
  } finally {
    client.release();
    await pool.end();
  }
}

function renderTableText(title, headers, rows) {
  const lines = [title.toUpperCase(), ""];
  lines.push(headers.join(" | "));
  lines.push(headers.map(() => "---").join(" | "));
  for (const r of rows) {
    const vals = headers.map((h) => {
      if (h === "Nhóm vật liệu" || h === "Nhóm xử lý" || h === "Loại phôi")
        return r.group || "";
      if (h === "Mã gốc (quốc tế)" || h === "Ký hiệu gốc" || h === "Đặc điểm")
        return r.from || "";
      if (h === "Mã VNT" || h === "Kết quả VNT" || h === "Phương án gia công")
        return r.to || "";
      return r.note || "";
    });
    lines.push(vals.join(" | "));
  }
  return lines.join("\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
