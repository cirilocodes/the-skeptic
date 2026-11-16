// A "target" is the plan under review: a Jira work item (usually an epic) or a Confluence page.
import { route } from '@forge/api';
import { json } from './http';
import { adfToText, clip, planHash, sections, stripHtml } from './text';

// Storage key for a target. Issues keep the plain ID (compatible with v1); pages are prefixed.
export const tkey = (t) => (t.type === 'page' ? `page:${t.id}` : String(t.id));

const person = (u) => (u?.accountId && u.accountType !== 'app' ? u.accountId : null);
const PLAN_FIELDS = 'summary,description,status,project,issuetype,labels,reporter,assignee,duedate,fixVersions,issuelinks,created,updated';

export async function getIssue(c, idOrKey, fields = PLAN_FIELDS) {
  return json(await c.jira(route`/rest/api/3/issue/${idOrKey}?fields=${fields}`), `Read ${idOrKey}`);
}

export async function getSiteUrl(c) {
  try {
    const info = await json(await c.jira(route`/rest/api/3/serverInfo`), 'serverInfo');
    return (info.baseUrl || '').replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function issueTarget(i, siteUrl) {
  const f = i.fields || {};
  const text = adfToText(f.description);
  return {
    type: 'issue',
    id: String(i.id),
    key: i.key,
    label: i.key,
    title: f.summary || i.key,
    text: clip(text, 6000),
    sections: sections(text),
    hash: planHash(f.summary, text),
    url: `${siteUrl}/browse/${i.key}`,
    issueType: f.issuetype?.name || '',
    statusCategory: f.status?.statusCategory?.key || 'new',
    statusName: f.status?.name || '',
    labels: f.labels || [],
    projectKey: f.project?.key || '',
    projectId: f.project?.id ? String(f.project.id) : '',
    // Never mention an app account (demo items are created by the app itself).
    ownerAccountId: person(f.reporter),
    assigneeAccountId: person(f.assignee),
    assigneeName: f.assignee?.displayName || null,
    dueDate: f.duedate || (f.fixVersions || []).map((v) => v.releaseDate).filter(Boolean).sort()[0] || null,
    links: (f.issuelinks || []).map((l) => ({
      type: l.type?.name || '',
      inward: l.type?.inward || '',
      outward: l.type?.outward || '',
      direction: l.inwardIssue ? 'inward' : 'outward',
      key: (l.inwardIssue || l.outwardIssue)?.key,
      id: (l.inwardIssue || l.outwardIssue)?.id,
      statusCategory: (l.inwardIssue || l.outwardIssue)?.fields?.status?.statusCategory?.key || null,
    })),
  };
}

export async function resolveTarget(c, { planKey, pageId, siteUrl }) {
  if (pageId) {
    const p = await json(await c.confluence(route`/wiki/api/v2/pages/${pageId}?body-format=storage`), `Read page ${pageId}`);
    const text = stripHtml(p.body?.storage?.value || '');
    return {
      type: 'page',
      id: String(p.id),
      label: p.title,
      title: p.title,
      text: clip(text, 6000),
      sections: sections(text),
      hash: planHash(p.title, text),
      url: `${siteUrl}/wiki${p._links?.webui || `/pages/viewpage.action?pageId=${p.id}`}`,
      spaceId: p.spaceId ? String(p.spaceId) : null,
      statusCategory: 'new',
      labels: [],
      ownerAccountId: p.ownerId || p.authorId || null,
      dueDate: null,
      links: [],
    };
  }
  return issueTarget(await getIssue(c, planKey), siteUrl);
}

export function targetFromContext(context) {
  const ext = context?.extension || {};
  if (ext.issue?.id) return { type: 'issue', id: String(ext.issue.id), key: ext.issue.key };
  if (ext.content?.id) return { type: 'page', id: String(ext.content.id), spaceKey: ext.space?.key };
  return null;
}
