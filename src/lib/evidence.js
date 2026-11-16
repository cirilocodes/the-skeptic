// Evidence gathering: index first, live search as the fallback, and a permission re-check on everything.
//
// 1. Rank candidates from the history index (fast, built in the background).
// 2. If the index is not ready, or finds almost nothing, also run a live JQL/CQL text search.
// 3. Re-read every candidate with the asking person's permissions. Anything they cannot see is dropped
//    and only counted ("3 related items you can't see were left out"), never named.
// 4. Tag what is left with short refs the agent must cite: E (past plans), I (incidents), R (open risks),
//    P (pages), T (the Skeptic's own graded track record), L (accepted risks that became incidents).
//    Rule findings (C refs) come from rules.js.
import { route } from '@forge/api';
import { appClient, json, JSON_HEADERS } from './http';
import { categoryOf, getMeta, indexReady, isDecisionLike, issueDoc, outcomeOf, pageDoc, searchIndex, searchIndexMany } from './hindex';
import { adfToText, clip, jqlString, matchedTerms, parseTerms, queryTerms, reasonSentence, stripHtml, synonymsFor } from './text';

const FIELDS = ['summary', 'status', 'labels', 'description', 'assignee', 'issuetype', 'project', 'updated', 'created', 'resolution', 'resolutiondate', 'comment'];

async function jql(c, query, maxResults = 50, fields = FIELDS) {
  try {
    const data = await json(
      await c.jira(route`/rest/api/3/search/jql`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ jql: query, fields, maxResults }) }),
      'JQL search',
    );
    return data.issues || [];
  } catch (e) {
    // "project in (A, B)" fails for everyone if the reader can't browse one of the projects. Retry without
    // it and keep the projects they can see.
    const m = query.match(/project in \(([^)]*)\) AND /);
    if (e.status === 400 && m) {
      const keys = m[1].split(',').map((x) => x.trim());
      const retry = await jql(c, query.replace(m[0], ''), Math.min(100, maxResults * 2), fields.includes('project') ? fields : [...fields, 'project']);
      return retry ? retry.filter((i) => keys.includes(i.fields?.project?.key)).slice(0, maxResults) : null;
    }
    console.warn(e.message, e.detail, query);
    return null;
  }
}

// Can one account see one issue? (Used when there is no user client, e.g. automation.)
export async function canViewIssue(key, accountId) {
  try {
    const users = await json(
      await appClient().jira(route`/rest/api/3/user/viewissue/search?issueKey=${key}&accountId=${accountId}&maxResults=1`),
      'viewissue',
    );
    return Array.isArray(users) && users.some((u) => u.accountId === accountId);
  } catch {
    return false;
  }
}

export async function pagePermission(pageId, accountId, operation = 'read') {
  try {
    const r = await json(
      await appClient().confluence(route`/wiki/rest/api/content/${pageId}/permission/check`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ subject: { type: 'user', identifier: accountId }, operation }),
      }),
      'page permission',
    );
    return !!r?.hasPermission;
  } catch {
    return false;
  }
}

// Fetch issues by id or key. Uses bulk fetch, which reports an issue that is missing or hidden from the
// caller in issueErrors instead of failing the whole request (a JQL "id in (...)" naming one such issue
// fails with a 400, which would make every other item disappear too).
export async function fetchIssues(c, idsOrKeys, fields = FIELDS) {
  const list = [...new Set(idsOrKeys.map(String).filter(Boolean))];
  const out = [];
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100);
    try {
      const data = await json(
        await c.jira(route`/rest/api/3/issue/bulkfetch`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ issueIdsOrKeys: chunk, fields }) }),
        'bulk fetch',
      );
      out.push(...(data?.issues || []));
    } catch (e) {
      // Fallback: one JQL per item, so one bad item can't hide the rest.
      console.warn(e.message);
      for (const x of chunk) out.push(...((await jql(c, /^\d+$/.test(x) ? `id = ${x}` : `key = ${x}`, 1, fields)) || []));
    }
  }
  return out;
}

// Fresh copies of the given issue IDs that the reader may see.
export async function visibleIssues(reader, ids) {
  const list = [...new Set(ids.map(Number).filter(Boolean))];
  if (!list.length) return [];
  const out = [];
  for (let i = 0; i < list.length; i += 50) {
    const chunk = list.slice(i, i + 50);
    const issues = await fetchIssues(reader.c, chunk);
    // 'user' reads are already permission-checked; 'app' reads only feed counts (radar), never citations.
    if (reader.mode === 'user' || reader.mode === 'app') out.push(...issues);
    else {
      const ok = await Promise.all(issues.map((iss) => canViewIssue(iss.key, reader.accountId)));
      out.push(...issues.filter((_, j) => ok[j]));
    }
  }
  return out;
}

export async function visiblePages(reader, ids) {
  const list = [...new Set(ids.map(String).filter((x) => /^\d+$/.test(x)))];
  if (!list.length) return [];
  const out = [];
  for (let i = 0; i < list.length; i += 50) {
    const chunk = list.slice(i, i + 50);
    let pages = [];
    try {
      const data = await json(await reader.c.confluence(route`/wiki/api/v2/pages?id=${chunk.join(',')}&body-format=storage&limit=50`), 'pages');
      pages = data.results || [];
    } catch (e) {
      console.warn(e.message);
      continue;
    }
    if (reader.mode === 'user' || reader.mode === 'app') out.push(...pages);
    else {
      const ok = await Promise.all(pages.map((p) => pagePermission(p.id, reader.accountId, 'read')));
      out.push(...pages.filter((_, j) => ok[j]));
    }
  }
  return out;
}

const anyTermClause = (field, terms) => `(${terms.map((t) => `${field} ~ "\\"${jqlString(t)}\\""`).join(' OR ')})`;

// Live fallback: text search with the reader's own client.
async function liveCandidates(reader, terms, scope, plan) {
  if (!terms.length) return { issueIds: [], pageIds: [] };
  const notThis = plan?.type === 'issue' && plan.id ? `id != ${Number(plan.id)} AND ` : '';
  const proj = scope.projectClause ? `${scope.projectClause} AND ` : '';
  const queries = [`${notThis}${proj}${anyTermClause('text', terms)} ORDER BY updated DESC`];
  const risks = `${notThis}${scope.riskClause} AND statusCategory != Done AND ${anyTermClause('text', terms)}`;
  const [issues, riskIssues] = await Promise.all([jql(reader.c, queries[0], 30, ['summary']), jql(reader.c, risks, 10, ['summary'])]);
  let riskList = riskIssues;
  if (riskList === null && scope.riskClause.includes(' OR (')) {
    // A broken custom risk JQL must not break the review: fall back to the default risk clause.
    riskList = await jql(reader.c, `${notThis}labels in (risk, risks) AND statusCategory != Done AND ${anyTermClause('text', terms)}`, 10, ['summary']);
  }
  const issueIds = [...(issues || []), ...(riskList || [])].map((i) => i.id);
  let pageIds = [];
  if (scope.confluence) {
    const notPage = plan?.type === 'page' && plan.id ? ` AND id != ${Number(plan.id)}` : '';
    try {
      const data = await json(
        await reader.c.confluence(route`/wiki/rest/api/search?cql=${`type = page${notPage} AND ${anyTermClause('text', terms)}`}&limit=15`),
        'Confluence search',
      );
      pageIds = (data.results || []).map((r) => r.content?.id).filter(Boolean);
    } catch (e) {
      console.warn(e.message, e.detail);
    }
  }
  return { issueIds, pageIds };
}

// Score a freshly read document against the query (for live candidates that have no index score).
function scoreDoc(doc, qterms) {
  let s = 0;
  const matched = [];
  for (const [t, qw] of Object.entries(qterms)) {
    if (doc.terms[t]) {
      s += qw * ((doc.terms[t] * 2.2) / (doc.terms[t] + 1.2)) * 0.1;
      matched.push(t);
    }
  }
  return { score: Math.round(s * 100) / 100, matched };
}

const yearsAgo = (date) => (date ? Math.max(0, (Date.now() - Date.parse(date)) / (365.25 * 86400000)) : null);

export async function gatherEvidence({ reader, plan, searchTerms, siteUrl, settings, scope, outcomes = [], ledger = [], light = false }) {
  const title = plan.title || '';
  const body = plan.text || '';
  const qterms = queryTerms({ searchTerms, title, body });
  // The agent's phrases, plus the plan's own title keywords so a match never depends on the agent alone.
  const ownTerms = parseTerms('', title);
  const agentTerms = searchTerms ? parseTerms(searchTerms, title) : [];
  const humanTerms = [...new Set([...agentTerms, ...ownTerms])].slice(0, 12);
  // What counts as "the same idea" when matching: the phrases plus their synonyms, with the plan's own
  // words getting their synonyms first so the agent's terms cannot crowd them out.
  const synonyms = [...new Set([...synonymsFor(ownTerms, 6), ...synonymsFor(agentTerms, 6)])];
  const matchTerms = [...humanTerms, ...synonyms];
  const meta = await getMeta();
  const selfId = plan.type === 'issue' ? `i${plan.id}` : plan.type === 'page' ? `p${plan.id}` : null;
  const exclude = new Set(selfId ? [selfId] : []);

  // Search twice: with the agent's terms, and with the plan's own words (plus synonyms) alone. The
  // second search keeps what the radar and drafts find in the pack even when the agent's terms drift
  // (to an earlier plan in the same chat, say).
  const planTerms = searchTerms ? queryTerms({ searchTerms: '', title, body }) : null;
  const [agentHits, planHits = []] = meta.docs ? await searchIndexMany(planTerms ? [qterms, planTerms] : [qterms], [40, 20], { exclude }) : [[], []];
  const seenHit = new Set(agentHits.map((h) => h.doc.id));
  const hits = [...agentHits, ...planHits.filter((h) => !seenHit.has(h.doc.id))];
  const indexScores = new Map(hits.map((h) => [h.doc.id, h]));
  const needLive = !indexReady(meta) || (hits.length < 3 && !light);
  const live = needLive ? await liveCandidates(reader, matchTerms.slice(0, 8), scope, plan) : { issueIds: [], pageIds: [] };

  const issueIds = [...new Set([...hits.filter((h) => h.doc.kind === 'issue').map((h) => h.doc.iid), ...live.issueIds.map(String)])].filter(
    (id) => !(plan.type === 'issue' && id === String(plan.id)),
  );
  const pageIds = [...new Set([...hits.filter((h) => h.doc.kind === 'page').map((h) => h.doc.pid), ...live.pageIds.map(String)])].filter(
    (id) => !(plan.type === 'page' && id === String(plan.id)),
  );
  const candidates = issueIds.length + pageIds.length;

  const [issues, pages] = await Promise.all([visibleIssues(reader, issueIds.slice(0, 40)), scope.confluence ? visiblePages(reader, pageIds.slice(0, 25)) : []]);

  // Fresh documents, ranked by index score (or a direct score for live-only candidates).
  const ranked = [
    ...issues.map((i) => ({ raw: i, doc: issueDoc(i, scope, settings) })),
    ...pages.map((p) => ({ raw: p, doc: pageDoc(p) })),
  ]
    .map((x) => {
      const fromIndex = indexScores.get(x.doc.id);
      const s = fromIndex ? { score: fromIndex.score, matched: fromIndex.matched } : scoreDoc(x.doc, qterms);
      return { ...x, ...s };
    })
    .filter((x) => x.score > 0 || x.matched.length);

  const sparse = scope.density !== 'normal';
  const cat = (x) => categoryOf(x.raw.fields || {}, scope);
  const describeIssue = (x) => {
    const f = x.raw.fields || {};
    const description = adfToText(f.description);
    const comments = (f.comment?.comments || []).slice(-3).map((cm) => ({
      author: cm.author?.displayName || 'someone',
      created: String(cm.created || '').slice(0, 10),
      text: clip(adfToText(cm.body), 280),
    }));
    const outcome = outcomeOf(f, settings.abandonedLabels);
    return {
      docId: x.doc.id,
      key: x.raw.key,
      url: `${siteUrl}/browse/${x.raw.key}`,
      title: f.summary,
      type: f.issuetype?.name,
      project: f.project?.name,
      status: f.status?.name,
      outcome,
      // The sentence that says why it ended: latest comments first, then the description.
      whyEnded: outcome === 'abandoned' || cat(x) === 'incident' ? reasonSentence([...comments.map((c) => c.text).reverse(), description]) : '',
      owner: f.assignee?.displayName || null,
      date: String(f.resolutiondate || f.updated || '').slice(0, 10) || null,
      description: clip(description, 800),
      recentComments: comments,
      matchedTerms: matchedTerms(`${f.summary} ${description} ${comments.map((c) => c.text).join(' ')}`, humanTerms),
      synonymHits: matchedTerms(`${f.summary} ${description} ${comments.map((c) => c.text).join(' ')}`, synonyms),
      relevance: x.score,
      _text: `${f.summary}\n${description}\n${comments.map((c) => `${c.author}: ${c.text}`).join('\n')}`,
    };
  };
  const describePage = (x) => {
    const text = stripHtml(x.raw.body?.storage?.value || '');
    return {
      docId: x.doc.id,
      id: String(x.raw.id),
      url: `${siteUrl}/wiki${x.raw._links?.webui || `/pages/viewpage.action?pageId=${x.raw.id}`}`,
      title: x.raw.title,
      decisionOrRetro: isDecisionLike(x.raw.title, text),
      whyEnded: isDecisionLike(x.raw.title, text) ? reasonSentence([text]) : '',
      date: String(x.raw.version?.createdAt || x.raw.createdAt || '').slice(0, 10) || null,
      text: clip(text, 1400),
      matchedTerms: matchedTerms(`${x.raw.title} ${text}`, humanTerms),
      synonymHits: matchedTerms(`${x.raw.title} ${text}`, synonyms),
      relevance: x.score,
      _text: `${x.raw.title}\n${text}`,
    };
  };

  const byScore = (a, b) => b.score - a.score;
  const issuesRanked = ranked.filter((x) => x.doc.kind === 'issue').sort(byScore);
  const plansList = issuesRanked
    .filter((x) => cat(x) === 'plan' || (x.doc.outcome === 'abandoned' && cat(x) === 'other') || (sparse && cat(x) === 'other' && x.doc.outcome !== 'not started'))
    .map(describeIssue)
    .sort((a, b) => (b.outcome === 'abandoned') - (a.outcome === 'abandoned') || b.relevance - a.relevance)
    .slice(0, 8);
  const incidentsList = issuesRanked.filter((x) => cat(x) === 'incident').map(describeIssue).slice(0, 4);
  const risksList = issuesRanked
    .filter((x) => cat(x) === 'risk' && x.doc.statusCat !== 'done')
    .map(describeIssue)
    .slice(0, 4);
  const pagesList = ranked
    .filter((x) => x.doc.kind === 'page')
    .sort(byScore)
    .map(describePage)
    .sort((a, b) => b.decisionOrRetro - a.decisionOrRetro || b.relevance - a.relevance)
    .slice(0, 6);
  if (light) for (const p of pagesList) p.text = clip(p.text, 300);

  // The Skeptic's own track record and accepted risks that became incidents. They come from app storage,
  // so the reader must be able to see the plan each one belongs to before it is cited.
  const termHit = (text) => matchedTerms(text, matchTerms).length > 0;
  const trackCands = outcomes
    .filter((r) => !(plan.type === 'issue' && String(r.planId) === String(plan.id)))
    .filter((r) => termHit(`${r.planSummary} ${(r.terms || []).join(' ')}`))
    .slice(0, 6);
  const ledgerCands = ledger.filter((r) => r.status === 'materialised' && termHit(`${r.claim} ${r.planSummary} ${(r.keywords || []).join(' ')}`)).slice(0, 6);
  const planIds = [...new Set([...trackCands.map((r) => r.planId), ...ledgerCands.filter((r) => r.targetType !== 'page').map((r) => r.planId)])];
  const visiblePlans = new Set((await visibleIssues(reader, planIds)).map((i) => String(i.id)));
  const track = trackCands.filter((r) => visiblePlans.has(String(r.planId))).slice(0, 3);
  const ledgerHits = ledgerCands.filter((r) => visiblePlans.has(String(r.planId))).slice(0, 3);

  const refs = {};
  const tag = (prefix, list, kindOf) =>
    list.map((item, i) => {
      const ref = `${prefix}${i + 1}`;
      const { _text, ...rest } = item;
      refs[ref] = {
        title: clip(item.key ? `${item.key}: ${item.title}` : item.title, 160),
        url: item.url,
        kind: kindOf(item),
        docId: item.docId || null,
        date: item.date || null,
        ageYears: yearsAgo(item.date),
        owner: item.owner || null,
        whyEnded: item.whyEnded || '',
        text: clip(_text || '', 1800),
      };
      return { ref, ...rest };
    });

  const evidence = {
    pastPlans: tag('E', plansList, () => 'plan'),
    incidents: tag('I', incidentsList, () => 'incident'),
    openRisks: tag('R', risksList, () => 'risk'),
    confluencePages: tag('P', pagesList, (p) => (p.decisionOrRetro ? 'decision' : 'page')),
    skepticTrackRecord: tag(
      'T',
      track.map((r) => ({
        docId: `i${r.planId}`,
        title: `Skeptic track record: ${r.planKey} ${r.planSummary}`,
        url: `${siteUrl}/browse/${r.planKey}`,
        objectionsThatCameTrue: r.objections.filter((o) => o.outcome === 'came-true').map((o) => o.claim),
        objectionsThatDidNot: r.objections.filter((o) => o.outcome === 'did-not').map((o) => o.claim),
        _text: `${r.planSummary}\n${r.objections.map((o) => `${o.outcome}: ${o.claim}`).join('\n')}`,
        date: String(r.gradedAt || '').slice(0, 10),
      })),
      () => 'track',
    ),
    acceptedRisksThatHappened: tag(
      'L',
      ledgerHits.map((r) => ({
        docId: `i${r.planId}`,
        title: `Accepted risk on ${r.planKey}: ${clip(r.claim, 90)}`,
        url: r.planUrl,
        acceptedAt: String(r.acceptedAt || '').slice(0, 10),
        incidents: (r.incidents || []).map((x) => x.key),
        _text: `${r.claim}\n${r.reason || ''}\nIncidents: ${(r.incidents || []).map((x) => x.key).join(', ')}`,
        date: String(r.materialisedAt || r.acceptedAt || '').slice(0, 10),
      })),
      () => 'ledger',
    ),
    refs,
  };

  const visible = Object.keys(refs).length;
  evidence.coverage = {
    indexState: meta.state,
    indexedDocs: meta.docs || 0,
    usedLiveSearch: needLive,
    candidates,
    visible,
    notVisible: Math.max(0, Math.min(issueIds.length, 40) + Math.min(pageIds.length, scope.confluence ? 25 : 0) - issues.length - pages.length),
    density: scope.density,
    terms: humanTerms,
  };
  return evidence;
}

export const evidenceCount = (ev) =>
  ['pastPlans', 'incidents', 'openRisks', 'confluencePages', 'skepticTrackRecord', 'acceptedRisksThatHappened'].reduce((n, k) => n + (ev[k] || []).length, 0);
