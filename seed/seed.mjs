// Seeds the Kestrel Freight demo history into your Jira project and Confluence space.
//
// In your own PowerShell window, from the project folder (never paste the token into chat):
//   $env:ATLASSIAN_SITE="one-atlas-ojhi.atlassian.net"
//   $env:ATLASSIAN_EMAIL="you@example.com"
//   $env:ATLASSIAN_API_TOKEN="your-token"
//   $env:JIRA_PROJECT_KEY="KF"
//   $env:CONFLUENCE_SPACE_KEY="KF"
//   npm run seed
//   Remove-Item Env:ATLASSIAN_API_TOKEN
//
// Safe to re-run: items that already exist (same title, label kf-seed) are skipped, so running it again
// after upgrading adds only what is new (v2 adds past incidents and due dates).
import * as kestrel from './data.mjs';
import * as pinecrest from './data-software.mjs';

// The simplest way to load a demo company is the Skeptic settings page (Demo data tab). This script does the
// same from your computer. Set $env:SKEPTIC_DEMO="pinecrest" for the second company (no Confluence).
const DEMO = process.env.SKEPTIC_DEMO === 'pinecrest' ? pinecrest : kestrel;
const { epics, incidents, pages, plans, risks } = DEMO;
import { adf, call, createIssue, issuesWithLabel, issueTypes, moveTo, PROJECT, requireEnv, signIn, SITE, SPACE } from './atlassian.mjs';

const LABEL = 'kf-seed';
requireEnv();

async function seedJira() {
  console.log(`\nJira project ${PROJECT}`);
  const { epic, task, bug } = await issueTypes();
  const known = await issuesWithLabel(LABEL);

  // History is labelled skeptic-ignore so the radar doesn't comment on old work while seeding.
  for (const e of epics) {
    const isNew = !known.has(e.summary);
    const labels = [LABEL, 'skeptic-ignore', ...(e.outcome === 'shipped' ? ['shipped'] : e.outcome === 'abandoned' ? ['abandoned'] : [])];
    const key = await createIssue({ summary: e.summary, text: e.text, labels, typeId: epic.id, known });
    if (isNew && e.comment) await call('POST', `/rest/api/3/issue/${key}/comment`, { body: adf([`${e.commentBy ? `${e.commentBy}: ` : ''}${e.comment}`]) }).catch(() => null);
    if (isNew && (e.outcome === 'shipped' || e.outcome === 'abandoned')) await moveTo(key, 'done');
    if (isNew && e.outcome === 'in-progress') await moveTo(key, 'indeterminate');
  }

  for (const x of incidents) {
    const isNew = !known.has(x.summary);
    const labels = [LABEL, 'skeptic-ignore', ...(bug ? [] : ['incident'])];
    const key = await createIssue({ summary: x.summary, text: x.text, labels, typeId: (bug || task).id, known });
    if (isNew) await moveTo(key, 'done');
  }

  for (const r of risks) await createIssue({ summary: r.summary, text: r.text, labels: [LABEL, 'risk', 'skeptic-ignore'], typeId: task.id, known });

  const planKeys = {};
  for (const p of plans) {
    const existing = known.get(p.summary);
    planKeys[p.key] = await createIssue({ summary: p.summary, text: p.text, labels: [LABEL, 'plan'], typeId: epic.id, dueDate: p.dueDate, known });
    if (existing && p.dueDate) {
      // v1 created the plans without due dates; add them so the freeze-window rule has something to check.
      await call('PUT', `/rest/api/3/issue/${existing.key}`, { fields: { duedate: p.dueDate } }).catch(() => null);
    }
  }
  return planKeys;
}

async function seedConfluence() {
  console.log(`\nConfluence space ${SPACE}`);
  const spaces = await call('GET', `/wiki/api/v2/spaces?keys=${encodeURIComponent(SPACE)}`);
  const space = spaces.results?.[0];
  if (!space) throw new Error(`Confluence space ${SPACE} not found. Create it first (see the setup guide).`);
  for (const p of pages) {
    const found = await call('GET', `/wiki/api/v2/pages?space-id=${space.id}&title=${encodeURIComponent(p.title)}&status=current`);
    if (found.results?.length) {
      console.log(`  = ${p.title} (already there)`);
      continue;
    }
    await call('POST', '/wiki/api/v2/pages', { spaceId: space.id, status: 'current', title: p.title, body: { representation: 'storage', value: p.html } });
    console.log(`  + ${p.title}`);
  }
}

try {
  const me = await signIn();
  console.log(`Signed in as ${me.displayName} on ${SITE}`);
  if (pages.length) await seedConfluence();
  const planKeys = await seedJira();
  console.log(`\nDone (${DEMO.company.name}). Demo plans to review:`);
  for (const [k, key] of Object.entries(planKeys)) console.log(`  ${k}: https://${SITE}/browse/${key}`);
  console.log('\nThe Skeptic indexes new items from product events within a minute. If you seeded before installing v2,');
  console.log('open the Skeptic settings page and click "Rebuild the index".');
} catch (err) {
  console.error(`\nSeeding stopped: ${err.message}`);
  process.exit(1);
}
