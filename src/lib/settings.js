// App settings, stored in Forge KVS and edited only on the Jira admin page.
// Every setting has a safe default so the Skeptic works on any site straight after install;
// the site profile (profile.js) fills in what can be detected (plan issue types, incident types).
import { kvs } from '@forge/kvs';
import { isIsoDate } from './text';

const KEY = 'config:settings';
const SECRET_KEY = 'config:intake-secret';

export const SEVERITIES = ['low', 'medium', 'high', 'critical'];
export const sevRank = (s) => Math.max(0, SEVERITIES.indexOf(s));

export const DEFAULTS = {
  // Scope
  planIssueTypes: [], // issue type names reviewed as plans; empty = detected (epic-level types)
  projectKeys: [], // empty = every project
  proposalLabel: 'proposal', // Confluence pages with this label (or "Proposal" in the title) are prepared in the background
  // Background work
  radarEnabled: true, // deterministic check of new and edited plans (no AI, no cost)
  autoReview: true, // ask the automation rule for a full review when a plan is created or its text changes
  automationReady: false, // the admin confirms the automation rule exists (see the admin page)
  automationRuns: 3, // independent agent runs per background review; majority vote across them
  setupMode: 'fast', // 'fast': one agent step writes all passes in one reply; 'thorough': one agent step per pass
  draftFallback: true, // if no agent reply arrives in time, write a labelled draft from history (no AI)
  demoMode: false, // show the guided tour banner in the panel
  sweepEnabled: true,
  radarComments: true,
  // Evidence sources
  riskJql: '', // extra JQL for open risks; empty = labels risk/risks (and the Risk issue type if it exists)
  incidentTypes: [], // empty = detected (Bug, Incident, Problem ...)
  abandonedLabels: ['abandoned', 'cancelled', 'canceled', 'stopped', 'wontdo', 'rejected'],
  indexLimit: 3000, // issues indexed by the backfill (most recently updated first)
  // Deterministic rules
  freezeWindows: [], // [{ name, start, end }] ISO dates
  overloadThreshold: 15, // open work items per owner before "overloaded" is flagged; 0 = off
  // Gate
  gateMinSeverity: 'medium', // objections below this are shown but never block
  requireReviewOnHigh: true, // block a plan the radar rates "high" until a review exists
  approvers: [], // account IDs allowed to sign off high/critical risk acceptance; empty = anyone except the author
  backupApprover: '', // account ID asked when the named approver has not answered
  reminderHours: 24,
  backupAfterHours: 48,
  // Notifications
  notifyMinSeverity: 'high', // below this, findings go to the daily digest instead of a mention
  digestSpaceKey: '', // Confluence space for the daily digest page (keys and counts only)
  decisionSpaceKey: '', // Confluence space for decision records written from Jira plans
  mitigationProjectKey: '', // Jira project for mitigation tasks raised from Confluence proposals
};

const str = (v, max = 64) => String(v ?? '').trim().slice(0, max);
const upperList = (v, max = 30) =>
  (Array.isArray(v) ? v : String(v || '').split(/[,;\s]+/))
    .map((x) => str(x, 32).toUpperCase())
    .filter((x) => /^[A-Z][A-Z0-9_]*$/.test(x))
    .slice(0, max);
const nameList = (v, max = 20) =>
  (Array.isArray(v) ? v : String(v || '').split(/[,\n]/))
    .map((x) => str(x, 60))
    .filter(Boolean)
    .slice(0, max);
const idList = (v, max = 20) =>
  (Array.isArray(v) ? v : String(v || '').split(/[,\n]/))
    .map((x) => (typeof x === 'object' ? x?.id || x?.accountId : x))
    .map((x) => str(x, 128))
    .filter((x) => /^[A-Za-z0-9:_-]{6,128}$/.test(x))
    .slice(0, max);
const int = (v, lo, hi, d) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const sev = (v, d) => (SEVERITIES.includes(v) ? v : d);

// Freeze windows arrive from the admin page as lines: "Peak season: 2026-12-01 to 2027-01-10".
export function parseFreezeWindows(v) {
  const lines = Array.isArray(v) ? v : String(v || '').split('\n');
  const out = [];
  for (const line of lines) {
    if (line && typeof line === 'object') {
      if (isIsoDate(line.start) && isIsoDate(line.end) && line.start <= line.end)
        out.push({ name: str(line.name || 'Freeze', 60), start: line.start, end: line.end });
      continue;
    }
    const m = String(line).match(/^\s*(.*?)[:\s]*\b(\d{4}-\d{2}-\d{2})\s*(?:to|-|–|\.\.)\s*(\d{4}-\d{2}-\d{2})\s*$/i);
    if (m && isIsoDate(m[2]) && isIsoDate(m[3]) && m[2] <= m[3]) out.push({ name: str(m[1] || 'Freeze', 60).replace(/[:\s]+$/, '') || 'Freeze', start: m[2], end: m[3] });
  }
  return out.slice(0, 12);
}

const CLEAN = {
  planIssueTypes: (v) => nameList(v),
  projectKeys: (v) => upperList(v),
  proposalLabel: (v) => str(v, 40).toLowerCase().replace(/\s+/g, '-'),
  radarEnabled: Boolean,
  autoReview: Boolean,
  automationReady: Boolean,
  automationRuns: (v) => int(v, 1, 3, 3),
  setupMode: (v) => (v === 'thorough' ? 'thorough' : 'fast'),
  draftFallback: Boolean,
  demoMode: Boolean,
  sweepEnabled: Boolean,
  radarComments: Boolean,
  riskJql: (v) => str(v, 400),
  incidentTypes: (v) => nameList(v),
  abandonedLabels: (v) => nameList(v).map((x) => x.toLowerCase()),
  indexLimit: (v) => int(v, 100, 20000, 3000),
  freezeWindows: parseFreezeWindows,
  overloadThreshold: (v) => int(v, 0, 500, 15),
  gateMinSeverity: (v) => sev(v, 'medium'),
  requireReviewOnHigh: Boolean,
  approvers: (v) => idList(v),
  backupApprover: (v) => idList([v], 1)[0] || '',
  reminderHours: (v) => int(v, 1, 240, 24),
  backupAfterHours: (v) => int(v, 2, 480, 48),
  notifyMinSeverity: (v) => sev(v, 'high'),
  digestSpaceKey: (v) => upperList([v], 1)[0] || '',
  decisionSpaceKey: (v) => upperList([v], 1)[0] || '',
  mitigationProjectKey: (v) => upperList([v], 1)[0] || '',
};

export async function getSettings() {
  const saved = (await kvs.get(KEY)) || {};
  return { ...DEFAULTS, ...saved };
}

export function cleanSettings(input = {}) {
  const clean = {};
  for (const k of Object.keys(DEFAULTS)) if (k in input) clean[k] = CLEAN[k](input[k]);
  if (clean.backupAfterHours && clean.reminderHours && clean.backupAfterHours <= clean.reminderHours)
    clean.backupAfterHours = clean.reminderHours * 2;
  return clean;
}

export async function saveSettings(input) {
  const next = { ...(await getSettings()), ...cleanSettings(input) };
  await kvs.set(KEY, next);
  return next;
}

function newSecret() {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Shared secret the automation rule (and the eval script) send, so only they can post to the web trigger.
export async function getIntakeSecret({ rotate = false } = {}) {
  let secret = rotate ? null : await kvs.getSecret(SECRET_KEY);
  if (!secret && !rotate) {
    // v1 kept the secret in plain storage: move it to encrypted storage so existing rules keep working.
    const legacy = await kvs.get(SECRET_KEY);
    if (legacy) {
      await kvs.setSecret(SECRET_KEY, legacy);
      await kvs.delete(SECRET_KEY);
      return legacy;
    }
  }
  if (!secret) {
    secret = newSecret();
    await kvs.setSecret(SECRET_KEY, secret);
  }
  return secret;
}

export function safeEqual(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  if (!x || x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
