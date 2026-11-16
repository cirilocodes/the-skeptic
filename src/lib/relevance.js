// Whether an item from elsewhere on the site is about what a plan says.
//
// Items from the plan's own project share people and context, so an ordinary match is enough. An item
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

export function aboutThePlan(src, target, words = planWords(target)) {
  if (sameProject(src, target)) return true;
  const itemText = `${src?.title || ''}\n${src?.text || ''}`;
  return sharedBigrams(itemText, words).length > 0 || overlap(itemText, words).count >= 3;
}
