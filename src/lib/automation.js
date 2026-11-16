// Background reviews through Jira automation.
//
// Rovo agents run by an automation rule can call read actions (find-evidence) but not write actions, so the
// rule posts each agent reply to the Skeptic's web trigger. The rule runs the agent three times
// (independent runs), posting each one; the Skeptic waits for all of them (or a timeout), then takes the
// majority view. Every run must use the evidence pack built in the same session, and the plan must not
// have changed since.
//
// Race-free by construction: each run is stored under its own key, and finalising is claimed once with a
// fail-if-exists key, so runs that arrive at the same moment (or a retried web request) can't lose a run
// or save the review twice.
import { kvs } from '@forge/kvs';
import { appClient } from './http';
import { buildPack, saveDraft, saveFromRuns } from './review';
import { getProfile, scopeFor } from './profile';
import { markSeen, recordError } from './health';
import { batchDelete, getEvidence, getProgress, getReview, listByPrefix, setProgress } from './store';
import { getSiteUrl, resolveTarget } from './targets';
import { fnv1a } from './text';

export const EVIDENCE_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const DAY = { value: 1, unit: 'DAYS' };

const packId = (pack) => fnv1a(pack.gatheredAt);
const runPrefix = (tk, pid) => `run:${tk}:${pid}:`;
const doneKey = (tk, pid) => `done:${tk}:${pid}`;

export async function targetForKey(tk) {
  const app = appClient();
  const siteUrl = await getSiteUrl(app);
  return resolveTarget(app, String(tk).startsWith('page:') ? { pageId: tk.slice(5), siteUrl } : { planKey: tk, siteUrl });
}

async function storedRuns(tk, pid) {
  return (await listByPrefix(runPrefix(tk, pid), 10)).map((r) => r.value);
}

export async function acceptRun({ target, tk, run, runs: many, runNumber, settings }) {
  const pack = await getEvidence(tk);
  if (!pack || Date.now() - Date.parse(pack.gatheredAt) > EVIDENCE_MAX_AGE_MS) {
    await recordError('intake', { code: 'HTTP 409', message: `A reply for ${target?.key || tk} arrived, but the agent had not called find-evidence in the same run. Check the prompt in the rule.` });
    return { status: 409, body: { error: 'No fresh evidence for this plan. The agent must call find-evidence in the same run.' } };
  }
  if (pack.planHash !== target.hash) return { status: 409, body: { error: 'The plan changed after the evidence was gathered. The next run will pick it up.' } };
  const pid = packId(pack);

  // Fast setup: one agent step wrote all its passes in one reply ({"runs":[...]}), or was asked to
  // ("run": "all") and wrote one. Either way there is nothing to wait for: save at once.
  if ((Array.isArray(many) && many.length > 1) || runNumber === 'all') {
    try {
      await kvs.set(doneKey(tk, pid), Date.now(), { keyPolicy: 'FAIL_IF_EXISTS', ttl: DAY });
    } catch {
      return { status: 200, body: { accepted: false, note: 'This review was already finalised.' } };
    }
    await markSeen('intake', { tk, run: 'all' });
    const passes = (Array.isArray(many) && many.length ? many : [run]).slice(0, 3);
    return { status: 200, body: await saveFromRuns({ target, pack, runs: passes, requestedBy: 'automation', channel: 'automation', settings }) };
  }
  if (await kvs.get(doneKey(tk, pid))) return { status: 200, body: { accepted: false, note: 'This review was already finalised.' } };
  await markSeen('intake', { tk, run: runNumber || null });

  const n = Number(runNumber) >= 1 && Number(runNumber) <= 5 ? String(Number(runNumber)) : `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await kvs.set(`${runPrefix(tk, pid)}${n}`, run, { ttl: DAY });
  const count = (await storedRuns(tk, pid)).length;
  const expected = settings.automationRuns || 3;
  await setProgress(tk, 'agent', { runs: Math.min(count, expected), expected });
  if (count < expected) return { status: 202, body: { accepted: true, run: n, waitingFor: expected - count } };
  const result = await finalizeStoredRuns(tk, settings, { target });
  return { status: 200, body: result || { accepted: true, note: 'Another request is finalising this review.' } };
}

export async function finalizeStoredRuns(tk, settings, { target = null, timedOut = false } = {}) {
  const pack = await getEvidence(tk);
  const pid = pack ? packId(pack) : null;
  const runs = pid ? await storedRuns(tk, pid) : [];
  if (!runs.length) {
    const progress = await getProgress(tk);
    if (!timedOut || !progress || progress.done) return null;
    // No agent reply arrived in time. Rather than leave the panel empty, write a labelled draft from the
    // strongest precedents (no AI), and say why.
    await recordError('automation', { code: 'no-reply', message: `No agent reply for ${tk} within the time limit. Check the rule's audit log.` });
    if (settings.draftFallback !== false) {
      const t = target || (await targetForKey(tk));
      // A full review of this exact text is still valid: keep it rather than replace it with a draft.
      const current = await getReview(tk);
      if (current && !current.draft && current.planHash === t.hash) {
        await setProgress(tk, 'failed', { error: 'No agent reply arrived this time, so the last full review is still shown. Check the automation rule audit log.' });
        return null;
      }
      // The agent may never have started (so no evidence pack). Gather evidence the way automation does:
      // as the app, limited to what the plan's owner can see.
      let usable = pack && pack.planHash === t.hash ? pack : null;
      if (!usable && t.ownerAccountId) {
        const reader = { c: appClient(), mode: 'owner-filtered', accountId: t.ownerAccountId };
        const profile = await getProfile();
        usable = (await buildPack({ reader, target: t, settings, scope: scopeFor(settings, profile), siteUrl: await getSiteUrl(reader.c), reuse: false })).pack;
      }
      if (usable) {
        try {
          await kvs.set(doneKey(tk, packId(usable)), Date.now(), { keyPolicy: 'FAIL_IF_EXISTS', ttl: DAY });
        } catch {
          return null;
        }
        const result = await saveDraft({ target: t, pack: usable, requestedBy: 'automation', settings });
        return { ...result, runsUsed: 0, timedOut, draft: true };
      }
    }
    await setProgress(tk, 'failed', { error: 'No agent reply arrived. Check the automation rule audit log, or use Discuss in Rovo chat.' });
    return null;
  }
  try {
    await kvs.set(doneKey(tk, pid), Date.now(), { keyPolicy: 'FAIL_IF_EXISTS', ttl: DAY });
  } catch {
    return null; // already finalised, or another invocation is doing it right now
  }
  const t = target || (await targetForKey(tk));
  const result = await saveFromRuns({ target: t, pack, runs, requestedBy: 'automation', channel: 'automation', settings });
  await batchDelete((await listByPrefix(runPrefix(tk, pid), 10)).map((r) => r.key));
  return { ...result, runsUsed: runs.length, timedOut };
}
