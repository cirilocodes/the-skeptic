// Scores the Skeptic's reviews of the labelled evaluation plans and posts the result to the dashboard.
//
//   npm run eval:score
//
// Needs the same environment variables as the seed script. To post the result to the dashboard, also set
// (both are on the Skeptic settings page, Background reviews tab):
//   $env:SKEPTIC_INTAKE_URL="https://...webtrigger..."
//   $env:SKEPTIC_SECRET="..."
//
// What is measured (per plan, objections at medium or above, from the skeptic-ledger property):
//   flagged       the review has at least one such objection
//   correct       an objection cites one of the plan's labelled sources (or, for rule plans, the rule)
//   precision     correct objections / all such objections, across every plan  <- the demo number
//   recall        flag-plans with a correct objection / all flag-plans
//   false flags   clean plans that were flagged;  misses  flag-plans without a correct objection
import { createHmac } from 'crypto';
import { evalPlans } from './plans.mjs';
import { call, clean, issuesWithLabel, PROJECT, requireEnv, signIn, SITE } from '../seed/atlassian.mjs';

const LABEL = 'skeptic-eval';
const RANK = { low: 0, medium: 1, high: 2, critical: 3 };

requireEnv();

const titleCache = new Map();
async function sourceTitle(doc) {
  if (!doc) return null;
  if (titleCache.has(doc)) return titleCache.get(doc);
  let title = null;
  try {
    if (doc.startsWith('i')) title = (await call('GET', `/rest/api/3/issue/${doc.slice(1)}?fields=summary`)).fields.summary;
    else if (doc.startsWith('p')) title = (await call('GET', `/wiki/api/v2/pages/${doc.slice(1)}`)).title;
  } catch {
    title = null;
  }
  titleCache.set(doc, title);
  return title;
}

try {
  await signIn();
  const issues = await issuesWithLabel(LABEL);
  const rows = [];
  let objectionsTotal = 0;
  let objectionsCorrect = 0;
  const ready = [];
  for (const p of evalPlans) {
    const issue = issues.get(p.summary);
    if (!issue) {
      rows.push({ id: p.id, expect: p.expect, status: 'not created' });
      continue;
    }
    let ledger = null;
    try {
      ledger = (await call('GET', `/rest/api/3/issue/${issue.key}/properties/skeptic-ledger`)).value;
    } catch {
      ledger = null;
    }
    if (!ledger) {
      rows.push({ id: p.id, key: issue.key, expect: p.expect, status: 'no review yet' });
      continue;
    }
    if (Number.isFinite(ledger.readyMs)) ready.push(ledger.readyMs);
    const serious = (ledger.objections || []).filter((o) => RANK[o.severity] >= RANK.medium);
    let correct = 0;
    for (const o of serious) {
      const ok = p.rule ? o.kind === 'check' : p.expect === 'flag' && p.sources.includes(await sourceTitle(o.doc));
      if (ok) correct += 1;
    }
    objectionsTotal += serious.length;
    objectionsCorrect += correct;
    rows.push({ id: p.id, key: issue.key, expect: p.expect, flagged: serious.length > 0, correct, serious: serious.length, top: ledger.topSeverity });
  }

  const scored = rows.filter((r) => r.flagged !== undefined);
  const flagPlans = scored.filter((r) => r.expect === 'flag');
  const cleanPlans = scored.filter((r) => r.expect === 'clean');
  const hits = flagPlans.filter((r) => r.correct > 0).length;
  const falseFlags = cleanPlans.filter((r) => r.flagged).length;
  const misses = flagPlans.length - hits;
  const precision = objectionsTotal ? Math.round((1000 * objectionsCorrect) / objectionsTotal) / 10 : 100;
  const recall = flagPlans.length ? Math.round((1000 * hits) / flagPlans.length) / 10 : null;
  ready.sort((a, b) => a - b);
  const readyMedianMs = ready.length ? ready[Math.floor(ready.length / 2)] : null;

  console.log('\nplan  key      expect  result');
  for (const r of rows)
    console.log(
      `${r.id.padEnd(5)} ${String(r.key || '').padEnd(8)} ${r.expect.padEnd(7)} ${
        r.status || `${r.flagged ? `flagged (${r.serious} at medium+, ${r.correct} correct, top ${r.top})` : 'no objections at medium+'}`
      }`,
    );
  console.log(`\nScored ${scored.length} of ${evalPlans.length} plans.`);
  console.log(`Precision ${precision}% (${objectionsCorrect} of ${objectionsTotal} objections at medium or above cite a correct source)`);
  console.log(`Recall ${recall}% · false flags ${falseFlags} of ${cleanPlans.length} clean plans · misses ${misses} of ${flagPlans.length}`);
  if (readyMedianMs !== null) console.log(`Median review ready time ${Math.round(readyMedianMs / 1000)} s`);

  const url = clean(process.env.SKEPTIC_INTAKE_URL);
  const secret = clean(process.env.SKEPTIC_SECRET);
  if (url && secret && scored.length) {
    // Signed, so a copied request can't be replayed: HMAC-SHA256(secret, "<timestamp>.<body>").
    const body = JSON.stringify({ kind: 'eval-result', precision, recall, plans: scored.length, flagged: scored.filter((r) => r.flagged).length, truePositives: hits, falseFlags, misses, readyMedianMs, label: `${PROJECT} labelled set on ${SITE}` });
    const ts = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Skeptic-Timestamp': ts, 'X-Skeptic-Signature': `sha256=${signature}` },
      body,
    });
    console.log(res.ok ? '\nPosted to the Skeptic dashboard.' : `\nCould not post to the dashboard (${res.status}). Check SKEPTIC_INTAKE_URL and SKEPTIC_SECRET.`);
  } else console.log('\nSet SKEPTIC_INTAKE_URL and SKEPTIC_SECRET to show this result on the dashboard.');
} catch (err) {
  console.error(`\nStopped: ${err.message}`);
  process.exit(1);
}
