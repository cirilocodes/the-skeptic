// Shared helpers for the seed and evaluation scripts: sign-in, REST calls and issue creation.
//
// Set these in your own PowerShell window (never paste the token into chat or a file):
//   $env:ATLASSIAN_SITE="your-site.atlassian.net"
//   $env:ATLASSIAN_EMAIL="you@example.com"
//   $env:ATLASSIAN_API_TOKEN="..."
//   $env:JIRA_PROJECT_KEY="KF"
//   $env:CONFLUENCE_SPACE_KEY="KF"
// When you are done:  Remove-Item Env:ATLASSIAN_API_TOKEN

export const clean = (v) => String(v || '').trim().replace(/^["'“”]+|["'“”]+$/g, '').trim();
export const SITE = clean(process.env.ATLASSIAN_SITE).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
export const EMAIL = clean(process.env.ATLASSIAN_EMAIL);
const TOKEN = clean(process.env.ATLASSIAN_API_TOKEN);
export const PROJECT = clean(process.env.JIRA_PROJECT_KEY) || 'KF';
export const SPACE = clean(process.env.CONFLUENCE_SPACE_KEY) || 'KF';

export function requireEnv() {
  if (!SITE || !EMAIL || !TOKEN) {
    console.error('Set ATLASSIAN_SITE, ATLASSIAN_EMAIL and ATLASSIAN_API_TOKEN first (see the top of seed/atlassian.mjs).');
    process.exit(1);
  }
}

const AUTH = () => `Basic ${Buffer.from(`${EMAIL}:${TOKEN}`).toString('base64')}`;
// Classic API tokens work against the site address. Tokens "with scopes" only work through Atlassian's
// API gateway, so sign-in switches to it automatically if the site refuses the token.
let JIRA_BASE = `https://${SITE}`;
let WIKI_BASE = `https://${SITE}`;

export async function call(method, path, body) {
  const base = path.startsWith('/wiki/') ? WIKI_BASE : JIRA_BASE;
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: AUTH(), Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const err = new Error(`${method} ${path} -> ${res.status}: ${typeof data === 'string' ? data.slice(0, 300) : JSON.stringify(data)}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function signIn() {
  try {
    return await call('GET', '/rest/api/3/myself');
  } catch (e) {
    if (e.status !== 401) throw e;
  }
  console.log('The site refused the token directly; trying Atlassian\'s API gateway (needed for tokens "with scopes")...');
  const info = await fetch(`https://${SITE}/_edge/tenant_info`)
    .then((r) => r.json())
    .catch(() => null);
  if (!info?.cloudId) throw new Error(`Could not look up the site ID for ${SITE}. Check ATLASSIAN_SITE.`);
  JIRA_BASE = `https://api.atlassian.com/ex/jira/${info.cloudId}`;
  WIKI_BASE = `https://api.atlassian.com/ex/confluence/${info.cloudId}`;
  try {
    return await call('GET', '/rest/api/3/myself');
  } catch (e) {
    if (e.status !== 401 && e.status !== 403) throw e;
    const masked = TOKEN.length > 8 ? `${TOKEN.slice(0, 4)}...${TOKEN.slice(-4)} (${TOKEN.length} characters)` : `(${TOKEN.length} characters)`;
    throw new Error(
      [
        `Atlassian rejected the login (${e.status}).`,
        `  Email used: ${EMAIL}`,
        `  Token used: ${masked}`,
        'Check:',
        '  1. The email is exactly the one you sign in to Atlassian with.',
        '  2. The token was copied whole (it starts with ATATT and is long; check the length above).',
        '  3. Easiest fix: at id.atlassian.com/manage-profile/security/api-tokens click "Create API token" (NOT "with scopes"),',
        '     copy it, set $env:ATLASSIAN_API_TOKEN again in this same window, and re-run.',
      ].join('\n'),
    );
  }
}

export const adf = (paragraphs) => ({
  type: 'doc',
  version: 1,
  content: paragraphs.map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p }] })),
});

// Every issue with a label, by summary. (Phrase search on titles breaks on ":" and misses unindexed items.)
export async function issuesWithLabel(label, fields = ['summary']) {
  const out = new Map();
  let nextPageToken;
  do {
    const data = await call('POST', '/rest/api/3/search/jql', {
      jql: `project = "${PROJECT}" AND labels = "${label}"`,
      fields,
      maxResults: 100,
      ...(nextPageToken ? { nextPageToken } : {}),
    });
    for (const i of data.issues || []) out.set(i.fields.summary, i);
    nextPageToken = data.nextPageToken;
  } while (nextPageToken);
  return out;
}

export async function issueTypes() {
  const data = await call('GET', `/rest/api/3/issue/createmeta/${PROJECT}/issuetypes`);
  const types = data.issueTypes || data.values || [];
  const byName = (n) => types.find((t) => t.name.toLowerCase() === n);
  const epic = byName('epic') || types.find((t) => t.hierarchyLevel === 1);
  const task = byName('task') || byName('story') || types.find((t) => !t.subtask && (t.hierarchyLevel ?? 0) === 0);
  const bug = byName('bug') || null;
  if (!epic) throw new Error(`Project ${PROJECT} has no Epic-level issue type. Use a Scrum or Kanban software project.`);
  return { epic, task, bug };
}

export async function moveTo(issueKey, category) {
  const { transitions } = await call('GET', `/rest/api/3/issue/${issueKey}/transitions`);
  const t = transitions.find((x) => x.to?.statusCategory?.key === category);
  if (!t) {
    console.warn(`  ! no transition to a "${category}" status for ${issueKey}; leaving it as is`);
    return;
  }
  await call('POST', `/rest/api/3/issue/${issueKey}/transitions`, { transition: { id: t.id } });
}

export async function createIssue({ summary, text, labels, typeId, dueDate = null, known }) {
  const existing = known.get(summary);
  if (existing) {
    console.log(`  = ${existing.key} ${summary} (already there)`);
    return existing.key;
  }
  const created = await call('POST', '/rest/api/3/issue', {
    fields: {
      project: { key: PROJECT },
      issuetype: { id: typeId },
      summary,
      description: adf(text),
      labels,
      ...(dueDate ? { duedate: dueDate } : {}),
    },
  });
  console.log(`  + ${created.key} ${summary}`);
  known.set(summary, { key: created.key, id: created.id, fields: { summary } });
  return created.key;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const siteUrl = () => `https://${SITE}`;
