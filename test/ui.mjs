// UI journey simulation: the real panel, dashboard and admin page, rendered with a UI Kit stand-in and wired
// to the real resolvers on a fake site. Each journey clicks through the product the way a person would,
// and every rendered component is checked against the props and values UI Kit actually accepts.
import { createRequire } from 'module';
import { createSite } from './fakesite.mjs';

const require = createRequire(import.meta.url);
const React = require('react');
const TR = require('react-test-renderer');
const { act } = TR;
const ALLOWED = require('./uikit-props.json');

let site = createSite();
globalThis.__sim = { calls: [], respond: (...a) => site.respond(...a), noUser: false };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const app = await import('./.bundle.mjs');
const { SkepticApp } = await import('./.ui-panel.mjs');
const Q = globalThis.__queue;
Q.handler = app.jobs;
const KVS = globalThis.__kvs;
const BRIDGE = globalThis.__bridge;
const ADMIN = { accountId: 'u4', moduleKey: 'skeptic-admin' };

let passed = 0;
let failed = 0;
const problems = new Set();
const section = (name) => console.log(`\n${name}`);
const check = (name, cond, detail) => {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name}${detail !== undefined ? `\n       ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 600)}` : ''}`);
  }
};

// ---- rendering helpers ------------------------------------------------------------------------
let context = {};
globalThis.__invoke = (fn, payload) => app.handler({ call: { functionKey: fn }, payload: payload || {}, context });
const tick = () => new Promise((r) => setTimeout(r, 0));
const flush = async (n = 12) => {
  for (let i = 0; i < n; i += 1) await act(async () => { await tick(); });
};
const textOf = (node) => {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  const title =
    node.props && typeof node.props.title === 'string' && node.type === 'ui-SectionMessage'
      ? node.props.title
      : node.props && node.type === 'ui-EmptyState' && typeof node.props.header === 'string'
        ? `${node.props.header} `
        : '';
  return title + (node.children || []).map(textOf).join('');
};
const all = (root, type) => (root.root || root).findAll((n) => n.type === `ui-${type}`);
const buttons = (root, label) => all(root, 'Button').filter((b) => textOf(b).includes(label));
const pageText = (r) => textOf(r.root);

// Every host node: props must be ones UI Kit accepts, and enumerated values must be valid.
function validate(root, where) {
  for (const n of root.findAll((x) => typeof x.type === 'string' && x.type.startsWith('ui-'))) {
    const name = n.type.slice(3);
    const ok = ALLOWED[name];
    if (ok) for (const p of Object.keys(n.props)) if (p !== 'children' && p !== 'key' && !ok.includes(p)) problems.add(`${where}: <${name}> has unknown prop "${p}"`);
    for (const [k, vals] of Object.entries(ALLOWED._values)) {
      const [comp, prop, sub] = k.split('.');
      if (comp !== name || n.props[prop] === undefined) continue;
      if (sub) for (const it of n.props[prop] || []) { if (!vals.includes(it[sub])) problems.add(`${where}: <${name}> ${prop}.${sub}="${it[sub]}"`); }
      else if (!vals.includes(n.props[prop])) problems.add(`${where}: <${name}> ${prop}="${n.props[prop]}"`);
    }
    if (name === 'Text') for (const c of n.children) if (typeof c === 'object' && c && ['ui-Stack', 'ui-Inline', 'ui-Box', 'ui-Text'].includes(c.type)) problems.add(`${where}: block element inside <Text>`);
    if (name === 'Button' && !textOf(n).trim()) problems.add(`${where}: a button with no label`);
    if (name === 'Link' && !n.props.href) problems.add(`${where}: a link with no href`);
    if (name === 'User' && !n.props.accountId) problems.add(`${where}: <User> with no accountId`);
    if (name === 'RadioGroup') for (const o of n.props.options || []) if (!o.label || !o.value) problems.add(`${where}: radio option missing label/value`);
    if ((name === 'Textfield' || name === 'TextArea') && !(n.props.id && root.findAll((x) => x.type === 'ui-Label' && x.props.labelFor === n.props.id).length))
      problems.add(`${where}: <${name}> without a label pointing at it`);
    if (name === 'Select' && !(n.props.inputId && root.findAll((x) => x.type === 'ui-Label' && x.props.labelFor === n.props.inputId).length))
      problems.add(`${where}: <Select> without a label pointing at it`);
    if (name === 'Label' && n.props.labelFor && !root.findAll((x) => x.props && (x.props.id === n.props.labelFor || x.props.inputId === n.props.labelFor)).length)
      problems.add(`${where}: <Label labelFor="${n.props.labelFor}"> points at nothing`);
  }
  const t = textOf(root);
  for (const bad of ['undefined', 'NaN', '[object Object]', 'null ']) if (t.includes(bad)) problems.add(`${where}: text contains "${bad}"`);
}

let current = null;
async function mount(element, ctx, where) {
  context = ctx;
  let r;
  await act(async () => { r = TR.create(element); });
  current = r;
  await flush();
  validate(r.root, where);
  return r;
}
async function click(r, btn, where) {
  await act(async () => { await btn.props.onClick(); });
  await flush();
  validate(r.root, where);
}
const typeInto = async (node, value) => {
  await act(async () => { node.props.onChange({ target: { value } }); });
  validate(current.root, 'input');
};
const pick = async (node, value) => {
  await act(async () => { node.props.onChange(value); });
  await flush(2);
  validate(current.root, 'pick');
};
const byId = (r, id) => r.root.find((n) => n.props && n.props.id === id);
const toggleOf = (r, id) => r.root.findAll((n) => n.type === 'ui-Toggle' && n.props.id === id)[0] || null;
const byIdMaybe = (r, id) => r.root.findAll((n) => n.props && n.props.id === id)[0] || null;
const panel = (kind = 'issue') => React.createElement(SkepticApp, { kind });
const ctxFor = (issue, accountId = 'u1') => ({ accountId, extension: { issue: { id: issue.id, key: issue.key } } });
const findRef = (ev, title) => {
  for (const list of ['pastPlans', 'incidents', 'openRisks', 'confluencePages'])
    for (const x of ev[list] || []) if (String(x.title).includes(title)) return x.ref;
  return null;
};
const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const CLAIM = 'In-app live chat was abandoned in April 2025 because support could not staff the chat in the evenings.';

await app.onInstalled();
await Q.drain();
const plan = site.plans.livechat;

// ------------------------------------------------------------------------------------------------
section('A. First look at a plan with no review');
{
  const r = await mount(panel(), ctxFor(plan), 'panel/empty');
  check('says it has not been reviewed, in an empty state with the next step', all(r.root, 'EmptyState').length === 1 && /No review yet|been here before/.test(pageText(r)));
  check('offers to check with the radar', buttons(r, 'Check now').length === 1);
  check('offers Review now as the primary action', buttons(r, 'Review now')[0]?.props.appearance === 'primary');
  await click(r, buttons(r, 'Check now')[0], 'panel/radar');
  check('the radar result shows in place, counts only', /Radar/.test(pageText(r)) && /high/.test(pageText(r)) && /abandoned plan/.test(pageText(r)) && !/In-app live chat/.test(pageText(r)), pageText(r).slice(0, 300));
  check('the high radar asks for a review before the plan can start', /A review is needed before this plan can start/.test(pageText(r)) && /organisation has been through something like this/.test(pageText(r)) && /the Skeptic moves it back/.test(pageText(r)));
  BRIDGE.rovo.length = 0;
  await click(r, buttons(r, 'Review now')[0], 'panel/review-now');
  check('without automation, Review now opens Rovo chat with the plan', BRIDGE.rovo.length === 1 && BRIDGE.rovo[0].prompt.includes(plan.key), BRIDGE.rovo);
  r.unmount();
}

// ------------------------------------------------------------------------------------------------
section('B. A review with several objections');
let ev;
{
  ev = await app.findEvidence({ planKey: plan.key, searchTerms: 'live chat, chat support' }, { accountId: 'u1' });
  const E = findRef(ev, 'In-app live chat');
  const P = findRef(ev, 'Why we stopped live chat');
  const D = findRef(ev, 'DEC-014');
  const I = findRef(ev, 'Evening chat queue');
  const Rk = findRef(ev, 'transcript');
  const A = [{ id: 'A1', text: 'The support team can staff the chat button', section: 1 }];
  const objs = [
    { assumption: 'A1', ref: E, claim: CLAIM, strength: 'precedent', impact: 4, likelihood: 4, reversibility: 3, mitigation: 0, talkTo: 'Ama Owusu', satisfiedBy: 'Evening support cover agreed before launch' },
    { assumption: 'A1', ref: P, claim: 'The retro found evening chats waited an average of 40 minutes because support works 8 am to 5 pm.', strength: 'related', impact: 3, likelihood: 3, reversibility: 2, mitigation: 0 },
    { assumption: 'A1', ref: D, claim: 'DEC-014 decided Kestrel will not run its own live chat because support cannot staff evenings.', strength: 'precedent', impact: 4, likelihood: 3, reversibility: 3, mitigation: 0 },
    { assumption: 'A1', ref: I, claim: 'During the April 2025 live chat trial, evening chats waited 40 minutes because nobody from support was on shift.', strength: 'precedent', impact: 3, likelihood: 4, reversibility: 2, mitigation: 0 },
    { assumption: 'A1', ref: Rk, claim: 'The legal review on how long chat transcripts may be kept was raised and never answered.', strength: 'related', impact: 2, likelihood: 3, reversibility: 2, mitigation: 0 },
  ];
  const run = { summary: 'This repeats the 2025 live chat attempt.', assumptions: A, objections: objs, questions: ['Who answers chats after 5 pm?'], revisitWhen: ['Support has evening cover'] };
  await app.saveReview({ planKey: plan.key, runsJson: JSON.stringify([run, run, run]) }, { accountId: 'u1' });
  const r = await mount(panel(), ctxFor(plan), 'panel/review');
  const cards = all(r.root, 'Lozenge').filter((l) => ['critical', 'high', 'medium', 'low'].includes(textOf(l)));
  check('verdict is shown first and bold', all(r.root, 'Lozenge')[0] && textOf(all(r.root, 'Lozenge')[0]) === 'strong objections' && all(r.root, 'Lozenge')[0].props.isBold);
  check('a plan in To Do says its blocking objections must be answered before it starts', /must be answered before it starts/.test(pageText(r)) && !/advisory while drafting/.test(pageText(r)));
  check('only the top three objections show', cards.length === 3, cards.map(textOf));
  check('a "Show 2 more" button collapses the rest', buttons(r, 'Show 2 more').length === 1);
  await click(r, buttons(r, 'Show 2 more')[0], 'panel/show-more');
  check('expanding shows all five', all(r.root, 'Lozenge').filter((l) => ['critical', 'high', 'medium', 'low'].includes(textOf(l))).length === 5);
  check('each objection says why it has its severity', /Why high: impact 4/.test(pageText(r)));
  check('each objection links its source', all(r.root, 'Link').some((l) => textOf(l).includes('In-app live chat')));
  check('"talk to" is shown', /Talk to Ama Owusu/.test(pageText(r)));
  check('questions and what would change the answer are shown', /Answer before starting/.test(pageText(r)) && /What would change the answer/.test(pageText(r)));
  check('the gate consequence is explained in plain words', /will block this plan when it moves out of To Do/.test(pageText(r)));
  check('every open objection has its own answer buttons', buttons(r, 'Other answer').length === 5 && buttons(r, 'Link evidence').length === 5);
  check('the summary line says how many, how many block, how many are open', /5 objections · \d blocks? the gate · 5 open/.test(pageText(r)), pageText(r).slice(0, 300));
  check('the main action is to answer the top objection', buttons(r, 'Answer objection 1')[0]?.props.appearance === 'primary');
  check("each objection quotes the source's own words", /The source says: “/.test(pageText(r)));
  check('no emergency override for a non-admin', buttons(r, 'Emergency override').length === 0);
  r.unmount();
}

// ------------------------------------------------------------------------------------------------
section('C. Responding: rebuttal, escalation, sign-off');
{
  let r = await mount(panel(), ctxFor(plan), 'panel/respond');
  await click(r, buttons(r, 'Other answer')[0], 'modal/open');
  const modal = () => all(r.root, 'Modal')[0];
  check('the respond dialog opens', !!modal());
  const radio = all(r.root, 'RadioGroup')[0];
  check('the dialog offers the six response types', radio.props.options.length === 6, radio.props.options.map((o) => o.label));
  check('the high objection marks which responses need sign-off', radio.props.options.filter((o) => /needs sign-off/.test(o.label)).length === 2);
  check('the dialog shows what would settle it', /What would settle it/.test(textOf(modal())));
  await pick(radio, { target: { value: 'accept-risk' } });
  await flush();
  check('choosing "accept the risk" shows a reason box and an approver picker', !!byId(r, 'reason') && all(r.root, 'UserPicker').some((u) => u.props.name === 'approver'));
  await typeInto(byId(r, 'reason'), 'accept risk');
  await click(r, buttons(r, 'Send for sign-off')[0], 'modal/rebuttal');
  check('a generic answer gets a rebuttal inside the dialog', /isn't convinced yet/.test(textOf(modal())) && /That doesn't answer/.test(textOf(modal())), textOf(modal()).slice(0, 400));
  await typeInto(byId(r, 'reason'), 'We will be careful');
  await click(r, buttons(r, 'Send for sign-off')[0], 'modal/escalate');
  check('a second weak answer escalates, shown as an error', all(r.root, 'SectionMessage').some((s) => s.props.appearance === 'error' && /second try/.test(textOf(s))));
  await typeInto(byId(r, 'reason'), 'Two evening agents start on 1 March; Kofi Mensah owns the evening rota and signed it off.');
  await click(r, buttons(r, 'Send for sign-off')[0], 'modal/no-approver');
  check('without an approver it asks for one', /named approver/.test(textOf(modal())));
  await pick(all(r.root, 'UserPicker').find((u) => u.props.name === 'approver'), { id: 'u2', name: 'Approver' });
  if (all(r.root, 'UserPicker').some((u) => u.props.name === 'assignee')) {
    await typeInto(byId(r, 'task'), 'Track evening chat wait times for the first month');
    await pick(all(r.root, 'UserPicker').find((u) => u.props.name === 'assignee'), { id: 'u7' });
    await pick(all(r.root, 'DatePicker')[0], soon);
  }
  await click(r, buttons(r, 'Send for sign-off')[0], 'modal/sent');
  check('sending closes the dialog', all(r.root, 'Modal').length === 0, textOf(r.root).slice(0, 200));
  check('the card now says it is awaiting sign-off, naming the approver', /awaiting sign-off/.test(pageText(r)) && all(r.root, 'User').some((u) => u.props.accountId === 'u2'));
  check('the author gets no Approve button', buttons(r, 'Approve').length === 0);
  r.unmount();

  site.me = 'u2';
  r = await mount(panel(), ctxFor(plan, 'u2'), 'panel/approver');
  check('the approver sees Approve and Send back', buttons(r, 'Approve').length === 1 && buttons(r, 'Send back').length === 1);
  await click(r, buttons(r, 'Approve')[0], 'panel/approved');
  check('approving confirms it and moves the card after the open ones', /Signed off/.test(pageText(r)) && KVS.get(`review:${plan.id}`).objections[0].status === 'resolved');
  await click(r, buttons(r, 'Show 2 more')[0], 'panel/more');
  check('the resolved card shows who signed it off', /Risk accepted/.test(pageText(r)) && /signed off by/.test(pageText(r)));
  site.me = 'u1';
  r.unmount();
}

// ------------------------------------------------------------------------------------------------
section('D. Proof responses, decision record');
{
  const r = await mount(panel(), ctxFor(plan), 'panel/proofs');
  const respondTo = async (index) => {
    const open = buttons(r, 'Other answer');
    await click(r, open[index], 'modal/open2');
  };
  // Mitigation task on the next open objection, straight from the card's one-click button
  await click(r, buttons(r, 'Add a mitigation task')[0], 'modal/quick-mitigation');
  check('a one-click answer opens the dialog with that answer chosen', all(r.root, 'RadioGroup')[0]?.props.value === 'mitigation' && !!byId(r, 'task'));
  await typeInto(byId(r, 'task'), 'Agree evening support cover with Support Ops');
  await pick(all(r.root, 'UserPicker').find((u) => u.props.name === 'assignee'), { id: 'u7' });
  await pick(all(r.root, 'DatePicker')[0], soon);
  await click(r, buttons(r, 'Submit')[0], 'modal/mitigation');
  check('a mitigation task is created from the dialog, and the panel confirms it', /Created KF-\d+/.test(pageText(r)), pageText(r).slice(0, 300));
  // Plan change without editing → refusal in the dialog
  await respondTo(0);
  await pick(all(r.root, 'RadioGroup')[0], { target: { value: 'plan-change' } });
  await flush();
  await click(r, buttons(r, 'Submit')[0], 'modal/plan-change');
  check('"I changed the plan" without a change is refused with a reason', /hasn't changed/.test(textOf(all(r.root, 'Modal')[0])));
  await pick(all(r.root, 'RadioGroup')[0], { target: { value: 'evidence' } });
  await flush();
  const inc = [...site.issues.values()].find((i) => i.fields.summary.startsWith('Evening chat queue'));
  await typeInto(byId(r, 'link'), inc.key);
  await typeInto(byId(r, 'why'), 'That incident is why the plan now has a 6 pm to 10 pm evening support shift from 1 March.');
  await click(r, buttons(r, 'Submit')[0], 'modal/evidence');
  check('linked evidence resolves it with a confirmation', all(r.root, 'Modal').length === 0 && /Resolved/.test(pageText(r)));
  // Resolve the rest quickly
  for (let i = 0; i < 4 && buttons(r, 'Other answer').length; i += 1) {
    await respondTo(0);
    await pick(all(r.root, 'RadioGroup')[0], { target: { value: 'evidence' } });
    await flush();
    await typeInto(byId(r, 'link'), inc.key);
    await typeInto(byId(r, 'why'), 'That incident is why the plan now has a 6 pm to 10 pm evening support shift from 1 March, owned by Kofi Mensah.');
    await click(r, buttons(r, 'Submit')[0], 'modal/evidence2');
    if (all(r.root, 'Modal').length) {
      await click(r, buttons(r, 'Cancel')[0], 'modal/cancel');
      break;
    }
  }
  check('with everything resolved, Record the decision appears', buttons(r, 'Record the decision').length === 1, KVS.get(`review:${plan.id}`).objections.map((o) => [o.severity, o.status]));
  await R('saveAdmin', { decisionSpaceKey: 'KF' }, ADMIN);
  await click(r, buttons(r, 'Record the decision')[0], 'panel/decision');
  check('the decision page is linked from the panel', /Decision recorded/.test(pageText(r)) && site.createdPages.some((p) => p.title.startsWith('Decision:')));
  check('Reopen is offered on resolved objections', buttons(r, 'Reopen').length >= 1);
  r.unmount();
}
async function R(fn, payload, ctx) {
  return app.handler({ call: { functionKey: fn }, payload: payload || {}, context: ctx });
}

// ------------------------------------------------------------------------------------------------
section('E. Background review with live progress');
{
  await R('saveAdmin', { automationReady: true }, ADMIN);
  const p2 = site.addIssue({ summary: 'Evening live chat support for customers', text: ['Open a live chat channel from 6 pm to 10 pm, answered by the support team.'] });
  const r = await mount(panel(), ctxFor(p2), 'panel/bg');
  await click(r, buttons(r, 'Review now')[0], 'panel/bg-start');
  const tracker = all(r.root, 'ProgressTracker')[0];
  check('progress is shown with stages', !!tracker && tracker.props.items.length === 6, tracker?.props.items);
  check('the agent stage shows the run count', tracker && tracker.props.items.some((i) => /Agent reviewing \(0\/3\)/.test(i.label)));
  check('Review buttons are hidden while it runs', buttons(r, 'Review').length === 0);
  check('it tells people they can keep working', /keep working/.test(pageText(r)));
  r.unmount();
}

// ------------------------------------------------------------------------------------------------
section('F. Project admin override and the Confluence byline');
{
  const p4 = site.addIssue({ summary: 'Live chat for warehouse staff', text: ['Warehouse staff chat with support about damaged parcels.'] });
  const evW = await app.findEvidence({ planKey: p4.key, searchTerms: 'live chat' }, { accountId: 'u1' });
  const E = findRef(evW, 'In-app live chat');
  await app.saveReview({ planKey: p4.key, runsJson: JSON.stringify([{ assumptions: [{ id: 'A1', text: 'Support answers warehouse chats', section: 1 }], objections: [{ assumption: 'A1', ref: E, claim: CLAIM, strength: 'precedent', impact: 4, likelihood: 4, reversibility: 3, mitigation: 0 }] }]) }, { accountId: 'u1' });
  site.me = 'u4';
  const r = await mount(panel(), ctxFor(p4, 'u4'), 'panel/admin');
  check('a project admin sees Emergency override', buttons(r, 'Emergency override').length === 1);
  await click(r, buttons(r, 'Emergency override')[0], 'override/open');
  await typeInto(byId(r, 'reason'), 'urgent');
  await click(r, buttons(r, 'Override the gate')[0], 'override/short');
  check('a vague reason is refused inside the dialog', all(r.root, 'Modal').length === 1 && /specific reason/.test(textOf(all(r.root, 'Modal')[0])));
  await typeInto(byId(r, 'reason'), 'Urgent: the warehouse needs this before the depot audit on Friday; support agreed to cover it.');
  await click(r, buttons(r, 'Override the gate')[0], 'override/ok');
  check('a real reason overrides, and the panel says so', /gate overridden/.test(pageText(r)));
  site.me = 'u1';
  r.unmount();

  const proposal = [...site.pages.values()].find((p) => p.title.startsWith('Proposal: live chat'));
  const rp = await mount(panel('page'), { accountId: 'u1', extension: { content: { id: proposal.id } } }, 'byline/empty');
  check('the Confluence byline renders without gate labels', /No review yet/.test(pageText(rp)) && /proposal/.test(pageText(rp)) && !/advisory|gate active/.test(pageText(rp)) && buttons(rp, 'Check now').length === 0);
  rp.unmount();
}

// ------------------------------------------------------------------------------------------------
section('G. No objections, empty and failing states');
{
  const honest = site.plans.honesty;
  await app.findEvidence({ planKey: honest.key }, { accountId: 'u1' });
  await app.saveReview({ planKey: honest.key, runsJson: JSON.stringify([{ assumptions: [], objections: [] }]) }, { accountId: 'u1' });
  let r = await mount(panel(), ctxFor(honest), 'panel/clean');
  check('a clean review shows a green "nothing contradicts" box', all(r.root, 'SectionMessage').some((s) => s.props.appearance === 'success' && /Nothing in your history contradicts/.test(s.props.title)));
  check('it lists the rules that were checked', /Rules:/.test(pageText(r)));
  r.unmount();

  const keep = globalThis.__invoke;
  globalThis.__invoke = async () => { throw new Error('Network is down'); };
  r = await mount(panel(), ctxFor(honest), 'panel/error');
  check('a load failure shows a readable error, not a blank panel', /could not load/.test(pageText(r)) && /Network is down/.test(pageText(r)));
  r.unmount();
  globalThis.__invoke = keep;

  site.me = 'u5';
  r = await mount(panel(), ctxFor(site.plans.livechat, 'u5'), 'panel/readonly');
  check('someone who cannot edit sees the review but no Respond buttons', buttons(r, 'Other answer').length === 0 && /strong objections|some concerns|minor points|no strong/.test(pageText(r)));
  site.me = 'u1';
  r.unmount();
}

// ------------------------------------------------------------------------------------------------
section('G2. Sidebar glance, quick draft and the guided tour');
{
  delete globalThis.__ui.element;
  await import(`./.ui-context.mjs?${Date.now()}`);
  const g = await mount(globalThis.__ui.element, ctxFor(plan), 'glance');
  const gt = pageText(g);
  check('the sidebar glance shows the status in one line', /blocking · \d+ open|open, none blocking|All objections answered|Nothing contradicts/.test(gt), gt.slice(0, 200));
  check('the glance points to the panel for details', /Skeptic panel on this work item/.test(gt));
  g.unmount();
  const unreviewed = site.addIssue({ summary: 'A plan nobody has looked at', text: ['Something new.'] });
  const gu = await mount(globalThis.__ui.element, ctxFor(unreviewed), 'glance/none');
  check('on a plan with no review, the sidebar offers Review now in one click', /Needs a review before it can start/.test(pageText(gu)) && buttons(gu, 'Review now')[0]?.props.appearance === 'primary', pageText(gu).slice(0, 200));
  gu.unmount();

  await R('saveAdmin', { automationReady: false, demoMode: true }, ADMIN);
  const fresh = site.addIssue({ summary: 'Customer live chat inside the tracking page', text: ['Customers chat with support from the tracking page, answered by the support team.'] });
  const r = await mount(panel(), ctxFor(fresh), 'panel/tour');
  check('the guided tour starts at step 1', /Guided tour, step 1 of 4/.test(pageText(r)));
  check('without automation, a quick draft from history is offered', buttons(r, 'Quick draft from history').length === 1);
  await click(r, buttons(r, 'Quick draft from history')[0], 'panel/draft');
  check('the draft appears at once, labelled as written without AI', /draft from history/.test(pageText(r)) && /without AI/.test(pageText(r)), pageText(r).slice(0, 300));
  check('the tour moves to step 2: answer the objections', /Guided tour, step 2 of 4/.test(pageText(r)));
  check('a finished draft shows no progress tracker (no agent stage for a draft no agent wrote)', all(r.root, 'ProgressTracker').length === 0);
  check('a full review in Rovo chat is offered, once', buttons(r, 'Full review in Rovo chat').length === 1 && buttons(r, 'Discuss in Rovo chat').length === 0);
  await click(r, buttons(r, 'Full review in Rovo chat')[0], 'panel/full-review');
  check('it opens Rovo chat with the Skeptic and the plan', BRIDGE.rovo.some((x) => x.agentKey === 'skeptic-agent' && x.prompt.includes(fresh.key)), BRIDGE.rovo.slice(-1));
  check('while Rovo works, the panel says what to expect, including the Confirm step', /The Skeptic is reviewing in Rovo chat/.test(pageText(r)) && /choose Confirm/.test(pageText(r)) && /updates by itself/.test(pageText(r)));
  // The sidebar section, with only a draft: one click to the full review, no apps menu needed.
  delete globalThis.__ui.element;
  await import(`./.ui-context.mjs?${Date.now()}`);
  const gd = await mount(globalThis.__ui.element, ctxFor(fresh), 'glance/draft');
  check('the sidebar says a draft is not enough to start', /Needs a full review before it can start/.test(pageText(gd)), pageText(gd).slice(0, 300));
  BRIDGE.rovo.length = 0;
  await click(gd, buttons(gd, 'Full review in Rovo chat')[0], 'glance/full-review');
  check('...and its button opens Rovo chat for the full review', BRIDGE.rovo.length === 1 && BRIDGE.rovo[0].prompt.includes(fresh.key) && /Reviewing in Rovo chat/.test(pageText(gd)));
  // The full review lands (as the agent would save it):
  const key = `review:${fresh.id}`;
  KVS.set(key, { ...KVS.get(key), draft: false, channel: 'chat', createdAt: new Date(Date.now() + 1000).toISOString() });
  await new Promise((done) => setTimeout(done, 4300));
  await flush(30);
  check('the panel picks up the full review by itself, no reload', !/The Skeptic is reviewing in Rovo chat/.test(pageText(r)) && /The full review is in/.test(pageText(r)) && !/head start, not a review/.test(pageText(r)), pageText(r).slice(0, 300));
  check('so does the sidebar', !/Reviewing in Rovo chat/.test(pageText(gd)) && !/Needs a full review/.test(pageText(gd)), pageText(gd).slice(0, 300));
  gd.unmount();
  r.unmount();
  await R('saveAdmin', { demoMode: false }, ADMIN);
}

// ------------------------------------------------------------------------------------------------
section('G3. Another viewer, an item they cannot see');
{
  const hiddenItem = [...site.issues.values()].find((i) => i.fields.summary === 'In-app live chat for customers');
  hiddenItem.hiddenFrom = ['u2'];
  site.me = 'u2';
  const r = await mount(panel(), ctxFor(plan, 'u2'), 'panel/redacted');
  const t = pageText(r);
  check("the objection citing it is shown redacted, with no link", /cites an item you can't see/.test(t) && !all(r.root, 'Link').some((l) => /In-app live chat/.test(textOf(l))), t.slice(0, 400));
  check('its severity is still shown', all(r.root, 'Lozenge').some((l) => ['critical', 'high', 'medium', 'low'].includes(textOf(l))));
  r.unmount();
  site.me = 'u1';
  delete hiddenItem.hiddenFrom;
}

// ------------------------------------------------------------------------------------------------
section('H. Dashboard');
{
  delete globalThis.__ui.element;
  await import(`./.ui-dashboard.mjs?${Date.now()}`);
  const r = await mount(globalThis.__ui.element, { accountId: 'u1' }, 'dashboard');
  const t = pageText(r);
  check('the three numbers lead the page', /A full review is ready in/.test(t) && /Authors spend/.test(t) && /Right on the test set/.test(t));
  check('author time has a real value', !/Authors spend—/.test(t));
  check('the risk ledger is a table with the signer', all(r.root, 'DynamicTable').length >= 1 && /Risk ledger/.test(t));
  check('overrides to review are listed', /Overrides to review/.test(t) && buttons(r, 'Mark reviewed').length === 1);
  check('recent reviews table is shown', /Recent reviews/.test(t));
  check('the logo leads the dashboard, with the name in the brand font', all(r.root, 'Image').length === 1 && all(r.root, 'Image')[0].props.alt === 'The Skeptic' && /^data:image\/png/.test(all(r.root, 'Image')[0].props.src));
  check('a heading per section, no duplicate page title', all(r.root, 'Heading').filter((h) => textOf(h) === 'The Skeptic').length === 0);
  check('a weekly chart of reviews, objections and answers', all(r.root, 'LineChart').length === 1 && all(r.root, 'LineChart')[0].props.data.some((d) => d.series === 'Answered'));
  check('the history that keeps coming up is shown', /History that keeps coming up/.test(t) && /cited on \d+ plans/.test(t), t.slice(t.indexOf('History that'), t.indexOf('History that') + 200));
  check('recent reviews say how each was made', /background|chat|draft \(no AI\)/.test(t));
  check('a summary band leads the page with the index and background-review status', /Here's how your plans are doing/.test(t) && /The Skeptic has looked at \d+ plans?/.test(t) && /past items|still reading history/.test(t) && /reviews (run on their own|on request)/.test(t));
  check('sections with nothing in them are not drawn; one line says what is empty', !/No approvals pending/.test(t) && /Nothing waiting for: [a-z -]+(, [a-z -]+)*\./.test(t) && !/matchs/.test(t), t.match(/Nothing waiting[^.]*\./)?.[0]);
  check('section counts are badges', all(r.root, 'Badge').length >= 2);
  r.unmount();
}

// ------------------------------------------------------------------------------------------------
section('I. Admin page');
{
  delete globalThis.__ui.element;
  await import(`./.ui-admin.mjs?${Date.now()}`);
  const r = await mount(globalThis.__ui.element, ADMIN, 'admin');
  const t = pageText(r);
  check('the logo leads the settings page', all(r.root, 'Image').length === 1 && all(r.root, 'Image')[0].props.alt === 'The Skeptic');
  check('the site line shows what was detected', /plans are Epic/.test(t) && /incidents are Bug/.test(t) && /Confluence available/.test(t));
  check('seven tabs, including Health and Demo data', all(r.root, 'Tab').length === 7 && textOf(all(r.root, 'Tab')[5]) === 'Health' && textOf(all(r.root, 'Tab')[6]) === 'Demo data', all(r.root, 'Tab').map(textOf));
  const demoOptions = all(r.root, 'Select').find((x) => x.props.inputId === 'demoCompany')?.props.options || [];
  check('the demo data tab offers all five companies', buttons(r, 'Load Kestrel Freight').length === 1 && demoOptions.map((o) => o.value).join() === 'kestrel,pinecrest,harbourvine,brightwell,sunfield', demoOptions);
  check('the Kestrel keys are filled in and named on the button', byIdMaybe(r, 'demoProject')?.props.value === 'KF' && byIdMaybe(r, 'demoSpace')?.props.value === 'KF' && buttons(r, 'Load Kestrel Freight into KF').length === 1);
  await typeInto(r.root.findAll((n) => n.props && n.props.id === 'demoProject').at(-1), 'KF');
  await pick(all(r.root, 'Select').find((x) => x.props.inputId === 'demoCompany'), { value: 'pinecrest', label: 'Pinecrest Apps' });
  check('Pinecrest Apps needs no Confluence space', buttons(r, 'Load Pinecrest Apps').length === 1 && !byIdMaybe(r, 'demoSpace'));
  check('switching company replaces the key typed for the last one', byIdMaybe(r, 'demoProject')?.props.value === 'PA' && buttons(r, 'Load Pinecrest Apps into PA').length === 1, byIdMaybe(r, 'demoProject')?.props.value);
  await pick(all(r.root, 'Select').find((x) => x.props.inputId === 'demoCompany'), { value: 'harbourvine', label: 'Harbour & Vine' });
  check('Harbour & Vine asks for a Confluence space and fills in the HV keys', buttons(r, 'Load Harbour & Vine').length === 1 && byIdMaybe(r, 'demoSpace') && byIdMaybe(r, 'demoProject')?.props.value === 'HV' && byIdMaybe(r, 'demoSpace')?.props.value === 'HV');
  await pick(all(r.root, 'Select').find((x) => x.props.inputId === 'demoCompany'), { value: 'sunfield', label: 'Sunfield Energy' });
  check('Sunfield Energy needs no Confluence space', buttons(r, 'Load Sunfield Energy').length === 1 && !byIdMaybe(r, 'demoSpace'));
  await pick(all(r.root, 'Select').find((x) => x.props.inputId === 'demoCompany'), { value: 'kestrel', label: 'Kestrel Freight' });
  check('a setup checklist shows what is done and what is next', /Setup/.test(t) && /History index built/.test(t) && /of 5 done/.test(t));
  check('background reviews are one switch, on by default, with the automation rule steps folded away', toggleOf(r, 'auto')?.props.isChecked === true && all(r.root, 'CodeBlock').length === 0 && buttons(r, 'Show the steps').length === 1 && /no AI, no cost, nothing to set up/.test(t), { auto: toggleOf(r, 'auto')?.props.isChecked, blocks: all(r.root, 'CodeBlock').length, ready: KVS.get('config:settings')?.automationReady, text: /nothing to set up/.test(t) });
  check('the checklist counts background reviews as done with no setup', /Background reviews/.test(t) && /flagged plans get a cited draft straight away/.test(t));
  await toggleOf(r, 'auto').props.onChange();
  await flush(30);
  check('the switch saves at once: off', KVS.get('config:settings').autoReview === false && /Background reviews are off/.test(pageText(r)));
  await toggleOf(r, 'auto').props.onChange();
  await flush(30);
  check('...and back on', KVS.get('config:settings').autoReview === true && /Background reviews are on/.test(pageText(r)), { auto: KVS.get('config:settings').autoReview, msg: pageText(r).match(/Background reviews are \w+/g) });
  await click(r, buttons(r, 'Show the steps')[0], 'admin/show-rule');
  await flush(30);
  check('fast setup (the default) needs one prompt and one URL', all(r.root, 'CodeBlock').length === 2 && /all lenses/.test(all(r.root, 'CodeBlock')[0].props.text), all(r.root, 'CodeBlock').map((c) => c.props.text));
  check('the web request puts the plan and run in the URL and sends the agent reply as the body', /\?issueKey=\{\{issue\.key\}\}&run=all$/.test(all(r.root, 'CodeBlock')[1].props.text) && /custom body \{\{agentResponse\}\}/.test(pageText(r)));
  await pick(all(r.root, 'Select').find((x) => x.props.inputId === 'mode'), { value: 'thorough', label: 'Thorough' });
  await flush(30);
  check('thorough setup shows three prompts and three URLs', all(r.root, 'CodeBlock').length === 6, all(r.root, 'CodeBlock').length);
  await pick(all(r.root, 'Select').find((x) => x.props.inputId === 'mode'), { value: 'fast', label: 'Fast (recommended)' });
  await flush(30);
  check('the secret is hidden until asked', !t.includes((await R('getAdmin', {}, ADMIN)).secret));
  const freeze = byId(r, 'freeze');
  await typeInto(freeze, 'Peak season: 2026-12-01 to 2027-01-10');
  await click(r, buttons(r, 'Save settings')[0], 'admin/save');
  check('saving shows a confirmation and stores the freeze window', /Settings saved/.test(pageText(r)) && KVS.get('config:settings').freezeWindows.length === 1);
  await click(r, buttons(r, 'Rebuild the index')[0], 'admin/rebuild');
  check('rebuild confirms it runs in the background', /Rebuilding the index/.test(pageText(r)));
  r.unmount();
}

// ------------------------------------------------------------------------------------------------
section('J. UI Kit conformance across every screen rendered above');
check('every component prop and value is one UI Kit accepts, and every input has a label', problems.size === 0, [...problems]);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
