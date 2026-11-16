// Health: what the admin page shows so people can trust the Skeptic is working, and fix it when it isn't.
//   - the last 20 errors, with where they happened and a short code;
//   - "last seen" markers: the automation rule, the workflow validator, the daily sweep, the queue;
//   - job counters, so a stuck queue is visible.
// Everything is best-effort: health bookkeeping must never break the work it observes.
import { kvs } from '@forge/kvs';

const ERRORS = 'health:errors';
const SEEN = 'health:seen';
const JOBS = 'health:jobs';
const MAX_ERRORS = 20;

// The same error again within ten minutes is counted on the existing entry rather than added, so a
// flood of bad requests can't push everything else off the list (and costs at most one write a minute).
export async function recordError(where, error) {
  try {
    const list = (await kvs.get(ERRORS)) || [];
    const entry = {
      at: new Date().toISOString(),
      where: String(where).slice(0, 60),
      code: error?.status ? `HTTP ${error.status}` : error?.code || 'error',
      message: String(error?.message || error).slice(0, 240),
    };
    const top = list[0];
    const age = top ? Date.now() - Date.parse(top.at) : Infinity;
    if (top && top.where === entry.where && top.code === entry.code && top.message === entry.message && age < 10 * 60 * 1000) {
      if (age < 60 * 1000 && top.count) return; // counted recently enough
      list[0] = { ...entry, count: (top.count || 1) + 1, firstAt: top.firstAt || top.at };
    } else list.unshift(entry);
    await kvs.set(ERRORS, list.slice(0, MAX_ERRORS));
  } catch {
    /* never let health bookkeeping fail the caller */
  }
}

export async function markSeen(what, detail = {}) {
  try {
    const seen = (await kvs.get(SEEN)) || {};
    seen[what] = { at: new Date().toISOString(), ...detail };
    await kvs.set(SEEN, seen);
  } catch {
    /* best effort */
  }
}

export async function countJob(outcome) {
  try {
    const c = (await kvs.get(JOBS)) || { pushed: 0, done: 0, failed: 0, retried: 0 };
    c[outcome] = (c[outcome] || 0) + 1;
    if (outcome === 'done') c.lastDoneAt = new Date().toISOString();
    await kvs.set(JOBS, c);
  } catch {
    /* best effort */
  }
}

export async function getHealth() {
  const [errors, seen, jobs] = await Promise.all([kvs.get(ERRORS), kvs.get(SEEN), kvs.get(JOBS)]);
  return { errors: errors || [], seen: seen || {}, jobs: jobs || { pushed: 0, done: 0, failed: 0, retried: 0 } };
}

export const clearErrors = () => kvs.set(ERRORS, []);

// "3 min ago", "2 h ago", "4 days ago"
export function ago(iso, now = Date.now()) {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 90) return 'just now';
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 172800) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}
