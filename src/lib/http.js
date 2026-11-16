// Product API clients.
//
// Security rule: evidence is always gathered with the *user's* permissions when a user is present,
// so the Skeptic can never cite a project, issue or page the person asking is not allowed to see.
// The app identity (asApp) is used only for the app's own bookkeeping (comments, properties) and in
// background contexts (triggers, validator) that do not read or reveal evidence.
import api, { route } from '@forge/api';

// Retry policy: Jira and Confluence answer 429 (rate limited) or 5xx under load, especially during a large
// index backfill. Retry twice with a short backoff, honouring Retry-After, but never wait long in a
// user-facing call. Queue jobs get a longer retry from Forge itself (see jobs.js).
export const RETRY = { attempts: 3, baseMs: 250, maxWaitMs: 2000 };
// 429 means the request was not processed, so it is always safe to retry. A 5xx is retried only for reads
// and idempotent writes: a POST that timed out may have created the comment or task already.
const retryable = (status, method) =>
  status === 429 || ((status === 502 || status === 503 || status === 504) && ['GET', 'PUT', 'DELETE'].includes(method));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Searches and bulk reads are POSTs that change nothing: retry them like reads.
const READ_POST = /\/search\/jql|\/bulkfetch|approximate-count|permission\/check/;
function methodOf(path, opts) {
  const m = String(opts?.method || 'GET').toUpperCase();
  return m === 'POST' && READ_POST.test(String(path?.value ?? path)) ? 'GET' : m;
}

async function withRetry(call, method = 'GET') {
  let res;
  for (let attempt = 1; attempt <= RETRY.attempts; attempt += 1) {
    res = await call();
    if (!res || !retryable(res.status, method) || attempt === RETRY.attempts) return res;
    const after = Number(res.headers?.get?.('retry-after'));
    const base = globalThis.__retryBaseMs ?? RETRY.baseMs; // tests shorten the wait
    const wait = Math.min(RETRY.maxWaitMs, Number.isFinite(after) && after > 0 ? after * 1000 : base * 2 ** (attempt - 1));
    await sleep(wait);
  }
  return res;
}

export function client(mode) {
  const who = mode === 'user' ? api.asUser() : api.asApp();
  return {
    mode,
    jira: (path, opts) => withRetry(() => who.requestJira(path, opts), methodOf(path, opts)),
    confluence: (path, opts) => withRetry(() => who.requestConfluence(path, opts), methodOf(path, opts)),
  };
}

export const appClient = () => client('app');

// Some invocation contexts do not carry a user. Detect that once, cheaply, instead of failing mid-search.
export async function userClientOrNull() {
  try {
    const c = client('user');
    const res = await c.jira(route`/rest/api/3/myself`);
    if (res && res.ok) return c;
  } catch (e) {
    console.warn('No user context available for this call:', e?.message);
  }
  return null;
}

export async function json(res, label) {
  if (!res) throw new Error(`${label}: no response`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`${label} failed (${res.status})`);
    err.status = res.status;
    err.detail = text.slice(0, 500);
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

export const JSON_HEADERS = { Accept: 'application/json', 'Content-Type': 'application/json' };
