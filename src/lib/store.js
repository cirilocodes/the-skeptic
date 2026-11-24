// Persistence in Forge KVS (data never leaves Atlassian).
//
// Target keys ("tk") come from targets.js: an issue ID ("10030") or "page:<id>" for Confluence pages.
// IDs, not issue keys, so a review survives an epic moving to another project.
//
// The authoritative ledger lives in KVS, which users cannot edit. A read-only summary is mirrored to the
// `skeptic-ledger` issue property for JQL (skepticOpen > 0) and for the evaluation script. The workflow
// gate always reads KVS, never the property.
import { route } from '@forge/api';
import { kvs, WhereConditions } from '@forge/kvs';
import { appClient, JSON_HEADERS } from './http';
import { sevRank } from './settings';

const k = {
  review: (tk) => `review:${tk}`,
  evidence: (tk) => `evidence:${tk}`,
  prep: (tk) => `prep:${tk}`,
  radar: (id) => `radar:${id}`,
  progress: (tk) => `progress:${tk}`,
  runs: (tk) => `runs:${tk}`,
  outcome: (id) => `outcome:${id}`,
};

const DAY = { value: 1, unit: 'DAYS' };

// Reviews saved by version 1 of the app used other names for some fields. Read them in today's shape so
// old reviews keep working after an upgrade: answered or accepted objections are resolved, and an objection
// without a computed severity counts as medium.
const LEGACY_STATUS = { answered: 'evidence', accepted: 'accept-risk', dismissed: 'not-relevant', mitigated: 'mitigation' };
export function upgradeReview(r) {
  if (!r || !Array.isArray(r.objections)) return r;
  let changed = false;
  const objections = r.objections.map((o) => {
    const x = { ...o };
    if (LEGACY_STATUS[x.status]) {
      x.resolution = x.resolution || { type: LEGACY_STATUS[x.status], text: x.answer || x.response || x.reason || '', at: x.answeredAt || x.updatedAt || null };
      x.status = 'resolved';
      changed = true;
    } else if (!['open', 'pending-approval', 'resolved'].includes(x.status)) {
      x.status = 'open';
      changed = true;
    }
    if (!['low', 'medium', 'high', 'critical'].includes(x.severity)) {
      x.severity = ['low', 'medium', 'high', 'critical'].includes(x.level) ? x.level : 'medium';
      changed = true;
    }
    if (!x.id) {
      x.id = `legacy-${(o.ref || o.claim || '').toString().slice(0, 24)}`;
      changed = true;
    }
    return x;
  });
  return changed ? { ...r, state: r.state || 'active', objections, legacy: true } : { ...r, state: r.state || 'active' };
}
export const getReview = async (tk) => upgradeReview(await kvs.get(k.review(tk)));
export const getEvidence = (tk) => kvs.get(k.evidence(tk));
// Evidence packs are working data: kept a week (the agent must use one within two hours anyway).
export const saveEvidence = (tk, v) => kvs.set(k.evidence(tk), v, { ttl: { value: 7, unit: 'DAYS' } });
export const getPrep = (tk) => kvs.get(k.prep(tk));
export const savePrep = (tk, v) => kvs.set(k.prep(tk), v);
export const getRadar = (id) => kvs.get(k.radar(id));
export const saveRadar = (id, v) => kvs.set(k.radar(id), v);
export const getRuns = (tk) => kvs.get(k.runs(tk));
export const saveRuns = (tk, v) => kvs.set(k.runs(tk), v, { ttl: DAY });
export const clearRuns = (tk) => kvs.delete(k.runs(tk));
export const getProgress = (tk) => kvs.get(k.progress(tk));

// Progress of a review, shown live in the panel.
export const STAGES = [
  { id: 'queued', label: 'Queued' },
  { id: 'history', label: 'History searched' },
  { id: 'rules', label: 'Rules checked' },
  { id: 'agent', label: 'Agent reviewing' },
  { id: 'verify', label: 'Citations verified' },
  { id: 'saved', label: 'Saved' },
];

export async function setProgress(tk, stage, extra = {}) {
  const now = new Date().toISOString();
  const prev = (await kvs.get(k.progress(tk))) || {};
  const restart = stage === 'queued' || !prev.startedAt || prev.done;
  const next = {
    ...(restart ? {} : prev),
    ...extra,
    stage,
    stagesAt: { ...(restart ? {} : prev.stagesAt || {}), ...(restart || !(prev.stagesAt || {})[stage] ? { [stage]: now } : {}) },
    startedAt: restart ? now : prev.startedAt,
    updatedAt: now,
    done: stage === 'saved' || stage === 'failed',
  };
  await kvs.set(k.progress(tk), next, { ttl: DAY });
  return next;
}

// An objection blocks the gate when it is not resolved and at or above the gate's minimum severity.
// Rolling timings of the last 40 reviews per channel: the panel's "about 30 s left" and the dashboard's
// p50/p90 come from here, without listing every review.
const TIMING = 'stats:timing';
export async function recordTiming(channel, readyMs, stages) {
  if (!Number.isFinite(readyMs)) return;
  try {
    const all = (await kvs.get(TIMING)) || {};
    const list = [{ ms: readyMs, stages: stages || null, at: new Date().toISOString() }, ...(all[channel] || [])].slice(0, 40);
    await kvs.set(TIMING, { ...all, [channel]: list });
  } catch {
    /* best effort */
  }
}
export const getTimingStats = async () => (await kvs.get(TIMING)) || {};

export function percentile(values, p) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.min(v.length - 1, Math.max(0, Math.ceil((p / 100) * v.length) - 1))];
}

export function blockingObjections(review, minSeverity = 'medium') {
  if (!review || review.state !== 'active') return [];
  return (review.objections || []).filter((o) => o.status !== 'resolved' && sevRank(o.severity) >= sevRank(minSeverity));
}
export const unresolved = (review) =>
  review && review.state === 'active' ? (review.objections || []).filter((o) => o.status !== 'resolved') : [];

export async function saveReviewRecord(review, { mirror = true } = {}) {
  review.targetType = review.targetType || 'issue';
  review.tkey = review.tkey || String(review.planId);
  review.updatedAt = new Date().toISOString();
  await kvs.set(k.review(review.tkey), review);
  if (mirror && review.targetType === 'issue') await mirrorLedgerProperty(review);
  return review;
}

// Summary only: no evidence titles (the property is readable by anyone who can see the issue).
export function ledgerSummary(review) {
  const objections = review.objections || [];
  return {
    openCount: unresolved(review).length,
    blocking: blockingObjections(review, review.gateMinSeverity || 'medium').length,
    total: objections.length,
    verdict: review.verdict,
    state: review.state,
    topSeverity: objections.reduce((top, o) => (sevRank(o.severity) > sevRank(top) ? o.severity : top), 'none'),
    objections: objections.map((o) => ({ id: o.id, severity: o.severity, status: o.status, kind: o.sourceKind, doc: o.docId || null })),
    worthAsking: (review.worthAsking || []).length,
    readyMs: review.timing?.readyMs ?? null,
    updatedAt: review.updatedAt,
  };
}

async function mirrorLedgerProperty(review) {
  try {
    const res = await appClient().jira(route`/rest/api/3/issue/${review.planId}/properties/skeptic-ledger`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify(ledgerSummary(review)),
    });
    if (!res.ok) console.warn('Could not mirror skeptic-ledger property', res.status);
  } catch (e) {
    console.warn('Could not mirror skeptic-ledger property', e.message);
  }
}

// Graded reviews become outcome records the Skeptic cites and learns from.
export async function saveOutcomeRecord(review) {
  const record = {
    planId: review.planId,
    planKey: review.planKey,
    planSummary: review.planSummary,
    terms: review.terms || [],
    gradedAt: new Date().toISOString(),
    objections: (review.objections || []).map((o) => ({
      claim: o.claim,
      sourceTitle: o.sourceTitle,
      sourceUrl: o.sourceUrl,
      sourceKind: o.sourceKind,
      docId: o.docId || null,
      severity: o.severity,
      strength: o.strength,
      status: o.status,
      resolution: o.resolution?.type || null,
      outcome: o.outcome,
    })),
  };
  await kvs.set(k.outcome(review.planId), record);
  return record;
}

export async function listByPrefix(prefix, max = 500) {
  const items = [];
  let cursor;
  do {
    let query = kvs.query().where('key', WhereConditions.beginsWith(prefix)).limit(100);
    if (cursor) query = query.cursor(cursor);
    const page = await query.getMany();
    items.push(...(page.results || []));
    cursor = page.nextCursor;
  } while (cursor && items.length < max);
  return items.slice(0, max);
}

export const listOutcomeRecords = async () => (await listByPrefix('outcome:', 300)).map((r) => r.value);
export const listReviews = async (max = 500) => (await listByPrefix('review:', max)).map((r) => r.value);
export const listRadars = async () => (await listByPrefix('radar:')).map((r) => ({ issueId: r.key.slice(6), ...r.value }));

// Writes in chunks of 25 (the KVS batch limit), retrying any key that failed once.
export async function batchSet(items) {
  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);
    try {
      const res = await kvs.batchSet(chunk);
      for (const f of res?.failedKeys || []) {
        const item = chunk.find((x) => x.key === f.key);
        if (item) await kvs.set(item.key, item.value);
      }
    } catch {
      for (const item of chunk) await kvs.set(item.key, item.value);
    }
  }
}

export async function batchDelete(keys) {
  for (let i = 0; i < keys.length; i += 25) {
    const chunk = keys.slice(i, i + 25).map((key) => ({ key }));
    try {
      await kvs.batchDelete(chunk);
    } catch {
      for (const { key } of chunk) await kvs.delete(key);
    }
  }
}

export async function batchGet(keys) {
  const out = new Map();
  for (let i = 0; i < keys.length; i += 25) {
    const chunk = keys.slice(i, i + 25);
    try {
      const res = await kvs.batchGet(chunk.map((key) => ({ key })));
      for (const r of res?.successfulKeys || []) out.set(r.key, r.value);
    } catch {
      const vals = await Promise.all(chunk.map((key) => kvs.get(key)));
      chunk.forEach((key, j) => vals[j] !== undefined && out.set(key, vals[j]));
    }
  }
  return out;
}

export async function deleteAllFor(issueId) {
  const tk = String(issueId);
  await batchDelete([k.review(tk), k.evidence(tk), k.prep(tk), k.outcome(tk), k.radar(tk), k.progress(tk), k.runs(tk), `staged:${tk}`]);
}
