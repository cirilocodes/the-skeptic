// Candidate objections: the strongest precedents in an evidence pack, picked by code, each with the
// sentence from the source that says what happened. Two uses:
//   - the agent gets them as a head start: it confirms or rejects each one instead of hunting, which
//     makes reviews faster and more precise;
//   - when no AI review is available (automation not set up, or no reply arrived), code writes a draft
//     review from them, clearly labelled, so a plan is never left with an empty panel.
// Drafts go through the same pipeline as agent output: citation check, severity, carry-over.
import { aboutThePlan, sameProject } from './relevance';
import { strongMatch } from './radar';
import { bestSentence, clip, plural, sentencesOf } from './text';

const KINDS = {
  abandoned: { impact: 4, likelihood: 3, reversibility: 3, strength: 'precedent', settle: 'Say what is different this time, or talk to the owner of the earlier plan.' },
  incident: { impact: 4, likelihood: 3, reversibility: 3, strength: 'precedent', settle: 'A specific step in the plan that prevents a repeat.' },
  decision: { impact: 3, likelihood: 3, reversibility: 3, strength: 'precedent', settle: 'Show why the earlier decision no longer applies.' },
  ledger: { impact: 4, likelihood: 4, reversibility: 3, strength: 'precedent', settle: 'A mitigation that covers what went wrong last time.' },
  risk: { impact: 3, likelihood: 3, reversibility: 2, strength: 'related', settle: 'Close the risk, or show the plan deals with it.' },
};


// The sentence that explains why an item matters for this plan.
function whyFor(ref, item, target) {
  const plan = `${target.title} ${(target.sections || []).map((x) => x.text).join(' ')}`;
  const why = ref.whyEnded || bestSentence(ref.text, plan) || sentencesOf(item.description || ref.text || '')[0] || '';
  // The stored text starts with the item's own title; the claim already names it, so do not repeat it.
  const noKey = (x) => String(x || '').replace(/^[A-Z][A-Z0-9_]+-\d+:\s*/, '').trim();
  const name = noKey(item.title || ref.title);
  const w = noKey(why);
  return name && w.toLowerCase().startsWith(name.toLowerCase()) && w.length > name.length + 15 ? w.slice(name.length).replace(/^[\s:.,;-]+/, '') : why;
}

// Items from the plan's own project count on an ordinary match. Items from other projects share fewer
// people and less context, so they need a phrase match or three informative words to make a draft.
const fitFor = (target, refs) => (item) => {
  if (!strongMatch(item)) return false;
  const key = item.key || '';
  const local = !!key && (target?.projectKey ? String(key).startsWith(`${target.projectKey}-`) : sameProject({ key }, target));
  if (local) return true;
  const ref = refs?.[item.ref] || {};
  return aboutThePlan({ title: ref.title || (key ? `${key}: ${item.title || ''}` : item.title || ''), text: ref.text || item.description || '' }, target);
};
const localFirst = (target, list) =>
  [...(list || [])].sort((a, b) => Number(String(b.key || '').startsWith(`${target?.projectKey}-`)) - Number(String(a.key || '').startsWith(`${target?.projectKey}-`)));

export function candidatesFrom(pack, target, max = 5) {
  const v = pack.agentView || pack;
  const refs = pack.refs || {};
  const out = [];
  const push = (kind, item) => {
    const ref = refs[item.ref];
    if (!ref || out.some((c) => c.ref === item.ref)) return;
    const why = clip(whyFor(ref, item, target), 220);
    const title = ref.title;
    const claim =
      kind === 'abandoned'
        ? `${title} was tried here before and abandoned${why ? `: ${why}` : '.'}`
        : kind === 'incident'
          ? `A past incident on the same topic, ${title}${why ? `: ${why}` : '.'}`
          : kind === 'decision'
            ? `The page "${title}" records an earlier decision on this${why ? `: ${why}` : '.'}`
            : kind === 'ledger'
              ? `A risk like this was accepted before and then became an incident: ${title}.`
              : `An open risk on the same topic is still unresolved, ${title}${why ? `: ${why}` : '.'}`;
    out.push({ ref: item.ref, kind, why, claim: clip(claim, 380), owner: ref.owner || '' });
  };
  const fits = fitFor(target, refs);
  for (const e of localFirst(target, v.pastPlans)) if (e.outcome === 'abandoned' && fits(e)) push('abandoned', e);
  for (const l of v.acceptedRisksThatHappened || []) push('ledger', l);
  for (const i of localFirst(target, v.incidents)) if (fits(i)) push('incident', i);
  for (const p of v.confluencePages || []) if (p.decisionOrRetro && fits(p)) push('decision', p);
  for (const r of localFirst(target, v.openRisks)) if (fits(r)) push('risk', r);
  return out.slice(0, max);
}

// What the agent sees: a short list it must confirm or reject.
export const forAgent = (cands) => cands.map((c) => ({ ref: c.ref, kind: c.kind, whatHappened: c.why || c.claim }));

// A review written by code from the candidates, in the same shape as one agent run.
export function draftRun(pack, target) {
  const cands = candidatesFrom(pack, target, 3);
  const sections = target.sections || [];
  return {
    summary: cands.length
      ? `Draft from your history, written without AI: ${plural(cands.length, 'item')} look like they apply. Run a full review for the reasoning behind each one.`
      : 'Draft from your history, written without AI: nothing in your history clearly applies.',
    assumptions: (sections.length ? sections : [{ n: 1, text: target.title }]).slice(0, 8).map((s) => ({ id: `A${s.n}`, text: clip(s.text, 220), section: s.n })),
    objections: cands.map((c) => ({
      ref: c.ref,
      claim: c.claim,
      strength: KINDS[c.kind].strength,
      impact: KINDS[c.kind].impact,
      likelihood: KINDS[c.kind].likelihood,
      reversibility: KINDS[c.kind].reversibility,
      mitigation: 0,
      talkTo: c.owner,
      satisfiedBy: KINDS[c.kind].settle,
    })),
    questions: [],
    revisitWhen: [],
  };
}
