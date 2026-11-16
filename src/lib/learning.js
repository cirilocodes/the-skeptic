// The learning loop. Three signals change how hard the Skeptic pushes next time:
//   - graded outcomes after a plan closes (came true / did not), per source kind;
//   - dismissals ("not relevant", "the plan already covers this"), per cited source;
//   - accepted risks that later became incidents, per cited source and kind.
// Weights only scale severity; they never invent or delete an objection.
import { kvs } from '@forge/kvs';
import { batchGet } from './store';

const docKey = (docId) => `learn:doc:${docId}`;
const KINDS = 'learn:kinds';

export const SIGNALS = ['dismissed', 'upheld', 'came-true', 'did-not'];

export async function recordSignal({ docId, kind }, signal) {
  if (!SIGNALS.includes(signal)) return;
  if (docId) {
    const cur = (await kvs.get(docKey(docId))) || {};
    cur[signal] = (cur[signal] || 0) + 1;
    cur.updatedAt = new Date().toISOString();
    await kvs.set(docKey(docId), cur);
  }
  if (kind) {
    const kinds = (await kvs.get(KINDS)) || {};
    kinds[kind] = kinds[kind] || {};
    kinds[kind][signal] = (kinds[kind][signal] || 0) + 1;
    await kvs.set(KINDS, kinds);
  }
}

export async function learningFor(docIds) {
  const ids = [...new Set((docIds || []).filter(Boolean))];
  const [docs, kinds] = await Promise.all([batchGet(ids.map(docKey)), kvs.get(KINDS)]);
  return { docs: Object.fromEntries(ids.map((id) => [id, docs.get(docKey(id)) || {}])), kinds: kinds || {} };
}

// How often objections came true, by kind of source (from graded outcome records and the kind signals).
export function computeCalibration(outcomes, kindSignals = {}) {
  const kinds = {};
  let cameTrue = 0;
  let graded = 0;
  const add = (k, ct, n) => {
    kinds[k] = kinds[k] || { cameTrue: 0, graded: 0 };
    kinds[k].cameTrue += ct;
    kinds[k].graded += n;
    cameTrue += ct;
    graded += n;
  };
  for (const r of outcomes || [])
    for (const o of r.objections || []) {
      if (o.outcome === 'came-true') add(o.sourceKind || 'unknown', 1, 1);
      else if (o.outcome === 'did-not') add(o.sourceKind || 'unknown', 0, 1);
    }
  // Kind-level signals are only written for incidents matched to accepted risks (graded outcomes are
  // counted from the outcome records above), so these never double count.
  for (const [k, v] of Object.entries(kindSignals || {})) if (v['came-true']) add(k, v['came-true'], v['came-true']);
  const byKind = Object.fromEntries(
    Object.entries(kinds).map(([k, v]) => [k, { ...v, rate: v.graded ? Math.round((100 * v.cameTrue) / v.graded) / 100 : null }]),
  );
  return { graded, cameTrue, rate: graded ? Math.round((100 * cameTrue) / graded) / 100 : null, byKind };
}

// Kind weight: neutral (1) until 3 graded objections of that kind, then 0.5 (never true) .. 1.5 (always true).
export function kindWeight(calibration, kind) {
  const k = calibration?.byKind?.[kind];
  if (!k || k.graded < 3 || k.rate === null) return 1;
  return 0.5 + k.rate;
}

// Source weight from what people did with objections citing this exact item before.
export function docFactor(stat = {}) {
  const f = 1 - 0.15 * (stat.dismissed || 0) + 0.05 * (stat.upheld || 0) + 0.2 * (stat['came-true'] || 0) - 0.1 * (stat['did-not'] || 0);
  return Math.round(Math.min(1.5, Math.max(0.4, f)) * 100) / 100;
}

export function weightFor(learning, calibration, { docId, kind }) {
  const w = kindWeight(calibration, kind) * docFactor(learning?.docs?.[docId]);
  return Math.round(Math.min(1.6, Math.max(0.35, w)) * 100) / 100;
}

export function describeCalibration(calibration) {
  if (!calibration?.graded) return 'No graded outcomes yet.';
  const kinds = Object.entries(calibration.byKind)
    .map(([k, v]) => `${k} ${v.cameTrue}/${v.graded}`)
    .join(', ');
  return `Of ${calibration.graded} graded objections, ${Math.round(calibration.rate * 100)}% came true (${kinds}).`;
}
