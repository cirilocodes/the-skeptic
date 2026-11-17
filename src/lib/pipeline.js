// The accuracy pipeline. The agent proposes; this code decides what survives.
//
// For each agent run:
//   1. assumptions must be grounded in the plan text;
//   2. every objection must cite a ref from the evidence pack and attach to an assumption;
//   3. citation check: the claim must share specific words with the cited item, and every number in the
//      claim must appear in the evidence or the plan; "talk to" names must appear in the evidence;
//   4. advocate pass: if the run says the plan already handles it and quotes the plan, and the quote is
//      really in the plan, the objection moves to "already covered".
// Across runs (normally three independent automation runs):
//   5. majority vote by cited item: kept only if most runs raise it; a minority objection becomes a
//      "worth asking" question instead;
//   6. factors are the median across runs, and severity is computed in code (severity.js);
//   7. deterministic rule findings are added; earlier answers on unchanged sections carry over.
import { computeSeverity } from './severity';
import { sevRank } from './settings';
import { weightFor } from './learning';
import { aboutThePlan } from './relevance';
import {
  asList,
  bestSentence,
  clip,
  fnv1a,
  median,
  numbersIn,
  overlap,
  quoteFound,
  sharedBigrams,
  synonymsFor,
  tokenSet,
  words,
} from './text';

const STRENGTHS = ['precedent', 'related', 'weak'];
const REF_RE = /\b([EIRPTLC])\s*-?\s*(\d{1,2})\b/i;

export const MAX_OBJECTIONS = 8;

export function normaliseRef(raw) {
  const m = String(raw || '').toUpperCase().match(REF_RE);
  return m ? `${m[1]}${Number(m[2])}` : '';
}

function bestSection(text, sections) {
  let best = null;
  let bestN = 0;
  const T = tokenSet(text);
  for (const s of sections || []) {
    const n = overlap(T, s.text).count;
    if (n > bestN) {
      best = s;
      bestN = n;
    }
  }
  return best;
}

// Citation check: does the claim actually say something the cited item says?
export function citationCheck(claim, evidenceText, planText = '') {
  const shared = overlap(claim, evidenceText);
  const bg = sharedBigrams(claim, evidenceText);
  if (shared.count < 2 && !bg.length) return { ok: false, reason: 'claim does not match the cited item' };
  const hay = `${evidenceText}\n${planText}`.toLowerCase();
  const missing = numbersIn(claim).filter((n) => !new RegExp(`(^|[^0-9])${n.replace('.', '\\.')}([^0-9]|$)`).test(hay));
  if (missing.length) return { ok: false, reason: `number not in the evidence (${missing.join(', ')})` };
  return { ok: true, shared: shared.shared };
}

function nameInEvidence(name, ref) {
  if (!name) return '';
  const hay = `${ref.text || ''} ${ref.owner || ''}`.toLowerCase();
  const parts = words(name).filter((w) => w.length > 1);
  return parts.length && parts.every((p) => hay.includes(p)) ? clip(name, 80) : '';
}

// The agent's internal reference ids ("(E2)", "(P1, C3)") mean nothing to a reader; Jira keys stay.
const noRefIds = (t) => (typeof t === 'string' ? t.replace(/\s*\((?:[A-Z]\d{1,2})(?:\s*,\s*[A-Z]\d{1,2})*\)/g, '').replace(/\s+([.,;:])/g, '$1') : t);
// A point that argues for the plan ("confirming technical feasibility") is support, not an objection.
const SUPPORT_CLAIM = /\b(?:confirm(?:s|ing)?|proves?|proving|shows?|showing|demonstrat(?:es|ing))\b[^.;]{0,30}\b(?:feasib\w*|it (?:can|will) work|this (?:can|will) work)\b|\bsuccessful precedent\b|\bsupports? (?:the|this) plan\b/i;
// A code check that a point is already answered by the plan, for when the agent did not quote the plan.
// Two narrow cases, each needing the plan's own words:
//  1. the point says "the plan does not specify X" and one plan sentence holds most of X's words;
//  2. a plan sentence opens by ruling the topic out ("No recordings or transcripts are kept") and shares at least
//     three words with the point, one of them in the cited item's title.
const ABSENCE = /\b(?:the )?plan (?:does not|doesn't|never|fails to|lacks?|has no|gives no|makes no|omits?)\b(?:\s+(?:specify|specifies|mention|mentions|include|includes|say|says|address|addresses|describe|describes|name|names|state|states|explain|explains|define|defines|cover|covers|provide|provides|have|give|set out|plan for|account for))?(.*)$/i;
const NEGATES = /^(?:no|nothing|none|never)\b/i;
const planSentences = (planText) => String(planText || '').split(/(?<=[.!?:])\s+|\n+/).map((x) => x.trim()).filter((x) => x.length > 20);
export function answeredByPlan(claim, sourceTitle, planText) {
  const sentences = planSentences(planText);
  const absent = String(claim || '').match(ABSENCE);
  if (absent) {
    const want = [...tokenSet(absent[1])];
    if (want.length >= 2)
      for (const s of sentences) {
        const have = tokenSet(s);
        if (want.filter((w) => have.has(w)).length / want.length >= 0.6) return s;
      }
  }
  const claimWords = tokenSet(claim);
  const titleWords = tokenSet(String(sourceTitle || '').replace(/^[A-Z][A-Z0-9_]+-\d+:\s*/, ''));
  for (const s of sentences) {
    if (!NEGATES.test(s)) continue;
    const words = tokenSet(s);
    const shared = [...words].filter((w) => claimWords.has(w));
    if (shared.length >= 3 && shared.some((w) => titleWords.has(w))) return s;
    // The sentence rules out the cited item's own topic ("No … transcripts are kept … transcript
    // retention does not arise" against "Chat transcript retention: legal review").
    if ([...words].filter((w) => titleWords.has(w)).length >= 2) return s;
  }
  return '';
}

// An objection points at something that went wrong or a constraint the plan must meet. A claim with no
// trace of either ("was designed for agents, not customers") is a difference, not a problem.
const PROBLEM = /\b(?:abandon\w*|fail\w*|stopp\w*|stop|cancel\w*|incident\w*|outage\w*|lost|los[st]e?s?|delay\w*|late|complain\w*|complaint\w*|could(?: not|n't)|cannot|can't|unable|refus\w*|block\w*|risk\w*|breach\w*|leak\w*|fraud\w*|default\w*|behind|overwr\w*|requir\w*|must|need\w*|only if|limit\w*|cost\w*|expens\w*|budget|penalt\w*|legal|unsafe|broke\w*|down|wait\w*|queue\w*|shortfall\w*|stolen|theft|spam\w*|flag\w*|error\w*|bug\w*|problem\w*|issue\w*|conflict\w*|crash\w*|unresolved|open|never|forbid\w*|prohibit\w*|decid\w*|decision|rejected|declin\w*|low|fell|drop\w*|harm\w*|damag\w*|injur\w*|unsafe|exceed\w*|overrun\w*|short|lack\w*|missing|without|gap\w*|unaddressed|unclear|disput\w*|dissatisf\w*|churn\w*|unpaid|owed|debt|liabilit\w*|audit\w*|complian\w*|regulat\w*|permit\w*|licen[cs]\w*|approv\w*|sign[- ]off|staff\w*|capacity|shift|overload\w*|depend\w*|single|only one|one supplier)\b/i;
const NO_PROBLEM = (claim) => !PROBLEM.test(String(claim || ''));
// "May not account for…" with nothing that actually happened behind it is a guess, not history.
const HEDGE = /\b(?:may|might)\b|\bcould (?:potentially|possibly|be|lead|cause|result|create|introduce)\b/i;
const HAPPENED = /\b(?:abandon\w*|fail(?:ed|ure|ures)|stopped|cancel(?:led|ed)|incidents?|outages?|lost|complain(?:ed|ts?)|delayed|breach(?:ed|es)?|leak(?:ed|s)?|went down|was down|overwr(?:ote|itten)|refused|rejected|decided|decision|flagged|stolen|charged|locked|could not|couldn't|cannot|never|unresolved|still open|remains? open|fell|dropped|waited|shortfalls?|defaulted|fell behind|did not|didn't|was not|wasn't)\b/i;
const SPECULATION = (claim) => HEDGE.test(String(claim || '')) && !HAPPENED.test(String(claim || ''));
const OWNER_CLAIM = /\b(?:no|without|lacks?|lacking|missing|has not|hasn't|does not (?:name|list|have)|doesn't (?:name|list|have)|not (?:named|assigned))\b[^.;]{0,40}\b(?:owner|lead|accountable|assignee|designated)\b|\b(?:owner|lead)\b[^.;]{0,25}\b(?:is (?:not|un)\w*|unclear|undefined|missing|not (?:named|set|defined|assigned))\b/i;
const WORKLOAD_CLAIM = /\b(?:\d+ open (?:work )?items|over capacity|overloaded|too many (?:open )?(?:items|tasks|work items))\b/i;

export function normaliseRun(run, { refs, target }) {
  const planText = `${target.title}\n${target.text || ''}`;
  // The plan in its own words plus listed synonyms ("on premise" ≈ "self-hosted"), for the check that an
  // objection is about something the plan says.
  const planWithSynonyms = `${planText}\n${synonymsFor([planText], 30).join('\n')}`;
  const sections = target.sections || [];
  const dropped = { noRef: 0, noClaim: 0, citation: 0, assumption: 0 };
  const reasons = [];

  const assumptions = new Map();
  for (const a of Array.isArray(run?.assumptions) ? run.assumptions.slice(0, 12) : []) {
    const text = clip(typeof a === 'string' ? a : a?.text || '', 240);
    if (text.length < 8 || overlap(text, planText).count < 1) continue;
    const id = String(a?.id || `A${assumptions.size + 1}`).toUpperCase().replace(/[^A-Z0-9]/g, '') || `A${assumptions.size + 1}`;
    const n = Number(a?.section);
    const section = sections.find((s) => s.n === n) || bestSection(text, sections);
    assumptions.set(id, { id, text, section: section?.n || null, sectionHash: section?.hash || null });
  }

  const objections = [];
  const handled = [];
  for (const o of Array.isArray(run?.objections) ? run.objections.slice(0, 12) : []) {
    const ref = normaliseRef(o?.ref);
    const src = refs[ref];
    if (!src || ref.startsWith('C')) {
      dropped.noRef += 1;
      continue;
    }
    const claim = noRefIds(clip(String(o?.claim || ''), 400));
    if (claim.length < 15) {
      dropped.noClaim += 1;
      continue;
    }
    // Attach to a stated assumption, or the plan section the claim is about.
    let assumption = assumptions.get(String(o?.assumption || '').toUpperCase().replace(/[^A-Z0-9]/g, ''));
    // The claim plus synonyms of its words, so "self-hosted" in a claim can attach to "on premise" in the plan.
    const claimX = `${claim}\n${synonymsFor([claim], 20).join('\n')}`;
    if (!assumption) {
      let best = null;
      let bestN = 0;
      for (const a of assumptions.values()) {
        const n = overlap(claimX, a.text).count;
        if (n > bestN) {
          best = a;
          bestN = n;
        }
      }
      if (best) assumption = best;
      else {
        const s = bestSection(claimX, sections);
        if (s || !sections.length) assumption = { id: 'A?', text: s ? clip(s.text, 200) : clip(target.title, 200), section: s?.n || null, sectionHash: s?.hash || null };
      }
    }
    if (!assumption || overlap(`${claim} ${src.title}`, `${assumption.text} ${planWithSynonyms}`).count < 1) {
      dropped.assumption += 1;
      reasons.push(`${ref}: not tied to anything the plan says`);
      continue;
    }
    if (!aboutThePlan(src, target, planWithSynonyms)) {
      dropped.assumption += 1;
      reasons.push(`${ref}: from another project and not about what this plan says`);
      continue;
    }
    // Who owns the plan and how busy people are come from the exact rule checks (real assignees, real
    // counts). An argument about them drawn from history only repeats those checks less reliably.
    if (SUPPORT_CLAIM.test(claim)) {
      dropped.citation += 1;
      reasons.push(`${ref}: argues for the plan, not against it`);
      continue;
    }
    if (OWNER_CLAIM.test(claim) || WORKLOAD_CLAIM.test(claim)) {
      dropped.citation += 1;
      reasons.push(`${ref}: owners and workload are checked by the rules, not argued from history`);
      continue;
    }
    const check = citationCheck(claim, `${src.title}\n${src.text}`, planText);
    if (!check.ok) {
      dropped.citation += 1;
      reasons.push(`${ref}: ${check.reason}`);
      continue;
    }
    if (NO_PROBLEM(claim)) {
      dropped.citation += 1;
      reasons.push(`${ref}: names no problem or constraint from the history`);
      continue;
    }
    if (SPECULATION(claim)) {
      dropped.citation += 1;
      reasons.push(`${ref}: a guess about what may happen, not something the history shows`);
      continue;
    }
    const item = {
      ref,
      docId: src.docId || null,
      claim,
      assumption: assumption.text,
      section: assumption.section,
      sectionHash: assumption.sectionHash,
      strength: STRENGTHS.includes(o?.strength) ? o.strength : 'related',
      factors: { impact: o?.impact, likelihood: o?.likelihood, reversibility: o?.reversibility, mitigation: o?.mitigation },
      talkTo: nameInEvidence(o?.talkTo, src),
      satisfiedBy: clip(String(o?.satisfiedBy || ''), 240),
    };
    const quote = clip(String(o?.planAlreadyHandles || ''), 300);
    if (quote && quoteFound(quote, planText) && overlap(quote, `${claim} ${src.title} ${assumption.text}`).count >= 1) {
      handled.push({ ...item, quote });
      continue;
    }
    const answer = answeredByPlan(claim, src.title, planText);
    if (answer) {
      handled.push({ ...item, quote: clip(answer, 300) });
      reasons.push(`${ref}: the plan already answers it ("${clip(answer, 80)}")`);
      continue;
    }
    if (quote) reasons.push(`${ref}: the "already handled" quote is not in the plan, so the objection stands`);
    objections.push(item);
  }

  // One objection per cited item per run: keep the stronger.
  const byRef = new Map();
  for (const o of objections) {
    const prev = byRef.get(o.ref);
    const power = (x) => (Number(x.factors.impact) || 3) * (Number(x.factors.likelihood) || 3);
    if (!prev || power(o) > power(prev)) byRef.set(o.ref, o);
  }
  return {
    assumptions: [...assumptions.values()],
    objections: [...byRef.values()],
    handled,
    dropped,
    reasons,
    questions: asList(run?.questions, 3),
    revisitWhen: asList(run?.revisitWhen, 3),
    summary: clip(String(run?.summary || ''), 400),
  };
}

const medianFactor = (versions, key) => median(versions.map((v) => Number(v.factors[key])).filter(Number.isFinite));
const mode = (list) => {
  const n = {};
  for (const x of list) n[x] = (n[x] || 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0];
};

export function vote(normalised) {
  const n = normalised.length;
  const majority = n <= 1 ? 1 : Math.floor(n / 2) + 1;
  const refs = new Set(normalised.flatMap((r) => [...r.objections.map((o) => o.ref), ...r.handled.map((h) => h.ref)]));
  const kept = [];
  const handled = [];
  const minority = [];
  for (const ref of refs) {
    const versions = normalised.map((r) => r.objections.find((o) => o.ref === ref)).filter(Boolean);
    const handledVersions = normalised.map((r) => r.handled.find((o) => o.ref === ref)).filter(Boolean);
    const count = versions.length + handledVersions.length;
    if (count < majority) {
      // A lone objection becomes a question. A lone "the plan handles this" is simply dropped.
      if (versions.length) minority.push(versions[0]);
      continue;
    }
    if (handledVersions.length > versions.length) {
      handled.push(handledVersions[0]);
      continue;
    }
    const factors = {
      impact: medianFactor(versions, 'impact'),
      likelihood: medianFactor(versions, 'likelihood'),
      reversibility: medianFactor(versions, 'reversibility'),
      mitigation: medianFactor(versions, 'mitigation'),
    };
    const power = (v) => (Number(v.factors.impact) || 3) * (Number(v.factors.likelihood) || 3);
    const sorted = [...versions].sort((a, b) => power(a) - power(b));
    const rep = sorted[Math.floor((sorted.length - 1) / 2)];
    kept.push({ ...rep, factors, strength: mode(versions.map((v) => v.strength)) || rep.strength, votes: versions.length, runs: n });
  }
  return { kept, handled, minority, majority };
}

export const stableId = (o) => `o${fnv1a(o.docId || `${o.ref}|${o.rule || ''}|${o.claim}`)}`;

export function verdictFor(objections) {
  if (!objections.length) return 'no strong objections';
  const top = Math.max(...objections.map((o) => sevRank(o.severity)));
  if (top >= sevRank('high')) return 'strong objections';
  if (top >= sevRank('medium')) return 'some concerns';
  return 'minor points';
}

// The sentence from the source shown under a claim: skipped when the claim already says it word for word.
export function quoteFor(src, claim) {
  // The stored text starts with the item's title; quote the body, not the title again.
  // Page titles can carry their own code ("DEC-014: ..."), so strip it from both before comparing.
  const noKey = (x) => String(x || '').replace(/^[A-Z][A-Z0-9_]+-\d+:\s*/, '').trim();
  const name = noKey(src.title);
  const text = noKey(src.text);
  const body = name && text.toLowerCase().startsWith(name.toLowerCase()) ? text.slice(name.length).replace(/^[\s:.,;-]+/, '') : text;
  const q = bestSentence(body, claim) || src.whyEnded || '';
  if (!q) return '';
  return overlap(q, claim).ofA >= 0.8 ? '' : q;
}

export function finalize({ runs, evidence, target, previous, rules, learning, calibration }) {
  const refs = evidence.refs || {};
  const normalised = (runs || []).slice(0, 5).map((r) => normaliseRun(r, { refs, target }));
  const { kept, handled, minority } = vote(normalised);
  const now = new Date().toISOString();

  const fresh = kept.map((o) => {
    const src = refs[o.ref];
    const weight = weightFor(learning, calibration, { docId: o.docId, kind: src.kind });
    const sev = computeSeverity(o.factors, { ageYears: src.ageYears, strength: o.strength, weight });
    return {
      id: stableId(o),
      ref: o.ref,
      docId: o.docId,
      claim: o.claim,
      assumption: o.assumption,
      section: o.section,
      sectionHash: o.sectionHash,
      sourceTitle: clip(src.title, 160),
      sourceUrl: src.url,
      sourceKind: src.kind,
      // The source's own words behind the objection, shown under the claim.
      sourceQuote: quoteFor(src, o.claim),
      strength: o.strength,
      factors: sev.factors,
      severity: sev.level,
      score: sev.score,
      severityExplain: sev.explain,
      talkTo: o.talkTo,
      satisfiedBy: o.satisfiedBy,
      votes: o.votes,
      runs: o.runs,
      status: 'open',
      createdAt: now,
    };
  });

  for (const f of rules?.findings || []) {
    const sev = computeSeverity(f.factors, { ageYears: 0, strength: 'precedent', weight: 1 });
    fresh.push({
      id: stableId({ docId: f.docId, ref: f.rule, rule: f.rule, claim: f.rule === 'blocker' ? f.title : f.rule }),
      ref: f.ref,
      docId: f.docId || null,
      rule: f.rule,
      claim: f.claim,
      assumption: 'Rule check',
      section: null,
      sectionHash: null,
      sourceTitle: f.title,
      sourceUrl: f.url,
      sourceKind: 'check',
      strength: 'precedent',
      factors: sev.factors,
      severity: sev.level,
      score: sev.score,
      severityExplain: `${sev.explain} (rule)`,
      talkTo: '',
      satisfiedBy: f.satisfiedBy,
      votes: null,
      runs: null,
      status: 'open',
      createdAt: now,
    });
  }

  // Carry over earlier answers. On a re-review the agent only looks at changed sections, so objections
  // tied to sections that did not change are kept as they were. Objections on changed sections that the
  // new review does not raise again were addressed by the change.
  const currentHashes = new Set((target.sections || []).map((s) => s.hash));
  const prevActive = previous?.state === 'active' ? previous.objections || [] : [];
  const sameItem = (a, b) => a.id === b.id || (a.docId && a.docId === b.docId) || (a.rule && a.rule === b.rule);
  const merged = [];
  let droppedByChange = 0;
  for (const o of fresh) {
    const before = prevActive.find((p) => sameItem(p, o));
    if (before && before.status !== 'open')
      merged.push({ ...o, id: before.id, status: before.status, resolution: before.resolution, approval: before.approval, authorMs: before.authorMs, rebuttalUsed: before.rebuttalUsed, escalated: before.escalated, carriedOver: true });
    else if (before) merged.push({ ...o, id: before.id, rebuttalUsed: before.rebuttalUsed, escalated: before.escalated, authorMs: before.authorMs });
    else merged.push(o);
  }
  for (const p of prevActive) {
    if (merged.some((o) => sameItem(p, o))) continue;
    const unchanged = p.sectionHash && currentHashes.has(p.sectionHash);
    // A kept objection must still pass today's checks: one an earlier review let through from an
    // unrelated project is not carried forward.
    const stillFits = p.rule || (!SUPPORT_CLAIM.test(p.claim || '') && !NO_PROBLEM(p.claim || '') && !SPECULATION(p.claim || '') && !answeredByPlan(p.claim, p.sourceTitle, `${target.title}\n${target.text || ''}`) && aboutThePlan({ title: p.sourceTitle || '', text: (refs[p.ref]?.docId === p.docId ? refs[p.ref]?.text : '') || p.sourceQuote || '' }, target) && !OWNER_CLAIM.test(p.claim || '') && !WORKLOAD_CLAIM.test(p.claim || ''));
    if (unchanged && !p.rule && stillFits) merged.push({ ...p, carriedOver: true });
    else if (p.status !== 'resolved') droppedByChange += 1;
  }

  merged.sort((a, b) => sevRank(b.severity) - sevRank(a.severity) || b.score - a.score);
  const objections = merged.slice(0, MAX_OBJECTIONS);

  const first = normalised.find((r) => r.summary || r.questions.length) || normalised[0] || { questions: [], revisitWhen: [], summary: '' };
  const evidenceText = Object.values(refs).map((r) => r.text).join('\n');
  // Grounded: says something the evidence says, and every number in it is in the evidence or the plan
  // (no invented thresholds such as "no more than 3 days of support").
  const numberHay = `${evidenceText}\n${target.title || ''}\n${target.text || ''}`.toLowerCase();
  const grounded = (s) =>
    overlap(s, evidenceText).count >= 2 &&
    numbersIn(s).every((n) => new RegExp(`(^|[^0-9])${n.replace('.', '\\.')}([^0-9]|$)`).test(numberHay));
  const revisitWhen = [...new Set(normalised.flatMap((r) => r.revisitWhen))].filter(grounded).slice(0, 3);
  const worthAsking = minority
    .filter(Boolean)
    .filter((m) => !objections.some((o) => o.ref === m.ref))
    .slice(0, 3)
    .map((m) => ({ ref: m.ref, docId: refs[m.ref]?.docId || null, text: noRefIds(m.claim), sourceTitle: clip(refs[m.ref]?.title || '', 160), sourceUrl: refs[m.ref]?.url }));

  const dropped = normalised.reduce(
    (acc, r) => {
      for (const [k2, v] of Object.entries(r.dropped)) acc[k2] = (acc[k2] || 0) + v;
      return acc;
    },
    { noRef: 0, noClaim: 0, citation: 0, assumption: 0 },
  );
  const assumptions = normalised[0]?.assumptions || [];
  const verdict = verdictFor(objections);
  return {
    verdict,
    objections,
    handled: handled.map((h) => ({ ref: h.ref, docId: h.docId || null, claim: h.claim, quote: h.quote, sourceTitle: clip(refs[h.ref]?.title || '', 160), sourceUrl: refs[h.ref]?.url })),
    worthAsking,
    assumptions,
    questions: (first.questions || []).map(noRefIds),
    revisitWhen: (revisitWhen || []).map(noRefIds),
    summary: noRefIds(first.summary),
    dropped,
    dropReasons: [...new Set(normalised.flatMap((r) => r.reasons))].slice(0, 8),
    droppedByChange,
    voting: { runs: normalised.length, majority: normalised.length <= 1 ? 1 : Math.floor(normalised.length / 2) + 1, minority: minority.length },
  };
}

// For the dashboard and tests: does a review "flag" a plan (at least one objection at or above medium)?
export const flags = (review, min = 'medium') => (review?.objections || []).some((o) => sevRank(o.severity) >= sevRank(min));

