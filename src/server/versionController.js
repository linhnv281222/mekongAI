// ============================================================
// Phase 1: Version API Routes
// Routes cho version tracking, diff, approval
// ============================================================

import express from "express";
import {
  getDrawingVersions,
  getLatestDrawingVersion,
  getAllJobVersions,
  saveDrawingVersion,
  getFieldEvidence,
  logFieldChange,
  getJobFeedback,
  diffDrawingVersions,
} from "../data/jobVersionStore.js";
import { getJob, updateJob } from "../data/jobStore.js";

const router = express.Router();

// ══════════════════════════════════════════════════════════
// 1. GET /jobs/:id/versions — Lấy tất cả versions của job
// ══════════════════════════════════════════════════════════

router.get("/:id/versions", async (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  if (isNaN(jobId)) {
    return res.status(400).json({ error: "Invalid job id" });
  }

  try {
    const versions = await getAllJobVersions(jobId);
    res.json({ ok: true, versions });
  } catch (e) {
    console.error("[VersionAPI] GET /jobs/:id/versions error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════
// 2. GET /jobs/:id/drawings/:index/versions — Version history
// ══════════════════════════════════════════════════════════

router.get("/:id/drawings/:index/versions", async (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  const drawingIndex = parseInt(req.params.index, 10);

  if (isNaN(jobId) || isNaN(drawingIndex)) {
    return res.status(400).json({ error: "Invalid job id or drawing index" });
  }

  try {
    const versions = await getDrawingVersions(jobId, drawingIndex);
    res.json({ ok: true, versions });
  } catch (e) {
    console.error("[VersionAPI] GET /jobs/:id/drawings/:index/versions error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════
// 3. GET /jobs/:id/drawings/:index/latest — Latest version
// ══════════════════════════════════════════════════════════

router.get("/:id/drawings/:index/latest", async (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  const drawingIndex = parseInt(req.params.index, 10);
  const versionType = req.query.type || null; // ai_extracted, user_draft, approved

  if (isNaN(jobId) || isNaN(drawingIndex)) {
    return res.status(400).json({ error: "Invalid job id or drawing index" });
  }

  try {
    const version = await getLatestDrawingVersion(jobId, drawingIndex, versionType);
    if (!version) {
      return res.status(404).json({ error: "Version not found" });
    }
    res.json({ ok: true, version });
  } catch (e) {
    console.error("[VersionAPI] GET /jobs/:id/drawings/:index/latest error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════
// 4. POST /jobs/:id/drawings/:index/draft — Save draft
// ══════════════════════════════════════════════════════════

router.post("/:id/drawings/:index/draft", async (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  const drawingIndex = parseInt(req.params.index, 10);
  const { data, changes, actor } = req.body;

  if (isNaN(jobId) || isNaN(drawingIndex)) {
    return res.status(400).json({ error: "Invalid job id or drawing index" });
  }

  if (!data) {
    return res.status(400).json({ error: "Missing data field" });
  }

  try {
    // Save user_draft version
    const versionId = await saveDrawingVersion(
      jobId,
      drawingIndex,
      "user_draft",
      data,
      {
        source: "user",
        created_by: actor || "unknown",
        change_reason: "User draft edit",
      }
    );

    // Log field changes
    if (changes && Array.isArray(changes)) {
      for (const change of changes) {
        await logFieldChange(jobId, drawingIndex, change.field, {
          oldValue: change.oldValue,
          newValue: change.newValue,
          reason: change.reason || "user_edit",
          actor: actor || "unknown",
          approved: false,
        });
      }
    }

    res.json({ ok: true, versionId });
  } catch (e) {
    console.error("[VersionAPI] POST /jobs/:id/drawings/:index/draft error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════
// 5. POST /jobs/:id/approve — Approve job (all drawings)
// ══════════════════════════════════════════════════════════

router.post("/:id/approve", async (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  const { actor, drawings } = req.body;

  if (isNaN(jobId)) {
    return res.status(400).json({ error: "Invalid job id" });
  }

  try {
    // Save approved versions for all drawings
    if (drawings && Array.isArray(drawings)) {
      for (let i = 0; i < drawings.length; i++) {
        await saveDrawingVersion(
          jobId,
          i,
          "approved",
          drawings[i],
          {
            source: "user",
            created_by: actor || "unknown",
            change_reason: "User approved",
          }
        );
      }
    }

    // Update job status
    await updateJob(jobId, {
      status: "approved",
      approved_by: actor || "unknown",
      approved_at: new Date().toISOString(),
    });

    res.json({ ok: true, message: "Job approved" });
  } catch (e) {
    console.error("[VersionAPI] POST /jobs/:id/approve error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════
// 6. GET /jobs/:id/drawings/:index/diff — Diff versions
// ══════════════════════════════════════════════════════════

router.get("/:id/drawings/:index/diff", async (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  const drawingIndex = parseInt(req.params.index, 10);
  const fromVersion = parseInt(req.query.from, 10);
  const toVersion = parseInt(req.query.to, 10);

  if (isNaN(jobId) || isNaN(drawingIndex) || isNaN(fromVersion) || isNaN(toVersion)) {
    return res.status(400).json({ error: "Invalid parameters" });
  }

  try {
    const diff = await diffDrawingVersions(jobId, drawingIndex, fromVersion, toVersion);
    res.json({ ok: true, diff });
  } catch (e) {
    console.error("[VersionAPI] GET /jobs/:id/drawings/:index/diff error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════
// 7. GET /jobs/:id/feedback — Get feedback history
// ══════════════════════════════════════════════════════════

router.get("/:id/feedback", async (req, res) => {
  const jobId = parseInt(req.params.id, 10);

  if (isNaN(jobId)) {
    return res.status(400).json({ error: "Invalid job id" });
  }

  try {
    const feedback = await getJobFeedback(jobId);
    res.json({ ok: true, feedback });
  } catch (e) {
    console.error("[VersionAPI] GET /jobs/:id/feedback error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════
// 8. GET /jobs/:id/drawings/:index/evidence — Field evidence
// ══════════════════════════════════════════════════════════

router.get("/:id/drawings/:index/evidence", async (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  const drawingIndex = parseInt(req.params.index, 10);
  const versionNo = req.query.version ? parseInt(req.query.version, 10) : null;

  if (isNaN(jobId) || isNaN(drawingIndex)) {
    return res.status(400).json({ error: "Invalid parameters" });
  }

  try {
    // Get version id
    let version;
    if (versionNo) {
      const versions = await getDrawingVersions(jobId, drawingIndex);
      version = versions.find((v) => v.versionNo === versionNo);
    } else {
      version = await getLatestDrawingVersion(jobId, drawingIndex);
    }

    if (!version) {
      return res.status(404).json({ error: "Version not found" });
    }

    const evidence = await getFieldEvidence(version.id);
    res.json({ ok: true, evidence });
  } catch (e) {
    console.error("[VersionAPI] GET /jobs/:id/drawings/:index/evidence error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════
// 9. POST /jobs/:id/validate — Validate before ERP push
// ══════════════════════════════════════════════════════════

router.post("/:id/validate", async (req, res) => {
  const jobId = parseInt(req.params.id, 10);

  if (isNaN(jobId)) {
    return res.status(400).json({ error: "Invalid job id" });
  }

  try {
    const job = await getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    const errors = [];
    const warnings = [];

    // Validate job fields
    if (!job.ten_cong_ty) {
      errors.push({ field: "ten_cong_ty", message: "Tên công ty không được để trống" });
    }

    // Validate drawings
    const allVersions = await getAllJobVersions(jobId);
    for (const [index, versions] of Object.entries(allVersions)) {
      const approved = versions.find((v) => v.versionType === "approved");
      if (!approved) {
        warnings.push({
          drawing: parseInt(index, 10),
          message: "Chưa có version approved",
        });
      }

      const latest = versions[0];
      const data = latest.data?.data || latest.data;

      if (!data.ma_ban_ve) {
        errors.push({
          drawing: parseInt(index, 10),
          field: "ma_ban_ve",
          message: "Mã bản vẽ không được để trống",
        });
      }

      if (!data.vat_lieu) {
        errors.push({
          drawing: parseInt(index, 10),
          field: "vat_lieu",
          message: "Vật liệu không được để trống",
        });
      }

      if (!data.so_luong || data.so_luong <= 0) {
        warnings.push({
          drawing: parseInt(index, 10),
          field: "so_luong",
          message: "Số lượng chưa hợp lệ",
        });
      }
    }

    const valid = errors.length === 0;
    res.json({ ok: true, valid, errors, warnings });
  } catch (e) {
    console.error("[VersionAPI] POST /jobs/:id/validate error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
