// Background work on a Forge queue (async events), so product events return fast and long jobs
// (backfilling the index, preparing reviews) run with a long timeout and never block anyone.
//
// Job types:
//   backfill     page through Jira or Confluence history and index it (one page of results per job)
//   index-issue  (re)index one work item;  index-page  (re)index one page;  unindex  remove a document
//   prep         background pre-review of a plan: radar + rules; asks for a full review only when the
//                radar found evidence-backed concerns (cheap checks first, expensive passes only when needed)
//   incident     compare a new incident with accepted risks in the ledger
//   finalize     close a background review that is still waiting for automation runs
import { Queue } from '@forge/events';
import { route } from '@forge/api';
import { kvs } from '@forge/kvs';
import { appClient, json, JSON_HEADERS } from './http';
import { categoryOf, clearIndexChunk, docIdsPage, getMeta, INDEX_VERSION, indexDocs, issueDoc, pageDoc, unindex, updateMeta } from './hindex';
import { evalPlans } from './evalset';
import { demoFinish, demoLoad, setDemoStatus } from './demo/loader';
import { evalRow, scoreRows } from './evaluation';
import { getSiteUrl, resolveTarget } from './targets';
import { fetchIssues } from './evidence';
import { findMatches, listLedger, recordMatch } from './ledger';
import { postIssueComment } from './notify';
import { getProfile, inScope, scopeFor } from './profile';
import { runRadar } from './radar';
import { buildPack, saveDraft, setReviewLabel } from './review';
import { getSettings } from './settings';
import { getReview, setProgress } from './store';
import { adfToText } from './text';
import { finalizeStoredRuns } from './automation';

export const QUEUE_KEY = 'skeptic-jobs';
const queue = new Queue({ key: QUEUE_KEY });

const INDEX_FIELDS = ['summary', 'description', 'labels', 'status', 'issuetype', 'project', 'updated', 'created', 'resolution', 'resolutiondate', 'assignee', 'comment'];
const PAGE_LIMIT = 3000;
export const FINALIZE_AFTER_S = 15 * 60;

export async function enqueue(body, delayInSeconds) {
  try {
    await queue.push(delayInSeconds ? { body, delayInSeconds } : { body });
    return true;
  } catch (e) {
    console.warn('queue push failed', body?.type, e.message);
    return false;
  }
}

// Many jobs at once, in batches of 50 (the platform's limit per push).
export async function enqueueMany(bodies) {
  let ok = 0;
  for (let i = 0; i < bodies.length; i += 50) {
    try {
      await queue.push(bodies.slice(i, i + 50).map((body) => ({ body })));
      ok += Math.min(50, bodies.length - i);
    } catch (e) {
      console.warn('queue push failed', e.message);
    }
  }
  return ok;
}

// Rebuild the index from scratch: clear old entries (in chunks, through the queue), then backfill.
export async function startBackfill({ reset = false } = {}) {
  await getProfile({ refresh: true });
  if (reset) {
    await updateMeta({ state: 'building', version: INDEX_VERSION, docs: 0, startedAt: new Date().toISOString(), jira: { indexed: 0, done: false }, confluence: { indexed: 0, done: false } });
    await enqueue({ type: 'clear-index' });
    return;
  }
  await enqueue({ type: 'backfill', source: 'jira', count: 0 });
  await enqueue({ type: 'backfill', source: 'confluence', count: 0 });
}

// Called when the settings page or a panel opens: start the index if it was never built (an upgrade from a
// version without one), is from an older version, or a build stalled for half an hour with nothing indexed.
export async function ensureIndexStarted(meta) {
  const m = meta || (await getMeta());
  const stalled = m.state === 'building' && !(m.docs > 0) && m.startedAt && Date.now() - Date.parse(m.startedAt) > 30 * 60 * 1000;
  if (m.state === 'empty' || stalled || (m.version !== INDEX_VERSION && m.state !== 'building')) {
    await startBackfill({ reset: true });
    return true;
  }
  return false;
}

// After an upgrade that changed tokenising, the first job notices and rebuilds the index once.
export async function ensureIndexVersion() {
  const meta = await getMeta();
  if (meta.version !== INDEX_VERSION && meta.state !== 'building') {
    await startBackfill({ reset: true });
    return true;
  }
  return false;
}

async function backfillJira(job, settings, scope) {
  const jql = `${scope.projectClause ? `${scope.projectClause} AND ` : ''}updated >= -1095d ORDER BY updated DESC`;
  const data = await json(
    await appClient().jira(route`/rest/api/3/search/jql`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ jql, fields: INDEX_FIELDS, maxResults: 50, ...(job.token ? { nextPageToken: job.token } : {}) }),
    }),
    'backfill search',
  );
  // Evaluation plans are test data, not history: never index them.
  const docs = (data.issues || []).filter((i) => !isEvalPlan(i)).map((i) => issueDoc(i, scope, settings));
  await indexDocs(docs);
  const count = (job.count || 0) + docs.length;
  if (data.nextPageToken && count < settings.indexLimit && docs.length) {
    await updateMeta({ jira: { indexed: count, done: false } });
    await enqueue({ type: 'backfill', source: 'jira', token: data.nextPageToken, count });
  } else await updateMeta({ jira: { indexed: count, done: true }, finishedAt: new Date().toISOString() });
}

async function backfillConfluence(job, scope) {
  if (!scope.confluence) {
    await updateMeta({ confluence: { indexed: 0, done: true, unavailable: true }, confluenceUnavailable: true });
    return;
  }
  const data = await json(
    await appClient().confluence(
      job.cursor ? route`/wiki/api/v2/pages?body-format=storage&limit=50&cursor=${job.cursor}` : route`/wiki/api/v2/pages?body-format=storage&limit=50`,
    ),
    'backfill pages',
  );
  const docs = (data.results || []).map(pageDoc);
  await indexDocs(docs);
  const count = (job.count || 0) + docs.length;
  const next = String(data._links?.next || '').match(/[?&]cursor=([^&]+)/);
  if (next && count < PAGE_LIMIT && docs.length) {
    await updateMeta({ confluence: { indexed: count, done: false } });
    await enqueue({ type: 'backfill', source: 'confluence', cursor: decodeURIComponent(next[1]), count });
  } else await updateMeta({ confluence: { indexed: count, done: true }, finishedAt: new Date().toISOString() });
}

async function readIssue(id) {
  const res = await appClient().jira(route`/rest/api/3/issue/${id}?fields=${INDEX_FIELDS.join(',')}`);
  if (res.status === 404) return null;
  return json(res, 'index issue');
}

async function prep(job, settings, profile) {
  const result = await runRadar(job.id, settings, { profile, force: !!job.force });
  if (!result) return null;
  const { record, target, scope } = result;
  // Evaluation plans never start background (AI) reviews: 40 at once would spend the site's automation runs.
  const evalPlan = (target.labels || []).includes(EVAL_LABEL);
  const wantsReview = !evalPlan && settings.autoReview && settings.automationReady && inScope(target, scope) && record.level !== 'low' && !record.reviewed;
  if (wantsReview) {
    await setProgress(String(target.id), 'queued', { source: 'background', requestedAt: job.requestedAt || new Date().toISOString() });
    await setProgress(String(target.id), 'agent', { waitingFor: 'automation', runs: 0, expected: settings.automationRuns });
    await setReviewLabel(target.id, true);
    await enqueue({ type: 'finalize', tk: String(target.id) }, FINALIZE_AFTER_S);
  }
  return { level: record.level, requested: wantsReview };
}

async function incident(job, settings, profile) {
  const issue = await readIssue(job.id);
  if (!issue) return null;
  const scope = scopeFor(settings, profile);
  if (categoryOf(issue.fields, scope) !== 'incident') return null;
  const ledger = await listLedger();
  if (!ledger.length) return null;
  const doc = { id: String(issue.id), key: issue.key, title: issue.fields.summary, text: adfToText(issue.fields.description), projectKey: issue.fields.project?.key };
  const matches = findMatches(doc, ledger);
  const recorded = [];
  for (const m of matches) {
    const rec = await recordMatch(doc, m);
    if (!rec) continue;
    recorded.push(rec);
    // Keys only: each side may not be able to see the other.
    if (m.risk.targetType !== 'page')
      await postIssueComment(m.risk.planId, [
        [{ text: 'Skeptic: ', bold: true }, `new incident ${issue.key} may match a risk this plan accepted. Confirm or reject the match on the Skeptic dashboard.`],
      ]);
    await postIssueComment(issue.id, [[{ text: 'Skeptic: ', bold: true }, 'this incident may match a risk a team accepted earlier. Someone who can see that plan will confirm it on the Skeptic dashboard.']]);
  }
  return { matches: recorded.length };
}

// ---------------------------------------------------------------------------
// Nightly reconciliation: check 50 indexed items a night still exist; remove the ones that are gone
// (deleted without an event reaching us, or moved out of reach). Resumes where it stopped.
// ---------------------------------------------------------------------------
async function reconcile(job) {
  const meta = await getMeta();
  if (meta.state !== 'ready') return { skipped: 'index not ready' };
  const { ids, next } = await docIdsPage(job.cursor || meta.reconcileCursor || null, 50);
  const issueIds = ids.filter((d) => d.startsWith('i')).map((d) => d.slice(1));
  const pageIds = ids.filter((d) => d.startsWith('p')).map((d) => d.slice(1));
  const gone = [];
  if (issueIds.length) {
    const found = await fetchIssues(appClient(), issueIds, ['labels']);
    const alive = new Set(found.filter((i) => !isEvalPlan(i)).map((i) => String(i.id)));
    for (const id of issueIds) if (!alive.has(id)) gone.push(`i${id}`);
  }
  if (pageIds.length && !meta.confluenceUnavailable) {
    for (const id of pageIds) {
      const res = await appClient().confluence(route`/wiki/api/v2/pages/${id}`);
      if (res.status === 404) gone.push(`p${id}`);
    }
  }
  for (const d of gone) await unindex(d);
  await updateMeta({ reconcileCursor: next, reconciledAt: new Date().toISOString(), lastReconcileRemoved: gone.length });
  return { checked: ids.length, removed: gone.length };
}

// ---------------------------------------------------------------------------
// The in-app evaluation: draft a review of each labelled plan, then score the set.
// ---------------------------------------------------------------------------
export const EVAL_LABEL = 'skeptic-eval';
export const isEvalPlan = (issue) => (issue?.fields?.labels || []).includes(EVAL_LABEL);

async function evalRun(job, settings, scope) {
  const app = appClient();
  const siteUrl = await getSiteUrl(app);
  const target = await resolveTarget(app, { planKey: job.key, siteUrl });
  const reader = { c: app, mode: 'app-filtered', accountId: job.accountId };
  const existing = await getReview(String(target.id));
  // A full review (from automation or chat) is better evidence than a draft: keep it.
  if (!existing || existing.planHash !== target.hash || existing.draft) {
    const { pack } = await buildPack({ reader, target, settings, scope, siteUrl, reuse: false });
    await saveDraft({ target, pack, requestedBy: job.accountId, settings, silent: true });
  }
  await kvs.set(`eval:done:${job.key}`, 1, { ttl: { value: 1, unit: 'DAYS' } });
  return { key: job.key };
}

async function evalScore(job) {
  const status = (await kvs.get('eval:status')) || {};
  const rows = [];
  let pending = 0;
  for (const p of evalPlans) {
    const ref = status.plans?.[p.id];
    const review = ref ? await getReview(String(ref.id)) : null;
    if (!review) pending += 1;
    rows.push(evalRow(p, review));
  }
  if (pending && (job.attempt || 0) < 6) {
    await kvs.set('eval:status', { ...status, done: evalPlans.length - pending });
    return enqueue({ type: 'eval-score', attempt: (job.attempt || 0) + 1 }, 60);
  }
  const score = scoreRows(rows);
  const channels = new Set(rows.map((r) => r.channel).filter(Boolean));
  const result = {
    ...score,
    runAt: new Date().toISOString(),
    label: channels.size === 1 && channels.has('draft') ? 'labelled set, drafts without AI' : 'labelled set, full reviews and drafts',
    rows,
  };
  await kvs.set('eval:last', result);
  await kvs.set('eval:status', { ...status, state: 'done', done: evalPlans.length - pending, finishedAt: result.runAt });
  return result;
}

export async function runJob(body) {
  const settings = await getSettings();
  const profile = await getProfile();
  const scope = scopeFor(settings, profile);
  if (!['backfill', 'clear-index'].includes(body?.type)) await ensureIndexVersion();
  switch (body?.type) {
    case 'clear-index':
      if (await clearIndexChunk()) return enqueue({ type: 'clear-index' });
      await updateMeta({ docs: 0 });
      await enqueue({ type: 'backfill', source: 'jira', count: 0 });
      return enqueue({ type: 'backfill', source: 'confluence', count: 0 });
    case 'backfill':
      return body.source === 'confluence' ? backfillConfluence(body, scope) : backfillJira(body, settings, scope);
    case 'index-issue': {
      const issue = await readIssue(body.id);
      if (!issue || isEvalPlan(issue)) return unindex(`i${body.id}`);
      return indexDocs([issueDoc(issue, scope, settings)]);
    }
    case 'index-page': {
      const res = await appClient().confluence(route`/wiki/api/v2/pages/${body.id}?body-format=storage`);
      if (res.status === 404 || res.status === 403) return unindex(`p${body.id}`);
      return indexDocs([pageDoc(await json(res, 'index page'))]);
    }
    case 'unindex':
      return unindex(body.docId);
    case 'prep':
      return prep(body, settings, profile);
    case 'incident':
      return incident(body, settings, profile);
    case 'finalize':
      return finalizeStoredRuns(body.tk, settings, { timedOut: true });
    case 'demo-load':
      try {
        return await demoLoad(body, { enqueue, enqueueMany });
      } catch (e) {
        await setDemoStatus(body.company, { state: 'failed', error: String(e.message || e).slice(0, 300) });
        throw e;
      }
    case 'demo-finish':
      return demoFinish(body, { enqueue });
    case 'reconcile':
      return reconcile(body);
    case 'eval-run':
      return evalRun(body, settings, scope);
    case 'eval-score':
      return evalScore(body);
    default:
      console.warn('Unknown job', JSON.stringify(body).slice(0, 200));
      return null;
  }
}

export { getMeta };
