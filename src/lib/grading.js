// The answer grader. A response to an objection must engage with it: be specific, be about the objection,
// and say what will happen. Empty or generic answers ("we'll be careful", "noted", "accept risk") fail.
// The first failure returns a rebuttal; a second failure escalates the objection, after which only
// verifiable proof (evidence, a mitigation task, a plan change) or a named approver can resolve it.
import { overlap, tokens, tokenSet, words } from './text';

const GENERIC = [
  'ok',
  'okay',
  'fine',
  'noted',
  'n/a',
  'na',
  'none',
  'no',
  'yes',
  'agreed',
  'acknowledged',
  'ack',
  'done',
  'lgtm',
  'will do',
  'sure',
  'accept',
  'accepted',
  'accept risk',
  'accept the risk',
  'we accept the risk',
  'risk accepted',
  'not an issue',
  'no issue',
  'not a problem',
  'no problem',
  'not relevant',
  'irrelevant',
  'we will be careful',
  'we will handle it',
  'we will deal with it',
  'we will monitor',
  'will monitor',
  'monitor it',
  'handled',
  'covered',
  'already covered',
  'already handled',
  'it is fine',
  'its fine',
  'this is fine',
  'we know',
  'we are aware',
  'aware',
  'ignore',
  'skip',
  'later',
  'tbd',
  'to be decided',
  'out of scope',
];
const GENERIC_SET = new Set(GENERIC.map((g) => words(g).join(' ')));
const FILLER = new Set(
  'we will be careful handle it deal monitor fine ok okay noted aware know this that is not an issue problem accept accepted risk the a it its are already covered handled later should can'.split(
    ' ',
  ),
);
const ACTION = /\b(will|plan to|planned|scheduled|hire|hired|hiring|add|added|limit|limited|cap|pilot|test|tested|trial|measure|budget|budgeted|sign(ed)? off|approve[ds]?|assign(ed)?|staff(ed)?|rota|cover|move[ds]?|delay(ed)?|split|cut|remove[ds]?|replace[ds]?|contract(ed)?|agree[ds]? with|confirm(ed)?|review(ed)?|escalate[ds]?|own(s|ed)?|by (mon|tue|wed|thu|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|q[1-4]|the end|end of|next))\b/i;
const SPECIFIC = /(\b\d+\b|\bq[1-4]\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b[A-Z][A-Z0-9_]+-\d+\b|https?:\/\/|\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b)/i;

export const MIN_TEXT = 20;

export function objectionTerms(o) {
  return `${o.claim} ${o.sourceTitle || ''} ${o.assumption || ''} ${o.satisfiedBy || ''}`;
}

export function gradeAnswer(text, objection, { minLength = MIN_TEXT } = {}) {
  const answer = String(text || '').trim();
  const normalised = words(answer).join(' ');
  const reasons = [];
  if (answer.length < 4) return { pass: false, score: 0, reasons: ['empty'], rebuttal: rebuttal(objection, ['empty']) };
  if (GENERIC_SET.has(normalised)) return { pass: false, score: 0, reasons: ['generic'], rebuttal: rebuttal(objection, ['generic']) };
  const content = words(answer).filter((w) => !FILLER.has(w));
  if (content.length < 3) return { pass: false, score: 0, reasons: ['generic'], rebuttal: rebuttal(objection, ['generic']) };
  if (answer.length < minLength) reasons.push('short');

  const ov = overlap(answer, objectionTerms(objection));
  const specificity = SPECIFIC.test(answer) || /\b[A-Z][a-z]+ [A-Z][a-z]+\b/.test(answer.slice(1)) ? 1 : 0;
  // An answer that adds nothing beyond the objection's own words restates it.
  const fresh = ov.ofA >= 0 ? tokens(answer).filter((t) => !tokenSet(objectionTerms(objection)).has(t)) : [];
  const echo = !specificity && new Set(fresh).size < 2 && ov.ofA >= 0.6;
  if (echo) return { pass: false, score: 0, reasons: ['echo'], rebuttal: rebuttal(objection, ['echo']) };

  const relevance = ov.count >= 1 ? 1 : 0;
  const action = ACTION.test(answer) ? 1 : 0;
  if (!relevance) reasons.push('off-topic');
  if (!specificity) reasons.push('vague');
  if (!action) reasons.push('no-action');
  const score = relevance + specificity + action;
  const pass = score >= 2 && answer.length >= minLength && (specificity === 1 || answer.length >= 40);
  return { pass, score, reasons, rebuttal: pass ? '' : rebuttal(objection, reasons) };
}

function focus(objection) {
  const t = tokens(objection.claim).slice(0, 6);
  return t.length ? `the point about ${objection.sourceTitle ? `"${objection.sourceTitle}"` : t.join(' ')}` : 'this objection';
}

export function rebuttal(objection, reasons) {
  const parts = [];
  if (reasons.includes('empty') || reasons.includes('generic'))
    parts.push(`That doesn't answer ${focus(objection)} yet.`);
  else if (reasons.includes('echo')) parts.push('That repeats the objection rather than answering it.');
  else if (reasons.includes('off-topic')) parts.push(`That doesn't mention ${focus(objection)}.`);
  else parts.push('Almost there.');
  const asks = [];
  if (reasons.includes('vague') || reasons.includes('generic') || reasons.includes('empty')) asks.push('who, what or by when');
  if (reasons.includes('no-action')) asks.push('what will change');
  if (reasons.includes('short')) asks.push('a sentence more of detail');
  if (asks.length) parts.push(`Say ${asks.join(', ')}, or link the evidence.`);
  if (objection.satisfiedBy) parts.push(`This would settle it: ${objection.satisfiedBy}`);
  return parts.join(' ');
}

// The agent may also grade an answer in chat. Code is the floor: the agent can be stricter, never looser.
export function combineGrades(codeGrade, agentGrade) {
  if (agentGrade && /^fail/i.test(String(agentGrade.grade || '')))
    return { ...codeGrade, pass: false, rebuttal: String(agentGrade.rebuttal || '').slice(0, 400) || codeGrade.rebuttal || rebuttal({ claim: '' }, ['vague']) };
  return codeGrade;
}
