// Deterministic rules: exact checks that need no AI and cannot be argued with.
//   freeze  - the plan's due date (or earliest fix-version release) falls inside a configured freeze window
//   blocker - the plan "is blocked by" a work item that is not done
//   load    - the plan's owner already has more open work than the configured threshold
// Each finding becomes an objection with a C ref. Each check is also reported as "checked", so a
// review with no objections still shows what was looked at.
import { approxCount } from './profile';
import { visibleIssues } from './evidence';
import { appClient } from './http';
import { plural } from './text';

export function freezeClash(dueDate, windows) {
  if (!dueDate) return null;
  const d = String(dueDate).slice(0, 10);
  return (windows || []).find((w) => d >= w.start && d <= w.end) || null;
}

export function openBlockers(links) {
  return (links || []).filter(
    (l) => l.direction === 'inward' && (/^blocks$/i.test(l.type) || /blocked by/i.test(l.inward)) && l.statusCategory !== 'done' && l.key,
  );
}

export async function runRules({ target, settings, reader, siteUrl }) {
  const findings = [];
  const checks = [];
  if (target.type !== 'issue') {
    checks.push({ rule: 'rules', label: 'Freeze windows, blockers, owner load', result: 'skipped', detail: 'Rules apply to Jira plans.' });
    return { findings, checks };
  }
  const add = (f) => findings.push({ ref: `C${findings.length + 1}`, sourceKind: 'check', ...f });

  // Freeze windows
  const windows = settings.freezeWindows || [];
  if (!windows.length) checks.push({ rule: 'freeze', label: 'Freeze windows', result: 'skipped', detail: 'No freeze windows configured.' });
  else if (!target.dueDate) checks.push({ rule: 'freeze', label: 'Freeze windows', result: 'skipped', detail: 'The plan has no due date or release date.' });
  else {
    const w = freezeClash(target.dueDate, windows);
    checks.push({ rule: 'freeze', label: 'Freeze windows', result: w ? 'flag' : 'ok', detail: w ? `${target.dueDate} is inside ${w.name}.` : `${target.dueDate} is clear of ${plural(windows.length, 'window')}.` });
    if (w)
      add({
        rule: 'freeze',
        title: `Freeze window: ${w.name} (${w.start} to ${w.end})`,
        url: target.url,
        claim: `The plan is due on ${target.dueDate}, inside the ${w.name} freeze (${w.start} to ${w.end}), when changes cannot ship.`,
        factors: { impact: 3, likelihood: 5, reversibility: 2, mitigation: 0 },
        satisfiedBy: 'Move the date outside the freeze, or get a named exception.',
      });
  }

  // Open blockers (only ones the reader can see are named)
  const blockers = openBlockers(target.links);
  if (!blockers.length) checks.push({ rule: 'blocker', label: 'Open blockers', result: 'ok', detail: 'Nothing open blocks this plan.' });
  else {
    const visible = reader?.c ? new Set((await visibleIssues(reader, blockers.map((b) => b.id))).map((i) => String(i.id))) : new Set();
    const shown = blockers.filter((b) => visible.has(String(b.id)));
    checks.push({ rule: 'blocker', label: 'Open blockers', result: 'flag', detail: `${plural(blockers.length, 'open blocker')}.` });
    for (const b of shown.slice(0, 3))
      add({
        rule: 'blocker',
        title: `${b.key} blocks this plan`,
        url: `${siteUrl}/browse/${b.key}`,
        docId: `i${b.id}`,
        claim: `${b.key} blocks this plan and is not done yet, so work started now would wait on it.`,
        factors: { impact: 2, likelihood: 4, reversibility: 2, mitigation: 0 },
        satisfiedBy: `Finish ${b.key}, remove the link if it no longer applies, or plan around it.`,
      });
    if (blockers.length > shown.length && !shown.length)
      add({
        rule: 'blocker',
        title: 'Blocked by work you cannot see',
        url: target.url,
        claim: `This plan is blocked by ${plural(blockers.length, 'open work item')} you don't have access to.`,
        factors: { impact: 2, likelihood: 4, reversibility: 2, mitigation: 0 },
        satisfiedBy: 'Ask the plan owner whether the blockers are still open.',
      });
  }

  // Owner load
  const ownerId = target.assigneeAccountId || target.ownerAccountId;
  if (!settings.overloadThreshold) checks.push({ rule: 'load', label: 'Owner workload', result: 'skipped', detail: 'Turned off.' });
  else if (!ownerId) checks.push({ rule: 'load', label: 'Owner workload', result: 'skipped', detail: 'The plan has no owner.' });
  else {
    const n = await approxCount(appClient(), `assignee = "${ownerId}" AND statusCategory != Done`);
    if (n === null) checks.push({ rule: 'load', label: 'Owner workload', result: 'skipped', detail: 'Could not count open work.' });
    else {
      const over = n > settings.overloadThreshold;
      checks.push({ rule: 'load', label: 'Owner workload', result: over ? 'flag' : 'ok', detail: `${plural(n, 'open item')}; threshold ${settings.overloadThreshold}.` });
      if (over)
        add({
          rule: 'load',
          title: `Owner has ${n} open work items`,
          url: `${siteUrl}/issues/?jql=${encodeURIComponent(`assignee = "${ownerId}" AND statusCategory != Done`)}`,
          claim: `${target.assigneeName || 'The owner'} already has ${n} open work items (the limit is ${settings.overloadThreshold}), so this plan competes for the same time.`,
          factors: { impact: 3, likelihood: 3, reversibility: 1, mitigation: 0 },
          satisfiedBy: 'Name a second owner, or close or hand over existing work.',
        });
    }
  }
  if (!target.assigneeAccountId) checks.push({ rule: 'owner', label: 'Named owner', result: 'flag', detail: 'No assignee yet.' });
  return { findings, checks };
}
