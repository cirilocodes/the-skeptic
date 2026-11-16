// Decision records: when every objection is resolved, the Skeptic writes the outcome up as a Confluence
// page. The next review of a similar plan finds that page (it is indexed like any other), so the
// organisation's memory grows with every plan. The page is created with the user's permissions.
import { route } from '@forge/api';
import { json, JSON_HEADERS } from './http';
import { RESPONSE_TYPES } from './responses';
import { escapeHtml } from './text';

async function spaceIdFor(c, { spaceKey, spaceId }) {
  if (spaceId) return spaceId;
  if (!spaceKey) throw new Error('No decision space is set. Ask a Jira admin to choose one on the Skeptic admin page.');
  const data = await json(await c.confluence(route`/wiki/api/v2/spaces?keys=${spaceKey}`), 'space lookup');
  const space = data.results?.[0];
  if (!space) throw new Error(`Confluence space ${spaceKey} was not found, or you can't see it.`);
  return space.id;
}

function resolutionText(o) {
  const r = o.resolution || {};
  const parts = [RESPONSE_TYPES[r.type] || 'Resolved'];
  if (r.text) parts.push(escapeHtml(r.text));
  if (r.quote) parts.push(`Plan says: “${escapeHtml(r.quote)}”`);
  if (r.link?.url) parts.push(`<a href="${escapeHtml(r.link.url)}">${escapeHtml(r.link.title || r.link.url)}</a>`);
  if (r.task?.key) parts.push(`Mitigation <a href="${escapeHtml(r.task.url)}">${escapeHtml(r.task.key)}</a>, due ${escapeHtml(r.task.dueDate)}`);
  return parts.join('<br/>');
}

export function decisionHtml(review, siteUrl) {
  const today = new Date().toISOString().slice(0, 10);
  const user = (id) => (id ? `<ac:link><ri:user ri:account-id="${escapeHtml(id)}" /></ac:link>` : '—');
  const rows = review.objections
    .map(
      (o) => `<tr><td><strong>${escapeHtml(o.severity)}</strong></td><td>${escapeHtml(o.claim)}<br/><a href="${escapeHtml(o.sourceUrl)}">${escapeHtml(o.sourceTitle)}</a></td>
<td>${resolutionText(o)}</td><td>${user(o.resolution?.by)}</td><td>${user(o.resolution?.approvedBy)}</td></tr>`,
    )
    .join('');
  const planLink = review.planUrl || (review.planKey ? `${siteUrl}/browse/${review.planKey}` : '');
  return `<p><strong>Decision record</strong> written by the Skeptic on ${today}.</p>
<p>Plan: <a href="${escapeHtml(planLink)}">${escapeHtml(review.planKey ? `${review.planKey}: ${review.planSummary}` : review.planSummary)}</a></p>
<h2>Decision</h2>
<p>The team went ahead after resolving every objection the Skeptic raised from this organisation's history.</p>
<h2>Objections and how they were resolved</h2>
<table><tbody><tr><th>Severity</th><th>Objection and source</th><th>Resolution</th><th>By</th><th>Signed off by</th></tr>${rows}</tbody></table>
${review.revisitWhen?.length ? `<h2>What would change the answer</h2><ul>${review.revisitWhen.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>` : ''}
${review.override ? `<h2>Gate override</h2><p>${user(review.override.by)} overrode the gate on ${escapeHtml(review.override.at.slice(0, 10))}: ${escapeHtml(review.override.reason)}</p>` : ''}
<p>Search terms: ${escapeHtml((review.terms || []).join(', '))}</p>`;
}

export async function writeDecisionPage(c, review, { spaceKey, spaceId, siteUrl }) {
  const sid = await spaceIdFor(c, { spaceKey, spaceId });
  const stamp = new Date().toISOString().slice(0, 10);
  const title = `Decision: ${review.planKey ? `${review.planKey} ` : ''}${review.planSummary} (${stamp})`.slice(0, 250);
  const page = await json(
    await c.confluence(route`/wiki/api/v2/pages`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ spaceId: sid, status: 'current', title, body: { representation: 'storage', value: decisionHtml(review, siteUrl) } }),
    }),
    'create decision page',
  );
  return { url: `${siteUrl}/wiki${page._links?.webui || ''}`, title, createdAt: new Date().toISOString() };
}
