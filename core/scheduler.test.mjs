import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_W, gradeToRating, retrievability, schedule, nextInterval } from './scheduler.mjs';

test('the default weight vector has 21 parameters', () => {
  assert.equal(DEFAULT_W.length, 21);
});

test('grades map onto the three ratings sparring can produce', () => {
  assert.equal(gradeToRating('wrong'), 1);
  assert.equal(gradeToRating('partial'), 2);
  assert.equal(gradeToRating('correct'), 3);
  assert.throws(() => gradeToRating('easy'), /unknown grade/);
});

test('retrievability is one at zero elapsed days and falls monotonically', () => {
  assert.equal(retrievability(0, 10), 1);
  const a = retrievability(5, 10);
  const b = retrievability(20, 10);
  assert.ok(a > b, 'recall probability must fall with time');
  assert.ok(b > 0 && a < 1);
});

test('retrievability is about 0.9 at one stability interval', () => {
  const r = retrievability(10, 10);
  assert.ok(Math.abs(r - 0.9) < 0.01, `expected about 0.9, got ${r}`);
});

test('a first correct answer schedules further out than a first wrong one', () => {
  const correct = schedule(null, 'correct', '2026-03-01');
  const wrong = schedule(null, 'wrong', '2026-03-01');
  assert.ok(correct.due > wrong.due);
  assert.equal(wrong.lapses, 0, 'a first answer is not a lapse');
  assert.equal(correct.reps, 1);
});

test('a lapse after success raises difficulty and shortens the interval', () => {
  let state = schedule(null, 'correct', '2026-03-01');
  state = schedule(state, 'correct', '2026-03-05');
  const before = state.difficulty;
  const lapsed = schedule(state, 'wrong', '2026-03-20');
  assert.ok(lapsed.difficulty > before);
  assert.equal(lapsed.lapses, 1);
  assert.ok(lapsed.stability < state.stability);
});

test('nextInterval respects the desired retention knob', () => {
  const at90 = nextInterval(10, 0.9);
  const at97 = nextInterval(10, 0.97);
  assert.ok(at97 < at90, 'higher desired retention means shorter intervals');
});
