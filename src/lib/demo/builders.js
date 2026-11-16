// Compact builders for demo history, so each company file reads like a project log.
//   epic('Summary', 'shipped' | 'abandoned' | 'in-progress' | 'todo', 'March 2023', 'Owner', 'What it was.', ['child task', ...], { why, comment, commentBy })
// `why` is the reason an abandoned epic stopped; it goes in the description, and `comment` (if any) is
// added as the closing comment. Child tasks become work items under the epic.
export function epic(summary, outcome, when, owner, what, tasks = [], extra = {}) {
  const line =
    outcome === 'shipped'
      ? `Owner: ${owner}. Shipped ${when}.`
      : outcome === 'abandoned'
        ? `Owner: ${owner}. Abandoned ${when}${extra.why ? `: ${extra.why}` : '.'}`
        : outcome === 'in-progress'
          ? `Owner: ${owner}. Started ${when}.`
          : `Proposed ${when}${owner ? ` by ${owner}` : ''}.`;
  return {
    summary,
    outcome,
    text: [what, line, ...(extra.more || [])],
    tasks,
    ...(extra.comment ? { comment: extra.comment, commentBy: extra.commentBy || owner } : {}),
  };
}

// Every work item a company's data creates (epics, their tasks, incidents, risks, plans), for counts.
export const itemCount = (d) => d.epics.length + d.epics.reduce((n, e) => n + (e.tasks || []).length, 0) + d.incidents.length + d.risks.length + d.plans.length;
