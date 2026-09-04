// ============================================================
// Phase 1: Version API cho jobStore.js
// Thêm các function để xử lý drawing versions
// ============================================================

import pg from "pg";
import { dbCfg } from "../libs/config.js";

const pool = dbCfg.hasDb ? new pg.Pool({ connectionString: dbCfg.url }) : null;

// ══════════════════════════════════════════════════════════
// 1. SAVE DRAWING VERSION
// ══════════════════════════════════════════════════════════

/**
 * Lưu version mới cho drawing item.
 * @param {number} jobId - Job DB id
 * @param {number} drawingIndex - Index của drawing trong job (0-based)
 * @param {string} versionType - 'ai_extracted' | 'user_draft' | 'approved' | 'erp_confirmed'
 * @param {object} data - Drawing data (full JSONB)
 * @param {object} meta - Metadata: { source, source_model, created_by, change_reason }
 * @returns {Promise<number>} version id
 */
export async function saveDrawingVersion(jobId, drawingIndex, versionType, data, meta = {}) {
  if (!pool) {
    console.warn("[JobDB] saveDrawingVersion: DATABASE_URL not set");
    return null;
  }

  try {
    // Get next version number
    const versionResult = await pool.query(
      `SELECT COALESCE(MAX(version_no), 0) + 1 as next_version
       FROM mekongai.drawing_item_versions
       WHERE job_id = $1 AND drawing_index = $2`,
      [jobId, drawingIndex]
    );
    const nextVersion = versionResult.rows[0]?.next_version || 1;

    const result = await pool.query(
      `INSERT INTO mekongai.drawing_item_versions
        (job_id, drawing_index, version_no, version_type, data, source, source_model, created_by, change_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        jobId,
        drawingIndex,
        nextVersion,
        versionType,
        JSON.stringify(data),
        meta.source || null,
        meta.source_model || null,
        meta.created_by || null,
        meta.change_reason || null,
      ]
    );

    console.log(`[JobDB] Saved version ${nextVersion} for job ${jobId}, drawing ${drawingIndex}`);
    return result.rows[0].id;
  } catch (e) {
    console.error("[JobDB] saveDrawingVersion error:", e.message);
    return null;
  }
}

// ══════════════════════════════════════════════════════════
// 2. GET DRAWING VERSIONS
// ══════════════════════════════════════════════════════════

/**
 * Lấy tất cả version của một drawing.
 * @param {number} jobId 
 * @param {number} drawingIndex 
 * @returns {Promise<Array>} Array of versions
 */
export async function getDrawingVersions(jobId, drawingIndex) {
  if (!pool) return [];

  try {
    const result = await pool.query(
      `SELECT id, job_id, drawing_index, version_no, version_type, data, 
              source, source_model, created_by, created_at, change_reason
       FROM mekongai.drawing_item_versions
       WHERE job_id = $1 AND drawing_index = $2
       ORDER BY version_no DESC`,
      [jobId, drawingIndex]
    );

    return result.rows.map((row) => ({
      id: row.id,
      jobId: row.job_id,
      drawingIndex: row.drawing_index,
      versionNo: row.version_no,
      versionType: row.version_type,
      data: row.data,
      source: row.source,
      sourceModel: row.source_model,
      createdBy: row.created_by,
      createdAt: row.created_at ? new Date(row.created_at).getTime() : null,
      changeReason: row.change_reason,
    }));
  } catch (e) {
    console.error("[JobDB] getDrawingVersions error:", e.message);
    return [];
  }
}

/**
 * Lấy version mới nhất theo type.
 * @param {number} jobId 
 * @param {number} drawingIndex 
 * @param {string} versionType - 'ai_extracted' | 'user_draft' | 'approved'
 * @returns {Promise<object|null>}
 */
export async function getLatestDrawingVersion(jobId, drawingIndex, versionType = null) {
  if (!pool) return null;

  try {
    const query = versionType
      ? `SELECT * FROM mekongai.drawing_item_versions
         WHERE job_id = $1 AND drawing_index = $2 AND version_type = $3
         ORDER BY version_no DESC LIMIT 1`
      : `SELECT * FROM mekongai.drawing_item_versions
         WHERE job_id = $1 AND drawing_index = $2
         ORDER BY version_no DESC LIMIT 1`;

    const params = versionType ? [jobId, drawingIndex, versionType] : [jobId, drawingIndex];
    const result = await pool.query(query, params);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      jobId: row.job_id,
      drawingIndex: row.drawing_index,
      versionNo: row.version_no,
      versionType: row.version_type,
      data: row.data,
      source: row.source,
      sourceModel: row.source_model,
      createdBy: row.created_by,
      createdAt: row.created_at ? new Date(row.created_at).getTime() : null,
      changeReason: row.change_reason,
    };
  } catch (e) {
    console.error("[JobDB] getLatestDrawingVersion error:", e.message);
    return null;
  }
}

// ══════════════════════════════════════════════════════════
// 3. GET ALL VERSIONS FOR JOB
// ══════════════════════════════════════════════════════════

/**
 * Lấy tất cả versions của tất cả drawings trong job.
 * @param {number} jobId 
 * @returns {Promise<object>} { drawingIndex: [versions] }
 */
export async function getAllJobVersions(jobId) {
  if (!pool) return {};

  try {
    const result = await pool.query(
      `SELECT id, job_id, drawing_index, version_no, version_type, data,
              source, source_model, created_by, created_at, change_reason
       FROM mekongai.drawing_item_versions
       WHERE job_id = $1
       ORDER BY drawing_index, version_no DESC`,
      [jobId]
    );

    const grouped = {};
    for (const row of result.rows) {
      const idx = row.drawing_index;
      if (!grouped[idx]) grouped[idx] = [];
      grouped[idx].push({
        id: row.id,
        versionNo: row.version_no,
        versionType: row.version_type,
        data: row.data,
        source: row.source,
        sourceModel: row.source_model,
        createdBy: row.created_by,
        createdAt: row.created_at ? new Date(row.created_at).getTime() : null,
        changeReason: row.change_reason,
      });
    }

    return grouped;
  } catch (e) {
    console.error("[JobDB] getAllJobVersions error:", e.message);
    return {};
  }
}

// ══════════════════════════════════════════════════════════
// 4. FIELD EVIDENCE
// ══════════════════════════════════════════════════════════

/**
 * Lưu evidence cho field.
 * @param {number} versionId - drawing_item_version id
 * @param {string} fieldName 
 * @param {object} evidence - { value, page, bbox, evidenceText, sourceType, confidence }
 */
export async function saveFieldEvidence(versionId, fieldName, evidence) {
  if (!pool) return;

  try {
    await pool.query(
      `INSERT INTO mekongai.field_evidence
        (drawing_item_version_id, field_name, field_value, page_number, bbox, evidence_text, source_type, confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        versionId,
        fieldName,
        evidence.value || null,
        evidence.page || null,
        evidence.bbox ? JSON.stringify(evidence.bbox) : null,
        evidence.evidenceText || null,
        evidence.sourceType || null,
        evidence.confidence || null,
      ]
    );
  } catch (e) {
    console.error("[JobDB] saveFieldEvidence error:", e.message);
  }
}

/**
 * Lấy evidence cho version.
 * @param {number} versionId 
 * @returns {Promise<Array>}
 */
export async function getFieldEvidence(versionId) {
  if (!pool) return [];

  try {
    const result = await pool.query(
      `SELECT id, field_name, field_value, page_number, bbox, evidence_text, source_type, confidence, created_at
       FROM mekongai.field_evidence
       WHERE drawing_item_version_id = $1
       ORDER BY field_name`,
      [versionId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      fieldName: row.field_name,
      fieldValue: row.field_value,
      pageNumber: row.page_number,
      bbox: row.bbox,
      evidenceText: row.evidence_text,
      sourceType: row.source_type,
      confidence: row.confidence ? parseFloat(row.confidence) : null,
      createdAt: row.created_at ? new Date(row.created_at).getTime() : null,
    }));
  } catch (e) {
    console.error("[JobDB] getFieldEvidence error:", e.message);
    return [];
  }
}

// ══════════════════════════════════════════════════════════
// 5. FEEDBACK EVENTS
// ══════════════════════════════════════════════════════════

/**
 * Log field change event.
 * @param {number} jobId 
 * @param {number} drawingIndex 
 * @param {string} fieldName 
 * @param {object} change - { oldValue, newValue, reason, actor, approved, erpResult }
 */
export async function logFieldChange(jobId, drawingIndex, fieldName, change) {
  if (!pool) return;

  try {
    await pool.query(
      `INSERT INTO mekongai.feedback_events
        (job_id, drawing_index, field_name, old_value, new_value, reason, actor, approved, erp_result)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        jobId,
        drawingIndex,
        fieldName,
        change.oldValue || null,
        change.newValue || null,
        change.reason || null,
        change.actor || null,
        change.approved || false,
        change.erpResult || null,
      ]
    );
    console.log(`[JobDB] Logged field change: job=${jobId} drawing=${drawingIndex} field=${fieldName}`);
  } catch (e) {
    console.error("[JobDB] logFieldChange error:", e.message);
  }
}

/**
 * Get feedback for job.
 * @param {number} jobId 
 * @returns {Promise<Array>}
 */
export async function getJobFeedback(jobId) {
  if (!pool) return [];

  try {
    const result = await pool.query(
      `SELECT id, job_id, drawing_index, field_name, old_value, new_value, reason, actor, approved, erp_result, created_at
       FROM mekongai.feedback_events
       WHERE job_id = $1
       ORDER BY created_at DESC`,
      [jobId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      jobId: row.job_id,
      drawingIndex: row.drawing_index,
      fieldName: row.field_name,
      oldValue: row.old_value,
      newValue: row.new_value,
      reason: row.reason,
      actor: row.actor,
      approved: row.approved,
      erpResult: row.erp_result,
      createdAt: row.created_at ? new Date(row.created_at).getTime() : null,
    }));
  } catch (e) {
    console.error("[JobDB] getJobFeedback error:", e.message);
    return [];
  }
}

// ══════════════════════════════════════════════════════════
// 6. DIFF UTILITY
// ══════════════════════════════════════════════════════════

/**
 * So sánh 2 version.
 * @param {number} jobId 
 * @param {number} drawingIndex 
 * @param {number} fromVersion 
 * @param {number} toVersion 
 * @returns {Promise<object>} { field: { from, to, changed } }
 */
export async function diffDrawingVersions(jobId, drawingIndex, fromVersion, toVersion) {
  if (!pool) return {};

  try {
    const result = await pool.query(
      `SELECT version_no, data
       FROM mekongai.drawing_item_versions
       WHERE job_id = $1 AND drawing_index = $2 AND version_no IN ($3, $4)
       ORDER BY version_no`,
      [jobId, drawingIndex, fromVersion, toVersion]
    );

    if (result.rows.length < 2) return {};

    const from = result.rows[0].data;
    const to = result.rows[1].data;

    const diff = {};
    const allKeys = new Set([...Object.keys(from.data || from), ...Object.keys(to.data || to)]);

    for (const key of allKeys) {
      const fromVal = (from.data || from)[key];
      const toVal = (to.data || to)[key];
      if (JSON.stringify(fromVal) !== JSON.stringify(toVal)) {
        diff[key] = { from: fromVal, to: toVal, changed: true };
      }
    }

    return diff;
  } catch (e) {
    console.error("[JobDB] diffDrawingVersions error:", e.message);
    return {};
  }
}

export { pool };
