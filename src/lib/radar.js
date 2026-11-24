// The radar: the cheap, deterministic first pass. No AI, no cost per run.
// It runs in the background when a plan is created or its text changes, and in the daily sweep. It uses
// the history index and the rule checks to score how likely the plan repeats past history:
//   low     nothing evidence-backed: no agent review is requested (saves time and noise)
//   medium  related history: a full review is requested in the background, advisory
//   high    a precedent: a full review is requested, and (optionally) required before the plan can start
//
// Privacy: the radar runs as the app with no user present, so it never names what it found. Its comment
// gives counts and kinds only. The full, cited review always re-reads evidence with a person's permissions.
import { appClient } from './http';
import { gatherEvidence } from './evidence';
import { computeCalibration, kindWeight } from './learning';
import { postIssueComment } from './notify';
import { getProfile, inScope, scopeFor } from './profile';
import { runRules } from './rules';
import { getRadar, listOutcomeRecords, saveRadar } from './store';
import { getSiteUrl, resolveTarget } from './targets';
import { listLedger } from './ledger';
import { tokens, WEAK } from './text';

// A strong match shares two distinct informative words with the plan, or one informative phrase
// ("live chat"), or scores very high in the index. Generic words ("customer", "app") never count alone.
// Words that only match through a synonym count half, so a synonym can tip a match but never make one.
export function strongMatch(item) {
  return matchStrength(item).strong;
}

// How specific a match is: informative words matched (synonyms count half) and whether a phrase matched.
export function matchStrength(item) {
  const informative = new Map();
  let phrase = false;
  // A multi-word phrase ("live chat", "self-hosted") is specific enough on its own, whether the plan used
  // it or it is a listed synonym of the plan's words; single words from synonyms count half.
  const take = (terms, weight) => {
    for (const t of terms || []) {
      const parts = tokens(String(t).replace(/-/g, ' ')).filter((w) => !WEAK.has(w));
      parts.forEach((w) => informative.set(w, Math.max(informative.get(w) || 0, weight)));
      if (/[\s-]/.test(String(t).trim()) && parts.length >= 2) phrase = true;
    }
  };
  take(item.matchedTerms, 1);
  take(item.synonymHits, 0.5);
  const score = [...informative.values()].reduce((a, b) => a + b, 0);
  return { score, phrase, strong: phrase || score >= 2 || item.relevance >= 2.5 };
}

// Pure scoring so it can be unit-tested and explained.
export function scoreEvidence(ev, calibration, ruleFindings = []) {
  const parts = [];
  const add = (kind, points, why) => parts.push({ kind, points: Math.round(points * kindWeight(calibration, kind) * 10) / 10, why });
  let precedents = 0;
  for (const e of ev.pastPlans || []) {
    if (!strongMatch(e)) continue;
    if (e.outcome === 'abandoned' && precedents < 2) {
      add('plan', 3, 'abandoned plan on the same idea');
      precedents += 1;
    } else if (e.outcome !== 'abandoned') add('plan', 0.5, 'similar plan');
  }
  let decisions = 0;
  for (const p of ev.confluencePages || []) {
    if (!(p.matchedTerms || []).length && !(p.relevance >= 1.6)) continue;
    if (p.decisionOrRetro && decisions < 2 && strongMatch(p)) {
      add('decision', 2, 'decision or retro page on the topic');
      decisions += 1;
    } else add('page', 0.5, 'related page');
  }
  let incidents = 0;
  for (const i of ev.incidents || []) {
    if (incidents >= 2 || !strongMatch(i)) continue;
    add('incident', 1.5, 'past incident on the topic');
    incidents += 1;
  }
  let risks = 0;
  for (const r of ev.openRisks || []) {
    if (risks >= 2) break;
    if (!strongMatch(r)) continue;
    add('risk', 1, 'risk raised and never closed');
    risks += 1;
  }
  // Two independent kinds of evidence agreeing (the idea was abandoned, and it also went wrong in
  // production) is stronger than either alone.
  if (precedents && incidents) add('corroborated', 0.5, 'abandoned before, and an incident on the same topic');
  for (const t of ev.skepticTrackRecord || []) if ((t.objectionsThatCameTrue || []).length) add('track', 2, 'similar plan where the Skeptic was right');
  for (const l of ev.acceptedRisksThatHappened || []) if (l) add('ledger', 2.5, 'an accepted risk like this one became an incident');
  for (const f of ruleFindings) add('check', f.rule === 'freeze' ? 3 : 1, f.rule === 'freeze' ? 'due date inside a freeze window' : f.rule === 'blocker' ? 'open blocker' : 'owner overloaded');

  const minor = Math.min(1.5, parts.filter((p) => p.points < 1).reduce((n, p) => n + p.points, 0));
  const major = parts.filter((p) => p.points >= 1).reduce((n, p) => n + p.points, 0);
  const score = Math.round((major + minor) * 10) / 10;
  const level = score >= 5 ? 'high' : score >= 2 ? 'medium' : 'low';
  const counts = {
    abandonedPlans: precedents,
    decisionPages: decisions,
    incidents,
    openRisks: risks,
    ruleFlags: ruleFindings.length,
    relatedItems: parts.filter((p) => p.points < 1 && p.kind !== 'corroborated').length,
  };
  return { score, level, counts, reasons: [...new Set(parts.map((p) => p.why))] };
}

export function radarSentence(counts) {
  const n = (x, one, many) => (x ? `${x} ${x > 1 ? many : one}` : '');
  return [
    n(counts.abandonedPlans, 'abandoned plan', 'abandoned plans'),
    n(counts.decisionPages, 'decision or retro page', 'decision or retro pages'),
    n(counts.incidents, 'past incident', 'past incidents'),
    n(counts.openRisks, 'open risk', 'open risks'),
    n(counts.ruleFlags, 'rule flag', 'rule flags'),
  ]
    .filter(Boolean)
    .join(', ');
}

export async function runRadar(issueId, settings, { force = false, profile = null } = {}) {
  const c = appClient();
  const siteUrl = await getSiteUrl(c);
  const target = await resolveTarget(c, { planKey: issueId, siteUrl });
  const prof = profile || (await getProfile());
  const scope = scopeFor(settings, prof);
  if (!force && (!inScope(target, scope) || target.statusCategory !== 'new')) return null;

  const [outcomes, ledger, previous] = await Promise.all([listOutcomeRecords(), listLedger(), getRadar(target.id)]);
  const calibration = computeCalibration(outcomes);
  const reader = { c, mode: 'app' };
  const ev = await gatherEvidence({ reader, plan: target, searchTerms: '', siteUrl, settings, scope, outcomes, ledger, light: true });
  const rules = await runRules({ target, settings, reader, siteUrl });
  const scored = scoreEvidence(ev, calibration, rules.findings);

  const record = {
    ...scored,
    key: target.key,
    title: target.title,
    planHash: target.hash,
    terms: ev.coverage.terms,
    density: scope.density,
    reviewed: previous?.reviewed && previous.planHash === target.hash ? true : false,
    checkedAt: new Date().toISOString(),
  };
  await saveRadar(target.id, record);

  const newlyHigh = record.level === 'high' && previous?.level !== 'high';
  if (newlyHigh && settings.radarComments && !(target.labels || []).includes('skeptic-eval')) {
    await postIssueComment(target.id, [
      [{ text: 'Skeptic radar: ', bold: true }, `this plan looks like something your organisation has been through before (${radarSentence(record.counts) || 'several related items'}).`],
      [
        settings.autoReview && settings.automationReady
          ? 'A full, cited review is being prepared and will appear in the Skeptic panel.'
          : settings.autoReview
            ? 'A draft review citing that history is in the Skeptic panel (from the apps button under the title, if it is not shown). Choose Full review in Rovo chat for a complete AI review.'
          : settings.requireReviewOnHigh
            ? 'It needs a full Skeptic review before it can start. Open the Skeptic panel (from the apps button under the title, if it is not shown) and choose Review now.'
            : 'Ask the Skeptic in the panel for a cited review before starting.',
      ],
    ]);
  }
  return { record, target, scope };
}
