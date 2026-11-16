// A fake Atlassian site for tests: just enough Jira and Confluence REST behaviour for the Skeptic.
// Built from seed/data.mjs, so tests and the offline evaluation see the same history as the real demo.
//
// Permissions: items marked `restricted` are visible to the app but to no user; `hiddenFrom: [ids]` hides an
// item from those users only (for per-viewer checks). The current user is
// `site.me` (default u1). u5 cannot edit; u4 is a project admin; u3 is the project lead.
import * as kestrel from '../seed/data.mjs';
import * as pinecrest from '../seed/data-software.mjs';

const adf = (paras) => ({ type: 'doc', version: 1, content: [].concat(paras).map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })) });
const adfText = (d) => (d?.content || []).map((p) => (p.content || []).map((x) => x.text || '').join('')).join('\n');
const stripHtml = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const STATUS = {
  new: { id: '1', name: 'To Do', statusCategory: { key: 'new' } },
  indeterminate: { id: '3', name: 'In Progress', statusCategory: { key: 'indeterminate' } },
  done: { id: '5', name: 'Done', statusCategory: { key: 'done' } },
};

export function createSite(opts = {}) {
  // dataset 'software' is the second demo site (Pinecrest Apps): Initiatives, an Incident type, no Confluence.
  const soft = opts.dataset === 'software';
  const data = soft ? pinecrest : kestrel;
  const {
    base = soft ? 'https://pinecrest.atlassian.net' : 'https://kf.atlassian.net',
    project = soft ? 'PA' : 'KF',
    planType = soft ? 'Initiative' : 'Epic',
    withConfluence = !soft,
    history = true,
    extraTypes = soft ? [{ id: '10009', name: 'Incident', hierarchyLevel: 0 }] : [],
  } = opts;
  const projectName = soft ? 'Pinecrest Apps' : 'Kestrel Freight';
  const incidentType = soft ? 'Incident' : 'Bug';
  const { epics, incidents, pages: seedPages, plans: seedPlans, risks } = data;
  const site = {
    base,
    me: 'u1',
    issues: new Map(),
    byKey: new Map(),
    pages: new Map(),
    comments: [],
    pageComments: [],
    createdPages: [],
    links: [],
    calls: [],
    nextId: 10001,
    nextPage: 501,
    props: {},
  };
  const types = [
    { id: '10000', name: planType, hierarchyLevel: 1 },
    { id: '10001', name: 'Task', hierarchyLevel: 0 },
    { id: '10002', name: 'Bug', hierarchyLevel: 0 },
    { id: '10003', name: 'Sub-task', hierarchyLevel: -1, subtask: true },
    ...extraTypes,
  ];
  site.types = types;
  const typeByName = (n) => types.find((t) => t.name === n) || types[1];

  site.addIssue = ({ summary, text = [], type = planType, labels = [], status = 'new', restricted = false, reporter = 'u1', assignee = null, dueDate = null, links = [], updated = '2026-10-01T10:00:00.000+0000', resolutiondate = null, projectKey = project }) => {
    const id = String(site.nextId++);
    const key = `${projectKey}-${Number(id) - 10000}`;
    const issue = {
      id,
      key,
      restricted,
      fields: {
        summary,
        description: adf(text),
        status: STATUS[status],
        issuetype: { id: typeByName(type).id, name: typeByName(type).name },
        labels: [...labels],
        reporter: reporter === 'app' ? { accountId: 'app-skeptic', accountType: 'app', displayName: 'the-skeptic' } : { accountId: reporter, accountType: 'atlassian' },
        assignee: assignee ? { accountId: assignee, displayName: assignee === 'u7' ? 'Ama Owusu' : `User ${assignee}` } : null,
        project: { id: projectKey === project ? '100' : '101', key: projectKey, name: projectKey === project ? projectName : projectKey },
        duedate: dueDate,
        fixVersions: [],
        issuelinks: links,
        created: '2025-01-01T10:00:00.000+0000',
        updated,
        resolution: status === 'done' ? { name: labels.includes('abandoned') ? "Won't Do" : 'Done' } : null,
        resolutiondate: resolutiondate || (status === 'done' ? '2025-04-14T10:00:00.000+0000' : null),
        comment: { comments: [] },
      },
    };
    site.issues.set(id, issue);
    site.byKey.set(key, issue);
    return issue;
  };
  site.addPage = ({ title, html, restricted = false, spaceId = '77' }) => {
    const id = String(site.nextPage++);
    const page = { id, title, spaceId, restricted, body: { storage: { value: html } }, version: { number: 1, createdAt: '2025-05-02T10:00:00.000Z' }, _links: { webui: `/spaces/KF/pages/${id}` } };
    site.pages.set(id, page);
    return page;
  };

  if (history) {
    for (const e of epics) {
      const status = e.outcome === 'shipped' || e.outcome === 'abandoned' ? 'done' : e.outcome === 'in-progress' ? 'indeterminate' : 'new';
      const labels = ['kf-seed', 'skeptic-ignore', ...(e.outcome === 'shipped' ? ['shipped'] : e.outcome === 'abandoned' ? ['abandoned'] : [])];
      const i = site.addIssue({ summary: e.summary, text: e.text, labels, status });
      if (e.comment) i.fields.comment.comments.push({ author: { displayName: e.commentBy || 'someone' }, created: '2025-04-10T10:00:00.000+0000', body: adf(e.comment) });
      for (const t of e.tasks || []) {
        const child = site.addIssue({ summary: t, text: [`Part of "${e.summary}".`], type: 'Task', labels: ['kf-seed', 'skeptic-ignore'], status: status === 'new' ? 'new' : 'done' });
        child.fields.parent = { key: i.key };
      }
    }
    for (const x of incidents) site.addIssue({ summary: x.summary, text: x.text, type: incidentType, labels: ['kf-seed', 'skeptic-ignore'], status: 'done' });
    for (const r of risks) site.addIssue({ summary: r.summary, text: r.text, type: 'Task', labels: ['kf-seed', 'risk', 'skeptic-ignore'] });
    if (withConfluence) for (const p of seedPages) site.addPage({ title: p.title, html: p.html });
  }
  site.plans = {};
  if (opts.plans !== false) for (const p of seedPlans) site.plans[p.key] = site.addIssue({ summary: p.summary, text: p.text, labels: ['kf-seed', 'plan'], dueDate: p.dueDate || null });

  // ---- tiny JQL ---------------------------------------------------------------------------------
  const textOf = (i) => `${i.fields.summary} ${adfText(i.fields.description)} ${(i.fields.comment?.comments || []).map((c) => adfText(c.body)).join(' ')}`.toLowerCase();
  const termsIn = (q) => [...q.matchAll(/~ "\\"([^"\\]+)\\""/g)].map((m) => m[1].toLowerCase());
  site.matchJql = (q, who) => {
    let list = [...site.issues.values()].filter((i) => who === 'app' || (!i.restricted && !(i.hiddenFrom || []).includes(site.me)));
    const ids = q.match(/\bid in \(([^)]*)\)/);
    if (ids) list = list.filter((i) => ids[1].split(',').map((s) => s.trim()).includes(i.id));
    const keys = q.match(/\bkey in \(([^)]*)\)/);
    if (keys) list = list.filter((i) => keys[1].split(',').map((s) => s.trim()).includes(i.key));
    for (const m of q.matchAll(/\bid != (\d+)/g)) list = list.filter((i) => i.id !== m[1]);
    const terms = termsIn(q);
    if (terms.length) list = list.filter((i) => terms.some((t) => textOf(i).includes(t)));
    const labIn = q.match(/\blabels in \(([^)]*)\)/);
    if (labIn && !/risk/.test(labIn[1])) {
      const want = labIn[1].split(',').map((x) => x.trim());
      list = list.filter((i) => i.fields.labels.some((l) => want.includes(l)));
    }
    const lab = q.match(/\blabels = ([\w-]+)/);
    if (lab && lab[1] !== 'risk') list = list.filter((i) => i.fields.labels.includes(lab[1]));
    if (/labels in \(risk, risks\)|labels = risk\b/.test(q)) list = list.filter((i) => i.fields.labels.some((l) => l === 'risk' || l === 'risks') || i.fields.issuetype.name === 'Risk');
    if (/statusCategory != Done/.test(q)) list = list.filter((i) => i.fields.status.statusCategory.key !== 'done');
    if (/statusCategory = Done/.test(q)) list = list.filter((i) => i.fields.status.statusCategory.key === 'done');
    if (/statusCategory = "To Do"/.test(q)) list = list.filter((i) => i.fields.status.statusCategory.key === 'new');
    const it = q.match(/issuetype in \(([^)]*)\)/);
    if (it) {
      const names = it[1].split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
      list = list.filter((i) => names.includes(i.fields.issuetype.name));
    }
    const pe = q.match(/\bproject = "?([A-Z][A-Z0-9_]*)"?/);
    if (pe) list = list.filter((i) => i.fields.project.key === pe[1]);
    const proj = q.match(/project in \(([^)]*)\)/);
    if (proj) list = list.filter((i) => proj[1].split(',').map((s) => s.trim()).includes(i.fields.project.key));
    const asg = q.match(/assignee = "([^"]+)"/);
    if (asg) list = list.filter((i) => i.fields.assignee?.accountId === asg[1]);
    if (/labels not in \(skeptic-ignore\)/.test(q)) list = list.filter((i) => !i.fields.labels.includes('skeptic-ignore'));
    return list;
  };

  const userCanSeeIssue = (i, accountId) => !!i && !i.restricted && !(i.hiddenFrom || []).includes(accountId) && ['u1', 'u2', 'u3', 'u4', 'u5', 'u7'].includes(accountId);
  site.overloaded = new Set();

  const ok = (body, status = 200) => ({ status, body });
  const nf = () => ({ status: 404, body: { errorMessages: ['Not found'] } });
  const pageView = (p) => ({ ...p });

  // Failure injection for robustness tests.
  site.fail = { confluence: false, jiraSearch: false, comments: false, rateLimit: 0 };
  site.respond = (product, rawPath, opts = {}, who = 'app') => {
    const path = decodeURIComponent(rawPath);
    const method = (opts.method || 'GET').toUpperCase();
    site.calls.push(`${who} ${method} ${path}`);
    if (site.fail.rateLimit > 0) {
      site.fail.rateLimit -= 1;
      return { status: 429, body: { errorMessages: ['Rate limited'] } };
    }
    if (site.fail.confluence && product === 'confluence') return { status: 503, body: { message: 'Confluence is down' } };
    if (site.fail.jiraSearch && product === 'jira' && path.includes('/search')) return { status: 500, body: { errorMessages: ['Search is down'] } };
    if (site.fail.comments && path.includes('comment')) return { status: 500, body: { errorMessages: ['Comments are down'] } };
    const body = opts.body ? JSON.parse(opts.body) : null;
    const m = (re) => path.match(re);

    if (product === 'jira') {
      if (path.startsWith('/rest/api/3/myself')) return ok({ accountId: site.me });
      if (path.startsWith('/rest/api/3/serverInfo')) return ok({ baseUrl: base });
      if (path.startsWith('/rest/api/3/issuetype')) return ok(types);
      if (path.startsWith('/rest/api/3/search/approximate-count')) {
        const q = body.jql;
        if (site.overloaded.size && /assignee = "([^"]+)"/.test(q) && site.overloaded.has(q.match(/assignee = "([^"]+)"/)[1])) return ok({ count: 40 });
        return ok({ count: site.matchJql(q, 'app').length });
      }
      if (path.startsWith('/rest/api/3/search/jql')) {
        // Like real Jira: "id in (...)" or "key in (...)" naming an item that doesn't exist, or that the caller
        // can't see, fails the whole query with a 400 rather than leaving it out.
        const canSee = (i) => i && (who === 'app' || (!i.restricted && !(i.hiddenFrom || []).includes(site.me)));
        const ids = (body.jql.match(/\bid in \(([^)]*)\)/) || [])[1];
        const keys = (body.jql.match(/\bkey in \(([^)]*)\)/) || [])[1];
        const badId = ids && ids.split(',').map((x) => x.trim()).find((x) => !canSee(site.issues.get(x)));
        const badKey = keys && keys.split(',').map((x) => x.trim()).find((x) => !canSee(site.byKey.get(x)));
        if (badId) return { status: 400, body: { errorMessages: [`A value with ID '${badId}' does not exist for the field 'id'.`] } };
        if (badKey) return { status: 400, body: { errorMessages: [`An issue with key '${badKey}' does not exist for field 'key'.`] } };
        const list = site.matchJql(body.jql, who);
        const start = Number(body.nextPageToken || 0);
        const n = body.maxResults || 50;
        const page = list.slice(start, start + n);
        return ok({ issues: page, ...(start + n < list.length ? { nextPageToken: String(start + n) } : {}) });
      }
      if (path.startsWith('/rest/api/3/mypermissions')) {
        const keys = (path.match(/permissions=([A-Z_,]+)/) || [])[1]?.split(',') || [];
        const perms = {};
        for (const k of keys) perms[k] = { havePermission: k === 'EDIT_ISSUES' ? site.me !== 'u5' : k === 'ADMINISTER_PROJECTS' || k === 'ADMINISTER' ? site.me === 'u4' : false };
        return ok({ permissions: perms });
      }
      let mm = m(/\/rest\/api\/3\/status\/(\d+)/);
      if (mm) return ok(Object.values(STATUS).find((s) => s.id === mm[1]) || STATUS.indeterminate);
      if (path.startsWith('/rest/api/3/user/viewissue/search')) {
        const key = path.match(/issueKey=([^&]+)/)[1];
        const acc = path.match(/accountId=([^&]+)/)[1];
        return ok(userCanSeeIssue(site.byKey.get(key), acc) ? [{ accountId: acc }] : []);
      }
      mm = m(/\/rest\/api\/3\/project\/([^/?]+)/);
      if (mm) return mm[1] === project || (site.extraProjects || []).includes(mm[1]) ? ok({ key: mm[1], name: mm[1] === project ? projectName : mm[1], lead: { accountId: 'u3' } }) : nf();
      if (path.startsWith('/rest/api/3/issueLink')) {
        site.links.push(body);
        return ok(null, 201);
      }
      mm = m(/\/rest\/api\/3\/issue\/createmeta\/([^/]+)\/issuetypes/);
      if (mm) return ok({ issueTypes: types });
      mm = m(/\/rest\/api\/3\/issue\/([^/?]+)\/comment/);
      if (mm) {
        const i = site.issues.get(mm[1]) || site.byKey.get(mm[1]);
        if (method === 'POST') {
          site.comments.push({ issue: i?.key || mm[1], text: JSON.stringify(body.body), who });
          return ok({}, 201);
        }
        return ok({ comments: i?.fields.comment.comments || [] });
      }
      mm = m(/\/rest\/api\/3\/issue\/([^/?]+)\/properties\/([^/?]+)/);
      if (mm) {
        site.props[`${mm[1]}:${mm[2]}`] = body;
        return ok(null, 204);
      }
      let tm = path.match(/^\/rest\/api\/3\/issue\/([^/?]+)\/transitions/);
      if (tm) {
        const i = site.issues.get(tm[1]) || site.byKey.get(tm[1]);
        if (!i) return nf();
        const all = [
          { id: '11', name: 'To Do', to: STATUS.new },
          { id: '21', name: 'In Progress', to: STATUS.indeterminate },
          { id: '31', name: 'Done', to: STATUS.done },
        ];
        if (method === 'POST') {
          const t = all.find((x) => x.id === body.transition?.id);
          if (!t) return { status: 400, body: { errorMessages: ['No such transition'] } };
          i.fields.status = t.to;
          if (t.to.statusCategory.key === 'done') {
            i.fields.resolution = { name: i.fields.labels.includes('abandoned') ? "Won't Do" : 'Done' };
            i.fields.resolutiondate = '2025-04-14T10:00:00.000+0000';
          }
          return ok(null, 204);
        }
        return ok({ transitions: all.filter((x) => x.to.id !== i.fields.status.id) });
      }
      if (path === '/rest/api/3/issue/bulkfetch' && method === 'POST') {
        const asked = body.issueIdsOrKeys || [];
        if (!asked.length || asked.length > 100) return { status: 400, body: { errorMessages: ['Between 1 and 100 issues.'] } };
        const issues = [];
        const issueErrors = [];
        for (const x of asked) {
          const i = site.issues.get(String(x)) || site.byKey.get(String(x));
          if (i && (who === 'app' || (!i.restricted && !(i.hiddenFrom || []).includes(site.me)))) issues.push(i);
          else issueErrors.push({ id: String(x), errorMessage: 'Issue does not exist or you do not have permission to see it.' });
        }
        return ok({ issues, issueErrors });
      }
      if (path === '/rest/api/3/issue/bulk' && method === 'POST') {
        const issues = (body.issueUpdates || []).map(({ fields: f }) => {
          const created = site.addIssue({ summary: f.summary, text: adfText(f.description).split('\n'), type: f.issuetype?.name || types.find((t) => t.id === f.issuetype?.id)?.name || 'Task', labels: f.labels || [], dueDate: f.duedate || null, projectKey: f.project?.key || project, reporter: who === 'app' ? 'app' : 'u1' });
          if (f.parent?.key) created.fields.parent = { key: f.parent.key };
          return { id: created.id, key: created.key };
        });
        return ok({ issues, errors: [] }, 201);
      }
      if (path === '/rest/api/3/issue' && method === 'POST') {
        if (who !== 'user') return { status: 403, body: { errorMessages: ['Use the user'] } };
        const f = body.fields;
        const created = site.addIssue({ summary: f.summary, text: [adfText(f.description)], type: types.find((t) => t.id === f.issuetype.id)?.name || 'Task', labels: f.labels || [], assignee: f.assignee?.accountId || f.assignee?.id, dueDate: f.duedate });
        return ok({ id: created.id, key: created.key }, 201);
      }
      mm = m(/\/rest\/api\/3\/issue\/([^/?]+)/);
      if (mm) {
        const i = site.issues.get(mm[1]) || site.byKey.get(mm[1]);
        if (!i || (who === 'user' && (i.restricted || (i.hiddenFrom || []).includes(site.me)))) return nf();
        if (method === 'PUT') {
          for (const op of body.update?.labels || []) {
            if (op.add && !i.fields.labels.includes(op.add)) i.fields.labels.push(op.add);
            if (op.remove) i.fields.labels = i.fields.labels.filter((l) => l !== op.remove);
          }
          return ok(null, 204);
        }
        return ok(i);
      }
    }

    if (product === 'confluence') {
      if (!withConfluence) return nf();
      if (path.startsWith('/wiki/api/v2/spaces')) {
        const keys = (path.match(/[?&]keys=([^&]+)/) || [])[1];
        const spaces = (site.spaces || ['KF']).map((k, n) => ({ id: String(77 + n), key: k }));
        return ok({ results: spaces.filter((sp) => !keys || keys.split(',').includes(sp.key)) });
      }
      if (path.startsWith('/wiki/rest/api/search')) {
        const cql = (path.match(/cql=(.*?)(&limit=|&excerpt=|$)/) || [])[1] || '';
        const visible = [...site.pages.values()].filter((p) => who === 'app' || (!p.restricted && !(p.hiddenFrom || []).includes(site.me)));
        if (/^type = page$/.test(cql.trim())) return ok({ results: [], totalSize: visible.length, size: 0 });
        const terms = termsIn(cql);
        const notId = (cql.match(/id != (\d+)/) || [])[1];
        const hits = visible.filter((p) => p.id !== notId && terms.some((t) => `${p.title} ${stripHtml(p.body.storage.value)}`.toLowerCase().includes(t)));
        return ok({ results: hits.map((p) => ({ content: { id: p.id, title: p.title } })), totalSize: hits.length });
      }
      let mm = m(/\/wiki\/rest\/api\/content\/(\d+)\/permission\/check/);
      if (mm) {
        const p = site.pages.get(mm[1]);
        return ok({ hasPermission: !!p && !p.restricted && (body.operation === 'read' || body.subject.identifier !== 'u5') });
      }
      if (path.startsWith('/wiki/api/v2/footer-comments')) {
        site.pageComments.push({ pageId: body.pageId, html: body.body.value });
        return ok({}, 201);
      }
      if (path.startsWith('/wiki/api/v2/pages') && method === 'POST') {
        const p = site.addPage({ title: body.title, html: body.body.value, spaceId: body.spaceId });
        site.createdPages.push(p);
        return ok({ ...pageView(p), _links: { base: `${base}/wiki`, webui: p._links.webui } });
      }
      mm = m(/\/wiki\/api\/v2\/pages\/(\d+)/);
      if (mm) {
        const p = site.pages.get(mm[1]);
        if (!p || (who === 'user' && (p.restricted || (p.hiddenFrom || []).includes(site.me)))) return nf();
        if (method === 'PUT') {
          p.body.storage.value = body.body.value;
          p.version.number += 1;
          return ok(pageView(p));
        }
        return ok(pageView(p));
      }
      if (path.startsWith('/wiki/api/v2/pages')) {
        const visible = [...site.pages.values()].filter((p) => who === 'app' || (!p.restricted && !(p.hiddenFrom || []).includes(site.me)));
        const ids = (path.match(/[?&]id=([0-9,]+)/) || [])[1];
        if (ids) return ok({ results: visible.filter((p) => ids.split(',').includes(p.id)).map(pageView) });
        const title = (path.match(/[?&]title=([^&]+)/) || [])[1];
        if (title) return ok({ results: visible.filter((p) => p.title === title).map(pageView) });
        const cursor = Number((path.match(/cursor=(\d+)/) || [])[1] || 0);
        const lim = Number((path.match(/limit=(\d+)/) || [])[1] || 25);
        const slice = visible.slice(cursor, cursor + lim).map(pageView);
        return ok({ results: slice, _links: cursor + lim < visible.length ? { next: `/wiki/api/v2/pages?cursor=${cursor + lim}&limit=${lim}` } : {} });
      }
    }
    console.warn('UNHANDLED', product, method, path);
    return nf();
  };
  // A large, noisy site: n generic work items plus m pages, for scale tests.
  site.bulk = (n, m = 0) => {
    const W = 'invoice route depot scanner van driver parcel label warehouse refund billing portal report dashboard schedule shift rota customs fuel tyre battery charging pickup returns tracking map photo survey login export import pricing quote contract supplier audit training safety helmet uniform printer barcode pallet forklift dock gate yard'.split(' ');
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const pickW = (k) => Array.from({ length: k }, () => W[Math.floor(rnd() * W.length)]).join(' ');
    for (let i = 0; i < n; i += 1) {
      const kind = rnd();
      site.addIssue({
        summary: `${pickW(3)} ${i}`,
        text: [pickW(25), pickW(20)],
        type: kind < 0.1 ? planType : kind < 0.15 ? 'Bug' : 'Task',
        labels: kind > 0.97 ? ['abandoned'] : [],
        status: kind < 0.5 ? 'done' : kind < 0.8 ? 'indeterminate' : 'new',
        updated: `2026-0${1 + (i % 9)}-1${i % 9}T10:00:00.000+0000`,
      });
    }
    for (let j = 0; j < m; j += 1) site.addPage({ title: `${pickW(3)} notes ${j}`, html: `<p>${pickW(60)}</p><p>${pickW(40)}</p>` });
  };
  return site;
}
