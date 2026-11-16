// Notifications. Loud only when it matters: high-severity findings and approval requests mention people;
// everything else goes into one daily digest. Comments are short and evidence-first.
import { route } from '@forge/api';
import { kvs } from '@forge/kvs';
import { appClient, json, JSON_HEADERS } from './http';
import { sevRank } from './settings';
import { listByPrefix, batchDelete } from './store';
import { clip, escapeHtml, paragraphsToAdf, plural } from './text';

export async function postIssueComment(issueId, lines) {
  try {
    const res = await appClient().jira(route`/rest/api/3/issue/${issueId}/comment`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ body: paragraphsToAdf(lines) }),
    });
    if (!res.ok) console.warn('Could not post issue comment', res.status);
  } catch (e) {
    console.warn('Could not post issue comment', e.message);
  }
}

export function linesToStorage(lines) {
  return lines
    .map(
      (line) =>
        `<p>${(Array.isArray(line) ? line : [line])
          .filter((piece) => piece !== '' && piece != null)
          .map((piece) => {
            if (typeof piece === 'string') return escapeHtml(piece);
            if (piece.mention) return `<ac:link><ri:user ri:account-id="${escapeHtml(piece.mention)}" /></ac:link>`;
            if (piece.href) return `<a href="${escapeHtml(piece.href)}">${escapeHtml(piece.text)}</a>`;
            return piece.bold ? `<strong>${escapeHtml(piece.text)}</strong>` : escapeHtml(piece.text);
          })
          .join('')}</p>`,
    )
    .join('');
}

export async function postPageComment(pageId, lines) {
  try {
    const res = await appClient().confluence(route`/wiki/api/v2/footer-comments`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ pageId: String(pageId), body: { representation: 'storage', value: linesToStorage(lines) } }),
    });
    if (!res.ok) console.warn('Could not post page comment', res.status);
  } catch (e) {
    console.warn('Could not post page comment', e.message);
  }
}

export const comment = (review, lines) => (review.targetType === 'page' ? postPageComment(review.planId, lines) : postIssueComment(review.planId, lines));

const SEV_LABEL = { low: 'LOW', medium: 'MEDIUM', high: 'HIGH', critical: 'CRITICAL' };

export function countBySeverity(objections) {
  const n = {};
  for (const o of objections || []) n[o.severity] = (n[o.severity] || 0) + 1;
  return ['critical', 'high', 'medium', 'low']
    .filter((s) => n[s])
    .map((s) => `${n[s]} ${s}`)
    .join(', ');
}

const seconds = (ms) => (ms >= 90000 ? `${Math.round(ms / 60000)} min` : `${Math.max(1, Math.round(ms / 1000))} s`);

// ---------------------------------------------------------------------------
// The review comment, designed: a coloured panel by verdict, then a table of the top objections.
// ---------------------------------------------------------------------------
const PANEL = { 'strong objections': 'error', 'some concerns': 'warning', 'minor points': 'info', 'no strong objections': 'success' };
const PAGE_MACRO = { error: 'warning', warning: 'note', info: 'info', success: 'tip' };
const txt = (text, marks) => ({ type: 'text', text: String(text), ...(marks ? { marks } : {}) });
const para = (...content) => ({ type: 'paragraph', content: content.filter(Boolean) });
const cell = (header, ...content) => ({ type: header ? 'tableHeader' : 'tableCell', attrs: {}, content: [para(...content)] });

export function headline(review) {
  const n = (review.objections || []).length;
  const counts = countBySeverity(review.objections);
  return `The Skeptic: ${review.verdict}${n ? ` (${counts})` : ''}${review.draft ? ' · draft from history, no AI' : ''}${review.timing?.readyMs ? ` · ready in ${seconds(review.timing.readyMs)}` : ''}`;
}

function gateLine(review) {
  // The summary above already says what was checked; this line only says what it means for the gate.
  if (!(review.objections || []).length) return 'Nothing here stops the plan from starting.';
  if (review.targetType !== 'issue') return 'Answer the objections in the Skeptic byline panel on this page.';
  return review.binding
    ? `Objections at ${review.gateMinSeverity} or above must be answered in the Skeptic panel before this plan can move on.`
    : `Advisory while the plan is in ${review.statusName || 'To Do'}: the gate applies when it moves on. Answer in the Skeptic panel.`;
}

// Comments are visible to everyone who can see the plan, who may not all see every cited item. A comment
// names an objection's source only when it is a rule, a Confluence page, or a Jira item in the plan's own
// project (project permissions are the usual boundary); other objections are listed by severity, and the
// panel shows them to people who can see their sources.
export function shareable(o, review) {
  if (o.sourceKind === 'check' || String(o.docId || '').startsWith('p')) return true;
  const project = String(review.planKey || '').split('-')[0];
  const m = String(o.sourceTitle || '').match(/^([A-Z][A-Z0-9_]+)-\d+:/);
  return !!project && !!m && m[1] === project;
}
const HIDDEN = 'Cites an item in another project: open the Skeptic panel to see it, if you have access.';

export function reviewAdf(review, { mention = null } = {}) {
  const top = (review.objections || []).slice(0, 5).map((o) => (shareable(o, review) ? o : { ...o, claim: HIDDEN, sourceTitle: 'Another project', sourceUrl: null, talkTo: '' }));
  const content = [
    {
      type: 'panel',
      attrs: { panelType: PANEL[review.verdict] || 'info' },
      content: [
        para(mention ? { type: 'mention', attrs: { id: mention } } : null, mention ? txt(' ') : null, txt(headline(review), [{ type: 'strong' }])),
        ...(review.summary ? [para(txt(review.summary))] : []),
      ],
    },
  ];
  if (top.length)
    content.push({
      type: 'table',
      attrs: { isNumberColumnEnabled: false, layout: 'default' },
      content: [
        { type: 'tableRow', content: [cell(true, txt('#')), cell(true, txt('Severity')), cell(true, txt('Objection')), cell(true, txt('Source'))] },
        ...top.map((o, i) => ({
          type: 'tableRow',
          content: [
            cell(false, txt(String(i + 1))),
            cell(false, txt(SEV_LABEL[o.severity] || 'LOW', [{ type: 'strong' }])),
            cell(false, txt(clip(o.claim, 300)), o.talkTo ? txt(` Talk to ${o.talkTo}.`, [{ type: 'em' }]) : null),
            cell(false, o.sourceUrl ? txt(clip(o.sourceTitle, 90), [{ type: 'link', attrs: { href: o.sourceUrl } }]) : txt(clip(o.sourceTitle || 'Rule check', 90))),
          ],
        })),
      ],
    });
  if ((review.objections || []).length > top.length) content.push(para(txt(`+${review.objections.length - top.length} more in the Skeptic panel.`)));
  const asks = (review.worthAsking || []).filter((w) => shareable({ ...w, sourceKind: w.sourceKind || 'item' }, review));
  if (asks.length) content.push(para(txt('Worth asking: ', [{ type: 'strong' }]), txt(asks.map((w) => w.text).join(' · '))));
  if (review.revisitWhen?.length) content.push(para(txt('What would change the answer: ', [{ type: 'strong' }]), txt(review.revisitWhen.join(' · '))));
  content.push(para(txt(gateLine(review), [{ type: 'em' }])));
  return { type: 'doc', version: 1, content };
}

export function reviewStorage(review, { mention = null } = {}) {
  const top = (review.objections || []).slice(0, 5).map((o) => (shareable(o, review) ? o : { ...o, claim: HIDDEN, sourceTitle: 'Another project', sourceUrl: null, talkTo: '' }));
  const macro = PAGE_MACRO[PANEL[review.verdict] || 'info'];
  const who = mention ? `<ac:link><ri:user ri:account-id="${escapeHtml(mention)}" /></ac:link> ` : '';
  let html = `<ac:structured-macro ac:name="${macro}"><ac:rich-text-body><p>${who}<strong>${escapeHtml(headline(review))}</strong></p>${review.summary ? `<p>${escapeHtml(review.summary)}</p>` : ''}</ac:rich-text-body></ac:structured-macro>`;
  if (top.length)
    html += `<table><tbody><tr><th>#</th><th>Severity</th><th>Objection</th><th>Source</th></tr>${top
      .map(
        (o, i) =>
          `<tr><td>${i + 1}</td><td><strong>${SEV_LABEL[o.severity] || 'LOW'}</strong></td><td>${escapeHtml(clip(o.claim, 300))}${o.talkTo ? ` <em>Talk to ${escapeHtml(o.talkTo)}.</em>` : ''}</td><td>${o.sourceUrl ? `<a href="${escapeHtml(o.sourceUrl)}">${escapeHtml(clip(o.sourceTitle, 90))}</a>` : escapeHtml(o.sourceTitle || 'Rule check')}</td></tr>`,
      )
      .join('')}</tbody></table>`;
  html += `<p><em>${escapeHtml(gateLine(review))}</em></p>`;
  return html;
}

async function postReviewComment(review, mention) {
  try {
    if (review.targetType === 'page') {
      const res = await appClient().confluence(route`/wiki/api/v2/footer-comments`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ pageId: String(review.planId), body: { representation: 'storage', value: reviewStorage(review, { mention }) } }),
      });
      if (!res.ok) console.warn('Could not post page comment', res.status);
      return;
    }
    const res = await appClient().jira(route`/rest/api/3/issue/${review.planId}/comment`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ body: reviewAdf(review, { mention }) }),
    });
    if (!res.ok) console.warn('Could not post issue comment', res.status);
  } catch (e) {
    console.warn('Could not post the review comment', e.message);
  }
}

// After a review is saved: mention the owner for high-severity findings, otherwise add to the digest.
export async function notifyReview(review, settings, target) {
  const loud = (review.objections || []).some((o) => o.status !== 'resolved' && sevRank(o.severity) >= sevRank(settings.notifyMinSeverity));
  const who = target.assigneeAccountId || target.ownerAccountId;
  await postReviewComment(review, loud ? who : null);
  if (!loud) await queueDigest({ kind: 'review', tkey: review.tkey, label: review.planKey || 'a Confluence proposal', verdict: review.verdict, counts: countBySeverity(review.objections) });
  return loud;
}

export async function notifyApprover(review, o, accountId, { reminder = false, backup = false } = {}) {
  const lead = backup ? 'You are the backup approver: the named approver has not answered.' : reminder ? 'Reminder:' : '';
  await comment(review, [
    [
      { mention: accountId },
      ` ${lead} Your sign-off is needed on a ${o.severity} Skeptic objection (${o.approval?.type === 'accept-risk' ? 'accept the risk' : 'not relevant'}). `,
      'Open the Skeptic panel on this plan to approve or reject.',
    ],
  ]);
}

const digestKey = () => `digest:item:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;

export async function queueDigest(item) {
  await kvs.set(digestKey(), { ...item, at: new Date().toISOString() }, { ttl: { value: 3, unit: 'DAYS' } });
}

// The digest page, laid out: a status line, then a table of reviews by project, then what needs a person.
// Keys and counts only, never evidence titles: anyone in the space may read it.
export function digestStorage(reviews, extra = {}, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const needs = [
    extra.pendingApprovals ? `${plural(extra.pendingApprovals, 'approval')} waiting for sign-off` : '',
    extra.overdueMitigations ? `${plural(extra.overdueMitigations, 'mitigation task')} past their due date` : '',
    extra.incidentMatches ? `${plural(extra.incidentMatches, 'incident')} that may match accepted risks: confirm them on the Skeptic dashboard` : '',
    extra.overrides ? `${plural(extra.overrides, 'gate override')} to review` : '',
  ].filter(Boolean);
  let html = `<h2>Skeptic daily digest, ${day}</h2>`;
  html += `<ac:structured-macro ac:name="${needs.length ? 'note' : 'tip'}"><ac:rich-text-body><p>${
    needs.length ? `<strong>Needs a person:</strong> ${needs.map(escapeHtml).join('; ')}.` : 'Nothing needs a person today.'
  }</p></ac:rich-text-body></ac:structured-macro>`;
  if (reviews.length) {
    const byProject = {};
    for (const r of reviews) (byProject[String(r.label).split('-')[0] || 'Other'] ||= []).push(r);
    html += '<h3>Reviews without high-severity findings</h3>';
    for (const [proj, list] of Object.entries(byProject).sort()) {
      html += `<h4>${escapeHtml(proj)}</h4><table><tbody><tr><th>Plan</th><th>Verdict</th><th>Objections</th></tr>${list
        .map((r) => `<tr><td>${escapeHtml(r.label)}</td><td>${escapeHtml(r.verdict)}</td><td>${escapeHtml(r.counts || 'none')}</td></tr>`)
        .join('')}</tbody></table>`;
    }
  } else html += '<p>No new reviews without high-severity findings.</p>';
  html += '<p><em>High-severity findings are not listed here: their owners were mentioned on the plan itself.</em></p>';
  return html;
}

// Builds the daily digest (keys and counts only) and writes it to a Confluence page if a space is set.
export async function writeDigest(settings, extra = {}) {
  const items = await listByPrefix('digest:item:', 300);
  const reviews = items.map((i) => i.value).filter((v) => v.kind === 'review');
  const lines = [[{ text: `Skeptic daily digest, ${new Date().toISOString().slice(0, 10)}`, bold: true }]];
  if (reviews.length) lines.push([`${plural(reviews.length, 'review')} without high-severity findings: `, reviews.map((r) => `${r.label} (${r.verdict}${r.counts ? `: ${r.counts}` : ''})`).join('; ')]);
  if (extra.pendingApprovals) lines.push([`${plural(extra.pendingApprovals, 'approval')} waiting.`]);
  if (extra.overdueMitigations) lines.push([`${plural(extra.overdueMitigations, 'mitigation task')} past their due date.`]);
  if (extra.incidentMatches) lines.push([`${plural(extra.incidentMatches, 'incident')} may match accepted risks. Confirm them on the Skeptic dashboard.`]);
  if (extra.overrides) lines.push([`${plural(extra.overrides, 'gate override')} to review.`]);
  if (lines.length === 1) lines.push(['Nothing new.']);
  const digest = { at: new Date().toISOString(), lines: lines.map((l) => l.map((p) => (typeof p === 'string' ? p : p.text)).join('')) };
  await kvs.set('digest:last', digest);
  if (items.length) await batchDelete(items.map((i) => i.key));

  if (!settings.digestSpaceKey) return digest;
  try {
    const c = appClient();
    const space = await json(await c.confluence(route`/wiki/api/v2/spaces?keys=${settings.digestSpaceKey}`), 'digest space');
    const spaceId = space.results?.[0]?.id;
    if (!spaceId) return digest;
    const value = digestStorage(reviews, extra);
    const existing = await kvs.get('digest:page');
    if (existing?.id) {
      const page = await json(await c.confluence(route`/wiki/api/v2/pages/${existing.id}`), 'digest page');
      const res = await c.confluence(route`/wiki/api/v2/pages/${existing.id}`, {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({ id: existing.id, status: 'current', title: page.title, body: { representation: 'storage', value }, version: { number: (page.version?.number || 1) + 1 } }),
      });
      if (res.ok) return { ...digest, url: existing.url };
    }
    const res = await c.confluence(route`/wiki/api/v2/pages`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ spaceId, status: 'current', title: 'Skeptic daily digest', body: { representation: 'storage', value } }),
    });
    if (res.ok) {
      const p = await res.json();
      const url = `${p._links?.base || ''}${p._links?.webui || ''}`;
      await kvs.set('digest:page', { id: String(p.id), url });
      return { ...digest, url };
    }
  } catch (e) {
    console.warn('digest page', e.message);
  }
  return digest;
}
