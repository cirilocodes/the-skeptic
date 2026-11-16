// Per-viewer redaction. A review is written with the permissions of the person (or plan owner) who asked
// for it, but other people can open the same plan. Before showing a review, each cited item is checked
// against the viewer's own permissions; objections citing an item they can't see keep their severity and
// status (so the gate stays explainable) but lose the claim, the source and anything quoted from it.
import { visibleIssues, visiblePages } from './evidence';

const docIdsOf = (list) => (list || []).map((x) => x.docId).filter((d) => typeof d === 'string' && /^[ip]\d+$/.test(d));

export async function visibleDocIds(reader, docIds) {
  const ids = [...new Set(docIds)];
  const issueIds = ids.filter((d) => d[0] === 'i').map((d) => d.slice(1));
  const pageIds = ids.filter((d) => d[0] === 'p').map((d) => d.slice(1));
  const seen = new Set();
  try {
    if (issueIds.length) for (const i of await visibleIssues(reader, issueIds)) seen.add(`i${i.id}`);
  } catch (e) {
    console.warn('visibility check (issues)', e.message);
  }
  try {
    if (pageIds.length) for (const p of await visiblePages(reader, pageIds)) seen.add(`p${p.id}`);
  } catch (e) {
    console.warn('visibility check (pages)', e.message);
  }
  return seen;
}

export const REDACTED_CLAIM = "This objection cites an item you can't see. Ask someone who can see it, or answer it from what you know.";

export function redactObjection(o) {
  return { ...o, claim: REDACTED_CLAIM, sourceTitle: "An item you can't see", sourceUrl: null, sourceQuote: '', talkTo: '', redacted: true };
}

// Returns a copy of the review with everything the viewer can't see removed or redacted.
export async function reviewForViewer(review, reader) {
  if (!review) return review;
  const ids = [...docIdsOf(review.objections), ...docIdsOf(review.handled), ...docIdsOf(review.worthAsking)];
  if (!ids.length) return review;
  const seen = await visibleDocIds(reader, ids);
  const ok = (x) => !x.docId || !/^[ip]\d+$/.test(x.docId) || seen.has(x.docId);
  return {
    ...review,
    objections: (review.objections || []).map((o) => (ok(o) ? o : redactObjection(o))),
    handled: (review.handled || []).filter(ok),
    worthAsking: (review.worthAsking || []).filter(ok),
    redactedCount: (review.objections || []).filter((o) => !ok(o)).length,
  };
}
