import { addDays, daysBetween } from './clock.mjs';

// FSRS-6 default parameters, 21 values, read from src/inference_v6.rs in
// open-spaced-repetition/fsrs-rs on 2026-09-12. The last value is the decay,
// FSRS6_DEFAULT_DECAY = 0.1542.
// https://raw.githubusercontent.com/open-spaced-repetition/fsrs-rs/main/src/inference_v6.rs
export const DEFAULT_W = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666,
  0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658,
  0.1542,
];

export const DESIRED_RETENTION = 0.9; // Anki's documented default.

// Clamps, read from src/simulation.rs in open-spaced-repetition/fsrs-rs on
// 2026-09-12: S_MIN = 0.0001, S_MAX = 36500.0, D_MIN = 1.0, D_MAX = 10.0.
// https://raw.githubusercontent.com/open-spaced-repetition/fsrs-rs/main/src/simulation.rs
const S_MIN = 0.0001;
const S_MAX = 36500;
const D_MIN = 1;
const D_MAX = 10;

function clamp(value, low, high) {
  return Math.min(Math.max(value, low), high);
}

// The reference implementation carries the decay negated, so `decay` below is
// -w[20] = -0.1542 and every exponent that follows is written with that sign.
// With w[20] = 0.1542 the factor works out at 0.980456, and R(S, S) = 0.9000.
function decayOf(w) {
  return -w[20];
}

function factorOf(decay) {
  return Math.pow(0.9, 1 / decay) - 1;
}

// The reference rounds elapsed days to the nearest whole day before using them,
// in round_elapsed_days and in power_forgetting_curve_scalar.
function roundElapsedDays(t) {
  return Math.round(Math.max(t, 0));
}

const GRADES = { wrong: 1, partial: 2, correct: 3 };

// Ours, not FSRS's. Sparring has no fourth grade, so rating 4 (Easy) is never
// produced, which is why the easy bonus w[16] can never apply.
export function gradeToRating(grade) {
  const rating = GRADES[grade];
  if (!rating) throw new Error(`unknown grade: ${grade}`);
  return rating;
}

// power_forgetting_curve_scalar, src/model_v6.rs:
//   let s = s.max(S_MIN);
//   let decay = -w[20];
//   let factor = 0.9f32.powf(1.0 / decay) - 1.0;
//   let t = t.max(0.0).round();
//   (t / s).mul_add(factor, 1.0).powf(decay)
// https://raw.githubusercontent.com/open-spaced-repetition/fsrs-rs/main/src/model_v6.rs
export function retrievability(elapsedDays, stability, w = DEFAULT_W) {
  const s = Math.max(stability, S_MIN);
  const decay = decayOf(w);
  const factor = factorOf(decay);
  const t = roundElapsedDays(elapsedDays);
  return Math.pow((t / s) * factor + 1, decay);
}

// next_interval_scalar, src/model_v6.rs:
//   let stability = stability.max(S_MIN);
//   let desired_retention = desired_retention.clamp(0.0001, 0.9999);
//   let decay = -w[20];
//   let factor = 0.9f32.powf(1.0 / decay) - 1.0;
//   (stability / factor * (desired_retention.powf(1.0 / decay) - 1.0)).clamp(0.0, S_MAX)
// The reference returns fractional days. Sparring schedules whole days against a
// date string, so the result is rounded and floored at one day.
export function nextInterval(stability, desiredRetention = DESIRED_RETENTION, w = DEFAULT_W) {
  const s = Math.max(stability, S_MIN);
  const retention = clamp(desiredRetention, 0.0001, 0.9999);
  const decay = decayOf(w);
  const factor = factorOf(decay);
  const days = (s / factor) * (Math.pow(retention, 1 / decay) - 1);
  return clamp(Math.round(days), 1, S_MAX);
}

// init_stability, src/model.rs: `self.w.val().select(0, rating.int() - 1)`,
// that is S_0(G) = w[G - 1].
// https://raw.githubusercontent.com/open-spaced-repetition/fsrs-rs/main/src/model.rs
function initStability(rating, w) {
  return clamp(w[rating - 1], S_MIN, S_MAX);
}

// init_difficulty_scalar, src/model_v6.rs:
//   w[4] - (w[5] * (rating - 1) as f32).exp() + 1.0
// that is D_0(G) = w[4] - e^(w[5] * (G - 1)) + 1. Returned unclamped, because
// mean reversion uses the raw D_0(4) as its anchor; the caller clamps when it
// uses this as an actual difficulty.
function initDifficulty(rating, w) {
  return w[4] - Math.exp(w[5] * (rating - 1)) + 1;
}

// stability_after_success_scalar, src/model_v6.rs:
//   let hard_penalty = if rating == 2 { w[15] } else { 1.0 };
//   let easy_bonus = if rating == 4 { w[16] } else { 1.0 };
//   (s * (w[8].exp() * (11.0 - d) * s.powf(-w[9]) * (((1.0 - r) * w[10]).exp() - 1.0)
//     * hard_penalty * easy_bonus + 1.0)).clamp(S_MIN, S_MAX)
function stabilityAfterSuccess(s, r, d, rating, w) {
  const hardPenalty = rating === 2 ? w[15] : 1;
  const easyBonus = rating === 4 ? w[16] : 1;
  const grown =
    s *
    (Math.exp(w[8]) *
      (11 - d) *
      Math.pow(s, -w[9]) *
      (Math.exp((1 - r) * w[10]) - 1) *
      hardPenalty *
      easyBonus +
      1);
  return clamp(grown, S_MIN, S_MAX);
}

// stability_after_failure_scalar, src/model_v6.rs:
//   let new_s_min = s / (w[17] * w[18]).exp();
//   let new_s = w[11] * d.powf(-w[12]) * ((s + 1.0).powf(w[13]) - 1.0) * ((1.0 - r) * w[14]).exp();
//   new_s.min(new_s_min).clamp(S_MIN, S_MAX)
function stabilityAfterFailure(s, r, d, w) {
  const newSMin = s / Math.exp(w[17] * w[18]);
  const newS =
    w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - r) * w[14]);
  return clamp(Math.min(newS, newSMin), S_MIN, S_MAX);
}

// stability_short_term_scalar, src/model_v6.rs, used when no days have elapsed:
//   let sinc = (w[17] * (rating as f32 - 3.0 + w[18])).exp() * s.powf(-w[19]);
//   let new_s = s * if rating >= 3 { sinc.max(1.0) } else { sinc };
//   new_s.clamp(S_MIN, S_MAX)
function stabilityShortTerm(s, rating, w) {
  const sinc = Math.exp(w[17] * (rating - 3 + w[18])) * Math.pow(s, -w[19]);
  const newS = s * (rating >= 3 ? Math.max(sinc, 1) : sinc);
  return clamp(newS, S_MIN, S_MAX);
}

// mean_reversion_scalar, src/model_v6.rs:
//   w[7] * init + (1.0 - w[7]) * current
function meanReversion(init, current, w) {
  return w[7] * init + (1 - w[7]) * current;
}

// next_difficulty_scalar, src/model_v6.rs, delta D with the linear damping and
// then the mean reversion toward D_0(4):
//   let delta_d = -w[6] * (rating as f32 - 3.0);
//   let new_d = d + ((10.0 - d) / 9.0) * delta_d;
//   mean_reversion_scalar(w, init_difficulty_scalar(w, 4), new_d).clamp(D_MIN, D_MAX)
function nextDifficulty(d, rating, w) {
  const deltaD = -w[6] * (rating - 3);
  const newD = d + ((10 - d) / 9) * deltaD;
  return clamp(meanReversion(initDifficulty(4, w), newD, w), D_MIN, D_MAX);
}

// update_state and step_with_ops, src/model_v6.rs and src/model.rs. With no
// prior state the first review takes S_0 and a clamped D_0 directly. Otherwise
// the branch is on elapsed days first, then on the rating: no days elapsed uses
// the short-term stability, rating 1 the post-lapse stability, anything else the
// stability increase on a successful review.
export function nextState(state, grade, elapsedDays, w = DEFAULT_W) {
  const rating = gradeToRating(grade);
  if (!state || state.stability === null || state.stability === undefined) {
    return {
      stability: initStability(rating, w),
      difficulty: clamp(initDifficulty(rating, w), D_MIN, D_MAX),
    };
  }
  const t = roundElapsedDays(elapsedDays);
  const s = clamp(state.stability, S_MIN, S_MAX);
  const d = clamp(state.difficulty, D_MIN, D_MAX);
  const r = retrievability(t, s, w);
  let stability;
  if (t === 0) stability = stabilityShortTerm(s, rating, w);
  else if (rating === 1) stability = stabilityAfterFailure(s, r, d, w);
  else stability = stabilityAfterSuccess(s, r, d, rating, w);
  return { stability, difficulty: nextDifficulty(d, rating, w) };
}

// `last_at` is carried on the row so the next call knows how many days elapsed.
// A first answer is never a lapse: a lapse is a failure on a card that already
// had a stability to lose.
export function schedule(state, grade, todayString, desiredRetention = DESIRED_RETENTION, w = DEFAULT_W) {
  const rating = gradeToRating(grade);
  const isReview = Boolean(state && state.stability !== null && state.stability !== undefined);
  const elapsedDays = isReview && state.last_at ? daysBetween(state.last_at, todayString) : 0;
  const next = nextState(state, grade, elapsedDays, w);
  return {
    stability: next.stability,
    difficulty: next.difficulty,
    due: addDays(todayString, nextInterval(next.stability, desiredRetention, w)),
    reps: (state?.reps ?? 0) + 1,
    lapses: (state?.lapses ?? 0) + (isReview && rating === 1 ? 1 : 0),
    last_at: todayString,
    last_grade: grade,
  };
}
