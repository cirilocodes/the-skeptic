// Feature tests for the v2.1 additions: candidate objections, "why it ended" sentences, drafts written
// without AI (on request and when automation never replies), fast one-step automation, the sidebar glance
// and Confluence byline count, queue retries, health, the setup checklist, Unicode and index upgrades.
import { createSite } from './fakesite.mjs';

const site = createSite();
globalThis.__sim = { calls: [], respond: (...a) => site.respond(...a), noUser: false };
globalThis.__retryBaseMs = 1;
const app = await import('./.bundle.mjs');
const Q = globalThis.__queue;
Q.handler = app.jobs;
const KVS = globalThis.__kvs;

let passed = 0;
let failed = 0;
const section = (name) => console.log(`\n${name}`);
const check = (name, cond, detail) => {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name}${detail !== undefined ? `\n       ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 700)}` : ''}`);
  }
};
const R = (fn, payload, context) => app.handler({ call: { functionKey: fn }, payload: payload || {}, context });
const ctxFor = (issue, accountId = 'u1') => ({ accountId, extension: { issue: { id: issue.id, key: issue.key } } });
const ADMIN = { accountId: 'u4', moduleKey: 'skeptic-admin' };
const post = async (body, s) => app.intake({ method: 'POST', headers: { 'X-Skeptic-Secret': [s] }, body: JSON.stringify(body) });
const findRef = (ev, title) => {
  for (const list of ['pastPlans', 'incidents', 'openRisks', 'confluencePages'])
    for (const x of ev[list] || []) if (String(x.title).includes(title)) return x.ref;
  return null;
};
const fails = async (fn) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e.message;
  }
};

await app.onInstalled();
await Q.drain();
const plan = site.plans.livechat;
const honest = site.plans.honesty;

// ------------------------------------------------------------------------------------------------
section('1. Candidate objections and "why it ended"');
let ev;
{
  ev = await app.findEvidence({ planKey: plan.key, searchTerms: 'live chat, chat support' }, { accountId: 'u1' });
  const E = findRef(ev, 'In-app live chat');
  const cand = ev.candidateObjections || [];
  check('the agent gets candidate objections picked by code', cand.length >= 2, cand);
  check('the abandoned live chat epic is a candidate, with what happened', cand.some((c) => c.ref === E && /staff|evening/i.test(c.whatHappened)), cand);
  const past = ev.pastPlans.find((e) => e.ref === E);
  check('the abandoned plan carries the sentence that says why it ended', /staff evening chat|could not staff/i.test(past?.whyEnded || ''), past?.whyEnded);
  check('the agent is told to confirm or reject each candidate', /candidateObjections lists \d+ item/.test(ev.note));
  const evH = await app.findEvidence({ planKey: honest.key, searchTerms: 'dark mode, night colours' }, { accountId: 'u1' });
  check('a plan with no precedent gets no candidates', (evH.candidateObjections || []).length === 0, evH.candidateObjections);
}

// ------------------------------------------------------------------------------------------------
section('2. A draft from history, written without AI');
{
  const v = await R('draftReview', {}, ctxFor(plan));
  const rv = v.review;
  check('the panel action writes a draft review', rv?.draft === true && rv.channel === 'draft', rv && { draft: rv.draft, channel: rv.channel });
  check('the draft has real objections', rv.objections.length >= 2 && rv.verdict !== 'no strong objections', rv.objections.map((o) => [o.severity, o.claim]));
  check('every draft objection cites an item the user can see', rv.objections.every((o) => o.sourceUrl && o.sourceTitle));
  check('draft claims passed the same citation check as agent claims', (rv.dropped?.citation || 0) === 0, rv.dropReasons);
  check("objections quote the source's own words", rv.objections.some((o) => (o.sourceQuote || '').length > 20), rv.objections.map((o) => o.sourceQuote));
  check('the draft says it was written without AI', /without AI/.test(rv.summary));
  const vh = await R('draftReview', {}, ctxFor(honest));
  check('a plan with no precedent gets an honest empty draft', vh.review.objections.filter((o) => o.sourceKind !== 'check').length === 0 && vh.review.verdict === 'no strong objections', vh.review.objections);
  site.me = 'u5';
  check('someone who cannot edit cannot start a draft', /permission to edit/.test((await fails(() => R('draftReview', {}, ctxFor(plan, 'u5')))) || ''));
  site.me = 'u1';
  check('a draft records how long it took', Number.isFinite(rv.timing?.readyMs));
}

// ------------------------------------------------------------------------------------------------
section('3. Automation never replies: a labelled draft instead of an empty panel');
let secret;
{
  secret = (await R('getAdmin', {}, ADMIN)).secret;
  await R('saveAdmin', { automationReady: true }, ADMIN);
  const p3 = site.addIssue({ summary: 'Live chat in the customer app at night', text: ['Customers chat with support in the evening from the customer app.'], reporter: 'u1' });
  const v = await R('requestReview', {}, ctxFor(p3));
  check('Review now starts a background review', v.progress?.stage === 'agent');
  await Q.drainDelayed();
  const rv = KVS.get(`review:${p3.id}`);
  check('after the time limit, a draft review is saved', rv?.draft === true && rv.objections.length >= 1, rv && { draft: rv.draft, n: rv.objections.length });
  check('the progress finishes as saved, not failed', KVS.get(`progress:${p3.id}`)?.stage === 'saved', KVS.get(`progress:${p3.id}`));
  check('the evidence was read with the plan owner’s permissions', KVS.get(`evidence:${p3.id}`)?.readMode === 'owner-filtered');
  const h = await R('getHealth', {}, ADMIN);
  check('the missing reply is logged on the health tab', h.errors.some((e) => e.where === 'automation' && /No agent reply/.test(e.message)), h.errors);
  await R('saveAdmin', { draftFallback: false }, ADMIN);
  const p3b = site.addIssue({ summary: 'Weekend live chat for customers', text: ['Customers chat with support on weekends.'], reporter: 'u1' });
  await R('requestReview', {}, ctxFor(p3b));
  await Q.drainDelayed();
  check('with drafts switched off, the panel says the review did not finish', KVS.get(`progress:${p3b.id}`)?.stage === 'failed' && !KVS.get(`review:${p3b.id}`));
  await R('saveAdmin', { draftFallback: true }, ADMIN);
}

// ------------------------------------------------------------------------------------------------
section('4. Fast automation: one agent step, three passes in one reply');
{
  const p4 = site.addIssue({ summary: 'Evening chat channel for customers', text: ['Open an evening live chat channel, answered by the support team.'], reporter: 'u1' });
  globalThis.__sim.noUser = true;
  const evA = await app.findEvidence({ planKey: p4.key, searchTerms: 'live chat, evening support' }, {});
  globalThis.__sim.noUser = false;
  const E = findRef(evA, 'In-app live chat');
  const pass = (impact) => ({
    summary: 'Repeats 2025.',
    assumptions: [{ id: 'A1', text: 'The support team answers evening chats', section: 1 }],
    objections: [{ assumption: 'A1', ref: E, claim: 'In-app live chat was abandoned in April 2025 because support could not staff the chat in the evenings.', strength: 'precedent', impact, likelihood: 4, reversibility: 3, mitigation: 0 }],
  });
  const res = await post({ issueKey: p4.key, run: 'all', response: JSON.stringify({ runs: [pass(4), pass(5), pass(3)] }) }, secret);
  const body = JSON.parse(res.body);
  check('one reply with three passes saves the review at once', res.statusCode === 200 && body.saved && body.voting?.runs === 3, body);
  const rv = KVS.get(`review:${p4.id}`);
  check('the median of the three passes is used', rv.objections[0].factors.impact === 4 && rv.objections[0].votes === 3);
  const again = await post({ issueKey: p4.key, run: 'all', response: JSON.stringify({ runs: [pass(4), pass(4)] }) }, secret);
  check('a retried web request does not save it twice', JSON.parse(again.body).accepted === false);
  check('the stage timings are recorded', rv.timing?.stages && ['history', 'rules', 'agent'].every((k) => Number.isFinite(rv.timing.stages[k])), rv.timing);
  const h = await R('getHealth', {}, ADMIN);
  check('the health tab shows when the rule last sent a review', !!h.seen.intake && /just now|min ago/.test(h.seen.intake.ago), h.seen);
  check('timing percentiles are computed for background reviews', Number.isFinite(h.timing.automation?.p50), h.timing);
  const view = await R('getPanel', {}, ctxFor(p4));
  check('the panel knows the typical time to a review', Number.isFinite(view.typicalMs), view.typicalMs);
  const bad = await post({ issueKey: p4.key, run: 1, response: 'Sorry, I could not do that.' }, secret);
  const h2 = await R('getHealth', {}, ADMIN);
  check('a reply with no JSON is refused and logged with the reason', bad.statusCode === 422 && h2.errors.some((e) => e.where === 'intake' && /no JSON review/.test(e.message)));
  const raw = await app.intake({ method: 'POST', headers: { 'X-Skeptic-Secret': [secret] }, queryParameters: { issueKey: [p4.key], run: ['all'] }, body: JSON.stringify({ runs: [pass(4), pass(5), pass(3)] }) });
  KVS.delete?.('health:seen');
  const raw2Plan = site.addIssue({ summary: 'Evening chat for drivers', text: ['Open an evening live chat channel for drivers, answered by dispatch.'], reporter: 'u1' });
  globalThis.__sim.noUser = true;
  await app.findEvidence({ planKey: raw2Plan.key, searchTerms: 'live chat, evening chat' }, {});
  globalThis.__sim.noUser = false;
  const raw2 = await app.intake({ method: 'POST', headers: { 'X-Skeptic-Secret': [secret] }, queryParameters: { issueKey: [raw2Plan.key], run: ['all'] }, body: JSON.stringify({ runs: [pass(4), pass(5), pass(3)] }) });
  const seenNow = (await R('getHealth', {}, ADMIN)).seen?.intake;
  check('a whole-body reply counts as the rule working (health shows it, the checklist item can turn done)', raw2.statusCode === 200 && !!seenNow, { status: raw2.statusCode, seenNow });
  check('the rule can send the agent reply as the whole body, with the plan and run in the URL', raw.statusCode === 200, raw.body);
  const wrapped = await app.intake({ method: 'POST', headers: { 'X-Skeptic-Secret': [secret] }, queryParameters: { issueKey: [p4.key], run: ['all'] }, body: `Here is the review: ${JSON.stringify({ runs: [pass(4), pass(5), pass(3)] })}` });
  check('a reply with a sentence around the JSON still works', wrapped.statusCode === 200, wrapped.body);
  const empty = await post({ issueKey: p4.key, run: 'all', response: '' }, secret);
  const h4 = await R('getHealth', {}, ADMIN);
  check('an empty reply is logged with what to check', empty.statusCode === 422 && h4.errors.some((e) => /it was empty: check the body uses \{\{agentResponse\}\}/.test(e.message)), h4.errors.map((e) => e.message));
  const stuck = await R('getPanel', {}, ctxFor(p4));
  check('the panel says the agent replied without a review, instead of staying on "Agent reviewing"', stuck.progress?.stage === 'failed' && /without a review/.test(stuck.progress?.error || ''), stuck.progress);
  const before = KVS.get(`review:${p4.id}`);
  await R('requestReview', {}, ctxFor(p4));
  await Q.drainDelayed();
  const after = KVS.get(`review:${p4.id}`);
  check('when no reply arrives, a full review of the same text is kept, not replaced by a draft', after && !after.draft && after.createdAt === before.createdAt && /last full review is still shown/.test(KVS.get(`progress:${p4.id}`)?.error || ''), { draft: after?.draft, same: after?.createdAt === before?.createdAt, progress: KVS.get(`progress:${p4.id}`) });
  await post({ issueKey: p4.key, run: 1, response: '{}' }, 'wrong-secret');
  const h3 = await R('getHealth', {}, ADMIN);
  check('a wrong secret is logged with what to do', h3.errors.some((e) => e.code === 'HTTP 401' && /Copy the secret/.test(e.message)));
}

// ------------------------------------------------------------------------------------------------
section('5. Sidebar glance and Confluence byline count');
{
  const g = await R('getGlance', {}, ctxFor(plan));
  check('the glance shows blocking and open counts', /blocking · \d+ open|open, none blocking/.test(g.text) && g.top.length >= 1, g);
  check('the glance marks a draft', g.draft === true);
  const g2 = await R('getGlance', {}, ctxFor(site.addIssue({ summary: 'Unreviewed plan about parcels', text: ['Something new.'] })));
  check('an unreviewed plan says so', g2.state === 'none' && /Not reviewed/.test(g2.text));
  const proposal = [...site.pages.values()].find((p) => p.title.startsWith('Proposal: live chat'));
  check('the byline title is plain before a review', (await app.bylineProps({ extension: { content: { id: proposal.id } } })).title === 'The Skeptic');
  const evP = await app.findEvidence({ pageId: proposal.id, searchTerms: 'live chat' }, { accountId: 'u1' });
  const E = findRef(evP, 'In-app live chat');
  await app.saveReview(
    {
      pageId: proposal.id,
      runsJson: JSON.stringify([{ assumptions: [{ id: 'A1', text: 'Support staffs warehouse chat', section: 1 }], objections: [{ assumption: 'A1', ref: E, claim: 'In-app live chat was abandoned in April 2025 because support could not staff the chat in the evenings.', strength: 'precedent', impact: 4, likelihood: 4, reversibility: 3, mitigation: 0 }] }]),
    },
    { accountId: 'u1' },
  );
  const props = await app.bylineProps({ extension: { content: { id: proposal.id } } });
  check('after a review, the byline title shows the open count', props.title === 'The Skeptic · 1 open', props);
  check('the byline never throws on odd input', (await app.bylineProps(null)).title === 'The Skeptic');
}

// ------------------------------------------------------------------------------------------------
section('6. Queue retries and the health tab');
{
  site.fail.rateLimit = 1000;
  const r1 = await app.jobs({ body: { type: 'index-issue', id: plan.id } }, {});
  check('a rate-limited job asks the platform to retry it later', r1?._retry === true && r1.retryOptions.retryAfter >= 30, r1);
  const r2 = await app.jobs({ body: { type: 'index-issue', id: plan.id }, retryContext: { retryCount: 2 } }, {});
  check('each retry waits longer', r2?._retry === true && r2.retryOptions.retryAfter > r1.retryOptions.retryAfter, r2);
  const r3 = await fails(() => app.jobs({ body: { type: 'index-issue', id: plan.id }, retryContext: { retryCount: 3 } }, {}));
  site.fail.rateLimit = 0;
  check('after three retries the job gives up', !!r3);
  const h = await R('getHealth', {}, ADMIN);
  check('the failure is on the health tab with its code', h.errors.some((e) => e.where === 'job index-issue' && e.code === 'HTTP 429'), h.errors.slice(0, 3));
  check('job counters track retries and failures', h.jobs.retried >= 2 && h.jobs.failed >= 1, h.jobs);
  const cleared = await R('clearErrors', {}, ADMIN);
  check('errors can be cleared', cleared.errors.length === 0);
  check('health is admin-only', /admin page/.test((await fails(() => R('getHealth', {}, { accountId: 'u1', moduleKey: 'skeptic-panel' }))) || ''));
}

// ------------------------------------------------------------------------------------------------
section('7. The setup checklist');
{
  const a = await R('getAdmin', {}, ADMIN);
  const byId = Object.fromEntries(a.checklist.map((i) => [i.id, i]));
  check('the index item is done', byId.index.done === true, byId.index);
  check('the automation item is done once a review has arrived', byId.rule.done === true, byId.rule);
  check('the validator item waits until the gate has run', byId.gate.done === false);
  await app.gate({ issue: { key: plan.key }, transition: { to: { id: '1' } } });
  const a2 = await R('getAdmin', {}, ADMIN);
  check('after a transition check, the validator item is done', a2.checklist.find((i) => i.id === 'gate').done === true);
  check('fast setup is the default: one prompt and one body', a2.rule.fast && a2.rule.pairs.length === 1 && /all lenses/.test(a2.rule.pairs[0].prompt) && /run=all$/.test(a2.rule.pairs[0].query) && a2.rule.pairs[0].body === '{{agentResponse}}');
  await R('saveAdmin', { setupMode: 'thorough', automationRuns: 2 }, ADMIN);
  const a3 = await R('getAdmin', {}, ADMIN);
  check('thorough setup lists one step per pass', !a3.rule.fast && a3.rule.pairs.length === 2 && /run=2$/.test(a3.rule.pairs[1].query));
  await R('saveAdmin', { setupMode: 'fast', automationRuns: 3 }, ADMIN);
}

// ------------------------------------------------------------------------------------------------
section('8. Other languages and synonyms');
{
  const fr = site.addIssue({
    summary: 'Programme de fidélité avec des récompenses',
    text: ['Abandonné en janvier 2026 : la finance ne pouvait pas comptabiliser les récompenses non utilisées.'],
    labels: ['abandoned'],
    status: 'done',
  });
  await app.onIssueCreated({ issue: { id: fr.id } });
  await Q.drain();
  const doc = KVS.get(`idx:d:i${fr.id}`);
  check('accented words are indexed (fidélité → fidelite)', doc && Object.keys(doc.terms || {}).some((t) => t.startsWith('fidelit')), doc && Object.keys(doc.terms || {}));
  const pr = await app.checkPrecedent({ idea: 'programme de fidelite' }, { accountId: 'u1' });
  check('a search without accents finds it', pr.pastPlans.some((p) => p.title.includes('fidélité')), pr.pastPlans.map((p) => p.title));
  const syn = await app.checkPrecedent({ idea: 'rewards scheme for frequent senders' }, { accountId: 'u1' });
  check('"rewards" finds the abandoned "loyalty points" plan through synonyms', syn.pastPlans.some((p) => /Loyalty points/.test(p.title)), syn.pastPlans.map((p) => p.title));
}

// ------------------------------------------------------------------------------------------------
section('9. Index upgrades rebuild themselves');
{
  const before = KVS.get('idx:meta');
  KVS.set('idx:meta', { ...before, version: 1 });
  await app.onIssueUpdated({ issue: { id: plan.id }, changelog: { items: [{ field: 'summary' }] } });
  await Q.drain(5000);
  const after = KVS.get('idx:meta');
  check('an index from an older version is rebuilt once', after.version === before.version && after.state === 'ready', after);
  check('the rebuilt index holds every item again', after.docs >= before.docs - 2, { before: before.docs, after: after.docs });
  const pr = await app.checkPrecedent({ idea: 'live chat for customers' }, { accountId: 'u1' });
  check('search works after the rebuild', pr.precedentLevel === 'high', pr.precedentLevel);
}

// ------------------------------------------------------------------------------------------------
section('9b. Nightly reconciliation removes items that disappeared without an event');
{
  const ghost = site.addIssue({ summary: 'Parcel lockers in shopping malls', text: ['Lockers in malls.'] });
  await app.onIssueCreated({ issue: { id: ghost.id } });
  await Q.drain();
  check('setup: the item is indexed', !!KVS.get(`idx:d:i${ghost.id}`));
  site.issues.delete(ghost.id);
  site.byKey.delete(ghost.key);
  let removed = 0;
  for (let i = 0; i < 20 && KVS.get(`idx:d:i${ghost.id}`); i += 1) {
    const r = await app.jobs({ body: { type: 'reconcile' } }, {});
    removed += r?.removed || 0;
  }
  check('the vanished item is removed from the index', !KVS.get(`idx:d:i${ghost.id}`) && removed >= 1);
  check('nothing that still exists is removed', KVS.get(`idx:d:i${plan.id}`) !== undefined && removed === 1, removed);
  check('progress is recorded so the next night resumes', !!KVS.get('idx:meta').reconciledAt);
}

// ------------------------------------------------------------------------------------------------
section('10. Measure precision from the admin page (40 labelled plans, drafts without AI)');
{
  const out = await R('startEvaluation', { projectKey: 'KF' }, ADMIN);
  check('starting creates the 40 plans and queues their reviews', out.status.total === 40 && /Created 40 plan/.test(out.message), out.message);
  check('the freeze window the rule plans need is added and said so', /freeze window/.test(out.message) && KVS.get('config:settings').freezeWindows.length === 1);
  const evalIssues = [...site.issues.values()].filter((i) => i.fields.labels.includes('skeptic-eval'));
  check('the plans are labelled skeptic-eval', evalIssues.length === 40);
  await Q.drain(5000);
  await Q.drainDelayed();
  await Q.drain(5000);
  check('evaluation plans are never indexed as history', evalIssues.every((i) => !KVS.get(`idx:d:i${i.id}`)));
  check('evaluation plans post no comments (no radar heads-up, no review comment)', !site.comments.some((c) => evalIssues.some((i) => i.key === c.issue)));
  check('evaluation plans never start background AI reviews', evalIssues.every((i) => !i.fields.labels.includes('skeptic-review')));
  const res = await R('getEvaluation', {}, ADMIN);
  const r = res.result;
  check('the set is scored when the reviews are done', res.status.state === 'done' && r?.plans === 40, res);
  check('drafts without AI find at least 90% of the repeats', r.recall >= 90, r);
  check('drafts without AI are at least 80% precise', r.precision >= 80, r);
  check('drafts without AI raise at most one false flag on 22 clean plans', r.falseFlags <= 1, r);
  console.log(`       drafts: precision ${r.precision}%  recall ${r.recall}%  false flags ${r.falseFlags}  misses ${r.misses}`);
  const again = await R('startEvaluation', { projectKey: 'KF' }, ADMIN);
  check('running it again reuses the plans', /Created 0 plan/.test(again.message));
  check('a bad project key is refused', /key of the project/.test((await fails(() => R('startEvaluation', { projectKey: 'not a key' }, ADMIN))) || ''));
  const admin = await R('getAdmin', {}, ADMIN);
  check('the admin page shows the result without the per-plan rows', admin.evalResult?.precision === r.precision && !admin.evalResult.rows);
}

// ------------------------------------------------------------------------------------------------
section('11. Gate status for people and coding agents (MCP)');
{
  const g = await app.gateStatus({ planKey: plan.key }, { accountId: 'u1' });
  check('a plan with blocking objections cannot start, and says why', g.canStart === false && g.state === 'blocked' && g.blocking.length >= 1 && /Answer the blocking/.test(g.next), g);
  check('blocking objections are numbered like the panel', g.blocking.every((b) => Number.isInteger(b.number) && b.number >= 1));
  const h = await app.gateStatus({ planKey: honest.key }, { accountId: 'u1' });
  check('a clean plan can start', h.canStart === true && h.state === 'clear', h);
  const fresh = site.addIssue({ summary: 'Live chat on the website for customers', text: ['Customers chat with support from the website, answered by the support team.'] });
  await app.onIssueCreated({ issue: { id: fresh.id } });
  await Q.drain();
  const f = await app.gateStatus({ planKey: fresh.key }, { accountId: 'u1' });
  check('an unreviewed plan the radar rates high needs a review first', f.state === 'review required' && f.canStart === false, f);
  check('a missing or restricted plan is refused without details', /don't have access/.test((await app.gateStatus({ planKey: 'KF-9999' }, { accountId: 'u1' })).error || ''));
}

section('12. Signed requests, retention, CSV export, service-management incident types');
{
  const { createHmac } = await import('crypto');
  const body = JSON.stringify({ kind: 'eval-result', precision: 90, recall: 95, plans: 40 });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
  const ok = await app.intake({ method: 'POST', headers: { 'X-Skeptic-Timestamp': [ts], 'X-Skeptic-Signature': [`sha256=${sig}`] }, body });
  check('a correctly signed request is accepted without sending the secret', ok.statusCode === 200, ok);
  const old = String(Math.floor(Date.now() / 1000) - 600);
  const oldSig = createHmac('sha256', secret).update(`${old}.${body}`).digest('hex');
  const replay = await app.intake({ method: 'POST', headers: { 'X-Skeptic-Timestamp': [old], 'X-Skeptic-Signature': [`sha256=${oldSig}`] }, body });
  check('a signed request older than five minutes is refused (no replays)', replay.statusCode === 401);
  const tampered = await app.intake({ method: 'POST', headers: { 'X-Skeptic-Timestamp': [ts], 'X-Skeptic-Signature': [`sha256=${sig}`] }, body: body.replace('90', '99') });
  check('a changed body breaks the signature', tampered.statusCode === 401);
  check('evidence packs expire after a week', globalThis.__kvsTtl?.[`evidence:${plan.id}`]?.value === 7, globalThis.__kvsTtl?.[`evidence:${plan.id}`]);
  const ins = await R('getInsights', {}, { accountId: 'u1' });
  check('the risk ledger exports as CSV with a header row', typeof ins.ledgerCsv === 'string' && ins.ledgerCsv.startsWith('"Plan","Severity"'), ins.ledgerCsv?.slice(0, 80));
  const lib = await import('./.pipeline.mjs');
  const csv = lib.ledgerCsv([{ planKey: 'KF-1', severity: 'high', claim: '=HYPERLINK("x") "quoted"', acceptedBy: 'u1', acceptedAt: '2026-01-01', status: 'open' }]);
  check('CSV cells are quoted and spreadsheet formulas neutralised', csv.includes(`"'=HYPERLINK(""x"") ""quoted"""`), csv);
  check('Jira Service Management incident types are recognised', ['[System] Incident', '[System] Problem', 'Major incident', 'Bug'].every(lib.isIncidentType) && !lib.isIncidentType('Service request') && !lib.isIncidentType('Story'));
}

section('13. Each viewer sees only what they can');
{
  const secretRetro = site.addIssue({ summary: 'Retro: courier app chat was dropped', text: ['Courier chat was dropped in 2025 because nobody answered messages after 6 pm.'], labels: ['abandoned'], status: 'done' });
  secretRetro.hiddenFrom = ['u2'];
  await app.onIssueCreated({ issue: { id: secretRetro.id } });
  await Q.drain();
  const px = site.addIssue({ summary: 'Chat between couriers and dispatch', text: ['Couriers chat with dispatch from the courier app, answered by dispatch staff in the evening.'], reporter: 'u1' });
  const evX = await app.findEvidence({ planKey: px.key, searchTerms: 'courier chat, chat' }, { accountId: 'u1' });
  const H = findRef(evX, 'Retro: courier app chat');
  const E = findRef(evX, 'In-app live chat');
  check('setup: the author can see both items', !!H && !!E, { H, E });
  await app.saveReview(
    {
      planKey: px.key,
      runsJson: JSON.stringify([
        {
          assumptions: [{ id: 'A1', text: 'Dispatch staff answer courier chats in the evening', section: 1 }],
          objections: [
            { assumption: 'A1', ref: H, claim: 'Courier chat was dropped in 2025 because nobody answered messages after 6 pm.', strength: 'precedent', impact: 4, likelihood: 4, reversibility: 3, mitigation: 0 },
            { assumption: 'A1', ref: E, claim: 'In-app live chat was abandoned in April 2025 because support could not staff the chat in the evenings.', strength: 'precedent', impact: 4, likelihood: 4, reversibility: 3, mitigation: 0 },
          ],
        },
      ]),
    },
    { accountId: 'u1' },
  );
  const mine = await R('getPanel', {}, ctxFor(px, 'u1'));
  check('the author sees both objections in full', mine.review.objections.every((o) => !o.redacted) && mine.review.objections.length === 2);
  site.me = 'u2';
  const theirs = await R('getPanel', {}, ctxFor(px, 'u2'));
  const hidden = theirs.review.objections.find((o) => o.redacted);
  const shown = theirs.review.objections.find((o) => !o.redacted);
  check("another viewer gets the hidden item's objection redacted", !!hidden && !/Courier chat was dropped/.test(JSON.stringify(theirs)) && hidden.sourceUrl === null, theirs.review.objections.map((o) => [o.claim, o.sourceTitle]));
  check('...but keeps its severity and status, so the gate still makes sense', hidden && ['high', 'critical', 'medium'].includes(hidden.severity) && hidden.status === 'open');
  check('the objection on an item they can see is unchanged', shown && /In-app live chat/.test(shown.sourceTitle));
  const gr = await app.getReviewAction({ planKey: px.key }, { accountId: 'u2' });
  check('chat (get-review) redacts it too', !/Courier chat was dropped|Retro: courier/.test(JSON.stringify(gr)), gr.objections);
  const gs = await app.gateStatus({ planKey: px.key }, { accountId: 'u2' });
  check('gate status redacts it too', !/Courier chat was dropped/.test(JSON.stringify(gs)) && gs.blocking.length === 2);
  const gl = await R('getGlance', {}, ctxFor(px, 'u2'));
  check('the sidebar glance redacts it too', !/Courier chat was dropped/.test(JSON.stringify(gl)));
  site.me = 'u1';
  const lib = await import('./.pipeline.mjs');
  const rv = { planKey: 'KF-9', objections: [{ sourceKind: 'plan', docId: 'i1', sourceTitle: 'OPS-3: Night shift trial', claim: 'secret' }, { sourceKind: 'plan', docId: 'i2', sourceTitle: 'KF-2: Same project', claim: 'fine' }, { sourceKind: 'page', docId: 'p5', sourceTitle: 'Retro', claim: 'page' }] };
  check('comments name sources in the same project and Confluence pages, not other projects', !lib.shareable(rv.objections[0], rv) && lib.shareable(rv.objections[1], rv) && lib.shareable(rv.objections[2], rv));
}

section('14. Real-Jira strictness: one missing item never hides the rest');
{
  const extra = site.addIssue({ summary: 'Live chat widget on the help pages', text: ['A live chat widget on help pages, abandoned because support could not staff it.'], labels: ['abandoned'], status: 'done' });
  await app.onIssueCreated({ issue: { id: extra.id } });
  await Q.drain();
  site.issues.delete(extra.id);
  site.byKey.delete(extra.key);
  const ev2 = await app.findEvidence({ planKey: plan.key, searchTerms: 'live chat, chat support' }, { accountId: 'u1' });
  check('an indexed item deleted without an event does not break evidence (bulk fetch, not "id in")', ev2.pastPlans.some((e) => /In-app live chat/.test(e.title)), ev2.pastPlans.map((e) => e.title));
  const hidden = [...site.issues.values()].find((i) => i.fields.summary === 'Evening chat queue: customers waited over 40 minutes');
  hidden.hiddenFrom = ['u1'];
  const ev3 = await app.findEvidence({ planKey: plan.key, searchTerms: 'live chat, evening chat' }, { accountId: 'u1' });
  check('an item the user may not see is left out, and the rest still arrive', !ev3.incidents.some((i) => /Evening chat queue/.test(i.title)) && ev3.pastPlans.length >= 1 && ev3.coverage.leftOutBecauseYouCannotSeeThem >= 1, ev3.coverage);
  delete hidden.hiddenFrom;
  const saved = await R('saveAdmin', { projectKeys: 'KF, NOPE' }, ADMIN);
  check('an unknown project key is dropped with a warning, not saved', saved.settings.projectKeys.join(',') === 'KF' && saved.warnings.some((w) => /NOPE/.test(w)), saved);
  await R('saveAdmin', { projectKeys: '' }, ADMIN);
}

section('15. Upgrading from version 1 on a live site');
{
  const old = site.addIssue({ summary: 'Legacy plan reviewed by version 1', text: ['A plan with an old review.'] });
  KVS.set(`review:${old.id}`, {
    tkey: old.id,
    planId: old.id,
    planKey: old.key,
    verdict: 'strong objections',
    objections: [
      { ref: 'E1', claim: 'An old objection that was answered.', status: 'answered', sourceTitle: 'KF-1: In-app live chat for customers', sourceUrl: 'https://kf.atlassian.net/browse/KF-1', answer: 'We hired an evening shift.' },
      { ref: 'P1', claim: 'An old objection that was accepted.', status: 'accepted', sourceTitle: 'Why we stopped live chat', sourceUrl: 'https://kf.atlassian.net/wiki/x' },
      { ref: 'I1', claim: 'An old open objection.', status: 'open', sourceTitle: 'Evening chat queue', sourceUrl: 'https://kf.atlassian.net/browse/KF-2' },
    ],
  });
  const v = await R('getPanel', {}, ctxFor(old));
  const st = v.review.objections.map((o) => [o.status, o.severity]);
  check('version 1 answers count as resolved, and missing severities as medium', JSON.stringify(st) === JSON.stringify([['resolved', 'medium'], ['resolved', 'medium'], ['open', 'medium']]), st);
  check('so the gate counts the open one', v.blocking === 1 && v.unresolved === 1, [v.blocking, v.unresolved]);
  check('nothing shows "undefined"', !JSON.stringify(v).includes('undefined'));
  const lib = await import('./.pipeline.mjs');
  check('service-desk request types are not incidents', !lib.isIncidentType('Submit a request or incident') && lib.isIncidentType('[System] Incident'));
  const metaBefore = KVS.get('idx:meta');
  KVS.set('idx:meta', { state: 'empty', docs: 0 });
  await R('getAdmin', {}, ADMIN);
  check('opening the settings page starts an index that was never built', KVS.get('idx:meta').state === 'building' && Q.pushed.slice(-3).some((j) => j.body.type === 'clear-index'));
  await Q.drain(5000);
  check('...and it finishes', KVS.get('idx:meta').state === 'ready' && KVS.get('idx:meta').docs >= metaBefore.docs - 5, KVS.get('idx:meta'));
}

section('16. Loading a demo where the seed script already ran');
{
  const before = site.issues.size;
  await R('loadDemo', { company: 'kestrel', projectKey: 'KF', spaceKey: 'KF' }, ADMIN);
  await Q.drain(5000);
  await Q.drainDelayed();
  await Q.drain(5000);
  const st = (await R('getDemo', {}, ADMIN)).kestrel;
  check('items the seed script created are recognised, so nothing is created twice', st.state === 'done' && st.created === 0 && site.issues.size === before, [st, site.issues.size - before]);
}

section('17. A stale progress marker does not inflate the ready time');
{
  const stale = site.addIssue({ summary: 'Add live chat for drivers', text: ['Drivers want live chat in the driver app, staffed by dispatch.'] });
  const old = new Date(Date.now() - 3 * 3600000).toISOString();
  KVS.set(`progress:${stale.id}`, { stage: 'queued', startedAt: old, stagesAt: { queued: old } });
  const ev = await app.findEvidence({ planKey: stale.key, searchTerms: 'live chat' }, { accountId: 'u1' });
  const E = findRef(ev, 'In-app live chat');
  const saved = await app.saveReview(
    { planKey: stale.key, runsJson: JSON.stringify([{ assumptions: [{ id: 'A1', text: 'Dispatch can staff chat', section: 1 }], objections: [{ assumption: 'A1', ref: E, claim: 'In-app live chat was abandoned in April 2025 because support could not staff the chat in the evenings.', strength: 'precedent', impact: 4, likelihood: 4, reversibility: 3, mitigation: 0 }] }]) },
    { accountId: 'u1' },
  );
  const rv = KVS.get(`review:${stale.id}`);
  const viaPageId = await app.getReviewAction({ pageId: stale.key }, { accountId: 'u1' });
  check('a work item key passed as pageId is treated as the work item', !viaPageId.error && JSON.stringify(viaPageId).includes(stale.key), JSON.stringify(viaPageId).slice(0, 300));
  if (!rv) console.log(JSON.stringify(saved).slice(0, 400));
  check('the ready time counts from this request, not a three-hour-old marker', rv?.timing?.readyMs < 60000, rv?.timing);
}

section('18. Drafts: own project first, no repeated titles');
{
  const lib = await import('./.pipeline.mjs');
  const target = { projectKey: 'PA', title: 'Work offline and sync later', sections: [{ n: 1, text: 'Let people edit notes offline and sync when back online.' }] };
  const refs = {
    P1: { title: 'PA-1: Offline editing in the mobile app', text: 'Offline editing in the mobile app Merges were never agreed.', whyEnded: '' },
    I1: { title: 'PA-11: Sync conflict overwrote notes', text: 'Sync conflict overwrote notes On 14 March two devices editing one note offline overwrote each other.', whyEnded: '' },
    I2: { title: 'ITS-6258: Sync failed due to network issues', text: 'Sync failed due to network issues. The problem occurs when syncing devices.', whyEnded: '' },
  };
  const agentView = {
    pastPlans: [{ ref: 'P1', key: 'PA-1', title: 'Offline editing in the mobile app', outcome: 'abandoned', matchedTerms: ['offline', 'editing'], relevance: 3 }],
    incidents: [
      { ref: 'I2', key: 'ITS-6258', title: 'Sync failed due to network issues', matchedTerms: ['sync', 'network'], relevance: 2 },
      { ref: 'I1', key: 'PA-11', title: 'Sync conflict overwrote notes', matchedTerms: ['sync', 'notes', 'offline'], relevance: 2 },
    ],
  };
  const c = lib.candidatesFrom({ refs, agentView }, target);
  check('an item from another project with only two plain words in common is left out of the draft', !c.some((x) => x.ref === 'I2'), c.map((x) => x.ref));
  check('items from the plan\'s own project are kept', c.some((x) => x.ref === 'I1') && c.some((x) => x.ref === 'P1'), c.map((x) => x.ref));
  const inc = c.find((x) => x.ref === 'I1');
  check('the claim does not repeat the item\'s title in its "what happened" part', inc && !/notes: Sync conflict/i.test(inc.claim) && /On 14 March/.test(inc.claim), inc?.claim);
  const wideRefs = { ...refs, I3: { title: 'ITS-7001: Notes edited offline were lost on sync', text: 'People who edit notes offline lost them when the app synced back online.', whyEnded: '' } };
  const wide = lib.candidatesFrom({ refs: wideRefs, agentView: { incidents: [{ ref: 'I3', key: 'ITS-7001', title: 'Notes edited offline were lost on sync', matchedTerms: ['offline', 'notes'], relevance: 2 }] } }, target);
  check('another project\'s item still counts when it is itself about what the plan says', wide.some((x) => x.ref === 'I3'), wide);
}

section('19. Items from another project must be about the plan');
{
  const lib = await import('./.pipeline.mjs');
  const target = { type: 'issue', key: 'PA-15', title: 'On-premise version for banks', text: 'Banks will only buy if the product runs on premise, inside their own data centre. Package the app so their IT teams can install it.', sections: [{ n: 1, text: 'Banks will only buy if the product runs on premise, inside their own data centre. Package the app so their IT teams can install it.' }] };
  const refs = {
    P1: { title: 'KF-1: In-app live chat for customers', text: 'Goal: let customers chat with a support agent from inside the customer app. Support could not staff the chat in the evenings, and the chat vendor quote came in at three times the estimate.' },
    P2: { title: 'PA-3: Self-hosted edition for enterprise customers', text: 'Goal: a version enterprise customers can run on their own servers. Cancelled because supporting dozens of customer setups needed a support team we did not have.' },
  };
  const run = {
    assumptions: [{ id: 'A1', text: 'Banks will only buy if the product runs on premise', section: 1 }],
    objections: [
      { assumption: 'A1', ref: 'P1', claim: 'A previous support initiative inside the app (live chat) was abandoned because support could not staff it and the vendor quote was three times the estimate.', strength: 'related', impact: 4, likelihood: 3 },
      { assumption: 'A1', ref: 'P2', claim: 'A self-hosted edition for customers to run on their own servers was cancelled because supporting customer setups needed a support team the company did not have.', strength: 'precedent', impact: 4, likelihood: 4 },
    ],
  };
  const n = lib.normaliseRun(run, { refs, target });
  check('a vivid story from another project that is not about the plan is dropped', !n.objections.some((o) => o.ref === 'P1') && n.reasons.some((r) => /another project/.test(r)), n.reasons);
  check('the real precedent, found through a synonym, is kept', n.objections.some((o) => o.ref === 'P2'), n.objections.map((o) => o.ref));
  const t2 = { ...target, sections: [{ n: 1, text: target.text, hash: 'h1' }] };
  const previous = { state: 'active', objections: [{ id: 'old1', ref: 'P1', docId: 'kf1', sourceTitle: 'KF-1: In-app live chat for customers', sourceQuote: 'Support could not staff the chat in the evenings, and the chat vendor quote came in at three times the estimate.', claim: 'Live chat was abandoned.', sectionHash: 'h1', status: 'open', severity: 'high', score: 9.6 }] };
  const f = lib.finalize({ runs: [{ assumptions: run.assumptions, objections: [] }], evidence: { refs }, target: t2, previous, rules: { findings: [], checks: [] } });
  check('an open objection an earlier review let through from an unrelated project is not carried over', !f.objections.some((o) => o.id === 'old1'), f.objections.map((o) => o.id));
  const keepPrev = { state: 'active', objections: [{ ...previous.objections[0], id: 'old2', ref: 'P2', docId: 'pa3', sourceTitle: refs.P2.title, sourceQuote: refs.P2.text }] };
  const g = lib.finalize({ runs: [{ assumptions: run.assumptions, objections: [] }], evidence: { refs }, target: t2, previous: keepPrev, rules: { findings: [], checks: [] } });
  check('an open objection from the plan\'s own project is still carried over on an unchanged section', g.objections.some((o) => o.id === 'old2' && o.carriedOver), g.objections.map((o) => o.id));
}

section('19b. Owners and workload are left to the rules');
{
  const lib = await import('./.pipeline.mjs');
  const target = { type: 'issue', key: 'HV-37', title: 'Allergen icons on the printed menus', text: 'Print small icons next to each dish for nuts, gluten, dairy and shellfish, matching the filter on the digital menu. Proposed by: front of house.', sections: [{ n: 1, text: 'Print small icons next to each dish for nuts, gluten, dairy and shellfish, matching the filter on the digital menu. Proposed by: front of house.' }] };
  const refs = {
    P1: { title: 'HV-11: Menu engineering review', text: 'Rework every menu around the dishes that sell and make money. Owner: Joseph Tetteh. Shipped June 2023. New menu layouts.' },
    P2: { title: 'HV-12: Digital menu with allergen filter', text: 'A QR-code menu where guests filter dishes by allergen: nuts, gluten, dairy, shellfish. Owner: Akosua Mensah. Shipped January 2024. Kitchen sign-off of allergen data.' },
  };
  const run = {
    assumptions: [{ id: 'A1', text: 'Print small icons next to each dish matching the filter on the digital menu', section: 1 }],
    objections: [
      { assumption: 'A1', ref: 'P1', claim: "Previous menu engineering was owned by Joseph Tetteh, but this plan lists only 'front of house' as the proposer without a designated lead.", strength: 'related', impact: 3, likelihood: 3 },
      { assumption: 'A1', ref: 'P2', claim: 'Akosua Mensah already has 31 open work items, so the digital menu filter work competes for the same time.', strength: 'related', impact: 3, likelihood: 3 },
      { assumption: 'A1', ref: 'P2', claim: 'The digital menu allergen filter needed a kitchen sign-off of allergen data before launch, and the printed icons need the same sign-off.', strength: 'related', impact: 3, likelihood: 3 },
    ],
  };
  const n = lib.normaliseRun(run, { refs, target });
  check('a point that only says the plan has no named lead is dropped', !n.objections.some((o) => /designated lead/.test(o.claim)) && n.reasons.some((r) => /owners and workload are checked by the rules/.test(r)), n.reasons);
  check('a point about someone\'s open work items is dropped', !n.objections.some((o) => /open work items/.test(o.claim)));
  check('a real point from the same history is kept', n.objections.some((o) => /sign-off/.test(o.claim)), n.objections.map((o) => o.claim));
  const t2 = { ...target, sections: [{ n: 1, text: target.text, hash: 'h1' }] };
  const previous = { state: 'active', objections: [{ id: 'own1', ref: 'P1', docId: 'hv11', sourceTitle: refs.P1.title, sourceQuote: refs.P1.text, claim: run.objections[0].claim, sectionHash: 'h1', status: 'open', severity: 'medium', score: 5 }] };
  const f = lib.finalize({ runs: [{ assumptions: run.assumptions, objections: [] }], evidence: { refs }, target: t2, previous, rules: { findings: [], checks: [] } });
  check('an earlier "no named lead" point is not carried into the next review', !f.objections.some((o) => o.id === 'own1'), f.objections.map((o) => o.id));
}

section('19c. Support is not an objection; internal ids never reach the reader');
{
  const lib = await import('./.pipeline.mjs');
  const target = { type: 'issue', key: 'SE-36', title: 'Referral bonus for customers who bring a neighbour', text: 'When a customer refers a neighbour who signs up and pays the deposit, give the customer one free week of power.', sections: [{ n: 1, text: 'When a customer refers a neighbour who signs up and pays the deposit, give the customer one free week of power.', hash: 'h1' }] };
  const refs = { P1: { title: 'SE-6: Agent referral bonus', text: 'Agents earn a bonus for each customer who completes three payments. Owner: Adwoa Sarpong. Shipped July 2022. Bonus rules. Bonus fraud checks.' } };
  const run = {
    summary: 'The referral plan fits what was done before (P1).',
    assumptions: [{ id: 'A1', text: 'give the customer one free week of power when a neighbour signs up', section: 1 }],
    objections: [{ assumption: 'A1', ref: 'P1', claim: 'Sunfield Energy has already implemented referral bonus logic in SE-6 (shipped July 2022), confirming technical feasibility for this type of incentive.', strength: 'related', impact: 2, likelihood: 2 }],
    revisitWhen: ['If the bonus fraud checks (P1) show referral fraud.'],
  };
  const n = lib.normaliseRun(run, { refs, target });
  check('a precedent that supports the plan is not raised as an objection', n.objections.length === 0 && n.reasons.some((r) => /argues for the plan/.test(r)), n.reasons);
  const f = lib.finalize({ runs: [run], evidence: { refs }, target, previous: null, rules: { findings: [], checks: [] } });
  check('reference ids like "(P1)" are removed from what people read', !/\(P1\)/.test(`${f.summary} ${(f.revisitWhen || []).join(' ')}`), [f.summary, f.revisitWhen]);
}

section('19d. A point the plan already answers moves to "already covered", even when the agent missed it');
{
  const lib = await import('./.pipeline.mjs');
  const hv = 'Print small icons next to each dish for nuts, gluten, dairy and shellfish, matching the filter on the digital menu. The icons come from the same allergen list as the digital menu, and the head chef signs off each printed menu before it goes to the printer.';
  check(
    '"the plan does not specify a sign-off" is answered by the plan sentence that does',
    /head chef signs off each printed menu/.test(lib.answeredByPlan('The kitchen guide requires the head chef to sign off on allergen lists before they go on the menu, but the plan does not specify a sign-off for the printed version.', 'Allergen information: kitchen guide', hv)),
  );
  const kf = 'Let business customers book a pickup by asking their smart speaker, so the office does not need to open the portal. No recordings, transcripts or personal data are kept beyond the pickup address and time, so transcript retention does not arise.';
  check(
    'an open legal review on transcript retention is answered by "no transcripts are kept"',
    /No recordings, transcripts or personal data are kept/.test(lib.answeredByPlan('A critical legal review (KF-26) regarding the retention of transcripts and personal data from real-time channels was raised in March 2025 and remains unaddressed.', 'KF-26: Chat transcript retention: legal review', kf)),
  );
  const chat = 'Add a chat button to the mobile app so customers can talk to support from 8 am to 10 pm. No extra hiring is planned.';
  check(
    'a real objection is not swallowed: "no extra hiring" does not answer "support could not staff evening chat"',
    lib.answeredByPlan('Live chat was abandoned in 2025 because support could not staff evening chat and customers waited over 40 minutes.', 'KF-1: In-app live chat for customers', chat) === '',
  );
  check(
    'a reworded point about the same legal review is still answered when the plan rules out its topic',
    /No recordings, transcripts or personal data are kept/.test(lib.answeredByPlan('A legal review for real-time data processing (KF-26) has been pending since March 2025 and is required before any such feature goes live.', 'KF-26: Chat transcript retention: legal review', kf)),
  );
  {
    const rel = await import('./.pipeline.mjs');
    const onprem = { key: 'PA-15', title: 'On-premise version for banks', text: 'Banks will only buy if the product runs on premise, inside their own data centre. Package the app so their IT teams can install it.' };
    check('an own-project item sharing only generic words ("version", "app") is not about the plan', !rel.aboutThePlanForTest({ title: 'PA-20: Browser-only lite version', text: 'A lighter version that runs only in the browser, for school computers. Abandoned May 2022: large notebooks took over ten seconds to open and teachers went back to the full app.' }, onprem));
    check('...while the real own-project precedent, in other words, still is', rel.aboutThePlanForTest({ title: 'PA-2: Self-hosted edition for enterprise customers', text: 'A version enterprise customers can run on their own servers. Cancelled because supporting dozens of customer setups needed a support team we did not have.' }, onprem));
  }
  check(
    'an incidental "does not" in the plan rules nothing out',
    lib.answeredByPlan('KF-15: Voice ordering through smart speakers was tried here before and abandoned: under 40 customers tried it in the beta.', 'KF-15: Voice ordering through smart speakers', 'Let business customers book a pickup by asking their smart speaker, so the office does not need to open the portal.') === '',
  );
  check(
    'nor does a plan that merely mentions the topic without ruling it out',
    lib.answeredByPlan('Offline editing was abandoned because two devices editing one note overwrote each other.', 'PA-1: Offline editing in the mobile app', 'Let people create and change notes with no connection, and sync when the connection returns.') === '',
  );
}

section('19e. A difference is not a problem; an answered point is not carried over');
{
  const lib = await import('./.pipeline.mjs');
  const target = { type: 'issue', key: 'SE-36', title: 'Referral bonus for customers who bring a neighbour', text: 'When a customer refers a neighbour who signs up, give the customer one free week of power after the neighbour\'s third monthly payment, the same rule as the agent referral bonus.', sections: [{ n: 1, text: 'When a customer refers a neighbour who signs up, give the customer one free week of power after the neighbour\'s third monthly payment, the same rule as the agent referral bonus.', hash: 'h1' }] };
  const refs = { P1: { title: 'SE-6: Agent referral bonus', text: 'Agents earn a bonus for each customer who completes three payments. Owner: Adwoa Sarpong. Shipped July 2022. Bonus rules. Bonus fraud checks.' } };
  const n = lib.normaliseRun({ assumptions: [{ id: 'A1', text: 'give the customer one free week of power after the third monthly payment', section: 1 }], objections: [{ assumption: 'A1', ref: 'P1', claim: 'The agent referral bonus (SE-6) was designed for agents, not customers, and shipped in July 2022.', impact: 3, likelihood: 3 }] }, { refs, target });
  check('a claim that names no problem or constraint is dropped', n.objections.length === 0 && n.reasons.some((r) => /names no problem/.test(r)), n.reasons);
  const g = lib.normaliseRun({ assumptions: [{ id: 'A1', text: 'give the customer one free week of power after the third monthly payment', section: 1 }], objections: [
    { assumption: 'A1', ref: 'P1', claim: 'The agent referral bonus (SE-6) was designed for agents who earn a bonus for each customer, which may not account for the different verification needs of customer-to-customer referrals.', impact: 3, likelihood: 3 },
  ] }, { refs, target });
  check('a hedged guess with nothing that happened behind it is dropped', g.objections.length === 0 && g.reasons.some((r) => /a guess about what may happen/.test(r)), g.reasons);
  const refs2 = { P2: { title: 'SE-7: Airtime top-up payments', text: 'Customers pay their monthly bill by sending phone airtime. Abandoned November 2022: the telcos paid the airtime money out weeks late and kept 15 percent, so systems stayed locked after customers had paid.' } };
  const t2 = { ...target, title: 'Let customers pay their monthly bill with airtime', text: 'Let customers pay the monthly bill by sending airtime from their phone, collected through the telcos.', sections: [{ n: 1, text: 'Let customers pay the monthly bill by sending airtime from their phone, collected through the telcos.', hash: 'h9' }] };
  const h = lib.normaliseRun({ assumptions: [{ id: 'A1', text: 'pay the monthly bill by sending airtime collected through the telcos', section: 1 }], objections: [
    { assumption: 'A1', ref: 'P2', claim: 'Airtime top-up payments were abandoned in 2022 because the telcos paid the airtime money out weeks late, so systems may stay locked after customers pay.', impact: 4, likelihood: 4 },
  ] }, { refs: refs2, target: t2 });
  check('a "may" backed by what actually happened is kept', h.objections.length === 1, h.reasons);
  const hv = { type: 'issue', key: 'HV-37', title: 'Allergen icons on the printed menus', text: 'Print small icons next to each dish for nuts, gluten, dairy and shellfish, matching the filter on the digital menu.\nThe icons come from the same allergen list as the digital menu, and the head chef signs off each printed menu before it goes to the printer.', sections: [{ n: 1, text: 'Print small icons next to each dish for nuts, gluten, dairy and shellfish, matching the filter on the digital menu.', hash: 'h1' }, { n: 2, text: 'The icons come from the same allergen list as the digital menu, and the head chef signs off each printed menu before it goes to the printer.', hash: 'h2' }] };
  const prev = { state: 'active', objections: [{ id: 'old', ref: 'P1', docId: 'pg9', sourceTitle: 'Allergen information: kitchen guide', sourceQuote: 'The head chef signs off the list.', claim: 'The kitchen guide requires the head chef to sign off on allergen lists before they go on the menu, but the plan does not specify a sign-off for the printed version.', sectionHash: 'h1', status: 'open', severity: 'critical', score: 12 }] };
  const f = lib.finalize({ runs: [{ assumptions: [], objections: [] }], evidence: { refs: { P1: { title: 'Allergen information: kitchen guide', text: 'Every dish has its allergens recorded before it goes on the menu. The head chef signs off the list.' } } }, target: hv, previous: prev, rules: { findings: [], checks: [] } });
  check('an earlier point the plan now answers is not carried into the next review', !f.objections.some((o) => o.id === 'old'), f.objections.map((o) => o.id));
}

section('20. A clean result says what a rule flagged, without contradicting itself');
{
  const clean = site.addIssue({ summary: 'Keyboard shortcuts cheat sheet', text: ['Add a page listing every keyboard shortcut, opened with the question mark key.'] });
  const d = await R('draftReview', {}, ctxFor(clean));
  check('no objections, and the missing owner is named as worth fixing', d.review.objections.length === 0 && /no item contradicts the plan/.test(d.review.summary) && /Worth fixing: No assignee yet/.test(d.review.summary), d.review?.summary);
}

section('21. Quotes and "what would change the answer" stay faithful');
{
  const lib = await import('./.pipeline.mjs');
  const target = { type: 'issue', key: 'PA-15', title: 'On-premise version for banks', text: 'Banks will only buy if the product runs on premise. Package the app so their IT teams can install it.', sections: [{ n: 1, text: 'Banks will only buy if the product runs on premise. Package the app so their IT teams can install it.', hash: 'h' }] };
  const refs = { E1: { title: 'PA-2: Self-hosted edition for enterprise customers', text: 'Self-hosted edition for enterprise customers Goal: a version enterprise customers can run on their own servers. Owner: Marco Diaz. Started May 2024. Outcome: cancelled in October 2024 because supporting dozens of customer setups needed a support team we did not have.' } };
  const run = {
    assumptions: [{ id: 'A1', text: 'Banks will only buy if the product runs on premise', section: 1 }],
    objections: [{ assumption: 'A1', ref: 'E1', claim: 'A self-hosted edition for enterprise customers was cancelled in October 2024 because supporting customer setups required a support team the organization did not have.', strength: 'precedent', impact: 5, likelihood: 4 }],
    revisitWhen: ['A pilot installation for a customer needs no more than 3 days of hands-on support from the team.', 'The support team confirms it can support customer setups for on-premise installs.'],
  };
  const f = lib.finalize({ runs: [run, run, run], evidence: { refs }, target, previous: null, rules: { findings: [], checks: [] } });
  const q = f.objections[0]?.sourceQuote || '';
  check('the quote is from the item\'s body, not its title repeated', q && !/^Self-hosted edition for enterprise customers/.test(q), q);
  const dec = lib.quoteFor({ title: 'DEC-014: No in-house chat; route customers to the service portal', text: 'DEC-014: No in-house chat; route customers to the service portal Decision record. Decided 2 May 2025 by Kofi Mensah, Head of Support: Kestrel Freight will not run its own live chat.' }, 'Kofi Mensah decided in May 2025 that the company would not run its own live chat.');
  check('a page whose title carries a code is quoted from its body too', !/^DEC-014/.test(dec) && /Kofi Mensah/.test(dec), dec);
  check('a "what would change the answer" with an invented number is dropped; a grounded one is kept', !f.revisitWhen.some((r) => /3 days/.test(r)) && f.revisitWhen.some((r) => /support team confirms/.test(r)), f.revisitWhen);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
