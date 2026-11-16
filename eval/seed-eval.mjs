// Creates the 40 labelled evaluation plans (eval/plans.mjs) in your Jira project, so the Skeptic reviews
// them exactly as it reviews real work. Run after `npm run seed`, with the same environment variables.
//
//   npm run eval:seed                 create the plans and request a background review for every one
//   npm run eval:seed -- --radar-only create them and let the radar decide which get a full review
//   npm run eval:seed -- --limit 10   only the first 10 (automation runs are limited on free plans)
//
// Then wait until every plan shows a review (the dashboard's "Recent reviews"), and run `npm run eval:score`.
// Before you start: add the freeze window below on the Skeptic settings page (Gate and approvals tab), so the
// two rule plans can be checked:
import { evalPlans, FREEZE } from './plans.mjs';
import { call, createIssue, issuesWithLabel, issueTypes, PROJECT, requireEnv, signIn, sleep, SITE } from '../seed/atlassian.mjs';

const LABEL = 'skeptic-eval';
const args = process.argv.slice(2);
const radarOnly = args.includes('--radar-only');
const limitAt = args.indexOf('--limit');
const limit = limitAt >= 0 ? Number(args[limitAt + 1]) || evalPlans.length : evalPlans.length;

requireEnv();
try {
  const me = await signIn();
  console.log(`Signed in as ${me.displayName} on ${SITE}. Project ${PROJECT}.`);
  console.log(`Freeze window to add on the settings page first:  ${FREEZE}\n`);
  const { epic } = await issueTypes();
  const known = await issuesWithLabel(LABEL);
  let requested = 0;
  for (const p of evalPlans.slice(0, limit)) {
    const isNew = !known.has(p.summary);
    const key = await createIssue({ summary: p.summary, text: p.text, labels: [LABEL], typeId: epic.id, dueDate: p.dueDate || null, known });
    if (!radarOnly) {
      // Give the radar a moment to run first, then ask for a full review regardless of what it found.
      if (isNew) await sleep(4000);
      await call('PUT', `/rest/api/3/issue/${key}`, { update: { labels: [{ add: 'skeptic-review' }] } });
      requested += 1;
      await sleep(1500);
    }
  }
  console.log(`\nCreated or found ${Math.min(limit, evalPlans.length)} plans; full reviews requested for ${requested}.`);
  console.log('Each full review is one automation rule run (three agent runs). Watch progress on the Skeptic dashboard,');
  console.log('then score them with:  npm run eval:score');
} catch (err) {
  console.error(`\nStopped: ${err.message}`);
  process.exit(1);
}
