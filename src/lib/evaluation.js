// Scoring a review against the labelled evaluation set (eval/plans.mjs). Shared by the in-app evaluation
// (admin page), the eval:score script and the tests, so every number is computed the same way.
//
//   flagged       the review has at least one objection at medium or above
//   correct       such an objection cites one of the plan's labelled sources (or, for rule plans, the rule)
//   precision     correct objections / all objections at medium or above, across every plan
//   recall        flag-plans with a correct objection / all flag-plans
import { sevRank } from './settings';

const stripKey = (title) => String(title || '').replace(/^[A-Z][A-Z0-9_]+-\d+:\s*/, '');

export function evalRow(plan, review) {
  if (!review) return { id: plan.id, expect: plan.expect, status: 'no review yet' };
  const serious = (review.objections || []).filter((o) => sevRank(o.severity) >= sevRank('medium'));
  const correct = serious.filter((o) => (plan.rule ? o.sourceKind === 'check' && (!o.rule || o.rule === plan.rule) : plan.expect === 'flag' && (plan.sources || []).includes(stripKey(o.sourceTitle)))).length;
  return { id: plan.id, expect: plan.expect, flagged: serious.length > 0, serious: serious.length, correct, readyMs: review.timing?.readyMs ?? null, channel: review.channel };
}

export function scoreRows(rows) {
  const scored = rows.filter((r) => r.flagged !== undefined);
  const flag = scored.filter((r) => r.expect === 'flag');
  const clean = scored.filter((r) => r.expect === 'clean');
  const total = scored.reduce((n, r) => n + r.serious, 0);
  const correct = scored.reduce((n, r) => n + r.correct, 0);
  const hits = flag.filter((r) => r.correct > 0).length;
  const ready = scored.map((r) => r.readyMs).filter(Number.isFinite).sort((a, b) => a - b);
  return {
    plans: scored.length,
    precision: total ? Math.round((1000 * correct) / total) / 10 : 100,
    recall: flag.length ? Math.round((1000 * hits) / flag.length) / 10 : null,
    flagged: scored.filter((r) => r.flagged).length,
    truePositives: hits,
    falseFlags: clean.filter((r) => r.flagged).length,
    misses: flag.length - hits,
    readyMedianMs: ready.length ? ready[Math.floor(ready.length / 2)] : null,
    objections: total,
    correctObjections: correct,
  };
}
