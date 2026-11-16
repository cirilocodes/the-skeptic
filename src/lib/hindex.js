// The history index: a small inverted index of the organisation's past work, kept in Forge KVS.
//
// Why: live JQL/CQL text search is slow (several seconds per source) and noisy. The index is built once
// in the background (queue jobs on install, or the admin "Rebuild" button) and kept current by product
// events, so a review starts with ranked candidates in well under a second.
//
// Layout (all keys are race-free: every posting is its own key, so parallel events never overwrite each other):
//   idx:meta                -> { docs, state, jira:{indexed,done}, confluence:{indexed,done}, updatedAt }
//   idx:d:<docId>           -> document summary (title, kind, category, outcome, date, terms)
//   idx:p:<term>:<docId>    -> term weight (1..10)
// docId is "i<issueId>" for work items and "p<pageId>" for pages.
//
// Privacy: the index is built with the app's identity, so it can contain items some users cannot see.
// It is never shown directly: every candidate is re-read with the asking user's permissions before it
// can be cited (see evidence.js).
import { kvs, WhereConditions } from '@forge/kvs';
import { batchDelete, batchGet, batchSet } from './store';
import { adfToText, clip, stripHtml, termWeights } from './text';

const META = 'idx:meta';
// Bump when tokenising or stemming changes: older indexes are rebuilt automatically (jobs.js).
export const INDEX_VERSION = 2;
const docKey = (id) => `idx:d:${id}`;
const postPrefix = (term) => `idx:p:${term}:`;
const postKey = (term, id) => `${postPrefix(term)}${id}`;

export const DECISION_LIKE =
  /\b(decision|decided|dec-\d+|adr|retro|retrospective|post-?mortem|lessons learn|why we stopped|why we killed|we will not|ruled out)\b/i;
const DECISION_OPENING = /\b(decision record|decided on|we decided|retro(spective)?|post-?mortem|lessons learn|why we stopped)\b/i;

// A page is a decision or retro if its title says so, or it opens like one. A page that merely mentions
// a decision ("see DEC-014") is not.
export const isDecisionLike = (title, text) => DECISION_LIKE.test(String(title || '')) || DECISION_OPENING.test(String(text || '').slice(0, 240));
const ABANDON_STATUS = /\b(cancel+ed|cancel|abandon|won'?t|reject|declin|stopp|discontinu|obsolete|killed|dropped)/i;

export async function getMeta() {
  return (await kvs.get(META)) || { docs: 0, state: 'empty', jira: { indexed: 0, done: false }, confluence: { indexed: 0, done: false } };
}

export async function updateMeta(patch) {
  const meta = await getMeta();
  const next = {
    ...meta,
    ...patch,
    jira: { ...meta.jira, ...(patch.jira || {}) },
    confluence: { ...meta.confluence, ...(patch.confluence || {}) },
    updatedAt: new Date().toISOString(),
  };
  if (next.jira.done && (next.confluence.done || patch.confluenceUnavailable)) next.state = 'ready';
  await kvs.set(META, next);
  return next;
}

export function outcomeOf(fields, abandonedLabels = []) {
  const labels = (fields.labels || []).map((l) => String(l).toLowerCase());
  const abandonSet = new Set(abandonedLabels.length ? abandonedLabels : ['abandoned', 'cancelled', 'canceled', 'stopped']);
  if (labels.some((l) => abandonSet.has(l))) return 'abandoned';
  if (labels.includes('shipped') || labels.includes('released')) return 'shipped';
  const res = String(fields.resolution?.name || '');
  const status = String(fields.status?.name || '');
  if (ABANDON_STATUS.test(res) || ABANDON_STATUS.test(status)) return 'abandoned';
  const cat = fields.status?.statusCategory?.key;
  if (cat === 'done') return 'done';
  if (cat === 'indeterminate') return 'in progress';
  return 'not started';
}

export function categoryOf(fields, scope) {
  const type = String(fields.issuetype?.name || '').toLowerCase();
  const labels = (fields.labels || []).map((l) => String(l).toLowerCase());
  if (labels.includes('risk') || labels.includes('risks') || type === 'risk' || type === 'risks') return 'risk';
  if (labels.includes('incident') || (scope.incidentTypes || []).map((n) => n.toLowerCase()).includes(type)) return 'incident';
  if ((scope.planTypes || []).map((n) => n.toLowerCase()).includes(type)) return 'plan';
  return 'other';
}

export function commentsText(fields, max = 3) {
  const list = fields.comment?.comments || [];
  return list
    .slice(-max)
    .map((c) => adfToText(c.body))
    .join('\n');
}

// A work item as an index document.
export function issueDoc(issue, scope, settings = {}) {
  const f = issue.fields || {};
  const description = adfToText(f.description);
  const comments = commentsText(f);
  const cat = categoryOf(f, scope);
  return {
    id: `i${issue.id}`,
    kind: 'issue',
    iid: String(issue.id),
    key: issue.key,
    title: clip(f.summary || issue.key, 200),
    cat,
    type: f.issuetype?.name || '',
    outcome: outcomeOf(f, settings.abandonedLabels),
    statusCat: f.status?.statusCategory?.key || 'new',
    project: f.project?.key || '',
    date: f.resolutiondate || f.updated || f.created || null,
    owner: f.assignee?.displayName || null,
    terms: termWeights(f.summary || '', `${description}\n${comments}`, 24),
  };
}

// A Confluence page as an index document (body from the v2 API in storage format).
export function pageDoc(page) {
  const text = stripHtml(page.body?.storage?.value || '');
  return {
    id: `p${page.id}`,
    kind: 'page',
    pid: String(page.id),
    title: clip(page.title || 'Untitled page', 200),
    cat: isDecisionLike(page.title, text) ? 'decision' : 'page',
    spaceId: page.spaceId ? String(page.spaceId) : null,
    date: page.version?.createdAt || page.createdAt || null,
    terms: termWeights(page.title || '', text, 24),
  };
}

// Index (or re-index) documents. Postings for terms a document no longer has are removed.
export async function indexDocs(docs) {
  if (!docs.length) return { indexed: 0, added: 0 };
  const previous = await batchGet(docs.map((d) => docKey(d.id)));
  const sets = [];
  const deletes = [];
  let added = 0;
  for (const d of docs) {
    const prev = previous.get(docKey(d.id));
    if (!prev) added += 1;
    for (const term of Object.keys(prev?.terms || {})) if (!(term in d.terms)) deletes.push(postKey(term, d.id));
    for (const [term, w] of Object.entries(d.terms)) if (prev?.terms?.[term] !== w) sets.push({ key: postKey(term, d.id), value: w });
    sets.push({ key: docKey(d.id), value: d });
  }
  if (deletes.length) await batchDelete(deletes);
  await batchSet(sets);
  if (added) {
    const meta = await getMeta();
    await kvs.set(META, { ...meta, docs: (meta.docs || 0) + added, state: meta.state === 'empty' ? 'partial' : meta.state, updatedAt: new Date().toISOString() });
  }
  return { indexed: docs.length, added };
}

export async function unindex(docId) {
  const prev = await kvs.get(docKey(docId));
  if (!prev) return false;
  await batchDelete([...Object.keys(prev.terms || {}).map((t) => postKey(t, docId)), docKey(docId)]);
  const meta = await getMeta();
  await kvs.set(META, { ...meta, docs: Math.max(0, (meta.docs || 1) - 1), updatedAt: new Date().toISOString() });
  return true;
}

export const getDoc = (docId) => kvs.get(docKey(docId));

// A page of indexed document ids, for the nightly reconciliation (resumes from a cursor).
export async function docIdsPage(cursor, limit = 50) {
  let q = kvs.query().where('key', WhereConditions.beginsWith('idx:d:')).limit(limit);
  if (cursor) q = q.cursor(cursor);
  const page = await q.getMany();
  return { ids: (page.results || []).map((r) => r.key.slice(6)), next: page.nextCursor || null };
}

export const indexReady = (meta) => meta?.state === 'ready' && meta?.version === INDEX_VERSION;

// Deletes up to `max` index keys (documents and postings, not the meta record). Returns true if more remain.
export async function clearIndexChunk(max = 500) {
  const page = await kvs.query().where('key', WhereConditions.beginsWith('idx:')).limit(100).getMany();
  let keys = (page.results || []).map((r) => r.key).filter((k) => k !== META);
  let cursor = page.nextCursor;
  while (cursor && keys.length < max) {
    const next = await kvs.query().where('key', WhereConditions.beginsWith('idx:')).limit(100).cursor(cursor).getMany();
    keys = keys.concat((next.results || []).map((r) => r.key).filter((k) => k !== META));
    cursor = next.nextCursor;
  }
  await batchDelete(keys.slice(0, max));
  return keys.length >= max || !!cursor;
}

// BM25-style ranking over the posting lists of the query terms.
// qterms: { term: queryWeight }. Returns ranked [{ doc, score, matched }].
export async function searchIndex(qterms, opts = {}) {
  return (await searchIndexMany([qterms], [opts.limit ?? 40], opts))[0];
}

// Several rankings over one fetch of the posting lists: each query's terms are read once even when
// the queries share them. Returns one ranked list per query.
export async function searchIndexMany(queries, limits, { exclude = new Set(), minScore = 0.4 } = {}) {
  const terms = [...new Set(queries.flatMap((q) => Object.keys(q || {})))];
  if (!terms.length) return queries.map(() => []);
  const meta = await getMeta();
  const lists = await Promise.all(
    terms.map(async (term) => {
      try {
        const page = await kvs.query().where('key', WhereConditions.beginsWith(postPrefix(term))).limit(100).getMany();
        const results = page.results || [];
        return { term, results, df: results.length + (page.nextCursor ? 100 : 0) };
      } catch {
        return { term, results: [], df: 0 };
      }
    }),
  );
  const N = Math.max(meta.docs || 0, ...lists.map((l) => l.df * 2), 10);
  const rankings = queries.map((qterms, qi) => {
    const scores = new Map();
    for (const { term, results, df } of lists) {
      const qw = qterms?.[term];
      if (!df || !qw) continue;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      for (const r of results) {
        const id = r.key.slice(postPrefix(term).length);
        if (exclude.has(id)) continue;
        const w = Number(r.value) || 1;
        const s = scores.get(id) || { score: 0, matched: [] };
        s.score += qw * idf * ((w * 2.2) / (w + 1.2)) * 0.1;
        s.matched.push(term);
        scores.set(id, s);
      }
    }
    const sorted = [...scores.entries()].sort((a, b) => b[1].score - a[1].score);
    const top = sorted.length ? sorted[0][1].score : 0;
    // Absolute floor plus a relative one: weak tail matches are noise once something strong is found.
    return sorted.filter(([, s]) => s.score >= Math.max(minScore, top * 0.2)).slice(0, limits[qi] ?? 40);
  });
  const docs = await batchGet([...new Set(rankings.flat().map(([id]) => docKey(id)))]);
  return rankings.map((ranked) =>
    ranked.map(([id, s]) => ({ doc: docs.get(docKey(id)), score: Math.round(s.score * 100) / 100, matched: s.matched })).filter((r) => r.doc),
  );
}
