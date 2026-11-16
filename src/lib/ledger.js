// The risk ledger: every risk a team accepted, who accepted it, who signed it off and when.
// When a new incident is raised, the Skeptic compares it with open accepted risks. A likely match is
// recorded as a suggestion; someone who can see both confirms it on the dashboard, which marks the risk
// as "happened" and teaches the learning loop that this kind of objection was right.
//
// Privacy: an incident's watchers may not be able to see the plan, and the reverse, so the comments
// posted on each side name only the other's key, never its title or the risk text.
import { kvs } from '@forge/kvs';
import { recordSignal } from './learning';
import { listByPrefix } from './store';
import { bigrams, clip, overlap, sharedBigrams, tokens } from './text';

const riskKey = (tk, oid) => `risk:${tk}:${oid}`;
const matchKey = (incidentId, riskId) => `match:${incidentId}:${riskId}`;

export async function addAcceptedRisk(review, o, { acceptedBy, approvedBy = null, reason }) {
  const id = `${review.tkey}:${o.id}`;
  const entry = {
    id,
    tkey: review.tkey,
    targetType: review.targetType,
    planId: review.planId,
    planKey: review.planKey,
    planSummary: review.planSummary,
    planUrl: review.planUrl,
    objectionId: o.id,
    claim: o.claim,
    sourceTitle: o.sourceTitle,
    sourceKind: o.sourceKind,
    docId: o.docId || null,
    severity: o.severity,
    reason: clip(reason, 600),
    keywords: [...new Set([...tokens(`${o.claim} ${o.assumption || ''}`), ...bigrams(o.claim)])].slice(0, 30),
    acceptedBy,
    approvedBy,
    acceptedAt: new Date().toISOString(),
    status: 'open',
    incidents: [],
  };
  await kvs.set(riskKey(review.tkey, o.id), entry);
  return entry;
}

export async function removeAcceptedRisk(tk, oid) {
  await kvs.delete(riskKey(tk, oid));
}

export const listLedger = async () => (await listByPrefix('risk:', 1000)).map((r) => r.value);
export const listMatches = async () => (await listByPrefix('match:', 500)).map((r) => r.value);

// Score how well an incident matches an accepted risk: shared words, shared phrases, same project.
export function matchScore(incident, risk) {
  const text = `${incident.title}\n${incident.text || ''}`;
  const riskText = `${risk.claim} ${(risk.keywords || []).join(' ')}`;
  const ov = overlap(text, riskText);
  const bg = sharedBigrams(text, risk.claim);
  const sameProject = incident.projectKey && risk.planKey && risk.planKey.startsWith(`${incident.projectKey}-`);
  return { score: ov.count + 2 * bg.length + (sameProject ? 1 : 0), shared: [...bg, ...ov.shared].slice(0, 6) };
}

export function findMatches(incident, ledger, { min = 4 } = {}) {
  return ledger
    .filter((r) => r.status === 'open' || r.status === 'materialised')
    .map((r) => ({ risk: r, ...matchScore(incident, r) }))
    .filter((m) => m.score >= min && m.shared.length >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

export async function recordMatch(incident, m) {
  const key = matchKey(incident.id, m.risk.id.replace(/:/g, '_'));
  if (await kvs.get(key)) return null;
  const rec = {
    key,
    incidentId: incident.id,
    incidentKey: incident.key,
    riskId: m.risk.id,
    planId: m.risk.planId,
    planKey: m.risk.planKey,
    score: m.score,
    shared: m.shared,
    status: 'suggested',
    createdAt: new Date().toISOString(),
  };
  await kvs.set(key, rec);
  return rec;
}

// Someone who can see both confirms or rejects the match.
export async function decideMatch(matchKeyValue, confirmed, actor) {
  const rec = await kvs.get(matchKeyValue);
  if (!rec || rec.status !== 'suggested') throw new Error('That match was already decided.');
  rec.status = confirmed ? 'confirmed' : 'rejected';
  rec.decidedBy = actor;
  rec.decidedAt = new Date().toISOString();
  await kvs.set(matchKeyValue, rec);
  if (confirmed) {
    const [tk, oid] = [rec.riskId.slice(0, rec.riskId.lastIndexOf(':')), rec.riskId.slice(rec.riskId.lastIndexOf(':') + 1)];
    const risk = await kvs.get(riskKey(tk, oid));
    if (risk) {
      risk.status = 'materialised';
      risk.materialisedAt = rec.decidedAt;
      risk.incidents = [...(risk.incidents || []), { id: rec.incidentId, key: rec.incidentKey, at: rec.decidedAt }];
      await kvs.set(riskKey(tk, oid), risk);
      await recordSignal({ docId: risk.docId, kind: risk.sourceKind }, 'came-true');
    }
  }
  return rec;
}

// The risk ledger as CSV, for audits and spreadsheets. Quotes every field; neutralises spreadsheet formulas.
export function ledgerCsv(rows) {
  const cell = (v) => {
    let t = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
    return `"${t.replace(/"/g, '""')}"`;
  };
  const head = ['Plan', 'Severity', 'Accepted risk', 'Accepted by', 'Signed off by', 'Accepted on', 'Status', 'Incidents'];
  const lines = rows.map((r) => [r.planKey, r.severity, r.claim, r.acceptedBy, r.approvedBy || '', String(r.acceptedAt || '').slice(0, 10), r.status, (r.incidents || []).join(' ')].map(cell).join(','));
  return [head.map(cell).join(','), ...lines].join('\n');
}
