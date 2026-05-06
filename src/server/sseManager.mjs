/**
 * Server-Sent Events (SSE) manager for real-time job progress.
 *
 * Architecture:
 *   POST /chat/message → returns job_id immediately
 *   GET  /chat/stream/:jobId → SSE stream, waits for events
 *   Background: job emits events via emitSseEvent(jobId, event, data)
 */

const clients = new Map();

const CLIENT_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

/** Register a new SSE client for a job. */
export function addSseClient(jobId, res) {
  if (!clients.has(jobId)) {
    clients.set(jobId, new Set());
  }
  const set = clients.get(jobId);
  set.add({ res, jobId, createdAt: Date.now() });
  console.log(`[SSE] Client connected for job=${jobId} (total=${set.size})`);
}

/** Remove a specific SSE client. */
export function removeSseClient(jobId, res) {
  const set = clients.get(jobId);
  if (!set) return;
  for (const client of set) {
    if (client.res === res) {
      set.delete(client);
      console.log(`[SSE] Client disconnected for job=${jobId} (remaining=${set.size})`);
      break;
    }
  }
  if (set.size === 0) {
    clients.delete(jobId);
  }
}

/**
 * Emit an SSE event to all clients watching a job.
 * @param {string} jobId
 * @param {string} event - Event type (e.g. 'progress', 'done', 'error')
 * @param {unknown} data
 */
export function emitSseEvent(jobId, event, data) {
  const set = clients.get(jobId);
  if (!set || set.size === 0) {
    console.log(`[SSE] No clients for job=${jobId}, event=${event} — DROPPED`);
    return;
  }
  console.log(`[SSE] → ${event} → job=${jobId} (${set.size} client(s))`);

  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const dead = [];

  for (const client of set) {
    try {
      client.res.write(message);
    } catch (e) {
      dead.push(client);
    }
  }

  for (const d of dead) {
    set.delete(d);
  }

  if (set.size === 0) {
    clients.delete(jobId);
  }
}

/** Start periodic cleanup of stale SSE clients */
function startCleanup() {
  setInterval(() => {
    const now = Date.now();
    for (const [jobId, set] of clients.entries()) {
      for (const client of set) {
        if (now - client.createdAt > CLIENT_TTL_MS) {
          set.delete(client);
          try {
            client.res.write(`event: timeout\ndata: ${JSON.stringify({ message: "Connection expired." })}\n\n`);
            client.res.end();
          } catch (_) {}
        }
      }
      if (set.size === 0) {
        clients.delete(jobId);
      }
    }
  }, CLEANUP_INTERVAL_MS);
}

let cleanupStarted = false;
export function ensureCleanup() {
  if (!cleanupStarted) {
    cleanupStarted = true;
    startCleanup();
  }
}

/** Number of active SSE connections (for debugging) */
export function getSseStats() {
  let totalClients = 0;
  for (const set of clients.values()) totalClients += set.size;
  return { jobCount: clients.size, totalClients };
}
