// A brand-new, empty site (what a judge has after installing the app): load both demo companies from the
// settings page, then check the Skeptic finds their history and reviews their demo plans.
import { createSite } from './fakesite.mjs';
import { company as kestrel } from '../seed/data.mjs';
import { company as pinecrest, epics as pEpics } from '../seed/data-software.mjs';
import { epics as kEpics, pages as kPages } from '../seed/data.mjs';

const site = createSite({ history: false, plans: false, extraTypes: [{ id: '10009', name: 'Incident', hierarchyLevel: 0 }, { id: '10010', name: 'Initiative', hierarchyLevel: 1 }] });
site.extraProjects = ['PA'];
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
const ADMIN = { accountId: 'u4', moduleKey: 'skeptic-admin' };
const fails = async (fn) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e.message;
  }
};
const settle = async () => {
  await Q.drain(5000);
  await Q.drainDelayed();
  await Q.drain(5000);
};
const ctxFor = (key) => {
  const i = site.byKey.get(key);
  return { accountId: 'u1', extension: { issue: { id: i.id, key: i.key } } };
};

section('1. A new, empty site');
{
  await app.onInstalled();
  await Q.drain();
  const a = await R('getAdmin', {}, ADMIN);
  check('the site starts with no history', (KVS.get('idx:meta')?.docs || 0) === 0);
  check('the setup checklist points to the demo data', /load a demo company/.test(a.checklist.find((i) => i.id === 'index').detail), a.checklist[0]);
}

section(`2. Load ${kestrel.name}`);
{
  check('a project that does not exist is refused with what to do', /Create it first/.test((await fails(() => R('loadDemo', { company: 'kestrel', projectKey: 'NOPE' }, ADMIN))) || ''));
  check('an unknown company is refused', /Choose Kestrel Freight or Pinecrest Apps/.test((await fails(() => R('loadDemo', { company: 'acme', projectKey: 'KF' }, ADMIN))) || ''));
  check('loading is admin-only', /admin page/.test((await fails(() => R('loadDemo', { company: 'kestrel', projectKey: 'KF' }, { accountId: 'u1', moduleKey: 'skeptic-panel' }))) || ''));
  const r = await R('loadDemo', { company: 'kestrel', projectKey: 'KF', spaceKey: 'KF' }, ADMIN);
  check('loading starts in the background and says how long it takes', r.status.state === 'running' && /about two minutes/.test(r.message), r);
  await settle();
  const st = (await R('getDemo', {}, ADMIN)).kestrel;
  check('it finishes, with the demo plans listed', st.state === 'done' && st.plans.livechat && st.plans.honesty, st);
  const kf = [...site.issues.values()].filter((i) => i.fields.project.key === 'KF');
  check('every history item and plan is created', kf.length === kEpics.length + 3 + 2 + 2, kf.length);
  const chat = kf.find((i) => i.fields.summary === 'In-app live chat for customers');
  check('abandoned history is moved to Done', chat.fields.status.statusCategory.key === 'done' && chat.fields.labels.includes('abandoned'));
  check('its comment says why it stopped', JSON.stringify(site.comments.filter((c) => c.issue === chat.key)).includes('cannot staff evening chat'));
  check('in-progress history is In Progress', kf.find((i) => i.fields.summary === 'Depot capacity forecasting').fields.status.statusCategory.key === 'indeterminate');
  check('incidents use the Bug type and are Done', kf.filter((i) => i.fields.issuetype.name === 'Bug').every((i) => i.fields.status.statusCategory.key === 'done'));
  check('the Confluence retro and decision pages are created', kPages.every((p) => [...site.pages.values()].some((x) => x.title === p.title)));
  check('the history is indexed', (KVS.get('idx:meta')?.docs || 0) >= kf.length + kPages.length - 2, KVS.get('idx:meta'));
  const radar = KVS.get(`radar:${site.byKey.get(st.plans.livechat).id}`);
  check('the radar rates the live chat plan high, once the history is in', radar?.level === 'high', radar);
  const v = await R('draftReview', {}, ctxFor(st.plans.livechat));
  check('a review of the live chat plan cites the abandoned epic', v.review.objections.some((o) => /In-app live chat/.test(o.sourceTitle)), v.review.objections.map((o) => o.sourceTitle));
  const h = await R('draftReview', {}, ctxFor(st.plans.honesty));
  check('the honesty plan gets no objections', h.review.objections.length === 0);
  const again = await R('loadDemo', { company: 'kestrel', projectKey: 'KF', spaceKey: 'KF' }, ADMIN);
  await settle();
  const st2 = (await R('getDemo', {}, ADMIN)).kestrel;
  check('loading again creates nothing twice', st2.created === 0 && st2.existing === kf.length && [...site.issues.values()].filter((i) => i.fields.project.key === 'KF').length === kf.length, [again.message, st2]);
  const noSpace = await R('loadDemo', { company: 'kestrel', projectKey: 'KF', spaceKey: 'ZZ' }, ADMIN);
  check('a missing space is reported, not fatal', /no Confluence space ZZ/.test(noSpace.message));
  await settle();
}

section(`3. Load ${pinecrest.name} into a second project`);
{
  const r = await R('loadDemo', { company: 'pinecrest', projectKey: 'PA' }, ADMIN);
  check('it needs no Confluence space', r.status.state === 'running' && !/space/.test(r.message.replace('Loading Pinecrest Apps into PA', '')), r.message);
  await settle();
  const st = (await R('getDemo', {}, ADMIN)).pinecrest;
  check('it finishes with its three demo plans', st.state === 'done' && st.plans.offline && st.plans.onprem && st.plans.honest, st);
  const pa = [...site.issues.values()].filter((i) => i.fields.project.key === 'PA');
  check('plans use the Initiative type', pa.filter((i) => i.fields.labels.includes('plan')).every((i) => i.fields.issuetype.name === 'Initiative'));
  check('incidents use the Incident type', pa.some((i) => i.fields.issuetype.name === 'Incident'));
  check('every item is created', pa.length === pEpics.length + 2 + 1 + 3, pa.length);
  const v = await R('draftReview', {}, ctxFor(st.plans.offline));
  check('the offline plan is reviewed against Pinecrest history', v.review.objections.some((o) => /Offline editing/.test(o.sourceTitle)), v.review.objections.map((o) => o.sourceTitle));
  const o = await R('draftReview', {}, ctxFor(st.plans.onprem));
  check('the on-premise plan finds the self-hosted edition', o.review.objections.some((x) => /Self-hosted/.test(x.sourceTitle)), o.review.objections.map((x) => x.sourceTitle));
  const drift = await app.findEvidence({ planKey: st.plans.onprem, searchTerms: 'live chat, chat support, support staffing, evening cover' }, { accountId: 'u1' });
  const own = (drift.pastPlans || []).find((p) => /Self-hosted/.test(p.title));
  const candRefs = (drift.candidateObjections || []).map((c) => c.ref);
  check('when the agent searches with terms from an earlier plan, the plan\'s own precedent is still a candidate', own && candRefs.includes(own.ref), candRefs);
  check('and the other company\'s live chat is not offered as a candidate', !(drift.pastPlans || []).filter((p) => /live chat/i.test(p.title)).some((p) => candRefs.includes(p.ref)), candRefs);
  const pk = st.plans.offline;
  const posted = site.comments.filter((c) => c.issue === pk && /Skeptic/.test(c.text));
  check('a review comment on a demo plan never mentions the app account that created it', posted.length > 0 && posted.every((c) => !/"mention"/.test(c.text) && !/app-skeptic/.test(c.text)), posted.map((c) => c.text.slice(0, 120)));
}

section('4. Failures are shown, not hidden');
{
  const types = globalThis.__sim.respond;
  globalThis.__sim.respond = (product, path, opts, who) => (String(path).includes('createmeta') ? { status: 500, body: { errorMessages: ['down'] } } : types(product, path, opts, who));
  await R('loadDemo', { company: 'pinecrest', projectKey: 'PA' }, ADMIN);
  await Q.drain(50).catch(() => null);
  globalThis.__sim.respond = types;
  const st = (await R('getDemo', {}, ADMIN)).pinecrest;
  check('a failed load says so, with the reason', st.state === 'failed' && /issue types/.test(st.error), st);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
