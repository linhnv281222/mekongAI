import { pool } from "../data/jobStore.js";

/**
 * Token usage statistics API
 * GET /api/token-stats?start=YYYY-MM-DD&end=YYYY-MM-DD&model=gemini
 */

export async function getTokenStats(req, res) {
  if (!pool) {
    return res.status(503).json({ error: "Database not configured" });
  }

  const { start, end, model } = req.query;

  try {
    // Base query
    let query = `
      SELECT
        DATE(created_at) as date,
        COUNT(*) as job_count,
        SUM(classify_tokens) as total_classify_tokens,
        SUM(drawing_tokens) as total_drawing_tokens,
        SUM(total_tokens) as total_tokens,
        classify_model,
        drawing_model
      FROM mekongai.agent_jobs
      WHERE total_tokens > 0
    `;

    const params = [];
    let paramIndex = 1;

    // Filter by date range
    if (start) {
      query += ` AND DATE(created_at) >= $${paramIndex}`;
      params.push(start);
      paramIndex++;
    }

    if (end) {
      query += ` AND DATE(created_at) <= $${paramIndex}`;
      params.push(end);
      paramIndex++;
    }

    // Filter by model
    if (model) {
      query += ` AND (classify_model LIKE $${paramIndex} OR drawing_model LIKE $${paramIndex})`;
      params.push(`%${model}%`);
      paramIndex++;
    }

    query += ` GROUP BY DATE(created_at), classify_model, drawing_model ORDER BY date DESC`;

    const result = await pool.query(query, params);

    // Calculate totals
    const totals = {
      total_jobs: 0,
      total_classify_tokens: 0,
      total_drawing_tokens: 0,
      total_tokens: 0,
    };

    result.rows.forEach(row => {
      totals.total_jobs += parseInt(row.job_count) || 0;
      totals.total_classify_tokens += parseInt(row.total_classify_tokens) || 0;
      totals.total_drawing_tokens += parseInt(row.total_drawing_tokens) || 0;
      totals.total_tokens += parseInt(row.total_tokens) || 0;
    });

    // Average tokens per job
    const avgTokensPerJob = totals.total_jobs > 0
      ? Math.round(totals.total_tokens / totals.total_jobs)
      : 0;

    res.json({
      success: true,
      filters: { start, end, model },
      totals: {
        ...totals,
        avg_tokens_per_job: avgTokensPerJob,
      },
      daily: result.rows.map(row => ({
        date: row.date,
        job_count: parseInt(row.job_count) || 0,
        classify_tokens: parseInt(row.total_classify_tokens) || 0,
        drawing_tokens: parseInt(row.total_drawing_tokens) || 0,
        total_tokens: parseInt(row.total_tokens) || 0,
        classify_model: row.classify_model,
        drawing_model: row.drawing_model,
      })),
    });
  } catch (error) {
    console.error("[TokenStats] Error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Individual job token details
 * GET /api/token-stats/jobs?limit=50&offset=0
 */
export async function getJobTokenDetails(req, res) {
  if (!pool) {
    return res.status(503).json({ error: "Database not configured" });
  }

  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;

  try {
    const result = await pool.query(
      `
      SELECT
        id,
        gmail_id,
        subject,
        classify_tokens,
        drawing_tokens,
        total_tokens,
        classify_model,
        drawing_model,
        created_at,
        status
      FROM mekongai.agent_jobs
      WHERE total_tokens > 0
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
      `,
      [limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM mekongai.agent_jobs WHERE total_tokens > 0`
    );

    res.json({
      success: true,
      jobs: result.rows,
      pagination: {
        limit,
        offset,
        total: parseInt(countResult.rows[0].total) || 0,
      },
    });
  } catch (error) {
    console.error("[TokenStats] Job details error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

export default { getTokenStats, getJobTokenDetails };
