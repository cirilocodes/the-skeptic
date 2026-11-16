// Daily sweep: keeps the Skeptic working when nobody is watching.
//  1. keeps the site profile and the history index healthy;
//  2. queues background pre-reviews for recently updated plans still in To Do;
//  3. looks for new evidence on plans that already have a review (counts only, no titles);
//  4. reminds approvers, then asks the backup approver;
//  5. flags mitigation tasks that are past their due date;
//  6. writes the daily digest.
import { route } from '@forge/api';
import { appClient, json, JSON_HEADERS } from './http';
import { fetchIssues, gatherEvidence } from './evidence';
import { getMeta, INDEX_VERSION } from './hindex';
import { enqueue, startBackfill } from './jobs';
import { listMatches } from './ledger';
import { comment, notifyApprover, writeDigest } from './notify';
import { getProfile, scopeFor } from './profile';
import { listByPrefix, listReviews, saveReviewRecord } from './store';
import { getSiteUrl, resolveTarget } from './targets';
import { plural } from './text';

const LIMIT = 15;

async function recentPlans(scope) {
  if (!scope.planTypeClause) return [];
  try {
    const data = await json(
      await appClient().jira(route`/rest/api/3/search/jql`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({
          jql: `${scope.planTypeClause}${scope.projectClause ? ` AND ${scope.projectClause}` : ''} AND statusCategory = "To Do" AND (labels is EMPTY OR labels not in (skeptic-ignore)) AND updated >= -30d ORDER BY updated DESC`,
          fields: ['summary'],
          maxResults: LIMIT,
        }),
      }),
      'sweep search',
    );
    return (data.issues || []).map((i) => String(i.id));
  } catch (e) {
    console.warn(e.message);
    return [];
  }
}

export function newDocsSince(review, ev) {
  const seen = new Set(review.seenDocs || []);
  const fresh = [
    ...(ev.pastPlans || []).filter((e) => e.outcome === 'abandoned').map((e) => ({ kind: 'abandoned plan', docId: e.docId })),
    ...(ev.incidents || []).map((e) => ({ kind: 'incident', docId: e.docId })),
    ...(ev.confluencePages || []).filter((p) => p.decisionOrRetro).map((p) => ({ kind: 'decision page', docId: p.docId })),
    ...(ev.openRisks || []).map((r) => ({ kind: 'open risk', docId: r.docId })),
  ];
  return fresh.filter((f) => f.docId && !seen.has(f.docId));
}

async function checkNewEvidence(reviews, settings, scope) {
  const c = appClient();
  const siteUrl = await getSiteUrl(c);
  let flagged = 0;
  const active = reviews.filter((r) => r.state === 'active' && r.targetType !== 'page').slice(0, LIMIT);
  for (const review of active) {
    try {
      const target = await resolveTarget(c, { planKey: review.planId, siteUrl });
      if (target.statusCategory === 'done') continue;
      const ev = await gatherEvidence({ reader: { c, mode: 'app' }, plan: target, searchTerms: (review.terms || []).join(', '), siteUrl, settings, scope, light: true });
      const fresh = newDocsSince(review, ev);
      const prevCount = review.newEvidence?.count || 0;
      if (fresh.length > prevCount) {
        review.newEvidence = { count: fresh.length, kinds: [...new Set(fresh.map((f) => f.kind))], at: new Date().toISOString() };
        await saveReviewRecord(review);
        await comment(review, [
          [{ text: 'Skeptic: ', bold: true }, `new evidence since this plan was reviewed (${plural(fresh.length, 'item')}: ${review.newEvidence.kinds.join(', ')}). Choose Review again in the Skeptic panel to see it.`],
        ]);
        flagged += 1;
      }
    } catch (e) {
      console.warn('sweep review', review.planKey, e.message);
    }
  }
  return flagged;
}

export async function remindApprovers(reviews, settings, now = Date.now()) {
  let reminded = 0;
  let escalated = 0;
  let pending = 0;
  for (const review of reviews) {
    let changed = false;
    for (const o of review.objections || []) {
      const a = o.approval;
      if (o.status !== 'pending-approval' || a?.status !== 'pending') continue;
      pending += 1;
      const age = now - Date.parse(a.requestedAt);
      if (a.backup && !a.backupNotifiedAt && age >= settings.backupAfterHours * 3600000) {
        await notifyApprover(review, o, a.backup, { backup: true });
        a.backupNotifiedAt = new Date(now).toISOString();
        escalated += 1;
        changed = true;
      } else if (age >= settings.reminderHours * 3600000 && (!a.remindedAt || now - Date.parse(a.remindedAt) >= settings.reminderHours * 3600000)) {
        await notifyApprover(review, o, a.approver, { reminder: true });
        a.remindedAt = new Date(now).toISOString();
        reminded += 1;
        changed = true;
      }
    }
    if (changed) await saveReviewRecord(review);
  }
  return { pending, reminded, escalated };
}

async function overdueMitigations(reviews) {
  const tasks = [];
  for (const r of reviews)
    for (const o of r.objections || []) {
      const t = o.resolution?.task || o.approval?.mitigation;
      if (t?.key && !t.overdueNotified && t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10)) tasks.push({ r, o, t });
    }
  if (!tasks.length) return 0;
  const keys = tasks.map((x) => x.t.key);
  let open = new Set();
  try {
    // Bulk fetch, not "key in (...)": a deleted task would make that JQL fail for every other task.
    const found = await fetchIssues(appClient(), keys, ['status']);
    open = new Set(found.filter((i) => i.fields?.status?.statusCategory?.key !== 'done').map((i) => i.key));
  } catch (e) {
    console.warn(e.message);
    return 0;
  }
  const byReview = new Map();
  for (const x of tasks) if (open.has(x.t.key)) byReview.set(x.r, [...(byReview.get(x.r) || []), x]);
  for (const [r, list] of byReview) {
    for (const x of list) x.t.overdueNotified = true;
    await saveReviewRecord(r);
    await comment(r, [[{ text: 'Skeptic: ', bold: true }, `${list.length === 1 ? 'a mitigation task is' : 'mitigation tasks are'} past their due date: ${list.map((x) => x.t.key).join(', ')}. The risks they cover are still open.`]]);
  }
  return [...byReview.values()].reduce((n, l) => n + l.length, 0);
}

export async function sweep(settings) {
  const profile = await getProfile({ refresh: true });
  const scope = scopeFor(settings, profile);
  const meta = await getMeta();
  if (meta.state === 'empty' || meta.version !== INDEX_VERSION) await startBackfill({ reset: true });

  const ids = await recentPlans(scope);
  for (const id of ids) await enqueue({ type: 'prep', id, reason: 'sweep' });
  await enqueue({ type: 'reconcile' });

  const reviews = await listReviews();
  const newEvidence = await checkNewEvidence(reviews, settings, scope);
  const approvals = await remindApprovers(reviews, settings);
  const overdue = await overdueMitigations(reviews);
  const matches = (await listMatches()).filter((m) => m.status === 'suggested').length;
  const overrides = (await listByPrefix('override:', 200)).filter((o) => !o.value.reviewedAfter).length;
  const digest = await writeDigest(settings, { pendingApprovals: approvals.pending, overdueMitigations: overdue, incidentMatches: matches, overrides });
  return { plansQueued: ids.length, newEvidence, approvals, overdueMitigations: overdue, incidentMatches: matches, overrides, digest: digest.url || 'stored' };
}
