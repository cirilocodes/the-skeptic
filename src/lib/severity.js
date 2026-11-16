// Severity is computed by code, never chosen by the model.
// The model scores four factors per objection; code combines them with how recent the evidence is,
// how strong the precedent is and what the learning loop knows about this kind of source.
//
//   score = impact x likelihood                      (1..25)
//         x (0.8 + 0.1 x reversibility)              (1 = easy to undo .. 5 = irreversible)
//         x (1 - 0.2 x existing mitigation)          (0 = none .. 3 = already well handled)
//         x recency                                  (1.0 within a year .. 0.65 after three)
//         x strength                                 (precedent 1.0, related 0.8, weak 0.5)
//         x learned weight                           (0.35 .. 1.6)
//   critical >= 16, high >= 9, medium >= 4, otherwise low.
import { clampInt } from './text';

export const THRESHOLDS = { critical: 16, high: 9, medium: 4 };

export function recencyFactor(ageYears) {
  if (ageYears === null || ageYears === undefined || !Number.isFinite(ageYears)) return 0.9;
  if (ageYears <= 1) return 1;
  if (ageYears <= 2) return 0.9;
  if (ageYears <= 3) return 0.8;
  return 0.65;
}

const STRENGTH = { precedent: 1, related: 0.8, weak: 0.5 };

export function normaliseFactors(f = {}) {
  return {
    impact: clampInt(f.impact, 1, 5, 3),
    likelihood: clampInt(f.likelihood, 1, 5, 3),
    reversibility: clampInt(f.reversibility, 1, 5, 3),
    mitigation: clampInt(f.mitigation, 0, 3, 0),
  };
}

export function levelFor(score) {
  if (score >= THRESHOLDS.critical) return 'critical';
  if (score >= THRESHOLDS.high) return 'high';
  if (score >= THRESHOLDS.medium) return 'medium';
  return 'low';
}

export function computeSeverity(factors, { ageYears = null, strength = 'related', weight = 1 } = {}) {
  const f = normaliseFactors(factors);
  const recency = recencyFactor(ageYears);
  const s = STRENGTH[strength] ?? 0.8;
  const raw = f.impact * f.likelihood * (0.8 + 0.1 * f.reversibility) * (1 - 0.2 * f.mitigation) * recency * s * weight;
  const score = Math.round(raw * 10) / 10;
  const level = levelFor(score);
  const explain =
    `impact ${f.impact} × likelihood ${f.likelihood}, reversibility ${f.reversibility}/5, mitigation ${f.mitigation}/3` +
    `${recency < 1 ? `, evidence ${ageYears >= 3 ? 'over 3' : Math.max(1, Math.round(ageYears))} year${ageYears >= 1.5 || ageYears >= 3 ? 's' : ''} old` : ''}` +
    `${s < 1 ? `, ${strength} match` : ''}${weight !== 1 ? `, learned weight ${weight}` : ''} → ${score}`;
  return { score, level, factors: f, explain };
}
