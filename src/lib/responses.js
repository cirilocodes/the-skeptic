// The layered gate. How an objection can be resolved depends on its severity:
//
//   low       the author resolves it with any response that passes the grader
//   medium    needs proof (linked evidence, a mitigation task, a plan change, a quote showing the plan
//             already covers it); accepting the risk requires a mitigation task with an owner and due date
//   high      proof as above; "not relevant" or "accept the risk" need sign-off from a named approver
//   critical  as high, and accepting the risk also needs a mitigation task
//
// Text answers are graded (grading.js). One rebuttal round, then the objection is escalated: from then on
// only verifiable proof or an approver can resolve it. Every resolution, approval and override is logged.
import { route } from '@forge/api';
import { appClient, json, JSON_HEADERS } from './http';
import { canViewIssue, pagePermission } from './evidence';
import { gradeAnswer, combineGrades, objectionTerms } from './grading';
import { addAcceptedRisk } from './ledger';
import { recordSignal } from './learning';
import { kvs } from '@forge/kvs';
import { sevRank } from './settings';
import { clip, isIsoDate, isoDate, overlap, paragraphsToAdf, quoteFound } from './text';

// Plain lower-case words of three letters or more, without function words, singular ("chats" = "chat").
const FUNCTION_WORDS = new Set('the and for with from that this was were are has have had not but its our their them they you your all any can will would could should into onto than then there here when what which who whom whose why how also only just very each every some such per via out off over under about after before because since while'.split(' '));
const plainWords = (t) => new Set((String(t).toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length >= 3 && !FUNCTION_WORDS.has(w)).map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)));

export const RESPONSE_TYPES = {
  evidence: 'Link evidence',
  mitigation: 'Create a mitigation task',
  'plan-change': 'I changed the plan',
  covered: 'The plan already covers this',
  'not-relevant': 'Not relevant',
  'accept-risk': 'Accept the risk',
};

export function allowedResponses(o, { targetType = 'issue', settings = {} } = {}) {
  const sev = sevRank(o.severity);
  const high = sev >= sevRank('high');
  const critical = sev >= sevRank('critical');
  const medium = sev >= sevRank('medium');
  const canTask = targetType === 'issue' || !!settings.mitigationProjectKey;
  const list = [
    { type: 'evidence' },
    canTask ? { type: 'mitigation' } : null,
    { type: 'plan-change' },
    { type: 'covered' },
    { type: 'not-relevant', needsApprover: high || !!o.escalated },
    { type: 'accept-risk', needsApprover: high || !!o.escalated, needsMitigation: canTask && (critical || (medium && !high)) },
  ].filter(Boolean);
  return list.map((r) => ({ ...r, label: RESPONSE_TYPES[r.type] }));
}

const MAX_ELAPSED = 30 * 60 * 1000;

function trackTime(review, o, elapsedMs) {
  const ms = Math.max(0, Math.min(MAX_ELAPSED, Number(elapsedMs) || 0));
  o.authorMs = (o.authorMs || 0) + ms;
  review.authorMs = (review.objections || []).reduce((n, x) => n + (x.authorMs || 0), 0);
}

function failGrade(o, grade) {
  if (!o.rebuttalUsed) {
    o.rebuttalUsed = true;
    return { ok: false, rebuttal: grade.rebuttal, escalated: false };
  }
  o.escalated = true;
  return {
    ok: false,
    escalated: true,
    rebuttal: `${grade.rebuttal} This was the second try, so the objection is escalated: resolve it with linked evidence, a mitigation task, a plan change, or a named approver's sign-off.`,
  };
}

function resolve(o, resolution, actor) {
  o.status = 'resolved';
  o.resolution = { ...resolution, by: actor, at: new Date().toISOString() };
  delete o.approval;
}

export function parseLink(link, siteUrl = '') {
  const s = String(link || '').trim();
  if (!s) return null;
  const page = s.match(/pages\/(\d+)/) || s.match(/pageId=(\d+)/);
  if (page) return { pageId: page[1] };
  const key = s.toUpperCase().match(/\b([A-Z][A-Z0-9_]+-\d+)\b/);
  if (key && (!/^https?:/i.test(s) || !siteUrl || s.startsWith(siteUrl) || /atlassian\.net/i.test(s))) return { issueKey: key[1] };
  if (/^\d{3,}$/.test(s)) return { pageId: s };
  return null;
}

async function readLinked(c, ref) {
  if (ref.issueKey) {
    const i = await json(await c.jira(route`/rest/api/3/issue/${ref.issueKey}?fields=summary,description`), 'linked issue');
    return { kind: 'issue', id: String(i.id), title: `${i.key}: ${i.fields.summary}`, key: i.key, text: `${i.fields.summary}` };
  }
  const p = await json(await c.confluence(route`/wiki/api/v2/pages/${ref.pageId}?body-format=storage`), 'linked page');
  return { kind: 'page', id: String(p.id), title: p.title, text: `${p.title} ${String(p.body?.storage?.value || '').replace(/<[^>]+>/g, ' ')}` };
}

async function taskTypeId(c, projectKey) {
  const data = await json(await c.jira(route`/rest/api/3/issue/createmeta/${projectKey}/issuetypes?maxResults=50`), 'create meta');
  const types = data.issueTypes || data.values || [];
  const pick = types.find((t) => /^task$/i.test(t.name) && !t.subtask) || types.find((t) => !t.subtask && (t.hierarchyLevel ?? 0) === 0);
  if (!pick) throw new Error(`No task issue type is available in ${projectKey}.`);
  return String(pick.id);
}

export async function createMitigationTask({ c, target, o, input, settings, siteUrl }) {
  const summary = clip(String(input.summary || ''), 200);
  if (summary.length < 10) throw new Error('Describe the mitigation task in a few words.');
  if (overlap(summary, objectionTerms(o)).count < 1 && !/\d/.test(summary))
    throw new Error('The task summary should say what it mitigates (mention the risk or its source).');
  if (!input.assigneeId) throw new Error('Pick an owner for the mitigation task.');
  const due = String(input.dueDate || '');
  if (!isIsoDate(due)) throw new Error('Pick a due date.');
  const today = isoDate();
  if (due < today) throw new Error('The due date must be today or later.');
  if (Date.parse(due) - Date.now() > 365 * 86400000) throw new Error('Pick a due date within a year.');
  const projectKey = target.type === 'issue' ? target.projectKey : settings.mitigationProjectKey;
  if (!projectKey) throw new Error('Set a project for mitigation tasks on the Skeptic admin page.');

  const typeId = await taskTypeId(c, projectKey);
  const body = {
    fields: {
      project: { key: projectKey },
      issuetype: { id: typeId },
      summary,
      assignee: { accountId: String(input.assigneeId) },
      duedate: due,
      labels: ['skeptic-mitigation', 'skeptic-ignore'],
      description: paragraphsToAdf([
        [{ text: 'Mitigation for a Skeptic objection on ', bold: false }, { text: target.label, href: target.url }],
        [{ text: 'Objection: ', bold: true }, o.claim],
        [{ text: 'Source: ', bold: true }, { text: o.sourceTitle, href: o.sourceUrl }],
      ]),
    },
  };
  const res = await c.jira(route`/rest/api/3/issue`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    let msg = 'Jira would not create the task.';
    try {
      const e = JSON.parse(detail);
      msg = Object.values(e.errors || {})[0] || (e.errorMessages || [])[0] || msg;
    } catch {
      /* keep the generic message */
    }
    throw new Error(`Could not create the mitigation task: ${msg}`);
  }
  const created = await res.json();
  if (target.type === 'issue') {
    await c
      .jira(route`/rest/api/3/issueLink`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ type: { name: 'Relates' }, inwardIssue: { key: created.key }, outwardIssue: { key: target.key } }),
      })
      .catch(() => null);
  }
  return { key: created.key, id: String(created.id), url: `${siteUrl}/browse/${created.key}`, assigneeId: String(input.assigneeId), dueDate: due, summary };
}

async function projectLead(projectKey) {
  if (!projectKey) return null;
  try {
    const p = await json(await appClient().jira(route`/rest/api/3/project/${projectKey}`), 'project');
    return p?.lead?.accountId || null;
  } catch {
    return null;
  }
}

async function canSee(target, accountId) {
  return target.type === 'issue' ? canViewIssue(target.key, accountId) : pagePermission(target.id, accountId, 'read');
}

async function validateApprover({ target, input, actor, settings }) {
  const approver = String(input.approverId || '');
  if (approver === actor) throw new Error('You cannot approve your own response. Pick someone else.');
  if (approver === target.ownerAccountId) throw new Error("The approver can't be the plan's author.");
  if ((settings.approvers || []).length && !settings.approvers.includes(approver))
    throw new Error('Pick one of the approvers your admin set on the Skeptic admin page.');
  if (!(await canSee(target, approver))) throw new Error("That person can't see this plan, so they can't approve it.");
  return approver;
}

async function requestApproval({ o, target, type, approver, actor, settings, reason, mitigation }) {
  const exclude = new Set([actor, target.ownerAccountId, approver]);
  let backup = settings.backupApprover && !exclude.has(settings.backupApprover) ? settings.backupApprover : null;
  if (!backup) {
    const lead = await projectLead(target.projectKey);
    backup = lead && !exclude.has(lead) ? lead : null;
  }
  o.status = 'pending-approval';
  o.approval = {
    type,
    approver,
    backup,
    requestedBy: actor,
    requestedAt: new Date().toISOString(),
    status: 'pending',
    reason: clip(reason, 600),
    mitigation: mitigation || null,
    remindedAt: null,
    backupNotifiedAt: null,
  };
  return { ok: true, status: 'pending-approval', notify: { approver }, message: 'Sent for sign-off. The gate stays closed until the approver decides.' };
}

// Main entry: validate and apply one response. Returns { ok, status?, rebuttal?, escalated?, message?, notify? }.
export async function respond({ review, o, type, input = {}, actor, target, c, settings, siteUrl, agentGrade = null }) {
  if (!o || review.state !== 'active') throw new Error('This objection is not open for responses.');
  if (o.status === 'resolved') throw new Error('This objection is already resolved. Reopen it first.');
  if (o.status === 'pending-approval') throw new Error('This objection is waiting for its approver.');
  const allowed = allowedResponses(o, { targetType: target.type, settings });
  const rule = allowed.find((r) => r.type === type);
  if (!rule) throw new Error('That response is not available for this objection.');
  trackTime(review, o, input.elapsedMs);
  const text = String(input.text || '').trim();

  if (type === 'evidence') {
    const ref = parseLink(input.link, siteUrl);
    if (!ref) throw new Error('Paste a Jira key (like KF-12) or a Confluence page link.');
    let linked;
    try {
      linked = await readLinked(c, ref);
    } catch {
      throw new Error("I can't open that link with your access.");
    }
    if ((linked.kind === 'issue' && linked.id === target.id) || (linked.kind === 'page' && linked.id === target.id))
      throw new Error('Link something other than the plan itself.');
    const grade = combineGrades(gradeAnswer(`${text} ${linked.title}`, o), agentGrade);
    if (!grade.pass || overlap(`${text} ${linked.text}`, objectionTerms(o)).count < 1) return failGrade(o, { ...grade, rebuttal: grade.rebuttal || 'Say how the linked item answers this objection.' });
    resolve(o, { type, text: clip(text, 600), link: { title: clip(linked.title, 160), url: ref.issueKey ? `${siteUrl}/browse/${ref.issueKey}` : String(input.link) } }, actor);
    await recordSignal({ docId: o.docId }, 'upheld');
    return { ok: true, status: 'resolved' };
  }

  if (type === 'mitigation') {
    const task = await createMitigationTask({ c, target, o, input, settings, siteUrl });
    resolve(o, { type, task, text: clip(text, 600) }, actor);
    await recordSignal({ docId: o.docId }, 'upheld');
    return { ok: true, status: 'resolved', message: `Created ${task.key}.` };
  }

  if (type === 'plan-change') {
    if (target.hash === review.planHash) return { ok: false, rebuttal: "The plan hasn't changed since this review. Edit the plan first, then choose this again." };
    const before = new Set(review.sectionHashes || []);
    const changed = (target.sections || []).filter((s) => !before.has(s.hash));
    const sectionGone = o.sectionHash && !(target.sections || []).some((s) => s.hash === o.sectionHash);
    const touches = overlap(changed.map((s) => s.text).join(' '), objectionTerms(o)).count >= 1;
    if (!sectionGone && !touches) return { ok: false, rebuttal: `The plan changed, but not where it deals with ${o.sourceTitle ? `"${o.sourceTitle}"` : 'this objection'}.` };
    resolve(o, { type, text: clip(text, 600), changedSections: changed.map((s) => s.n) }, actor);
    await recordSignal({ docId: o.docId }, 'upheld');
    return { ok: true, status: 'resolved' };
  }

  if (type === 'covered') {
    const quote = String(input.quote || '').trim();
    if (!quoteFound(quote, `${target.title}\n${target.text}`)) return { ok: false, rebuttal: "I can't find that text in the plan. Copy the sentence exactly." };
    if (overlap(quote, objectionTerms(o)).count < 1) return { ok: false, rebuttal: `That part of the plan doesn't mention ${o.sourceTitle ? `"${o.sourceTitle}"` : 'this risk'}.` };
    // The plan's own pitch always shares words with an objection to it ("live chat", "support"). A sentence
    // that answers the objection must name what is distinctive about it: words from the objection, its
    // source or what would settle it that are not already in the plan's title.
    const titleWords = plainWords(target.title || '');
    const distinctive = [...plainWords(`${o.claim || ''} ${o.sourceTitle || ''} ${o.sourceQuote || ''} ${o.satisfiedBy || ''}`)].filter((w) => !titleWords.has(w));
    const said = plainWords(quote);
    const hits = distinctive.filter((w) => said.has(w)).length;
    if (hits < 2)
      return {
        ok: false,
        rebuttal: `That sentence restates the plan rather than answering this objection${o.satisfiedBy ? ` (it would be settled by: ${String(o.satisfiedBy).replace(/[.\s]+$/, '')})` : ''}. Quote the part that deals with it, or choose another answer.`,
      };
    resolve(o, { type, quote: clip(quote, 400) }, actor);
    await recordSignal({ docId: o.docId }, 'dismissed');
    return { ok: true, status: 'resolved' };
  }

  // Free-text responses: "not relevant" and "accept the risk".
  const grade = combineGrades(gradeAnswer(text, o), agentGrade);
  if (!grade.pass) return failGrade(o, grade);

  let approver = null;
  if (rule.needsApprover) {
    if (!input.approverId)
      return { ok: false, needsApprover: true, rebuttal: 'This needs sign-off from a named approver who is not the plan author. Pick one, then send again.' };
    approver = await validateApprover({ target, input, actor, settings });
  }
  const mitigation = rule.needsMitigation ? await createMitigationTask({ c, target, o, input, settings, siteUrl }) : null;
  if (approver) return requestApproval({ o, target, type, approver, actor, settings, reason: text, mitigation });
  resolve(o, { type, text: clip(text, 600), task: mitigation }, actor);
  if (type === 'accept-risk') await addAcceptedRisk(review, o, { acceptedBy: actor, reason: text });
  else await recordSignal({ docId: o.docId }, 'dismissed');
  return { ok: true, status: 'resolved', message: mitigation ? `Risk accepted; created ${mitigation.key}.` : 'Resolved.' };
}

export function canDecide(o, actor, settings, now = Date.now()) {
  const a = o?.approval;
  if (!a || a.status !== 'pending') return false;
  if (actor === a.requestedBy) return false;
  if (actor === a.approver) return true;
  const backupActive = a.backupNotifiedAt || now - Date.parse(a.requestedAt) >= (settings.backupAfterHours || 48) * 3600000;
  return !!(a.backup && actor === a.backup && backupActive);
}

export async function decideApproval({ review, o, actor, approve, note, settings, target }) {
  if (!canDecide(o, actor, settings)) throw new Error('Only the named approver (or the backup, once asked) can decide this.');
  if (actor === target.ownerAccountId) throw new Error("The plan's author can't approve it.");
  const a = o.approval;
  if (approve) {
    const type = a.type;
    resolve(o, { type, text: a.reason, task: a.mitigation, approvedBy: actor, approvedAt: new Date().toISOString(), note: clip(note || '', 300) }, a.requestedBy);
    if (type === 'accept-risk') await addAcceptedRisk(review, o, { acceptedBy: a.requestedBy, approvedBy: actor, reason: a.reason });
    else await recordSignal({ docId: o.docId }, 'dismissed');
    return { ok: true, status: 'resolved' };
  }
  o.status = 'open';
  o.escalated = true;
  o.approval = { ...a, status: 'rejected', decidedBy: actor, decidedAt: new Date().toISOString(), note: clip(note || '', 300) };
  await recordSignal({ docId: o.docId }, 'upheld');
  return { ok: true, status: 'open', message: 'Rejected. The objection is open again.' };
}

// Emergency override by a project (or Jira) admin. It lets the plan move, and it is logged for review afterwards.
export async function overrideGate({ review, actor, reason, c, target }) {
  const grade = gradeAnswer(reason, { claim: 'emergency override reason urgent deadline incident customer' }, { minLength: 30 });
  if (String(reason || '').trim().length < 30 || grade.score < 1) throw new Error('Give a specific reason for the override (at least a full sentence).');
  let isAdmin = false;
  try {
    const perms = await json(
      await c.jira(route`/rest/api/3/mypermissions?projectKey=${target.projectKey}&permissions=ADMINISTER_PROJECTS,ADMINISTER`),
      'mypermissions',
    );
    isAdmin = !!(perms?.permissions?.ADMINISTER_PROJECTS?.havePermission || perms?.permissions?.ADMINISTER?.havePermission);
  } catch {
    isAdmin = false;
  }
  if (!isAdmin) throw new Error('Only a project admin can override the Skeptic gate.');
  const at = new Date().toISOString();
  review.override = { by: actor, at, reason: clip(reason, 600), reviewedAfter: false };
  await kvs.set(`override:${at.replace(/[^0-9]/g, '')}:${review.tkey}`, {
    tkey: review.tkey,
    planId: review.planId,
    planKey: review.planKey,
    by: actor,
    at,
    reason: clip(reason, 600),
    blocking: (review.objections || []).filter((o) => o.status !== 'resolved').map((o) => ({ id: o.id, severity: o.severity, claim: clip(o.claim, 160) })),
    reviewedAfter: false,
  });
  return { ok: true, message: 'Override logged. It will be listed on the dashboard for review afterwards.' };
}
