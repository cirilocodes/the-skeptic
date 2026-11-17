// Demo companies, loaded from the settings page so anyone who installs the app (judges included) can try
// it without scripts or API tokens. Five fictional companies, each with years of history (over 100 work
// items: epics with their tasks, incidents, risks) and differently shaped:
//   Kestrel Freight      logistics, Epics, Bugs as incidents, Confluence retros and decision records
//   Pinecrest Apps       software, Initiatives, an Incident type, no Confluence
//   Harbour & Vine       restaurants, Epics, Bugs, Confluence
//   Brightwell Learning  online courses, Epics, Bugs, Confluence
//   Sunfield Energy      pay-as-you-go solar, Initiatives, an Incident type, no Confluence
// Each company has three demo plans for judges: one that several history items argue against, one that a
// single item argues against, and one nothing should object to.
// Loading runs in the background (queue jobs, as the app): create the work items in bulk (epics first, then
// their tasks under them), move history to Done or In Progress and add its comments, create the pages,
// index everything, then run the radar on the demo plans once the history is in. Safe to run again: items
// already there (same title) are skipped.
import { route } from '@forge/api';
import { kvs } from '@forge/kvs';
import { appClient, json, JSON_HEADERS } from '../http';
import { paragraphsToAdf } from '../text';
import * as kestrel from './kestrel';
import * as pinecrest from './pinecrest';
import * as harbourvine from './harbourvine';
import * as brightwell from './brightwell';
import * as sunfield from './sunfield';

export const DEMOS = { kestrel, pinecrest, harbourvine, brightwell, sunfield };
export const DEMO_LABEL = 'skeptic-demo';
const statusKey = (id) => `demo:status:${id}`;

export const getDemoStatus = async () => {
  const ids = Object.keys(DEMOS);
  const all = await Promise.all(ids.map((id) => kvs.get(statusKey(id))));
  return Object.fromEntries(ids.map((id, i) => [id, all[i] || null]));
};
export const setDemoStatus = async (id, patch) => {
  const prev = (await kvs.get(statusKey(id))) || {};
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  await kvs.set(statusKey(id), next);
  return next;
};

// Which issue types to use in the chosen project, whatever the project calls them.
export function pickTypes(types, company) {
  const usable = (types || []).filter((t) => !t.subtask);
  const by = (name) => usable.find((t) => t.name.toLowerCase() === name.toLowerCase());
  const plan = by(company.planType) || usable.find((t) => t.hierarchyLevel === 1) || by('Epic') || usable[0];
  const incident = by(company.incidentType) || by('Bug') || by('Incident') || null;
  const task = by('Task') || usable.find((t) => t !== plan && t.hierarchyLevel === 0) || plan;
  return { plan, incident, task };
}

// Everything the company's history and demo plans need, as create requests.
export function demoItems(data, types) {
  const items = [];
  for (const e of data.epics) {
    const outcomeLabel = e.outcome === 'shipped' ? ['shipped'] : e.outcome === 'abandoned' ? ['abandoned'] : [];
    items.push({
      summary: e.summary,
      text: e.text,
      type: types.plan,
      labels: [DEMO_LABEL, 'skeptic-ignore', ...outcomeLabel],
      to: e.outcome === 'shipped' || e.outcome === 'abandoned' ? 'done' : e.outcome === 'in-progress' ? 'indeterminate' : null,
      comment: e.comment ? `${e.commentBy ? `${e.commentBy}: ` : ''}${e.comment}` : null,
    });
    // The epic's tasks: finished with it (shipped or abandoned), part done while it is in progress.
    (e.tasks || []).forEach((t, n) =>
      items.push({
        summary: t,
        text: [`Part of "${e.summary}".`],
        type: types.task,
        labels: [DEMO_LABEL, 'skeptic-ignore'],
        to: e.outcome === 'shipped' || e.outcome === 'abandoned' ? 'done' : e.outcome === 'in-progress' ? (n === 0 ? 'done' : 'indeterminate') : null,
        parent: e.summary,
      }),
    );
  }
  for (const x of data.incidents)
    items.push({ summary: x.summary, text: x.text, type: types.incident || types.task, labels: [DEMO_LABEL, 'skeptic-ignore', ...(types.incident ? [] : ['incident'])], to: 'done' });
  for (const r of data.risks) items.push({ summary: r.summary, text: r.text, type: types.task, labels: [DEMO_LABEL, 'risk', 'skeptic-ignore'], to: null });
  for (const p of data.plans) items.push({ summary: p.summary, text: p.text, type: types.plan, labels: [DEMO_LABEL, 'plan'], dueDate: p.dueDate || null, plan: p.key, to: null });
  return items;
}

async function existingDemoItems(c, projectKey) {
  const out = new Map();
  let token;
  for (let i = 0; i < 20; i += 1) {
    const data = await json(
      await c.jira(route`/rest/api/3/search/jql`, {
        method: 'POST',
        headers: JSON_HEADERS,
        // kf-seed: items created by the seed script, so loading after seeding creates nothing twice.
        body: JSON.stringify({ jql: `project = "${projectKey}" AND labels in (${DEMO_LABEL}, kf-seed)`, fields: ['summary'], maxResults: 100, ...(token ? { nextPageToken: token } : {}) }),
      }),
      'existing demo items',
    );
    for (const x of data.issues || []) out.set(x.fields.summary, { id: String(x.id), key: x.key });
    token = data.nextPageToken;
    if (!token) break;
  }
  return out;
}

// Which demo company a project already holds, judged by the titles of its demo items (null when it holds
// none). Used to stop one company being loaded into another company's project by mistake.
const titlesOf = (d) => new Set([...d.epics.map((e) => e.summary), ...d.epics.flatMap((e) => e.tasks || []), ...d.incidents.map((x) => x.summary), ...d.risks.map((x) => x.summary), ...d.plans.map((x) => x.summary)]);
export async function demoOwnerOf(c, projectKey) {
  const have = [...(await existingDemoItems(c, projectKey)).keys()];
  let best = null;
  let most = 0;
  for (const [id, d] of Object.entries(DEMOS)) {
    const titles = titlesOf(d);
    const n = have.filter((t) => titles.has(t)).length;
    if (n > most) [best, most] = [id, n];
  }
  return best;
}

// Create work items in bulk, 50 at a time, recording each new key. A task whose parent link is refused
// (some project types do not allow it) is created again without the link, so loading never stops on it.
async function createItems(c, projectKey, list, known) {
  let unassigned = true;
  const fieldsFor = (x, withParent) => ({
    project: { key: projectKey },
    summary: x.summary,
    description: paragraphsToAdf(x.text),
    issuetype: { id: x.type.id },
    labels: x.labels,
    ...(x.dueDate ? { duedate: x.dueDate } : {}),
    ...(withParent && x.parent && known.get(x.parent)?.key ? { parent: { key: known.get(x.parent).key } } : {}),
    // Unassigned, so a project whose default assignee is its lead does not pile 100 items on one person.
    ...(unassigned ? { assignee: null } : {}),
  });
  const send = async (chunk, withParent) => {
    const raw = await c.jira(route`/rest/api/3/issue/bulk`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ issueUpdates: chunk.map((x) => ({ fields: fieldsFor(x, withParent) })) }) });
    let res;
    if (raw?.status === 400) {
      // Every item failed; Jira lists why. A site that does not allow unassigned work gets the chunk again
      // with its default assignee, and a chunk of tasks (a parent problem) is retried without the link by
      // the caller. Anything else fails loudly.
      const text = await raw.text().catch(() => '');
      const body = (() => { try { return JSON.parse(text); } catch { return {}; } })();
      if (unassigned && /assignee/i.test(text)) {
        unassigned = false;
        return send(chunk, withParent);
      }
      if (!(withParent && chunk.every((x) => x.parent))) {
        const err = new Error('create demo items failed (400)');
        err.status = 400;
        err.detail = text.slice(0, 500);
        throw err;
      }
      res = (body.errors || []).length ? body : { errors: chunk.map((_, j) => ({ failedElementNumber: j })) };
    } else res = await json(raw, 'create demo items');
    const failed = new Set((res.errors || []).map((e) => e.failedElementNumber));
    const created = chunk.filter((_, j) => !failed.has(j));
    (res.issues || []).forEach((r, j) => created[j] && known.set(created[j].summary, { id: String(r.id), key: r.key, fresh: true }));
    return chunk.filter((_, j) => failed.has(j));
  };
  for (let i = 0; i < list.length; i += 50) {
    const refused = await send(list.slice(i, i + 50), true);
    if (refused.some((x) => x.parent)) await send(refused.filter((x) => x.parent), false);
  }
}

// Job 1: create what is missing, then queue the follow-ups.
export async function demoLoad(job, { enqueue, enqueueMany }) {
  const data = DEMOS[job.company];
  if (!data) return null;
  const c = appClient();
  await setDemoStatus(job.company, { state: 'running', step: 'Creating work items' });
  const meta = await json(await c.jira(route`/rest/api/3/issue/createmeta/${job.projectKey}/issuetypes`), 'project issue types');
  const types = pickTypes(meta.issueTypes || meta.values || [], data.company);
  if (!types.plan) throw new Error(`Project ${job.projectKey} has no issue types the demo can use.`);
  const known = await existingDemoItems(c, job.projectKey);
  const items = demoItems(data, types);
  const missing = items.filter((x) => !known.has(x.summary));
  // Epics and everything else first, then the tasks, which need their epic's key as parent.
  await createItems(c, job.projectKey, missing.filter((x) => !x.parent), known);
  await createItems(c, job.projectKey, missing.filter((x) => x.parent), known);
  // Follow-ups for the new items: status, comment and indexing.
  const follow = items
    .filter((x) => known.get(x.summary)?.fresh)
    .map((x) => ({ type: 'demo-finish', company: job.company, id: known.get(x.summary).id, to: x.to, comment: x.comment }));
  await enqueueMany(follow);

  // Pages.
  let pages = 0;
  if (data.pages.length && job.spaceKey) {
    await setDemoStatus(job.company, { step: 'Creating Confluence pages' });
    const space = (await json(await c.confluence(route`/wiki/api/v2/spaces?keys=${job.spaceKey}`), 'demo space')).results?.[0];
    if (space)
      for (const p of data.pages) {
        const found = await json(await c.confluence(route`/wiki/api/v2/pages?space-id=${space.id}&title=${p.title}&status=current`), 'existing page');
        if (found.results?.length) continue;
        const made = await json(
          await c.confluence(route`/wiki/api/v2/pages`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ spaceId: space.id, status: 'current', title: p.title, body: { representation: 'storage', value: p.html } }) }),
          'create demo page',
        );
        pages += 1;
        await enqueue({ type: 'index-page', id: String(made.id) });
      }
  }

  // The radar on the demo plans, once the history is indexed.
  const plans = Object.fromEntries(data.plans.map((p) => [p.key, known.get(p.summary)]).filter(([, v]) => v));
  for (const p of Object.values(plans)) await enqueue({ type: 'prep', id: p.id, reason: 'demo', force: true, requestedAt: new Date().toISOString() }, 300);
  return setDemoStatus(job.company, {
    state: 'done',
    step: 'Done',
    created: missing.length,
    existing: items.length - missing.length,
    pages,
    plans: Object.fromEntries(Object.entries(plans).map(([k, v]) => [k, v.key])),
    finishedAt: new Date().toISOString(),
  });
}

// Job 2, one per new item: move it to its status, add its comment, index it.
export async function demoFinish(job, { enqueue }) {
  const c = appClient();
  if (job.to) {
    const t = await json(await c.jira(route`/rest/api/3/issue/${job.id}/transitions`), 'transitions');
    const pick = (t.transitions || []).find((x) => x.to?.statusCategory?.key === job.to);
    if (pick)
      await c.jira(route`/rest/api/3/issue/${job.id}/transitions`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ transition: { id: pick.id } }) });
  }
  if (job.comment) await c.jira(route`/rest/api/3/issue/${job.id}/comment`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ body: paragraphsToAdf([job.comment]) }) });
  // The app's own edits don't fire update events (ignoreSelf), so index explicitly.
  await enqueue({ type: 'index-issue', id: job.id });
  return { id: job.id };
}
