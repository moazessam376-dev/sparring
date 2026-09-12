import { test } from 'node:test';
import assert from 'node:assert/strict';
import { features, masteryLogit } from './mastery.mjs';

function at(day, grade) {
  return { at: `2026-03-${String(day).padStart(2, '0')}T00:00:00.000Z`, grade };
}

test('features count successes and failures and find the last correct day', () => {
  const f = features([at(1, 'correct'), at(2, 'wrong'), at(3, 'correct')], '2026-03-13');
  assert.equal(f.successes, 2);
  assert.equal(f.failures, 1);
  assert.equal(f.daysSinceCorrect, 10);
});

test('recent answers weigh more than old ones', () => {
  const improving = features([at(1, 'wrong'), at(2, 'wrong'), at(3, 'correct')], '2026-03-04');
  const declining = features([at(1, 'correct'), at(2, 'correct'), at(3, 'wrong')], '2026-03-04');
  assert.ok(improving.propdec > declining.propdec);
});

test('a partial answer counts as half a success', () => {
  const f = features([at(1, 'partial')], '2026-03-02');
  assert.equal(f.successes, 0.5);
  assert.equal(f.failures, 0.5);
});

test('mastery rises with successes and falls with time away', () => {
  const fresh = masteryLogit(features([at(1, 'correct'), at(2, 'correct'), at(3, 'correct')], '2026-03-04'));
  const stale = masteryLogit(features([at(1, 'correct'), at(2, 'correct'), at(3, 'correct')], '2026-06-04'));
  const weak = masteryLogit(features([at(1, 'wrong'), at(2, 'wrong')], '2026-03-04'));
  assert.ok(fresh > stale);
  assert.ok(fresh > weak);
});

test('no attempts means no evidence rather than zero mastery', () => {
  const f = features([], '2026-03-04');
  assert.equal(f.successes, 0);
  assert.equal(f.daysSinceCorrect, null);
});
