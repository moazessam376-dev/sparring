import { daysBetween } from './clock.mjs';
import { descendants } from './graph.mjs';

const CREDIT = { correct: 1, partial: 0.5, wrong: 0 };
// Weight on each step further into the past. This has to be below about 0.62,
// because at three attempts the two older ones carry DECAY^2 + DECAY between
// them and a single recent answer carries 1. At 0.9 the past wins and the
// feature stops being recency-weighted at all. Unfitted, like the coefficients.
const DECAY = 0.5;

// Initial coefficients, not fitted. The feature set is the one that survives
// automated search in the literature: recency, log prior successes, and a
// recency-weighted proportion correct.
const COEF = { intercept: -1.0, successes: 0.9, failures: -0.6, propdec: 1.2, staleness: -0.35 };

export function features(attempts, todayString) {
  const ordered = [...attempts].sort((a, b) => (a.at < b.at ? -1 : 1));
  let successes = 0;
  let failures = 0;
  let weighted = 0;
  let weight = 0;
  let lastCorrect = null;
  const n = ordered.length;
  ordered.forEach((attempt, index) => {
    const credit = CREDIT[attempt.grade] ?? 0;
    successes += credit;
    failures += 1 - credit;
    const w = Math.pow(DECAY, n - 1 - index);
    weighted += w * credit;
    weight += w;
    if (credit > 0) lastCorrect = attempt.at.slice(0, 10);
  });
  return {
    successes,
    failures,
    propdec: weight === 0 ? 0 : weighted / weight,
    daysSinceCorrect: lastCorrect === null ? null : daysBetween(lastCorrect, todayString),
  };
}

export function masteryLogit(f) {
  const staleness = f.daysSinceCorrect === null ? 0 : Math.log(1 + f.daysSinceCorrect);
  return COEF.intercept
    + COEF.successes * Math.log(1 + f.successes)
    + COEF.failures * Math.log(1 + f.failures)
    + COEF.propdec * f.propdec
    + COEF.staleness * staleness;
}

export function topicMastery(db, topicId, todayString) {
  const ids = descendants(db, topicId);
  const marks = ids.map(() => '?').join(',');
  const attempts = ids.length === 0 ? [] : db.prepare(`
    select a.at, a.grade from attempts a
    join card_topics ct on ct.card = a.card
    where ct.topic in (${marks})
  `).all(...ids);
  const cards = ids.length === 0 ? 0 : db.prepare(`
    select count(distinct c.id) as n from cards c
    join card_topics ct on ct.card = c.id
    where ct.topic in (${marks}) and c.retired = 0
  `).get(...ids).n;
  const f = features(attempts, todayString);
  const score = 1 / (1 + Math.exp(-masteryLogit(f)));
  // Confidence is deliberately crude and deliberately visible. The estimate is
  // weak and the interface must say so rather than round it into a claim.
  const confidence = Math.min(1, attempts.length / 12);
  return { score, confidence, cards, attempts: attempts.length };
}
