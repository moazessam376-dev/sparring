import { daysBetween } from './clock.mjs';
import { retrievability, schedule } from './scheduler.mjs';

const MIN_CALIBRATION_ATTEMPTS = 5;
const BIN_COUNT = 5;

function interval(actual, actualSquared, count) {
  // A zero sample variance is not zero uncertainty: one all-correct answer is
  // still one observation. Keep a Bernoulli-sized floor so sparse bins look
  // visibly doubtful, while the band narrows as counted evidence grows.
  const observedVariance = Math.max(0, actualSquared / count - actual ** 2);
  const standardError = Math.sqrt(Math.max(0.25, observedVariance) / count);
  const margin = 1.96 * standardError;
  return {
    low: Math.max(0, actual - margin),
    high: Math.min(1, actual + margin),
  };
}

function outcomeOf(grade) {
  if (grade === 'correct') return 1;
  if (grade === 'partial') return 0.5;
  return 0;
}

function projectFilter(projectId) {
  return projectId === null || projectId === undefined ? '' : 'where c.project = ?';
}

function projectParams(projectId) {
  return projectId === null || projectId === undefined ? [] : [projectId];
}

/**
 * The scheduler does not persist a prediction with an attempt. Replaying the
 * attempt history is the only honest way to recover the prediction it made at
 * the instant of each review. First answers are excluded: there was no prior
 * schedule to calibrate.
 */
export function calibration(state, projectId = null) {
  const rows = state.db.prepare(`
    select a.id, a.card, a.at, a.grade, c.project
    from attempts a
    join cards c on c.id = a.card
    ${projectFilter(projectId)}
    order by a.at, a.id
  `).all(...projectParams(projectId));
  const schedules = new Map();
  const observations = [];

  for (const row of rows) {
    const previous = schedules.get(row.card);
    if (previous?.stability !== null && previous?.stability !== undefined && previous.last_at) {
      const predicted = retrievability(
        daysBetween(previous.last_at, row.at.slice(0, 10)),
        previous.stability,
      );
      observations.push({ predicted, actual: outcomeOf(row.grade) });
    }
    schedules.set(row.card, schedule(previous ?? null, row.grade, row.at.slice(0, 10)));
  }

  if (observations.length < MIN_CALIBRATION_ATTEMPTS) {
    return {
      ready: false,
      attempts: observations.length,
      minimumAttempts: MIN_CALIBRATION_ATTEMPTS,
      reason: `Need at least ${MIN_CALIBRATION_ATTEMPTS} scheduled reviews; ${observations.length} counted.`,
      points: [],
    };
  }

  const bins = Array.from({ length: BIN_COUNT }, () => ({ predicted: 0, actual: 0, actualSquared: 0, count: 0 }));
  for (const observation of observations) {
    const index = Math.min(BIN_COUNT - 1, Math.floor(observation.predicted * BIN_COUNT));
    const bin = bins[index];
    bin.predicted += observation.predicted;
    bin.actual += observation.actual;
    bin.actualSquared += observation.actual ** 2;
    bin.count += 1;
  }
  const points = bins
    .filter((bin) => bin.count > 0)
    .map((bin) => {
      const actual = bin.actual / bin.count;
      const doubt = interval(actual, bin.actualSquared, bin.count);
      return {
        predicted: bin.predicted / bin.count,
        actual,
        count: bin.count,
        actualLow: doubt.low,
        actualHigh: doubt.high,
      };
    });

  return {
    ready: true,
    attempts: observations.length,
    minimumAttempts: MIN_CALIBRATION_ATTEMPTS,
    reason: null,
    points,
  };
}

/** Counts are deliberately returned as counts, not converted into a mastery
 * percentage. The screen can show the grade mix without making a tiny sample
 * look like a stable estimate.
 */
export function checkTypes(state, projectId = null) {
  const rows = state.db.prepare(`
    select a.mode, a.grade, count(*) as count
    from attempts a
    join cards c on c.id = a.card
    ${projectFilter(projectId)}
    group by a.mode, a.grade
    order by a.mode, a.grade
  `).all(...projectParams(projectId));
  const grouped = new Map();
  for (const row of rows) {
    const current = grouped.get(row.mode) ?? { mode: row.mode, correct: 0, partial: 0, wrong: 0, total: 0 };
    current[row.grade] = Number(row.count);
    current.total += Number(row.count);
    grouped.set(row.mode, current);
  }
  return [...grouped.values()];
}

export const calibrationMinimum = MIN_CALIBRATION_ATTEMPTS;
