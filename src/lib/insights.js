// Dashboard maths. Pure functions over stored records, so they are easy to test.
//
// The three numbers for the demo:
//   review ready time   median time from "review requested" to "review saved"
//   author time         median time an author spent responding, per review
//   measured precision  from the labelled evaluation set (eval/), plus live precision from how teams
//                       actually resolved objections (proof and accepted risks = useful; "already covered"
//                       and "not relevant" = false flags)
import { computeCalibration } from './learning';
import { sevRank } from './settings';
import { median } from './text';

const USEFUL = new Set(['evidence', 'mitigation', 'plan-change', 'accept-risk']);
const FALSE_FLAG = new Set(['covered', 'not-relevant']);

export function livePrecision(reviews) {
  let useful = 0;
  let falseFlags = 0;
  for (const r of reviews)
    for (const o of r.objections || []) {
      const t = o.resolution?.type;
      if (o.status !== 'resolved' || !t) continue;
      if (USEFUL.has(t)) useful += 1;
      else if (FALSE_FLAG.has(t)) falseFlags += 1;
    }
  const n = useful + falseFlags;
  return { useful, falseFlags, resolved: n, precision: n ? Math.round((1000 * useful) / n) / 10 : null };
}

const p90 = (values) => {
  const v = [...values].sort((a, b) => a - b);
  return v.length ? v[Math.min(v.length - 1, Math.ceil(0.9 * v.length) - 1)] : null;
};

export function timingStats(reviews) {
  const recent = [...reviews].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 50);
  // Full reviews only: a draft from history takes a second or two and would hide what a review costs.
  const ready = recent.filter((r) => !r.draft).map((r) => r.timing?.readyMs).filter((x) => Number.isFinite(x) && x > 0);
  const drafts = recent.filter((r) => r.draft).map((r) => r.timing?.readyMs).filter((x) => Number.isFinite(x) && x > 0);
  const background = recent.filter((r) => r.channel === 'automation').map((r) => r.timing?.readyMs).filter((x) => Number.isFinite(x) && x > 0);
  const author = recent.map((r) => r.authorMs).filter((x) => Number.isFinite(x) && x > 0);
  return {
    readyMedianMs: median(ready),
    readyP90Ms: p90(ready),
    readyBackgroundMedianMs: median(background),
    readyBackgroundP90Ms: p90(background),
    readySamples: ready.length,
    draftMedianMs: median(drafts),
    draftSamples: drafts.length,
    authorMedianMs: median(author),
    authorSamples: author.length,
  };
}

// Reviews and objections per week, for the last `weeks` weeks (oldest first), as chart rows.
export function weekly(reviews, weeks = 8, now = Date.now()) {
  const WEEK = 7 * 86400000;
  const start = now - weeks * WEEK;
  const label = (i) => new Date(start + (i + 1) * WEEK).toISOString().slice(5, 10);
  const rows = [];
  for (let i = 0; i < weeks; i += 1) {
    const from = start + i * WEEK;
    const to = from + WEEK;
    const inWeek = reviews.filter((r) => {
      const t = Date.parse(r.createdAt);
      return t >= from && t < to;
    });
    rows.push({ week: label(i), value: inWeek.length, series: 'Reviews' });
    rows.push({ week: label(i), value: inWeek.reduce((n, r) => n + (r.objections || []).length, 0), series: 'Points raised' });
    rows.push({ week: label(i), value: inWeek.reduce((n, r) => n + (r.objections || []).filter((o) => o.status === 'resolved').length, 0), series: 'Answered' });
  }
  return rows;
}

// The history that keeps coming up: sources cited by objections on more than one plan.
export function mostCited(reviews, max = 5) {
  const n = new Map();
  for (const r of reviews)
    for (const title of new Set((r.objections || []).filter((o) => o.sourceKind !== 'check').map((o) => o.sourceTitle)))
      n.set(title, { title, plans: (n.get(title)?.plans || 0) + 1, url: (r.objections || []).find((o) => o.sourceTitle === title)?.sourceUrl });
  return [...n.values()].sort((a, b) => b.plans - a.plans || a.title.localeCompare(b.title)).slice(0, max);
}

export function summariseReviews(reviews, outcomes, radars, extra = {}) {
  const issueReviews = reviews.filter((r) => r.targetType !== 'page');
  const objections = reviews.flatMap((r) => r.objections || []);
  const count = (pred) => objections.filter(pred).length;
  const verdicts = {};
  for (const r of reviews) verdicts[r.verdict] = (verdicts[r.verdict] || 0) + 1;
  const bySeverity = {};
  for (const o of objections) bySeverity[o.severity] = (bySeverity[o.severity] || 0) + 1;

  const reasons = {};
  for (const r of outcomes) for (const o of r.objections || []) if (o.outcome === 'came-true') reasons[o.sourceTitle] = (reasons[o.sourceTitle] || 0) + 1;

  const blocking = (r) => (r.objections || []).filter((o) => o.status !== 'resolved' && sevRank(o.severity) >= sevRank(r.gateMinSeverity || 'medium'));
  return {
    reviews: reviews.length,
    pageReviews: reviews.length - issueReviews.length,
    verdicts,
    bySeverity,
    objections: objections.length,
    resolved: count((o) => o.status === 'resolved'),
    pendingApproval: count((o) => o.status === 'pending-approval'),
    open: count((o) => o.status === 'open'),
    handledByPlan: reviews.reduce((n, r) => n + (r.handled || []).length, 0),
    worthAsking: reviews.reduce((n, r) => n + (r.worthAsking || []).length, 0),
    droppedByChecks: reviews.reduce((n, r) => n + Object.values(r.dropped || {}).reduce((a, b) => a + b, 0), 0),
    // Plans with only a draft wait for a full review first (when the gate asks for one).
    needsFullReview: issueReviews
      .filter((r) => r.state === 'active' && r.draft && r.requireFullReview !== false && !r.override)
      .map((r) => ({ key: r.planKey, title: r.planSummary, url: r.planUrl, points: (r.objections || []).length })),
    gated: issueReviews
      .filter((r) => r.state === 'active' && blocking(r).length && !r.override && !(r.draft && r.requireFullReview !== false))
      .map((r) => ({ key: r.planKey, title: r.planSummary, url: r.planUrl, blocking: blocking(r).length, binding: !!r.binding })),
    approvals: issueReviews.flatMap((r) =>
      (r.objections || [])
        .filter((o) => o.status === 'pending-approval')
        .map((o) => ({ key: r.planKey, url: r.planUrl, severity: o.severity, approver: o.approval?.approver, since: o.approval?.requestedAt })),
    ),
    awaitingGrades: issueReviews.filter((r) => r.state === 'awaiting-outcome').map((r) => ({ key: r.planKey, title: r.planSummary, url: r.planUrl })),
    decisionsRecorded: reviews.filter((r) => r.decision?.url).length,
    newEvidence: reviews.filter((r) => r.newEvidence?.count).map((r) => ({ key: r.planKey || r.planSummary, url: r.planUrl, count: r.newEvidence.count })),
    radarFlags: radars.filter((x) => x.level === 'high' && !x.reviewed).map((x) => ({ key: x.key, title: x.title, score: x.score })),
    calibration: computeCalibration(outcomes),
    topReasons: Object.entries(reasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([title, n]) => ({ title, n })),
    timing: timingStats(reviews),
    weekly: weekly(reviews),
    mostCited: mostCited(reviews),
    channels: reviews.reduce((acc, r) => ({ ...acc, [r.channel || 'chat']: (acc[r.channel || 'chat'] || 0) + 1 }), {}),
    precision: { live: livePrecision(reviews), eval: extra.evalResult || null },
  };
}
