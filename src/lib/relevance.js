// Whether an item from elsewhere on the site is about what a plan says.
//
// Items from the plan's own project share people and context, so one word about the topic is enough. An item
// from another project (or a Confluence page) must itself be about what the plan says: a shared phrase,
// or three shared words, counting listed synonyms ("on premise" ≈ "self-hosted"). Otherwise a vivid story
// from another team ("live chat was abandoned") gets stretched to fit an unrelated plan.
import { overlap, sharedBigrams, synonymsFor } from './text';

const projectOf = (key) => (String(key || '').match(/^([A-Z][A-Z0-9_]+)-\d+\b/) || [])[1] || '';

export function sameProject(src, target) {
  const mine = projectOf(target?.key);
  return !!mine && projectOf(src?.title || src?.key) === mine;
}

export function planWords(target) {
  const planText = `${target?.title || ''}\n${target?.text || (target?.sections || []).map((s) => s.text).join('\n')}`;
  return `${planText}\n${synonymsFor([planText], 30).join('\n')}`;
}

// Words almost every plan and item share; on their own they say nothing about the topic.
const GENERIC = new Set(['version', 'app', 'application', 'feature', 'product', 'project', 'plan', 'team', 'customer', 'user', 'system', 'service', 'company', 'work', 'item', 'new', 'support', 'owner', 'start', 'ship', 'target', 'propos', 'abandon', 'shipped', 'run', 'use', 'make', 'build', 'time', 'year', 'month', 'week', 'day'].map((w) => w));
const topical = (shared) => shared.filter((w) => !GENERIC.has(w) && ![...GENERIC].some((g) => w.startsWith(g) && w.length - g.length <= 2));

export function aboutThePlan(src, target, words = planWords(target)) {
  const itemText = `${src?.title || ''}\n${src?.text || ''}`;
  // Same project: one shared word about the topic (synonyms count) is enough, but there must be one, so
  // "browser-only lite version" is not stretched to fit "on-premise version for banks".
  if (sameProject(src, target)) return sharedBigrams(itemText, words).length > 0 || topical(overlap(itemText, words).shared).length >= 1;
  return sharedBigrams(itemText, words).length > 0 || overlap(itemText, words).count >= 3;
}
