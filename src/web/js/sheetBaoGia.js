const INCH_MM = 25.4,
  LUU_DU = 5;
let file = null,
  nhiet = false;

// Upload
const dz = document.getElementById("dz");
const fi = document.getElementById("fi");
dz.addEventListener("dragover", (e) => {
  e.preventDefault();
  dz.classList.add("drag");
});
dz.addEventListener("dragleave", () => dz.classList.remove("drag"));
dz.addEventListener("drop", (e) => {
  e.preventDefault();
  dz.classList.remove("drag");
  const f = e.dataTransfer.files[0];
  if (f?.type === "application/pdf") setFile(f);
});
fi.addEventListener("change", (e) => {
  if (e.target.files[0]) setFile(e.target.files[0]);
});

function setFile(f) {
  file = f;
  document.getElementById("fname").textContent = f.name;
  document.getElementById("finfo").style.display = "flex";
  document.getElementById("btnGo").disabled = false;
}

async function analyze() {
  if (!file) return;
  document.getElementById("btnGo").disabled = true;
  document.getElementById("analyzing").style.display = "flex";

  const selectedProvider = document.getElementById("modelSelect").value;
  const form = new FormData();
  form.append("file", file);

  document.getElementById("analyzingText").textContent = `AI đang phân tích... (${selectedProvider === "gemini" ? "Gemini" : "Claude"})`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);

  try {
    const res = await fetch(
      `/drawings?provider=${encodeURIComponent(selectedProvider)}`,
      {
        method: "POST",
        body: form,
        signal: controller.signal,
      }
    );
    clearTimeout(timer);

    let json;
    try {
      json = await res.json();
    } catch (e) {
      throw new Error("Server trả về dữ liệu không hợp lệ (không phải JSON)");
    }

    if (!res.ok)
      throw new Error(
        json.error || json.detail || "Lỗi server HTTP " + res.status
      );

    fillForm(json.data, json.provider || selectedProvider);
  } catch (e) {
    clearTimeout(timer);
    const isTimeout = e.name === "AbortError";
    const msg = isTimeout
      ? "Quá 120 giây không có phản hồi. Kiểm tra:\n- Server có đang chạy không?\n- API key có đúng không?\n- Xem log trong terminal npm start"
      : "Lỗi: " + e.message + "\n\nXem chi tiết trong terminal npm start";
    alert(msg);
    document.getElementById("btnGo").disabled = false;
  } finally {
    document.getElementById("analyzing").style.display = "none";
  }
}

function fillForm(d, providerUsed) {
  document.getElementById("empty").style.display = "none";
  document.getElementById("fbody").style.display = "block";

  if (providerUsed) {
    const badge = `<span class="model-badge ${providerUsed === "gemini" ? "badge-gemini" : "badge-claude"}">${providerUsed}</span>`;
    const head = document.querySelector(".sec-head");
    if (head && !head.querySelector(".model-badge"))
      head.insertAdjacentHTML("beforeend", badge);
  }

  sv("ma_ban_ve", d.ban_ve?.ma_ban_ve);
  sv("revision", d.ban_ve?.revision);
  sv("ten_chi_tiet", d.ban_ve?.ten_chi_tiet);
  sv("ma_vl", d.vat_lieu?.ma);
  sv("loai_vl", d.vat_lieu?.loai);
  setNhiet(!!d.vat_lieu?.nhiet_luyen);
  sv("nhiet_detail", d.vat_lieu?.nhiet_luyen || "");
  sv("so_luong", d.san_xuat?.so_luong);
  sv(
    "xu_ly_bm",
    (d.xu_ly?.be_mat || []).map((x) => x.ten).join(", ") || "Không"
  );

  sv(
    "ma_qt",
    d.ma_quy_trinh || "QT-" + String(Math.floor(Math.random() * 900) + 100)
  );
  sv("so_nc", (d.nguyen_cong_cnc || []).length || "");
  const tongLo = (d.be_mat_gia_cong || []).filter((b) => {
    const l = (b.loai || "").toLowerCase();
    return (
      l.includes("ren") ||
      l.includes("trơn") ||
      l.includes("tron") ||
      l.includes("csk") ||
      l.includes("lỗ") ||
      l.includes("lo")
    );
  }).length;
  sv("tong_lo", tongLo || "");

  const kt = d.kich_thuoc_bao || {};
  const c = (kt.don_vi || "").toLowerCase() === "inch" ? INCH_MM : 1;
  const r = (n) => Math.round(n * 10) / 10;

  const kieuMap = {
    "phi tron dac": "Phi tròn đặc",
    "phi tron ong": "Phi tròn ống",
    "hinh tam": "Hình tấm",
    "luc giac": "Lục giác",
    "hon hop": "Hỗn hợp",
    "tron xoay": "Phi tròn đặc",
    "vuong canh": "Hình tấm",
  };
  const kp = (d.hinh_dang?.kieu_phoi || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
  let hdVal = "";
  for (const [k, v] of Object.entries(kieuMap)) {
    if (kp.includes(k)) {
      hdVal = v;
      break;
    }
  }
  if (!hdVal) {
    const loai = (d.hinh_dang?.loai || "").toLowerCase();
    if (loai.includes("tron") || loai.includes("tròn")) hdVal = "Phi tròn đặc";
    else if (loai.includes("vuong") || loai.includes("vuông"))
      hdVal = "Hình tấm";
    else if (loai.includes("hon") || loai.includes("hỗn")) hdVal = "Hỗn hợp";
  }
  document.getElementById("hinh_dang").value = hdVal;
  syncPA();

  const isTron =
    hdVal === "Phi tròn đặc" ||
    hdVal === "Phi tròn ống" ||
    hdVal === "Lục giác";
  if (isTron) {
    sv("sp_l", kt.dai ? r(kt.dai * c) : "");
    sv(
      "sp_phi_lon",
      kt.phi_lon
        ? r(kt.phi_lon * c)
        : kt.cao_hoac_duong_kinh
        ? r(kt.cao_hoac_duong_kinh * c)
        : ""
    );
    sv("sp_phi_nho", kt.phi_nho ? r(kt.phi_nho * c) : "");
    sv("ph_l", kt.dai ? r(kt.dai * c + LUU_DU) : "");
    sv(
      "ph_phi_lon",
      kt.phi_lon
        ? r(kt.phi_lon * c + 5)
        : kt.cao_hoac_duong_kinh
        ? r(kt.cao_hoac_duong_kinh * c + 5)
        : ""
    );
    sv("ph_phi_nho", kt.phi_nho ? r(Math.max(0, kt.phi_nho * c - 5)) : "");
  } else {
    sv("sp_l", kt.dai ? r(kt.dai * c) : "");
    sv("sp_w", kt.rong ? r(kt.rong * c) : "");
    sv("sp_h", kt.cao_hoac_duong_kinh ? r(kt.cao_hoac_duong_kinh * c) : "");
    sv("ph_l", kt.dai ? r(kt.dai * c + LUU_DU) : "");
    sv("ph_w", kt.rong ? r(kt.rong * c + LUU_DU) : "");
    sv(
      "ph_h",
      kt.cao_hoac_duong_kinh ? r(kt.cao_hoac_duong_kinh * c + LUU_DU) : ""
    );
  }

  const steps = document.getElementById("steps");
  steps.innerHTML =
    (d.nguyen_cong_cnc || [])
      .map(
        (s) => `
    <div class="step-item">
      <div class="snum">${s.stt}</div>
      <div><div class="sname">${s.ten}</div><div class="smeta">${s.may}${
          s.ghi_chu ? " · " + s.ghi_chu : ""
        }</div></div>
    </div>`
      )
      .join("") ||
    '<div style="font-size:12px;color:#9aa3b5">Không có dữ liệu</div>';

  const notes = (d.be_mat_gia_cong || [])
    .filter((b) => b.critical)
    .map(
      (b) =>
        `[CRITICAL] ${b.be_mat}: ${b.quy_cach}${
          b.dung_sai ? " · DT: " + b.dung_sai : ""
        }`
    );
  if (d.san_xuat?.tieu_chuan)
    notes.push("Tiêu chuẩn: " + d.san_xuat.tieu_chuan);
  sv("chi_tiet", notes.join("\n"));
}

function syncPA() {
  const m = {
    "Phi tròn đặc": "Tiện CNC",
    "Phi tròn ống": "Tiện CNC",
    "Hình tấm": "Phay CNC",
    "Lục giác": "Tiện CNC",
    "Hỗn hợp": "Tiện + Phay",
  };
  const loai = document.getElementById("hinh_dang").value;
  document.getElementById("phuong_an").value = m[loai] || "";
  renderKT(loai);
}

function renderKT(loai) {
  const isTron =
    loai === "Phi tròn đặc" || loai === "Phi tròn ống" || loai === "Lục giác";
  const isOng = loai === "Phi tròn ống";
  const spBody = document.getElementById("sp-body");
  if (isTron) {
    spBody.innerHTML = `<div class="row c3">
      <div class="field"><label>Chiều dài (L)</label><input type="number" id="sp_l" step="0.1"/></div>
      <div class="field"><label>Ø lớn</label><input type="number" id="sp_phi_lon" step="0.1"/></div>
      <div class="field"><label>${
        isOng ? "Ø trong (nhỏ)" : "Ø nhỏ (min)"
      }</label><input type="number" id="sp_phi_nho" step="0.1"/></div>
    </div>`;
  } else {
    spBody.innerHTML = `<div class="row c3">
      <div class="field"><label>Dài (L)</label><input type="number" id="sp_l" step="0.1"/></div>
      <div class="field"><label>Rộng (W)</label><input type="number" id="sp_w" step="0.1"/></div>
      <div class="field"><label>Cao (H)</label><input type="number" id="sp_h" step="0.1"/></div>
    </div>`;
  }
  const phBody = document.getElementById("ph-body");
  if (isTron) {
    phBody.innerHTML = `<div class="row c3">
      <div class="field"><label>Chiều dài (L)</label><input type="number" id="ph_l" step="0.1"/></div>
      <div class="field"><label>Ø lớn</label><input type="number" id="ph_phi_lon" step="0.1"/></div>
      <div class="field"><label>${
        isOng ? "Ø trong" : "Ø nhỏ"
      }</label><input type="number" id="ph_phi_nho" step="0.1"/></div>
    </div>`;
  } else {
    phBody.innerHTML = `<div class="row c3">
      <div class="field"><label>Dài (L)</label><input type="number" id="ph_l" step="0.1"/></div>
      <div class="field"><label>Rộng (W)</label><input type="number" id="ph_w" step="0.1"/></div>
      <div class="field"><label>Cao (H)</label><input type="number" id="ph_h" step="0.1"/></div>
    </div>`;
  }
}

function setNhiet(v) {
  nhiet = v;
  document.getElementById("tnYes").className = "tbtn" + (v ? " ayes" : "");
  document.getElementById("tnNo").className = "tbtn" + (!v ? " ano" : "");
}

function sv(id, val) {
  const e = document.getElementById(id);
  if (e && val != null) e.value = val;
}
function gv(id) {
  return document.getElementById(id)?.value || "";
}

function clearAll() {
  [
    "ma_ban_ve",
    "revision",
    "ten_chi_tiet",
    "ma_vl",
    "loai_vl",
    "nhiet_detail",
    "so_luong",
    "xu_ly_bm",
    "phuong_an",
    "ma_qt",
    "so_nc",
    "tong_lo",
    "sp_l",
    "sp_w",
    "sp_h",
    "ph_l",
    "ph_w",
    "ph_h",
    "chi_tiet",
  ].forEach((id) => {
    const e = document.getElementById(id);
    if (e) e.value = "";
  });
  document.getElementById("hinh_dang").value = "";
  document.getElementById("steps").innerHTML = "";
  setNhiet(false);
  renderKT("");
}

function fillDemo() {
  fillForm({
    ban_ve: {
      ma_ban_ve: "715-C07377-001",
      revision: "C",
      ten_chi_tiet: "HUB, T1, SHLDR, UPR, BE, 3DFP",
    },
    vat_lieu: { ma: "AL6061-T6", loai: "Nhôm", nhiet_luyen: "T6" },
    san_xuat: { so_luong: 2, tieu_chuan: "ASME Y14.5-2009" },
    xu_ly: { be_mat: [] },
    hinh_dang: {
      loai: "Tròn xoay",
      kieu_phoi: "Phi tròn đặc",
      phuong_an_gia_cong: "Tiện CNC",
    },
    kich_thuoc_bao: {
      don_vi: "inch",
      dai: 4.7239,
      rong: null,
      cao_hoac_duong_kinh: 4.7239,
      phi_lon: 4.7239,
      phi_nho: 3.7419,
    },
    nguyen_cong_cnc: [
      {
        stt: 1,
        ten: "Tiện thô + tinh mặt ngoài",
        may: "Tiện CNC",
        ghi_chu: "Ø4.7239 g6, Ø4.3701 h7",
      },
      {
        stt: 2,
        ten: "Tiện bore lỗ trong + bậc vai",
        may: "Tiện CNC",
        ghi_chu: "Section A-A",
      },
      {
        stt: 3,
        ten: "Khoan + taro lỗ ren phân bố tròn",
        may: "Phay CNC 4 trục",
        ghi_chu: "6 nhóm B.C khác nhau",
      },
      {
        stt: 4,
        ten: "Kiểm tra CMM",
        may: "CMM",
        ghi_chu: "GD&T critical features",
      },
    ],
    be_mat_gia_cong: [
      {
        be_mat: "Mặt trụ ngoài",
        quy_cach: 'Ø4.7231~4.7239"',
        dung_sai: "g6",
        critical: true,
      },
      {
        be_mat: "Bore trong",
        quy_cach: 'Ø3.7411~3.7419"',
        dung_sai: '.0008"',
        critical: true,
      },
      {
        be_mat: "Chiều cao",
        quy_cach: '1.969"',
        dung_sai: "+.003/-.000",
        critical: true,
      },
    ],
  });
}

function exportJSON() {
  const data = {
    ma_ban_ve: gv("ma_ban_ve"),
    revision: gv("revision"),
    ten_chi_tiet: gv("ten_chi_tiet"),
    ma_quy_trinh: gv("ma_qt"),
    so_nguyen_cong: +gv("so_nc") || 0,
    tong_lo_ren: +gv("tong_lo") || 0,
    vat_lieu: { ma: gv("ma_vl"), loai: gv("loai_vl") },
    xu_ly_nhiet: { co: nhiet, chi_tiet: gv("nhiet_detail") },
    so_luong: +gv("so_luong") || 0,
    xu_ly_be_mat: gv("xu_ly_bm"),
    hinh_dang: gv("hinh_dang"),
    phuong_an: gv("phuong_an"),
    kich_thuoc_san_pham_mm: { L: +gv("sp_l"), W: +gv("sp_w"), H: +gv("sp_h") },
    kich_thuoc_phoi_mm: { L: +gv("ph_l"), W: +gv("ph_w"), H: +gv("ph_h") },
    chi_tiet_quy_trinh: gv("chi_tiet"),
  };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
  );
  a.download = (data.ma_ban_ve || "bao_gia") + "_" + Date.now() + ".json";
  a.click();
}

(function () {
  const h = new Date().getHours();
  let msg, sub;
  if (h >= 5 && h < 12) {
    msg = "Chào buổi sáng!";
    sub = "Một ngày làm việc hiệu quả nhé!";
  } else if (h >= 12 && h < 14) {
    msg = "Chào buổi trưa!";
    sub = "Nghỉ ngơi chút rồi chiến tiếp!";
  } else if (h >= 14 && h < 18) {
    msg = "Chào buổi chiều!";
    sub = "Gần xong rồi, cố lên!";
  } else {
    msg = "Chào buổi tối!";
    sub = "Nghỉ ngơi thư giãn nhé!";
  }
  const greetText = document.getElementById("greetText");
  const greetSub = document.getElementById("greetSub");
  if (greetText) greetText.textContent = msg;
  if (greetSub) greetSub.textContent = sub;
})();
