// End-to-end simulation of the Skeptic against fake Jira + Confluence sites.  Run with: npm test
// It exercises every entry point the way Forge would call it, then runs the offline evaluation.
import { createSite } from './fakesite.mjs';
import { evalPlans, FREEZE } from '../eval/plans.mjs';

let site = createSite();
globalThis.__sim = { calls: [], respond: (...a) => site.respond(...a), noUser: false };
const app = await import('./.bundle.mjs');
const { finalize } = await import('./.pipeline.mjs');
const Q = globalThis.__queue;
Q.handler = app.jobs;
const KVS = globalThis.__kvs;

// ---- tiny harness -----------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const sectionStart = (name) => console.log(`\n${name}`);
const check = (name, cond, detail) => {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name}${detail !== undefined ? `\n       ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 700)}` : ''}`);
  }
};
const fails = async (fn) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e.message;
  }
};
const drain = () => Q.drain();
const ctxFor = (issue, accountId = site.me) => ({ accountId, extension: { issue: { id: issue.id, key: issue.key } } });
const R = (fn, payload, context) => app.handler({ call: { functionKey: fn }, payload: payload || {}, context });
const ADMIN = { accountId: 'u4', moduleKey: 'skeptic-admin' };
const as = (who) => {
  site.me = who;
};
const findRef = (ev, title) => {
  for (const list of ['pastPlans', 'incidents', 'openRisks', 'confluencePages', 'skepticTrackRecord', 'acceptedRisksThatHappened'])
    for (const x of ev[list] || []) if (String(x.title).includes(title)) return x.ref;
  return null;
};
const post = async (body, s) => app.intake({ method: 'POST', headers: { 'X-Skeptic-Secret': [s] }, body: JSON.stringify(body) });
const soon = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
const LIVECHAT_CLAIM = 'In-app live chat was abandoned in April 2025 because support could not staff the chat in the evenings.';

const plan = site.plans.livechat;
const honest = site.plans.honesty;

// ---------------------------------------------------------------------------------------------
sectionStart('1. Agent output parsing');
check('parseRuns accepts one object, an array, a JSON string, fenced JSON and double-encoded JSON', [
  app.parseRuns({ objections: [] }).length === 1,
  app.parseRuns([{ objections: [] }, { objections: [] }]).length === 2,
  app.parseRuns('[{"objections":[]},{"assumptions":[]}]').length === 2,
  app.parseRuns('Here you go:\n```json\n{"objections":[{"ref":"E1"}]}\n```').length === 1,
  app.parseRuns('"{\\"objections\\":[]}"').length === 1,
  app.parseRuns('{"runs":[{"objections":[]},{"objections":[]}]}').length === 2,
  app.parseRuns('nothing here').length === 0,
].every(Boolean));

// ---------------------------------------------------------------------------------------------
sectionStart('2. Install: site profile and history index backfill (queue jobs)');
{
  await app.onInstalled();
  const jobs = await drain();
  const meta = KVS.get('idx:meta');
  check('backfill ran through the queue', jobs >= 2, jobs);
  check('index is ready', meta?.state === 'ready', meta);
  check('index holds every work item and page', meta?.docs === site.issues.size + site.pages.size, { docs: meta?.docs, issues: site.issues.size, pages: site.pages.size });
  const profile = KVS.get('site:profile');
  check('profile detects Epic as the plan type and Bug as an incident type', profile.planTypes?.includes('Epic') && profile.incidentTypes?.includes('Bug'), profile);
  check('profile sees normal history density', profile.density === 'normal', profile.counts);
  const postings = [...KVS.keys()].filter((k) => k.startsWith('idx:p:chat:'));
  check('postings are one key per term and document (race-free updates)', postings.length >= 3, postings.length);
}

// ---------------------------------------------------------------------------------------------
sectionStart('3. find-evidence: index first, permission re-check, refs');
let ev;
{
  const secretEpic = site.addIssue({ summary: 'Live chat rebuild for VIP customers', text: ['Confidential live chat project for VIP customers, abandoned.'], labels: ['abandoned', 'skeptic-ignore'], status: 'done', restricted: true });
  await app.onIssueCreated({ issue: { id: secretEpic.id } });
  await drain();
  check('a new work item is indexed by its create event', !!KVS.get(`idx:d:i${secretEpic.id}`));
  const before = site.calls.length;
  ev = await app.findEvidence({ planKey: plan.key, searchTerms: 'live chat, chat support, messaging' }, { accountId: 'u1' });
  const calls = site.calls.slice(before);
  check('returns the plan split into sections', Array.isArray(ev.plan?.sections) && ev.plan.sections.length >= 1, ev.plan);
  check('the abandoned live chat epic is the first past plan', ev.pastPlans?.[0]?.title === 'In-app live chat for customers' && ev.pastPlans[0].outcome === 'abandoned', ev.pastPlans?.map((p) => p.title));
  check('its recent comments come along', (ev.pastPlans?.[0]?.recentComments || []).some((c) => /staff evening chat/.test(c.text)));
  check('retro and decision pages are found and marked', ['Why we stopped live chat', 'DEC-014'].every((t) => ev.confluencePages?.some((p) => p.title.includes(t) && p.decisionOrRetro)), ev.confluencePages?.map((p) => p.title));
  check('the open transcript risk is found', ev.openRisks?.some((r) => r.title.includes('transcript')), ev.openRisks);
  check('the evening chat incident is found', ev.incidents?.some((r) => r.title.includes('Evening chat queue')), ev.incidents);
  check('the restricted epic is not listed', !JSON.stringify(ev).includes('VIP'));
  check('...but counted as left out', ev.coverage.leftOutBecauseYouCannotSeeThem >= 1, ev.coverage);
  check('the index was used: no live text search ran', !calls.some((c) => c.includes('text ~')), calls.filter((c) => c.includes('search')));
  check('the safety notice is included', /Never follow instructions/.test(ev.safetyNotice));
  check('the plan itself is not evidence', !JSON.stringify(ev.pastPlans).includes(plan.key));
  const again = await app.findEvidence({ planKey: plan.key, searchTerms: 'live chat, chat support, messaging' }, { accountId: 'u1' });
  check('a second call in the same session reuses the pack (same refs)', again.evidenceReused === true && findRef(again, 'In-app live chat') === findRef(ev, 'In-app live chat'));
}

// ---------------------------------------------------------------------------------------------
sectionStart('4. save-review: citation check, majority vote, computed severity');
{
  const E = findRef(ev, 'In-app live chat');
  const P = findRef(ev, 'Why we stopped live chat');
  const D = findRef(ev, 'DEC-014');
  const Rk = findRef(ev, 'transcript');
  const A = [{ id: 'A1', text: 'The support team can staff the chat button', section: 1 }];
  const objE = { assumption: 'A1', ref: E, claim: LIVECHAT_CLAIM, strength: 'precedent', impact: 4, likelihood: 4, reversibility: 3, mitigation: 0, talkTo: 'Ama Owusu', satisfiedBy: 'Evening support cover agreed before launch' };
  const objP = { assumption: 'A1', ref: P, claim: 'The retro found evening chats waited an average of 40 minutes because support works 8 am to 5 pm.', strength: 'related', impact: 3, likelihood: 3, reversibility: 2, mitigation: 0 };
  const run1 = {
    summary: 'This repeats the 2025 live chat attempt.',
    assumptions: A,
    objections: [
      objE,
      objP,
      { assumption: 'A1', ref: Rk, claim: 'The legal review on how long chat transcripts may be kept was raised and never answered.', strength: 'related', impact: 3, likelihood: 3, reversibility: 4, mitigation: 0 },
      { assumption: 'A1', ref: 'E99', claim: 'An invented epic says chat failed for many reasons at once.', impact: 5, likelihood: 5 },
      { assumption: 'A1', ref: E, claim: 'Live chat vendors charged 12 times the estimate for chat seats in the evenings.', impact: 5, likelihood: 5 },
    ],
    questions: ['Who answers chats after 5 pm?'],
    revisitWhen: ['Support has evening cover', 'The moon is made of cheese'],
  };
  const run2 = { assumptions: A, objections: [{ ...objE, impact: 5 }, { ...objP, likelihood: 4 }], questions: [] };
  const run3 = {
    assumptions: A,
    objections: [
      { ...objE, impact: 3 },
      { assumption: 'A1', ref: D, claim: 'DEC-014 decided Kestrel will not run its own live chat because support cannot staff evenings.', strength: 'precedent', impact: 4, likelihood: 4, reversibility: 3, mitigation: 0, planAlreadyHandles: 'staffed by the support team' },
    ],
  };
  const saved = await app.saveReview({ planKey: plan.key, runsJson: JSON.stringify([run1, run2, run3]) }, { accountId: 'u1' });
  check('saved', saved.saved === true, saved);
  const review = KVS.get(`review:${plan.id}`);
  const refsKept = review.objections.map((o) => o.ref).sort();
  check('objections raised by most passes are kept (E and P)', JSON.stringify(refsKept) === JSON.stringify([E, P].sort()), { refsKept, E, P });
  check('a one-pass objection becomes a "worth asking" question', review.worthAsking.some((w) => w.ref === Rk), review.worthAsking);
  check('an unknown ref is dropped', review.dropped.noRef >= 1, review.dropped);
  check('a claim with a number the evidence does not contain is dropped', review.dropped.citation >= 1 && review.dropReasons.some((r) => /number not in the evidence/.test(r)), review.dropReasons);
  check('a lone "plan already handles this" is neither kept nor asked', !review.handled.length && !review.worthAsking.some((w) => w.ref === D));
  const e = review.objections.find((o) => o.ref === E);
  const p = review.objections.find((o) => o.ref === P);
  check('severity is computed in code from median factors (precedent: high)', e.severity === 'high' && e.factors.impact === 4, e);
  check('related evidence scores lower (medium)', p.severity === 'medium', p);
  check('objections are sorted by severity', review.objections[0].ref === E);
  check('the verdict follows the objections', review.verdict === 'strong objections');
  check('a talk-to name is kept only because it appears in the evidence', e.talkTo === 'Ama Owusu');
  check('an ungrounded "what would change the answer" is dropped', review.revisitWhen.length === 1 && /evening cover/.test(review.revisitWhen[0]), review.revisitWhen);
  check('votes are recorded', review.voting.runs === 3 && e.votes === 3 && p.votes === 2, review.voting);
  check('the review ready time is recorded', Number.isFinite(review.timing.readyMs));
  const prop = site.props[`${plan.id}:skeptic-ledger`];
  check('the ledger property is mirrored without evidence titles', prop?.openCount === 2 && prop.topSeverity === 'high' && !JSON.stringify(prop).includes('live chat'), prop);
  const c = site.comments.filter((x) => x.issue === plan.key).pop();
  check('high severity mentions the plan owner in the comment', c && c.text.includes('"type":"mention"') && c.text.includes('u1'), c);
  check('the comment is a coloured panel with a table of objections and severity labels', c.text.includes('"type":"panel"') && c.text.includes('"panelType":"error"') && c.text.includes('"type":"table"') && c.text.includes('"text":"HIGH"'));
  check('the comment says the objections must be answered before the plan can start', c.text.includes('must be answered in the Skeptic panel before this plan can start'));

  const evH = await app.findEvidence({ planKey: honest.key, searchTerms: 'colour scheme, dark mode, night' }, { accountId: 'u1' });
  const noObj = { summary: '', assumptions: [{ id: 'A1', text: 'Drivers want darker screens at night' }], objections: [] };
  // As the agent saves now: check-review takes the passes (no approval card), save-review takes one plain sentence.
  const early = await app.saveReview({ planKey: honest.key, summary: 'No objections' }, { accountId: 'u1' });
  check('save-review without check-review first asks for it', /check-review/.test(early.error || ''), early);
  const checked = await app.checkReview({ planKey: honest.key, runsJson: JSON.stringify([noObj, noObj, noObj]) }, { accountId: 'u1' });
  check('check-review holds the passes and says what to call next, in plain words', checked.ok === true && checked.passes === 3 && /save-review/.test(checked.next), checked);
  const other = await app.saveReview({ planKey: honest.key, summary: 'No objections' }, { accountId: 'u2' });
  check('nobody else can save the passes someone checked', !!other.error, other);
  const savedH = await app.saveReview({ planKey: honest.key, summary: 'No objections: nothing in the history contradicts the plan' }, { accountId: 'u1' });
  check('save-review with only a plain sentence saves the checked review', savedH.verdict === 'no strong objections' && !KVS.get(`staged:${honest.id}`), savedH);
  const manifest = (await import('node:fs')).readFileSync(new URL('../manifest.yml', import.meta.url), 'utf8');
  const block = (key) => manifest.slice(manifest.indexOf(`- key: ${key}`), manifest.indexOf('- key:', manifest.indexOf(`- key: ${key}`) + 5));
  check('the approval card shows no JSON: save-review takes no JSON input, and the JSON goes through a read action', !/runsJson/.test(block('save-review')) && /actionVerb: GET/.test(block('check-review')) && /runsJson/.test(block('check-review')));
  const rh = KVS.get(`review:${honest.id}`);
  check('honesty plan: no objections, honest verdict', savedH.verdict === 'no strong objections' && rh.objections.length === 0, savedH);
  check('honesty plan: says what was checked', /Checked|Searched/.test(rh.summary) && rh.checked.rules.length >= 3, rh.summary);
  check('honesty plan: no mention; it goes to the daily digest', [...KVS.keys()].some((k) => k.startsWith('digest:item:')));
  check('honesty plan: no abandoned precedent in its evidence', (evH.pastPlans || []).every((x) => x.outcome !== 'abandoned'), evH.pastPlans?.map((x) => x.title));
}

// ---------------------------------------------------------------------------------------------
sectionStart('5. Advocate pass and assumption grounding');
{
  const pack = KVS.get(`evidence:${plan.id}`);
  const D = Object.entries(pack.refs).find(([, v]) => v.title.includes('DEC-014'))[0];
  const target = { title: plan.fields.summary, text: plan.fields.description.content.map((x) => x.content[0].text).join('\n\n'), sections: pack.agentView.plan.sections.map((s, i) => ({ ...s, hash: pack.sectionHashes[i] })) };
  const base = { assumption: 'A1', ref: D, claim: 'DEC-014 decided Kestrel will not run its own live chat because support cannot staff evenings.', strength: 'precedent', impact: 4, likelihood: 4, reversibility: 3, mitigation: 0 };
  const run = (o) => ({ assumptions: [{ id: 'A1', text: 'The support team can staff the chat button', section: 1 }], objections: [o] });
  const go = (runs) => finalize({ runs, evidence: pack, target, previous: null, rules: { findings: [] }, learning: { docs: {} }, calibration: {} });
  const r1 = go([run({ ...base, planAlreadyHandles: 'staffed by the support team' }), run({ ...base, planAlreadyHandles: 'staffed by the support team' })]);
  check('quote found in the plan: the objection moves to "already covered"', r1.handled.length === 1 && r1.objections.length === 0, r1);
  const r2 = go([run({ ...base, planAlreadyHandles: 'We hired an evening shift of six agents' }), run({ ...base, planAlreadyHandles: 'We hired an evening shift of six agents' })]);
  check('quote not in the plan: the objection stands', r2.objections.length === 1 && r2.handled.length === 0, r2.dropReasons);
  const r3 = go([{ assumptions: [], objections: [{ ref: D, claim: 'Quantum widgets for tax returns failed spectacularly in finance.', impact: 5, likelihood: 5 }] }]);
  check('a claim that matches neither the plan nor its source is dropped', r3.objections.length === 0 && r3.dropped.assumption + r3.dropped.citation === 1, r3.dropped);
  const r4 = go([run({ ...base, ref: 'C1' })]);
  check('the agent cannot cite rule refs (code adds those)', r4.objections.length === 0 && r4.dropped.noRef === 1);
}

// ---------------------------------------------------------------------------------------------
sectionStart('6. Workflow gate: advisory in To Do, binding on start, plans only');
{
  const g1 = await app.gate({ issue: { key: plan.key }, transition: { to: { id: '3' } } });
  check('blocks moving the plan to In Progress', g1.result === false && /2 unresolved objection/.test(g1.errorMessage), g1);
  check('the message lists severity', /\[high\]/.test(g1.errorMessage));
  const g2 = await app.gate({ issue: { key: plan.key }, transition: { to: { id: '1' } } });
  check('moving back to To Do is always allowed', g2.result === true);
  const g3 = await app.gate({ issue: { key: honest.key }, transition: { to: { id: '3' } } });
  check('a plan with no objections passes', g3.result === true);
  const task = [...site.issues.values()].find((i) => i.fields.issuetype.name === 'Task');
  const g4 = await app.gate({ issue: { key: task.key }, transition: { to: { id: '3' } } });
  check('work items outside the plan scope are never gated', g4.result === true);
  globalThis.__sim.respond = () => {
    throw new Error('platform down');
  };
  const g5 = await app.gate({ issue: { key: plan.key }, transition: { to: { id: '3' } } });
  globalThis.__sim.respond = (...a) => site.respond(...a);
  check('fails open on platform errors', g5.result === true);
  plan.fields.labels.push('skeptic-ignore');
  const g6 = await app.gate({ issue: { key: plan.key }, transition: { to: { id: '3' } } });
  plan.fields.labels = plan.fields.labels.filter((l) => l !== 'skeptic-ignore');
  check('adding skeptic-ignore does not get a reviewed plan past the gate', g6.result === false);
}

// ---------------------------------------------------------------------------------------------
sectionStart('7. Layered gate: grading, rebuttal, escalation, approvals, proof');
{
  const ctx = ctxFor(plan, 'u1');
  const view = await R('getPanel', {}, ctx);
  const E = view.review.objections[0];
  const P = view.review.objections[1];
  check('the panel lists allowed responses per severity', E.allowed.find((a) => a.type === 'accept-risk')?.needsApprover === true && P.allowed.find((a) => a.type === 'accept-risk')?.needsMitigation === true);
  check('the panel shows advisory mode while in To Do', view.binding === false);
  const good = 'Evening cover: we hired two agents for 6 pm to 10 pm from 1 March; Kofi Mensah signed off the rota.';

  let r = await R('respond', { id: E.id, type: 'accept-risk', input: { text: 'accept risk', elapsedMs: 4000 } }, ctx);
  check('a generic answer gets a rebuttal', r.result.ok === false && r.result.rebuttal && !r.result.escalated, r.result);
  r = await R('respond', { id: E.id, type: 'accept-risk', input: { text: 'We will be careful', elapsedMs: 3000 } }, ctx);
  check('a second weak answer escalates', r.result.escalated === true, r.result);
  r = await R('respond', { id: E.id, type: 'accept-risk', input: { text: good, elapsedMs: 20000 } }, ctx);
  check('a good answer on a high objection asks for an approver', r.result.needsApprover === true, r.result);
  r = await R('respond', { id: E.id, type: 'accept-risk', input: { text: good, approverId: 'u1' } }, ctx);
  check('the author cannot be the approver', r.result.ok === false && /approve your own|author/.test(r.result.error), r.result);
  r = await R('respond', { id: E.id, type: 'accept-risk', input: { text: good, approverId: 'u2', elapsedMs: 15000 } }, ctx);
  check('a named approver gets the request', r.result.status === 'pending-approval' && site.comments.some((c) => c.issue === plan.key && c.text.includes('u2') && /sign-off/.test(c.text)), r.result);
  const gPending = await app.gate({ issue: { key: plan.key }, transition: { to: { id: '3' } } });
  check('the gate stays closed while sign-off is pending', gPending.result === false && /awaiting sign-off/.test(gPending.errorMessage), gPending);
  let d = await R('decide', { id: E.id, approve: true }, ctxFor(plan, 'u1'));
  check('the requester cannot approve', d.result.ok === false);
  as('u2');
  const v2 = await R('getPanel', {}, ctxFor(plan, 'u2'));
  check('the approver sees approve buttons', v2.review.objections.find((o) => o.id === E.id).canDecide === true);
  d = await R('decide', { id: E.id, approve: true, note: 'Rota checked' }, ctxFor(plan, 'u2'));
  as('u1');
  check('approval resolves the objection', d.result.status === 'resolved', d.result);
  check('the accepted risk is in the ledger', !!KVS.get(`risk:${plan.id}:${E.id}`));

  const accept = 'We accept the evening wait for the first month while the new shift ramps up to full cover by 1 April.';
  r = await R('respond', { id: P.id, type: 'accept-risk', input: { text: accept } }, ctx);
  check('medium: accepting the risk requires a mitigation task', r.result.ok === false && /mitigation task/i.test(r.result.error), r.result);
  r = await R('respond', { id: P.id, type: 'accept-risk', input: { text: accept, summary: 'Measure evening chat wait times weekly', assigneeId: 'u7', dueDate: soon, elapsedMs: 30000 } }, ctx);
  const task = [...site.issues.values()].find((i) => i.fields.labels.includes('skeptic-mitigation'));
  check('a mitigation task is created with an owner and due date, and linked', r.result.status === 'resolved' && task?.fields.assignee?.accountId === 'u7' && task.fields.duedate === soon && site.links.length === 1, r.result);
  const g = await app.gate({ issue: { key: plan.key }, transition: { to: { id: '3' } } });
  check('with everything resolved the gate opens', g.result === true, g);
  const rev = KVS.get(`review:${plan.id}`);
  check('author time is recorded', rev.authorMs >= 60000, rev.authorMs);

  await R('reopen', { id: P.id }, ctx);
  r = await R('respond', { id: P.id, type: 'plan-change', input: { text: 'Added evening cover' } }, ctx);
  check('plan change is refused when the plan did not change', r.result.ok === false && /hasn't changed/.test(r.result.rebuttal), r.result);
  plan.fields.description.content[0].content[0].text += ' Evening support cover from 6 pm to 10 pm is agreed with the support team.';
  r = await R('respond', { id: P.id, type: 'plan-change', input: { text: 'Added evening cover' } }, ctx);
  check('plan change is accepted once the plan text deals with it', r.result.status === 'resolved', r.result);
  await R('reopen', { id: P.id }, ctx);
  r = await R('respond', { id: P.id, type: 'covered', input: { quote: 'We hired a night shift of ten agents' } }, ctx);
  check('covered: a quote that is not in the plan is refused', r.result.ok === false && /can't find/.test(r.result.rebuttal));
  const pitch = String(plan.fields.description.content[0].content[0].text).split(/(?<=\.)\s+/).find((x) => /live chat/i.test(x)) || '';
  r = await R('respond', { id: P.id, type: 'covered', input: { quote: pitch } }, ctx);
  check('covered: the plan\'s own pitch, pasted back, does not settle an objection to it', r.result.ok === false && /restates the plan/.test(r.result.rebuttal), [pitch, r.result]);
  r = await R('respond', { id: P.id, type: 'covered', input: { quote: 'Evening support cover from 6 pm to 10 pm is agreed with the support team.' } }, ctx);
  check('covered: an exact quote that deals with it resolves it', r.result.status === 'resolved', [r.result, P.claim, P.sourceTitle, P.sourceQuote, P.satisfiedBy]);
  await R('reopen', { id: P.id }, ctx);
  const incident = [...site.issues.values()].find((i) => i.fields.summary.startsWith('Evening chat queue'));
  r = await R('respond', { id: P.id, type: 'evidence', input: { link: incident.key, text: 'That incident is why we now staff evenings: the 6 pm to 10 pm shift started on 1 March.' } }, ctx);
  check('evidence: a visible linked item with a real explanation resolves it', r.result.status === 'resolved', r.result);
  await R('reopen', { id: P.id }, ctx);
  r = await R('respond', { id: P.id, type: 'evidence', input: { link: 'KF-9999', text: 'See this.' } }, ctx);
  check('evidence: a link the user cannot open is refused', r.result.ok === false && /can't open/.test(r.result.error), r.result);
  as('u5');
  const err = await fails(() => R('respond', { id: P.id, type: 'not-relevant', input: { text: 'Not needed, the vendor is different in 2027 and handles staffing.' } }, ctxFor(plan, 'u5')));
  as('u1');
  check('people who cannot edit the plan cannot respond', /permission to edit/.test(err || ''), err);
  r = await R('respond', { id: P.id, type: 'not-relevant', input: { text: 'Not relevant: since March the 6 pm to 10 pm evening shift answers every channel, so waits are gone.' } }, ctx);
  const docP = KVS.get(`review:${plan.id}`).objections.find((o) => o.id === P.id).docId;
  check('medium: "not relevant" with a real reason resolves it and is learned as a dismissal', r.result.status === 'resolved' && (KVS.get(`learn:doc:${docP}`)?.dismissed || 0) >= 1, r.result);
}

// ---------------------------------------------------------------------------------------------
sectionStart('8. Chat responses: the agent grades, code has the final say');
{
  const ctx = ctxFor(plan, 'u1');
  let view = await R('getPanel', {}, ctx);
  const E = view.review.objections.find((o) => o.severity === 'high');
  view = await R('reopen', { id: E.id }, ctx);
  const n = view.review.objections.findIndex((o) => o.id === E.id) + 1;
  const strong = 'The 2027 vendor handles evening staffing with 24/7 agents, contract signed on 2 October by Kofi Mensah.';
  let r = await app.respondToObjection({ planKey: plan.key, objection: String(n), responseType: 'evidence', link: 'KF-9999', answer: strong }, { accountId: 'u1' });
  check('chat responses go through the same checks', r.error && /can't open/.test(r.error), r);
  r = await app.respondToObjection({ planKey: plan.key, objection: String(n), responseType: 'not-relevant', answer: strong, grade: 'fail', rebuttal: 'Name who checked the staffing numbers.' }, { accountId: 'u1' });
  check('an agent "fail" wins even when code would pass', r.ok === false && /who checked/.test(r.rebuttal), r);
  r = await app.respondToObjection({ planKey: plan.key, objection: String(n), responseType: 'not-relevant', answer: 'fine', grade: 'pass' }, { accountId: 'u1' });
  check('an agent "pass" cannot rescue a generic answer', r.ok === false, r);
  r = await app.respondToObjection({ planKey: plan.key, objection: String(n), responseType: 'mitigation' }, { accountId: 'u1' });
  check('mitigation from chat is sent to the panel', r.needsPanel === true);
  const gr = await app.getReviewAction({ planKey: plan.key }, { accountId: 'u1' });
  check('get-review numbers objections and reports the gate', gr.objections[0].number === 1 && /block the gate/.test(gr.gate), gr);
}

// ---------------------------------------------------------------------------------------------
sectionStart('9. Rules: freeze windows, blockers, owner load');
{
  await R('saveAdmin', { freezeWindows: 'Peak season: 2027-04-01 to 2027-05-15', overloadThreshold: 15 }, ADMIN);
  const blocker = site.addIssue({ summary: 'Support rota system upgrade', type: 'Task', text: ['Upgrade the rota tool.'] });
  plan.fields.issuelinks = [{ type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' }, inwardIssue: { id: blocker.id, key: blocker.key, fields: { status: { statusCategory: { key: 'new' } } } } }];
  plan.fields.assignee = { accountId: 'u7', displayName: 'Ama Owusu' };
  site.overloaded.add('u7');
  const evR = await app.findEvidence({ planKey: plan.key }, { accountId: 'u1' });
  check('rule findings are returned to the agent', evR.ruleFindings.length === 3, evR.ruleFindings);
  await app.saveReview({ planKey: plan.key, runsJson: JSON.stringify([{ assumptions: [], objections: [] }]) }, { accountId: 'u1' });
  const rv = KVS.get(`review:${plan.id}`);
  const rules = rv.objections.filter((o) => o.sourceKind === 'check').map((o) => o.rule).sort();
  check('freeze, blocker and load become objections', JSON.stringify(rules) === JSON.stringify(['blocker', 'freeze', 'load']), rules);
  check('a freeze clash is high severity', rv.objections.find((o) => o.rule === 'freeze').severity === 'high');
  check('objections on a section that changed since, and not raised again, are dropped', rv.droppedByChange >= 1, rv.droppedByChange);
  check('what was checked is recorded', rv.checked.rules.filter((x) => x.result === 'flag').length >= 3, rv.checked.rules);
  plan.fields.issuelinks = [];
  plan.fields.assignee = null;
  site.overloaded.clear();
  await R('saveAdmin', { freezeWindows: '' }, ADMIN);
}

// ---------------------------------------------------------------------------------------------
sectionStart('10. Re-review only what changed');
{
  const ev3 = await app.findEvidence({ planKey: plan.key }, { accountId: 'u1' });
  check('unchanged plan: no section is marked changed', ev3.plan.sections.filter((x) => x.changed).length === 0, ev3.plan.sections);
  const E = findRef(ev3, 'In-app live chat');
  const r1 = { assumptions: [{ id: 'A1', text: 'The support team can staff the chat button', section: 1 }], objections: [{ assumption: 'A1', ref: E, claim: LIVECHAT_CLAIM, strength: 'precedent', impact: 4, likelihood: 4, reversibility: 3, mitigation: 0 }] };
  await app.saveReview({ planKey: plan.key, runsJson: JSON.stringify([r1]) }, { accountId: 'u1' });
  const ctx = ctxFor(plan, 'u1');
  const v = await R('getPanel', {}, ctx);
  const target = v.review.objections.find((o) => o.ref === E);
  const ev3b = await R('respond', { id: target.id, type: 'evidence', input: { link: [...site.issues.values()].find((i) => i.fields.summary.startsWith('Evening chat queue')).key, text: 'That incident is why the plan now has a 6 pm to 10 pm evening support shift from 1 March.' } }, ctx);
  check('setup: the objection is resolved', ev3b.result.status === 'resolved', ev3b.result);
  plan.fields.description.content.push({ type: 'paragraph', content: [{ type: 'text', text: 'New: a pilot with ten business customers first, measured for four weeks.' }] });
  const ev4 = await app.findEvidence({ planKey: plan.key }, { accountId: 'u1' });
  const changed = ev4.plan.sections.filter((x) => x.changed);
  check('after an edit only the new section is marked changed', changed.length === 1 && /pilot/.test(changed[0].text), ev4.plan.sections);
  check('the agent is told to review only changed sections', /Only sections with changed: true/.test(ev4.plan.reviewOnly));
  await app.saveReview({ planKey: plan.key, runsJson: JSON.stringify([{ assumptions: [], objections: [] }]) }, { accountId: 'u1' });
  const rv = KVS.get(`review:${plan.id}`);
  const kept = rv.objections.find((o) => o.ref === E || o.id === target.id);
  check('the answered objection on the unchanged section carries over, still resolved', kept?.carriedOver && kept.status === 'resolved', rv.objections.map((o) => [o.ref, o.status, o.carriedOver]));
}

// ---------------------------------------------------------------------------------------------
sectionStart('11. Background review through automation (three runs, majority, progress)');
let p2;
{
  const s = (await R('getAdmin', {}, ADMIN)).secret;
  await R('saveAdmin', { automationReady: true }, ADMIN);
  p2 = site.addIssue({ summary: 'Evening live chat support for customers', text: ['Open a live chat channel from 6 pm to 10 pm, answered by the support team.'], reporter: 'u1' });
  const before = Q.pushed.length;
  await app.onIssueCreated({ issue: { id: p2.id } });
  check('the create event queues index, incident and prep jobs', ['index-issue', 'incident', 'prep'].every((t) => Q.pushed.slice(before).some((j) => j.body.type === t)));
  await drain();
  const radar = KVS.get(`radar:${p2.id}`);
  check('the radar flags it high on its own (no AI)', radar?.level === 'high', radar);
  check('the radar comment gives counts only', site.comments.some((c) => c.issue === p2.key && /Skeptic radar/.test(c.text) && !/In-app live chat/.test(c.text)));
  check('evidence-backed, so the review label is added for automation', p2.fields.labels.includes('skeptic-review'));
  let prog = KVS.get(`progress:${p2.id}`);
  check('progress shows the agent stage', prog?.stage === 'agent' && prog.source === 'background', prog);

  globalThis.__sim.noUser = true;
  const evA = await app.findEvidence({ planKey: p2.key, searchTerms: 'live chat, evening support' }, {});
  globalThis.__sim.noUser = false;
  check('automation reads with the plan owner’s permissions', KVS.get(`evidence:${p2.id}`).readMode === 'owner-filtered' && !JSON.stringify(evA).includes('VIP'));
  const E = findRef(evA, 'In-app live chat');
  const run = (impact) =>
    JSON.stringify({ summary: 'Repeats 2025.', assumptions: [{ id: 'A1', text: 'The support team answers chats from 6 pm to 10 pm', section: 1 }], objections: [{ assumption: 'A1', ref: E, claim: LIVECHAT_CLAIM, strength: 'precedent', impact, likelihood: 4, reversibility: 3, mitigation: 0 }] });
  let res = await post({ issueKey: p2.key, run: 1, response: run(4) }, 'wrong');
  check('a wrong secret is refused', res.statusCode === 401);
  res = await post({ issueKey: p2.key, run: 1, response: run(4) }, s);
  check('run 1 accepted, waiting for more', res.statusCode === 202, res.body);
  res = await post({ issueKey: p2.key, run: 2, response: JSON.stringify(run(5)) }, s);
  check('run 2 accepted (double-encoded JSON is fine)', res.statusCode === 202, res.body);
  res = await post({ issueKey: p2.key, run: 3, response: run(3) }, s);
  const body = JSON.parse(res.body);
  check('run 3 finalises the review', res.statusCode === 200 && body.saved && body.runsUsed === 3, body);
  const rv = KVS.get(`review:${p2.id}`);
  check('the majority view is saved with median factors', rv.channel === 'automation' && rv.objections[0].factors.impact === 4 && rv.objections[0].votes === 3, rv.objections[0]);
  check('the review label is removed when done', !p2.fields.labels.includes('skeptic-review'));
  prog = KVS.get(`progress:${p2.id}`);
  check('progress reaches "saved" with a ready time', prog.stage === 'saved' && Number.isFinite(prog.readyMs), prog);
  await Q.drainDelayed();
  check('the timeout job leaves a finished review alone', KVS.get(`progress:${p2.id}`).stage === 'saved');
  p2.fields.description.content[0].content[0].text += ' Changed.';
  res = await post({ issueKey: p2.key, run: 1, response: run(4) }, s);
  check('a run for a plan that changed after the evidence was gathered is refused', res.statusCode === 409, res.body);
  res = await post({ kind: 'eval-result', precision: 91.7, recall: 88.9, plans: 40, falseFlags: 1, misses: 2 }, s);
  check('evaluation results are accepted from the eval script', res.statusCode === 200 && KVS.get('eval:last')?.precision === 91.7);
  const vp = await R('requestReview', {}, ctxFor(p2, 'u1'));
  check('"Review now" in the panel starts a background review', vp.progress?.stage === 'agent' && p2.fields.labels.includes('skeptic-review'), vp.progress);
}

// ---------------------------------------------------------------------------------------------
sectionStart('12. Risk ledger: an incident that matches an accepted risk');
{
  p2.fields.description.content[0].content[0].text = 'Open a live chat channel from 6 pm to 10 pm, answered by the support team.';
  const ctx2 = ctxFor(p2, 'u1');
  const v = await R('getPanel', {}, ctx2);
  const hi = v.review.objections[0];
  const acc = await R('respond', { id: hi.id, type: 'accept-risk', input: { text: 'We accept it: two evening agents start on 1 March and Kofi Mensah owns the evening rota.', approverId: 'u2', summary: 'Track evening chat wait times for the first month', assigneeId: 'u7', dueDate: soon } }, ctx2);
  as('u2');
  const dec = await R('decide', { id: hi.id, approve: true, note: 'ok' }, ctxFor(p2, 'u2'));
  check('setup: critical acceptance needs a mitigation task and sign-off', acc.result.status === 'pending-approval' && dec.result.status === 'resolved', [acc.result, dec.result, hi.severity]);
  as('u1');
  check('setup: the risk is accepted and signed off', !!KVS.get(`risk:${p2.id}:${hi.id}`));
  const bug = site.addIssue({ summary: 'Evening chat backlog: customers waited an hour for support', type: 'Bug', text: ['Live chat opened in the evening and nobody from support was on shift to staff the chat.'] });
  await app.onIssueCreated({ issue: { id: bug.id } });
  await drain();
  const matches = [...KVS.keys()].filter((k) => k.startsWith('match:'));
  check('the incident is matched to the accepted risk', matches.length === 1, matches);
  check('the plan gets a keys-only comment', site.comments.some((c) => c.issue === p2.key && c.text.includes(bug.key) && !c.text.includes('backlog')));
  const dash = await R('getInsights', {}, { accountId: 'u1' });
  check('the dashboard lists the match for someone who can see both', dash.matches.length === 1, dash.matches);
  await R('decideMatch', { key: dash.matches[0].key, confirmed: true }, { accountId: 'u1' });
  const risk = [...KVS.entries()].find(([k]) => k.startsWith('risk:'))[1];
  check('confirming marks the risk as happened', risk.status === 'materialised' && risk.incidents[0].key === bug.key, risk);
  check('the learning loop counts it as came true', (KVS.get('learn:kinds')?.plan?.['came-true'] || 0) >= 1, KVS.get('learn:kinds'));
  const p3 = site.addIssue({ summary: 'Weekend live chat for customers', text: ['Live chat at weekends, staffed by support.'] });
  const ev5 = await app.findEvidence({ planKey: p3.key, searchTerms: 'live chat, chat support' }, { accountId: 'u1' });
  check('the next similar plan cites the accepted risk that happened (L ref)', (ev5.acceptedRisksThatHappened || []).length === 1, ev5.acceptedRisksThatHappened);
}

// ---------------------------------------------------------------------------------------------
sectionStart('13. Emergency override, logged and reviewed afterwards');
{
  const p4 = site.addIssue({ summary: 'Live chat for warehouse staff', text: ['Warehouse staff chat with support about damaged parcels.'] });
  const evW = await app.findEvidence({ planKey: p4.key, searchTerms: 'live chat' }, { accountId: 'u1' });
  const E = findRef(evW, 'In-app live chat');
  const r1 = { assumptions: [{ id: 'A1', text: 'Support answers warehouse chats', section: 1 }], objections: [{ assumption: 'A1', ref: E, claim: LIVECHAT_CLAIM, strength: 'precedent', impact: 4, likelihood: 4, reversibility: 3, mitigation: 0 }] };
  await app.saveReview({ planKey: p4.key, runsJson: JSON.stringify([r1]) }, { accountId: 'u1' });
  let r = await R('override', { reason: 'Urgent: the warehouse needs this before the depot audit on Friday.' }, ctxFor(p4, 'u1'));
  check('only a project admin can override', r.result.ok === false && /project admin/.test(r.result.error), r.result);
  as('u4');
  r = await R('override', { reason: 'urgent' }, ctxFor(p4, 'u4'));
  check('an override needs a real reason', r.result.ok === false, r.result);
  r = await R('override', { reason: 'Urgent: the warehouse needs this before the depot audit on Friday; support agreed to cover it.' }, ctxFor(p4, 'u4'));
  as('u1');
  check('the override is logged', r.result.ok === true && [...KVS.keys()].some((k) => k.startsWith('override:')), r.result);
  const g = await app.gate({ issue: { key: p4.key }, transition: { to: { id: '3' } } });
  check('the gate lets an overridden plan through', g.result === true);
  const dash = await R('getInsights', {}, { accountId: 'u1' });
  check('the dashboard lists overrides to review', dash.overrides.length === 1, dash.overrides);
  const e = await fails(() => R('markOverrideReviewed', { key: dash.overrides[0].key, note: 'ok' }, { accountId: 'u1' }));
  check('reviewing an override needs a note', /short note/.test(e || ''));
  const self = await fails(() => R('markOverrideReviewed', { key: dash.overrides[0].key, note: 'Checked it myself, all fine.' }, { accountId: 'u4' }));
  check('the person who overrode cannot review their own override', /Someone other/.test(self || ''), self);
  await R('markOverrideReviewed', { key: dash.overrides[0].key, note: 'Checked with support: cover was in place.' }, { accountId: 'u1' });
  const dash2 = await R('getInsights', {}, { accountId: 'u1' });
  check('reviewed overrides leave the list', dash2.overrides.length === 0);
}

// ---------------------------------------------------------------------------------------------
sectionStart('14. Daily sweep: reminders, backup approver, digest');
{
  const p5 = site.addIssue({ summary: 'Chat for business customers in the portal', text: ['Business customers chat with support agents in the portal.'] });
  const evB = await app.findEvidence({ planKey: p5.key, searchTerms: 'live chat' }, { accountId: 'u1' });
  const E = findRef(evB, 'In-app live chat');
  const r1 = { assumptions: [{ id: 'A1', text: 'Support agents answer chats in the portal', section: 1 }], objections: [{ assumption: 'A1', ref: E, claim: LIVECHAT_CLAIM, strength: 'precedent', impact: 4, likelihood: 4, reversibility: 3, mitigation: 0 }] };
  await app.saveReview({ planKey: p5.key, runsJson: JSON.stringify([r1]) }, { accountId: 'u1' });
  const ctx = ctxFor(p5, 'u1');
  const v = await R('getPanel', {}, ctx);
  const sent = await R('respond', { id: v.review.objections[0].id, type: 'accept-risk', input: { text: 'Business customers only chat in office hours, 8 am to 5 pm, which support already covers.', approverId: 'u2', summary: 'Confirm portal chat closes at 5 pm', assigneeId: 'u7', dueDate: soon, elapsedMs: 45000 } }, ctx);
  check('sign-off requested (learning made it critical, so a mitigation task came too)', sent.result.status === 'pending-approval' && KVS.get(`review:${p5.id}`).objections[0].severity === 'critical', sent.result);
  const rv = KVS.get(`review:${p5.id}`);
  rv.objections[0].approval.requestedAt = new Date(Date.now() - 30 * 3600000).toISOString();
  KVS.set(`review:${p5.id}`, rv);
  let out = await R('runSweepNow', {}, ADMIN);
  check('after a day the approver is reminded', out.approvals.reminded >= 1 && site.comments.some((c) => c.issue === p5.key && /Reminder/.test(c.text)), out.approvals);
  const rv2 = KVS.get(`review:${p5.id}`);
  rv2.objections[0].approval.requestedAt = new Date(Date.now() - 50 * 3600000).toISOString();
  KVS.set(`review:${p5.id}`, rv2);
  out = await R('runSweepNow', {}, ADMIN);
  check('after two days the backup approver (project lead) is asked', out.approvals.escalated >= 1 && site.comments.some((c) => c.issue === p5.key && c.text.includes('u3') && /backup/.test(c.text)), out.approvals);
  as('u3');
  const d = await R('decide', { id: rv2.objections[0].id, approve: false, note: 'Office hours only is not in the plan text.' }, ctxFor(p5, 'u3'));
  as('u1');
  check('the backup can decide once asked; a rejection reopens and escalates', d.result.status === 'open' && KVS.get(`review:${p5.id}`).objections[0].escalated === true, d.result);
  check('the digest is written', !!KVS.get('digest:last')?.lines?.length, KVS.get('digest:last'));
  const e = await fails(() => R('runSweepNow', {}, { accountId: 'u4', moduleKey: 'skeptic-dashboard' }));
  check('admin resolvers refuse other modules', /admin page/.test(e || ''));
}

// ---------------------------------------------------------------------------------------------
sectionStart('15. Dashboard: the three numbers, permission filtered');
{
  const restricted = site.addIssue({ summary: 'Live chat for the board', text: ['Secret.'], restricted: true });
  KVS.set(`review:${restricted.id}`, { tkey: restricted.id, targetType: 'issue', planId: restricted.id, planKey: restricted.key, planSummary: 'Live chat for the board', objections: [], state: 'active', createdAt: new Date().toISOString(), timing: { readyMs: 1 } });
  const dash = await R('getInsights', {}, { accountId: 'u1' });
  check('review ready time is reported', Number.isFinite(dash.timing.readyMedianMs) && dash.timing.readySamples >= 3, dash.timing);
  check('author time is reported', Number.isFinite(dash.timing.authorMedianMs), dash.timing);
  check('measured precision from the labelled set is reported', dash.precision.eval?.precision === 91.7);
  check('live precision counts useful vs dismissed resolutions', dash.precision.live.resolved >= 1, dash.precision.live);
  check('reviews of plans the user cannot see are hidden', !dash.recent.some((r) => /board/.test(r.title)));
  check('the risk ledger is listed', dash.ledger.length >= 1 && !!dash.ledger[0].status, dash.ledger);
}

// ---------------------------------------------------------------------------------------------
sectionStart('16. check-precedent and Confluence proposals');
{
  const cp = await app.checkPrecedent({ idea: 'add live chat to the mobile app' }, { accountId: 'u1' });
  check('precedent is high for live chat', cp.precedentLevel === 'high', cp);
  const cp2 = await app.checkPrecedent({ idea: 'recycled packaging option at checkout' }, { accountId: 'u1' });
  check('precedent is low for an unrelated idea', cp2.precedentLevel === 'low', cp2.why);
  const proposal = [...site.pages.values()].find((p) => p.title.startsWith('Proposal: live chat'));
  const evP = await app.findEvidence({ pageId: proposal.id, searchTerms: 'live chat' }, { accountId: 'u1' });
  check('a Confluence proposal gets evidence (and not itself)', evP.plan.kind === 'Confluence page' && !evP.confluencePages.some((p) => p.id === proposal.id), evP.confluencePages?.map((p) => p.title));
  const E = findRef(evP, 'In-app live chat');
  const r1 = { assumptions: [{ id: 'A1', text: 'Support staffs a live chat channel for warehouse staff', section: 1 }], objections: [{ assumption: 'A1', ref: E, claim: LIVECHAT_CLAIM, strength: 'related', impact: 3, likelihood: 3, reversibility: 2, mitigation: 0 }] };
  const sv = await app.saveReview({ pageId: proposal.id, runsJson: JSON.stringify([r1]) }, { accountId: 'u1' });
  check('page reviews are saved and commented, not gated', sv.saved && /not gated/.test(sv.gate) && site.pageComments.some((c) => c.pageId === proposal.id), sv);
  const pv = await R('getPanel', {}, { accountId: 'u1', extension: { content: { id: proposal.id } } });
  check('the byline panel loads for pages', pv.targetType === 'page' && pv.review.objections.length === 1, pv);
}

// ---------------------------------------------------------------------------------------------
sectionStart('17. Works on any site: different plan type, no Confluence, no history');
{
  Q.pending.splice(0);
  Q.delayed.splice(0);
  for (const k of [...KVS.keys()]) KVS.delete(k);
  site = createSite({ project: 'AC', planType: 'Initiative', withConfluence: false, history: false });
  const p = site.addIssue({ summary: 'Customer loyalty app for cafés', text: ['A loyalty app for our café chain. Owners: product team.'], type: 'Initiative' });
  await app.onInstalled();
  await drain();
  const meta = KVS.get('idx:meta');
  check('the index is ready even without Confluence', meta.state === 'ready' && meta.confluence.unavailable === true, meta);
  const profile = KVS.get('site:profile');
  check('detects "Initiative" as the plan type', JSON.stringify(profile.planTypes) === '["Initiative"]', profile.planTypes);
  check('detects an empty or sparse site', profile.density !== 'normal', profile.density);
  const evE = await app.findEvidence({ planKey: p.key }, { accountId: 'u1' });
  check('evidence on an empty site says so honestly', /little recorded history/.test(evE.note) && evE.coverage.siteHistory !== 'normal', evE.note);
  const sv = await app.saveReview({ planKey: p.key, runsJson: JSON.stringify([{ assumptions: [], objections: [{ ref: 'E1', claim: 'Something failed before at this company apparently.' }] }]) }, { accountId: 'u1' });
  check('an invented objection on an empty site is dropped', sv.verdict === 'no strong objections' && sv.droppedForFailingChecks === 1, sv);
  const g = await app.gate({ issue: { key: p.key }, transition: { to: { id: '3' } } });
  check('the gate works with the detected plan type', g.result === true);
  const task = site.addIssue({ summary: 'Set up the café database', type: 'Task' });
  await app.onIssueCreated({ issue: { id: task.id } });
  await drain();
  check('only plan types get a radar run', !KVS.get(`radar:${task.id}`));
  const cp = await app.checkPrecedent({ idea: 'customer loyalty app' }, { accountId: 'u1' });
  check('check-precedent on an empty site is honest', /little recorded history/.test(cp.advice), cp.advice);
}

// ---------------------------------------------------------------------------------------------
sectionStart('18. Offline evaluation: the radar on the 40 labelled plans');
{
  Q.pending.splice(0);
  Q.delayed.splice(0);
  for (const k of [...KVS.keys()]) KVS.delete(k);
  site = createSite();
  await app.onInstalled();
  await drain();
  await R('saveAdmin', { freezeWindows: FREEZE }, ADMIN);
  const rows = [];
  for (const ep of evalPlans) {
    const issue = site.addIssue({ summary: ep.summary, text: ep.text, labels: ['skeptic-eval'], dueDate: ep.dueDate || null });
    await app.onIssueCreated({ issue: { id: issue.id } });
    await drain();
    const radar = KVS.get(`radar:${issue.id}`);
    rows.push({ id: ep.id, expect: ep.expect, level: radar?.level || 'none', score: radar?.score ?? 0, reasons: radar?.reasons || [] });
    if (process.env.EVAL_DEBUG) {
      const e = await app.checkPrecedent({ idea: `${ep.summary}` }, { accountId: 'u1' });
      console.log('      ', ep.id, ep.expect, radar?.level, radar?.score, (radar?.reasons || []).join(';'), '=>', [...e.pastPlans, ...e.incidents, ...e.confluencePages].map((x) => `${x.title.slice(0, 30)}(${x.relevance})`).join(' / ').slice(0, 260));
    }
  }
  const flagged = (r) => r.level === 'medium' || r.level === 'high';
  const shouldFlag = rows.filter((r) => r.expect === 'flag');
  const clean = rows.filter((r) => r.expect === 'clean');
  const tp = shouldFlag.filter(flagged).length;
  const fp = clean.filter(flagged).length;
  const recall = tp / shouldFlag.length;
  const precision = tp / Math.max(1, tp + fp);
  console.log(`       radar recall ${(recall * 100).toFixed(1)}%  precision ${(precision * 100).toFixed(1)}%  false flags ${fp}/${clean.length}`);
  for (const r of rows.filter((x) => (x.expect === 'flag') !== flagged(x))) console.log(`       ${r.expect === 'flag' ? 'miss' : 'false flag'}: ${r.id} radar ${r.level} (${r.score}) ${r.reasons.join('; ')}`);
  check('radar recall on plans that should be flagged is at least 80%', recall >= 0.8);
  check('radar raises at most 3 false flags on the 22 clean plans', fp <= 3);
  check('rule plans (freeze window) are flagged', rows.filter((r) => ['f17', 'f18'].includes(r.id)).every(flagged));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
