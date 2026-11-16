// Text helpers shared by the index, the evidence search, the review pipeline and the answer grader.
// Everything here is pure and deterministic, so it is unit-tested in test/sim.mjs.

// ---------------------------------------------------------------------------
// Atlassian Document Format (ADF) and HTML
// ---------------------------------------------------------------------------
export function adfToText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.text || '';
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'mention') return node.attrs?.text || '';
  const parts = (node.content || []).map(adfToText);
  // Paragraphs and headings end with a blank line, so plans split into sections the way people wrote them.
  if (['paragraph', 'heading', 'blockquote', 'codeBlock'].includes(node.type)) return `${parts.join('')}\n\n`;
  if (['listItem', 'tableRow'].includes(node.type)) return `${parts.join('').trim()}\n`;
  if (node.type === 'doc') return parts.join('').replace(/\n{3,}/g, '\n\n').trim();
  return parts.join('');
}

// Lines are arrays of pieces: a string, {text, href}, {text, bold} or {mention: accountId}.
export function paragraphsToAdf(paragraphs) {
  return {
    type: 'doc',
    version: 1,
    content: paragraphs.map((p) => ({
      type: 'paragraph',
      content: (Array.isArray(p) ? p : [p])
        .filter((piece) => piece !== '' && piece != null)
        .map((piece) => {
          if (typeof piece === 'string') return { type: 'text', text: piece };
          if (piece.mention) return { type: 'mention', attrs: { id: piece.mention } };
          if (piece.href) return { type: 'text', text: piece.text, marks: [{ type: 'link', attrs: { href: piece.href } }] };
          return { type: 'text', text: piece.text, marks: piece.bold ? [{ type: 'strong' }] : [] };
        }),
    })),
  };
}

export function stripHtml(html = '') {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h\d|li|tr|div)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

export function clip(text = '', max = 600) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function escapeHtml(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function jqlString(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ---------------------------------------------------------------------------
// Tokens, stems and terms (the same functions index and query, so they always agree)
// ---------------------------------------------------------------------------
export const STOP = new Set(
  `a about above after again against all also am an and any are as at be because been before being below between both but by can
could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it
its itself just me more most my no nor not now of off on once only or other our ours out over own same she should so some such than
that the their theirs them then there these they this those through to too under until up very was we were what when where which while
who whom why will with would you your yours yes via per etc new add adding build building create creating make making improve
improving support supporting launch launching use using allow allowing let lets get getting want wants need needs like every
based team teams plan plans project projects epic epics page pages item items task tasks proposed proposal target quarter
user users people someone something thing things way ways able one two three first next last within without keep keeps
may might must shall still yet ask asking asked le la les des une un et pour avec dans du de en au aux est sont el los las y para con por que del
der das und mit von ein eine`
    .split(/\s+/)
    .filter(Boolean),
);

// Light, predictable stemming. Not linguistics: just enough that "chats", "chatting" and "chat" meet.
export function stem(word) {
  let w = fold(String(word || '').toLowerCase()).replace(/'s$/, '');
  if (w.length <= 3 || !LATIN.test(w)) return w;
  for (const [suffix, min] of [
    ['ational', 4],
    ['ization', 4],
    ['isation', 4],
    ['ations', 4],
    ['ation', 4],
    ['ments', 4],
    ['ment', 4],
    ['ness', 4],
    ['ings', 4],
    ['ing', 4],
    ['ies', 3],
    ['ied', 3],
    ['ers', 5],
    ['er', 5],
    ['ed', 4],
    ['ly', 4],
    ['es', 4],
    ['s', 3],
  ]) {
    if (w.endsWith(suffix) && w.length - suffix.length >= min) {
      w = w.slice(0, -suffix.length);
      if (suffix === 'ies' || suffix === 'ied') w += 'y';
      break;
    }
  }
  if (w.length > 3 && /([b-df-hj-np-tv-z])\1$/.test(w) && !/(ll|ss|ff|zz)$/.test(w)) w = w.slice(0, -1);
  // "message" and "messaging" both become "messag"; "price" and "prices" both "pric".
  if (w.length > 4 && w.endsWith('e') && !w.endsWith('ee')) w = w.slice(0, -1);
  return w;
}

// Unicode-aware: letters and digits in any script. Accents are folded (café -> cafe) so that the same word
// typed with or without them meets in the index.
const WORD = /[\p{L}\p{N}][\p{L}\p{N}']*/gu;
const fold = (t) => String(t).normalize('NFD').replace(/\p{M}/gu, '');
const LATIN = /^[a-z0-9']+$/;

export function words(text = '') {
  return (fold(String(text).toLowerCase()).match(WORD) || [])
    .map((w) => w.replace(/'+$/, ''))
    .filter(Boolean);
}

const isContent = (w) => (LATIN.test(w) ? w.length > 2 : w.length >= 2) && !STOP.has(w) && !/^\d+$/.test(w);

// Content tokens: no stop words, no tiny words, stemmed. Order preserved.
export function tokens(text = '') {
  return words(text)
    .filter(isContent)
    .map(stem)
    .filter((w) => (LATIN.test(w) ? w.length > 2 : w.length >= 2) && !STOP.has(w));
}

export const tokenSet = (text) => new Set(tokens(text));

// Adjacent content-word pairs from the raw text ("live chat" -> "live_chat").
export function bigrams(text = '') {
  const raw = words(text);
  const out = [];
  for (let i = 0; i < raw.length - 1; i += 1)
    if (isContent(raw[i]) && isContent(raw[i + 1])) out.push(`${stem(raw[i])}_${stem(raw[i + 1])}`);
  return out;
}

// Storage keys allow only a-z, 0-9 and a few symbols, so terms in other scripts are hex-encoded.
export const safeTerm = (t) => {
  const s = String(t).toLowerCase();
  if (/^[a-z0-9_']*$/.test(s)) return s.replace(/[^a-z0-9_]/g, '').slice(0, 40);
  return `u${[...s].map((ch) => (/[a-z0-9_]/.test(ch) ? ch : ch.codePointAt(0).toString(16))).join('')}`.slice(0, 40);
};

// Weighted terms for a document: title words count three times, bigrams 1.5 times.
// Returns the top `max` terms as { term: weight } with weights normalised to 1..10.
export function termWeights(title = '', body = '', max = 24) {
  const w = {};
  const bump = (t, n) => {
    const s = safeTerm(t);
    if (s.length > 1) w[s] = (w[s] || 0) + n;
  };
  for (const t of tokens(title)) bump(t, 3);
  for (const t of bigrams(title)) bump(t, 4.5);
  for (const t of tokens(body)) bump(t, 1);
  for (const t of bigrams(body)) bump(t, 1.5);
  const top = Object.entries(w)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max);
  const peak = top.length ? top[0][1] : 1;
  return Object.fromEntries(top.map(([t, n]) => [t, Math.max(1, Math.round((10 * n) / peak))]));
}

// Words that appear in almost every product plan. They still count, but much less, in queries.
export const WEAK = new Set(
  ['app', 'mobile', 'web', 'website', 'site', 'portal', 'feature', 'system', 'tool', 'platform', 'service', 'product', 'custom', 'data', 'screen', 'button', 'option', 'setting', 'driver', 'order', 'deliv', 'delivery', 'parcel', 'time', 'better', 'faster', 'easy', 'easier', 'simple', 'automatic', 'automatically'].map(stem),
);
const weakTerm = (t) => t.split('_').every((p) => WEAK.has(p));

// Synonym groups: different words people use for the same idea, so "messaging" finds the old "live chat"
// epic and "rewards" finds "loyalty points". General product vocabulary plus common operations themes.
export const SYNONYMS = [
  ['chat', 'live chat', 'messaging', 'instant messaging', 'support chat', 'whatsapp', 'live agent'],
  ['chatbot', 'bot', 'virtual assistant', 'ai assistant', 'automated replies'],
  ['loyalty', 'rewards', 'reward points', 'points scheme', 'cashback', 'membership perks'],
  ['drone', 'uav', 'unmanned aircraft'],
  ['blockchain', 'distributed ledger', 'web3', 'smart contract'],
  ['voice', 'smart speaker', 'alexa', 'voice assistant'],
  ['outsource', 'vendor', 'third party', 'contractor', 'agency'],
  ['staff', 'staffing', 'headcount', 'hiring', 'rota', 'shift cover'],
  ['pricing', 'price', 'discount', 'subscription', 'billing'],
  ['retention', 'transcript', 'personal data', 'gdpr', 'privacy', 'data protection'],
  ['migration', 'migrate', 'replatform', 'rewrite', 'rebuild'],
  ['electric', 'battery', 'charging', 'ev fleet'],
  ['routing', 'route', 'navigation', 'route optimisation'],
  ['on-prem', 'on premise', 'on-premise', 'self-hosted', 'self hosted', 'own servers', 'private cloud', 'data centre', 'data center'],
  ['marketplace', 'integration', 'plugin', 'partner app'],
  ['offline', 'no signal', 'no connection', 'connectivity', 'sync later'],
  ['refund', 'chargeback', 'reimbursement'],
  ['onboarding', 'signup', 'sign up', 'activation'],
  ['notification', 'alert', 'push notification', 'sms'],
];
// The index key of a phrase: its first two content words as a bigram ("live_chat", "self_host"), or its
// one content word ("premis" for "on premise").
export const synKey = (phrase) => {
  const t = tokens(String(phrase).replace(/-/g, ' '));
  return t.length >= 2 ? `${t[0]}_${t[1]}` : t[0] || '';
};
const synonymIndex = (() => {
  const m = new Map();
  for (const group of SYNONYMS)
    for (const phrase of group) {
      const key = synKey(phrase);
      if (key) m.set(key, group);
    }
  return m;
})();

// Synonym phrases for a list of search phrases (for live search and matching), without the originals.
export function synonymsFor(phrases, max = 6) {
  const seen = new Set((phrases || []).map((p) => String(p).toLowerCase()));
  const out = [];
  for (const p of phrases || []) {
    const keys = [...bigrams(String(p).replace(/-/g, ' ')), ...tokens(p)];
    for (const k of keys)
      for (const alt of synonymIndex.get(k) || []) if (!seen.has(alt)) {
        seen.add(alt);
        out.push(alt);
      }
  }
  return out.slice(0, max);
}

// Query terms for a plan or idea: the agent's search terms first, then the title, then the body; then
// synonyms of the strongest terms at a lower weight.
export function queryTerms({ searchTerms = '', title = '', body = '' }, max = 12) {
  const q = {};
  const bump = (t, n) => {
    const s = safeTerm(t);
    if (s.length > 1) q[s] = Math.max(q[s] || 0, weakTerm(s) ? n * 0.3 : n);
  };
  const phrases = String(searchTerms || '')
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
  for (const p of phrases) {
    bigrams(p).forEach((t) => bump(t, 3));
    tokens(p).forEach((t) => bump(t, 2.5));
  }
  bigrams(title).forEach((t) => bump(t, 3));
  tokens(title).forEach((t) => bump(t, 2));
  for (const [t, n] of Object.entries(termWeights('', body, 10))) bump(t, n >= 6 ? 1.2 : 0.8);
  const top = Object.entries(q)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max);
  const out = Object.fromEntries(top);
  // Synonyms of the strongest terms, at 60% weight, in up to 4 extra slots.
  let extra = 0;
  for (const [t, w] of top) {
    if (extra >= 4 || w < 2) continue;
    for (const alt of synonymIndex.get(t) || []) {
      const key = safeTerm(synKey(alt));
      if (key.length > 1 && !(key in out) && extra < 4) {
        out[key] = Math.round(w * 0.6 * 100) / 100;
        extra += 1;
      }
    }
  }
  return out;
}

// Human-readable search phrases for the live JQL/CQL fallback ("live chat", "chat", ...).
export function keywordsFrom(text = '', max = 6) {
  const raw = words(text).filter((w) => w.length > 2 && !/^\d+$/.test(w));
  const weak = (w) => WEAK.has(stem(w));
  const out = [];
  for (let i = 0; i < raw.length - 1; i += 1)
    if (!STOP.has(raw[i]) && !STOP.has(raw[i + 1]) && !(weak(raw[i]) && weak(raw[i + 1]))) out.push(`${raw[i]} ${raw[i + 1]}`);
  for (const w of raw) if (!STOP.has(w) && w.length > 3 && !weak(w)) out.push(w);
  return [...new Set(out)].slice(0, max);
}

export function parseTerms(input, fallbackText) {
  const fromInput = String(input || '')
    .split(/[,;\n]/)
    .map((t) => t.trim().toLowerCase().replace(/["\\]/g, ''))
    .filter((t) => t.length > 1);
  const terms = fromInput.length ? fromInput : keywordsFrom(fallbackText);
  return [...new Set(terms)].slice(0, 6);
}

// Which human search phrases appear in a text (for display and the radar's "strong match").
export function matchedTerms(text, terms) {
  const hay = tokenSet(text);
  const hayRaw = String(text || '').toLowerCase();
  return (terms || []).filter((t) => {
    const parts = tokens(t);
    if (!parts.length) return hayRaw.includes(String(t).toLowerCase());
    return parts.every((p) => hay.has(p));
  });
}

// ---------------------------------------------------------------------------
// Overlap measures used by the citation check, the advocate pass and the grader
// ---------------------------------------------------------------------------
export function overlap(a, b) {
  const A = a instanceof Set ? a : tokenSet(a);
  const B = b instanceof Set ? b : tokenSet(b);
  const shared = [...A].filter((t) => B.has(t));
  return { shared, count: shared.length, ofA: A.size ? shared.length / A.size : 0, ofB: B.size ? shared.length / B.size : 0 };
}

export function sharedBigrams(a, b) {
  const B = new Set(bigrams(b));
  return [...new Set(bigrams(a))].filter((t) => B.has(t));
}

const norm = (s) => words(s).join(' ');

// Does `quote` appear in `text`? Exactly after normalising, or 85% of its content tokens inside one window.
export function quoteFound(quote, text) {
  const q = norm(quote);
  if (q.length < 8) return false;
  if (norm(text).includes(q)) return true;
  const qt = tokens(quote);
  if (qt.length < 3) return false;
  const tt = tokens(text);
  const span = Math.max(qt.length * 2, qt.length + 6);
  const need = Math.ceil(qt.length * 0.85);
  for (let i = 0; i < tt.length; i += 1) {
    const win = new Set(tt.slice(i, i + span));
    if (qt.filter((x) => win.has(x)).length >= need) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Sentences: the "why it ended" line of a precedent, and the source sentence behind an objection
// ---------------------------------------------------------------------------
export function sentencesOf(text = '') {
  return String(text || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((x) => x.replace(/\s+/g, ' ').trim())
    .filter((x) => x.length >= 15 && x.length <= 400);
}

export const REASON_RE =
  /\b(because|due to|could not|couldn't|cannot|can't|unable|stopp?ed|abandon|cancel|failed|fail|too expensive|cost|not worth|blocked|legal|permit|regulat|complain|churn|outage|backlog|we decided|decided|no longer|ruled out|went bankrupt|never)\b/i;

// The sentence that says why something ended. Searches the texts in order (most telling first).
export function reasonSentence(texts) {
  for (const t of texts || []) for (const sen of sentencesOf(t)) if (REASON_RE.test(sen)) return clip(sen, 220);
  return '';
}

// The sentence in `text` that best supports `claim` (at least two shared content words).
export function bestSentence(text, claim) {
  const C = tokenSet(claim);
  let best = '';
  let bestN = 1;
  for (const sen of sentencesOf(text)) {
    const n = overlap(sen, C).count;
    if (n > bestN) {
      best = sen;
      bestN = n;
    }
  }
  return best ? clip(best, 220) : '';
}

// Numbers in a claim. The citation check requires each one to appear in the evidence or the plan.
export const numbersIn = (s) => [...new Set(String(s || '').match(/\b\d+(?:[.,]\d+)?\b/g) || [])];

// ---------------------------------------------------------------------------
// Plan sections and hashing (re-review only what changed)
// ---------------------------------------------------------------------------
export function fnv1a(str) {
  let h = 0x811c9dc5;
  const s = String(str || '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

// Split plan text into sections: blank-line separated blocks; very short blocks join the previous one.
export function sections(text = '', max = 12) {
  const blocks = String(text || '')
    .split(/\n\s*\n|\n(?=#|\* |- |\d+\. )/)
    .flatMap((b) => (b.length > 600 ? b.split(/\n/) : [b]))
    .map((b) => b.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const merged = [];
  for (const b of blocks) {
    if (merged.length && (b.length < 40 || merged.length >= max)) merged[merged.length - 1] += ` ${b}`;
    else merged.push(b);
  }
  return merged.map((t, i) => ({ n: i + 1, text: clip(t, 900), hash: fnv1a(norm(t)) }));
}

export const planHash = (title, text) => fnv1a(`${norm(title)}|${norm(text)}`);

// ---------------------------------------------------------------------------
// JSON from model output (which may arrive with prose, code fences or as a JSON string)
// ---------------------------------------------------------------------------
export function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  const s = String(value || '').trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === 'string') return parseJsonArray(parsed);
    return [];
  } catch {
    const start = s.indexOf('[');
    const end = s.lastIndexOf(']');
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(s.slice(start, end + 1));
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }
}

export function parseJsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  const s = String(value || '').trim();
  if (!s) return null;
  try {
    const parsed = JSON.parse(s);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    if (typeof parsed === 'string') return parseJsonObject(parsed);
  } catch {
    /* fall through */
  }
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(s.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

export function asList(value, max = 5) {
  const arr = Array.isArray(value) ? value : parseJsonArray(value);
  return arr
    .map((x) => clip(typeof x === 'string' ? x : x?.text || x?.question || '', 240))
    .filter(Boolean)
    .slice(0, max);
}

// ---------------------------------------------------------------------------
// Numbers and dates
// ---------------------------------------------------------------------------
export function median(nums) {
  const a = (nums || []).filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function clampInt(v, lo, hi, dflt) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
}

export const daysBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;
export const isoDate = (d = new Date()) => new Date(d).toISOString().slice(0, 10);
// "1 item", "3 items": real plurals instead of "item(s)".
export const plural = (n, one, many = `${one}s`) => `${n} ${Number(n) === 1 ? one : many}`;

export const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(s));
