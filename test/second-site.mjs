// A second, different site: Pinecrest Apps, a software company. Plans are "Initiative"s, incidents are an
// "Incident" type, and there is no Confluence. Nothing in the code knows about this site: this checks the
// Skeptic works on a site shape it was not built around, not only on the Kestrel Freight demo.
import { createSite } from './fakesite.mjs';
import { company } from '../seed/data-software.mjs';

const site = createSite({ dataset: 'software' });
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

section(`1. Install on ${company.name}: detection with no configuration`);
{
  await app.onInstalled();
  await Q.drain();
  const profile = KVS.get('site:profile');
  check('plans are detected as Initiative', profile.planTypes.includes('Initiative') && !profile.planTypes.includes('Epic'), profile.planTypes);
  check('incidents are detected as Incident (and Bug)', profile.incidentTypes.includes('Incident'), profile.incidentTypes);
  check('no Confluence is detected, without errors', profile.confluence === false);
  const meta = KVS.get('idx:meta');
  check('the index is built from Jira alone', meta.state === 'ready' && meta.docs === site.issues.size, { docs: meta.docs, issues: site.issues.size });
  const a = await R('getAdmin', {}, ADMIN);
  check('the admin page shows what was detected', a.profile.planTypes.includes('Initiative') && a.checklist.find((i) => i.id === 'index').done);
}

section('2. The radar on three new plans');
const offline = site.plans.offline;
const onprem = site.plans.onprem;
const honest = site.plans.honest;
{
  for (const p of [offline, onprem, honest]) await app.onIssueCreated({ issue: { id: p.id } });
  await Q.drain();
  const level = (p) => KVS.get(`radar:${p.id}`)?.level;
  check('offline editing (tried and abandoned, plus an incident) is rated high', level(offline) === 'high', KVS.get(`radar:${offline.id}`));
  check('on-premise (abandoned as "self-hosted": different words) is flagged', ['medium', 'high'].includes(level(onprem)), KVS.get(`radar:${onprem.id}`));
  check('a keyboard shortcuts page with no history is rated low', level(honest) === 'low', KVS.get(`radar:${honest.id}`));
}

section('3. Evidence and reviews');
{
  const ev = await app.findEvidence({ planKey: offline.key, searchTerms: 'offline editing, sync, no connection' }, { accountId: 'u1' });
  check('the abandoned initiative is found, with why it ended', ev.pastPlans.some((e) => /Offline editing/.test(e.title) && /overwrit|conflict/i.test(e.whyEnded)), ev.pastPlans.map((e) => [e.title, e.whyEnded]));
  check('the incident is found under its own type', ev.incidents.some((i) => /Sync conflict/.test(i.title)), ev.incidents.map((i) => i.title));
  check('the open risk is found', ev.openRisks.some((r) => /merge design/.test(r.title)));
  check('no Confluence pages, and no error about it', ev.confluencePages.length === 0 && !ev.error);
  check('candidates include the initiative and the incident', (ev.candidateObjections || []).length >= 2, ev.candidateObjections);

  const v = await R('draftReview', {}, ctxFor(offline));
  check('a draft review cites the earlier initiative and the incident', v.review.objections.some((o) => /Offline editing/.test(o.sourceTitle)) && v.review.objections.some((o) => /Sync conflict/.test(o.sourceTitle)), v.review.objections.map((o) => o.sourceTitle));
  check('it would block the plan when it starts', v.blocking >= 1, v.blocking);

  const v2 = await R('draftReview', {}, ctxFor(onprem));
  check('the on-premise plan is matched to the self-hosted edition', v2.review.objections.some((o) => /Self-hosted/.test(o.sourceTitle)), v2.review.objections.map((o) => o.sourceTitle));

  const v3 = await R('draftReview', {}, ctxFor(honest));
  check('the plan with no history gets no objections', v3.review.objections.length === 0 && v3.review.verdict === 'no strong objections', v3.review.objections);
}

section('4. Has anyone here tried this?');
{
  const pr = await app.checkPrecedent({ idea: 'let people work without a connection and sync later' }, { accountId: 'u1' });
  check('the precedent check finds the abandoned offline initiative first', ['medium', 'high'].includes(pr.precedentLevel) && /Offline editing/.test(pr.pastPlans[0]?.title) && pr.pastPlans[0].outcome === 'abandoned', [pr.precedentLevel, pr.pastPlans.map((p) => p.title)]);
  const none = await app.checkPrecedent({ idea: 'a cheat sheet of keyboard shortcuts' }, { accountId: 'u1' });
  check('an idea with no history gets an honest low', none.precedentLevel === 'low', none.precedentLevel);
}

section('5. The gate works with Initiatives');
{
  offline.fields.status = { id: '3', name: 'In Progress', statusCategory: { key: 'indeterminate' } };
  const g0 = await app.gate({ issue: { key: offline.key }, transition: { to: { id: '3' } } });
  check('with only a draft review, the initiative cannot start until someone asks for the full review', g0.result === false && /only has a draft review/.test(g0.errorMessage), g0);
  // The full review (from Rovo) arrives, with the same objections:
  for (const i of [offline, honest]) KVS.set(`review:${i.id}`, { ...KVS.get(`review:${i.id}`), draft: false, channel: 'chat' });
  const g = await app.gate({ issue: { key: offline.key }, transition: { to: { id: '3' } } });
  check('moving the reviewed initiative out of To Do is blocked', g.result === false && /unresolved objection/.test(g.errorMessage), g);
  const g2 = await app.gate({ issue: { key: honest.key }, transition: { to: { id: '3' } } });
  check('the clean plan can move', g2.result === true);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
