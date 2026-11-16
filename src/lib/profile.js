// Site profile: what this Atlassian site looks like, detected once and refreshed daily.
// This is what lets the Skeptic work on any site, not only the demo: it finds which issue types are
// plans (epic-level types, whatever they are called), which are incidents, whether Confluence is
// installed, and how much history exists, so a near-empty site gets an honest "little to compare".
import { route } from '@forge/api';
import { kvs } from '@forge/kvs';
import { appClient, json, JSON_HEADERS } from './http';
import { jqlString } from './text';

const KEY = 'site:profile';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Incident-like types, including Jira Service Management's "[System] Incident" and "[System] Problem".
const INCIDENT_RE = /\b(bug|incident|problem|defect|outage|post.?incident|major incident)\b/i;
// "Submit a request or incident" is a service-desk request type, not an incident record.
export const isIncidentType = (name) => INCIDENT_RE.test(String(name || '')) && !/\brequest\b/i.test(String(name || ''));
const RISK_RE = /^risks?$/i;
const PLAN_RE = /\b(epic|initiative|feature|theme|program|objective)\b/i;

export async function approxCount(c, jql) {
  try {
    const r = await json(
      await c.jira(route`/rest/api/3/search/approximate-count`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ jql }) }),
      'approximate count',
    );
    return Number(r?.count) || 0;
  } catch {
    return null;
  }
}

async function detect() {
  const c = appClient();
  const profile = { detectedAt: new Date().toISOString(), issueTypes: [], planTypes: [], incidentTypes: [], riskType: null, confluence: false };
  try {
    const types = await json(await c.jira(route`/rest/api/3/issuetype`), 'issue types');
    const seen = new Map();
    for (const t of types || []) {
      if (t.subtask) continue;
      const entry = seen.get(t.name) || { name: t.name, ids: [], hierarchyLevel: t.hierarchyLevel ?? 0 };
      entry.ids.push(String(t.id));
      entry.hierarchyLevel = Math.max(entry.hierarchyLevel, t.hierarchyLevel ?? 0);
      seen.set(t.name, entry);
    }
    profile.issueTypes = [...seen.values()];
  } catch (e) {
    console.warn('profile: issue types', e.message);
  }
  const level1 = profile.issueTypes.filter((t) => t.hierarchyLevel === 1).map((t) => t.name);
  // Epic-level types are plans, except a type for risks (some templates put Risk at that level).
  const level1Plans = level1.filter((n) => !RISK_RE.test(n) && !isIncidentType(n));
  profile.planTypes = level1Plans.length ? level1Plans : profile.issueTypes.filter((t) => PLAN_RE.test(t.name)).map((t) => t.name);
  profile.incidentTypes = profile.issueTypes.filter((t) => isIncidentType(t.name)).map((t) => t.name);
  profile.riskType = profile.issueTypes.find((t) => /^risks?$/i.test(t.name))?.name || null;

  try {
    profile.confluence = (await c.confluence(route`/wiki/api/v2/spaces?limit=1`)).ok;
  } catch {
    profile.confluence = false;
  }

  const typeClause = (names) => (names.length ? `issuetype in (${names.map((n) => `"${jqlString(n)}"`).join(',')})` : null);
  const plans = typeClause(profile.planTypes);
  const [issues, planCount, closedPlans, incidents] = await Promise.all([
    approxCount(c, 'created >= -1095d'),
    plans ? approxCount(c, plans) : 0,
    plans ? approxCount(c, `${plans} AND statusCategory = Done`) : 0,
    profile.incidentTypes.length ? approxCount(c, typeClause(profile.incidentTypes)) : 0,
  ]);
  let pages = 0;
  if (profile.confluence) {
    try {
      const r = await json(await c.confluence(route`/wiki/rest/api/search?cql=${'type = page'}&limit=1`), 'page count');
      pages = Number(r?.totalSize ?? r?.size ?? 0) || 0;
    } catch {
      pages = 0;
    }
  }
  profile.counts = { issues: issues ?? 0, plans: planCount ?? 0, closedPlans: closedPlans ?? 0, incidents: incidents ?? 0, pages };
  const history = (closedPlans || 0) + (incidents || 0) + pages;
  profile.history = history;
  profile.density = history === 0 && !(issues > 20) ? 'empty' : history < 8 ? 'sparse' : 'normal';
  return profile;
}

export async function getProfile({ refresh = false } = {}) {
  const cached = await kvs.get(KEY);
  if (!refresh && cached && Date.now() - Date.parse(cached.detectedAt) < MAX_AGE_MS) return cached;
  try {
    const p = await detect();
    await kvs.set(KEY, p);
    return p;
  } catch (e) {
    console.warn('profile detection failed', e.message);
    return cached || { planTypes: ['Epic'], incidentTypes: ['Bug'], issueTypes: [], confluence: true, counts: {}, density: 'normal' };
  }
}

// The effective scope, from admin settings with the detected profile as the fallback.
export function scopeFor(settings, profile) {
  const known = new Set((profile.issueTypes || []).map((t) => t.name.toLowerCase()));
  const pick = (configured, detected) => {
    const list = (configured || []).filter((n) => !known.size || known.has(n.toLowerCase()));
    return list.length ? list : detected || [];
  };
  const planTypes = pick(settings.planIssueTypes, profile.planTypes?.length ? profile.planTypes : ['Epic']);
  const incidentTypes = pick(settings.incidentTypes, profile.incidentTypes);
  const quote = (names) => names.map((n) => `"${jqlString(n)}"`).join(',');
  const projects = settings.projectKeys || [];
  const riskParts = ['labels in (risk, risks)'];
  if (profile.riskType) riskParts.push(`issuetype = "${jqlString(profile.riskType)}"`);
  return {
    planTypes,
    incidentTypes,
    projects,
    planTypeClause: planTypes.length ? `issuetype in (${quote(planTypes)})` : null,
    incidentClause: incidentTypes.length ? `issuetype in (${quote(incidentTypes)})` : null,
    projectClause: projects.length ? `project in (${projects.join(',')})` : null,
    riskClause: settings.riskJql ? `((${riskParts.join(' OR ')}) OR (${settings.riskJql}))` : `(${riskParts.join(' OR ')})`,
    density: profile.density || 'normal',
    confluence: profile.confluence !== false,
  };
}

// Is this work item a plan the Skeptic should look after?
export function inScope(target, scope) {
  if (!target || target.type !== 'issue') return target?.type === 'page';
  const typeOk = scope.planTypes.map((n) => n.toLowerCase()).includes(String(target.issueType || '').toLowerCase());
  const projectOk = !scope.projects.length || scope.projects.includes(target.projectKey);
  const ignored = (target.labels || []).map((l) => l.toLowerCase()).includes('skeptic-ignore');
  return typeOk && projectOk && !ignored;
}
