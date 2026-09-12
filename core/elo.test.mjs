import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uncertainty, expected, update } from './elo.mjs';

test('uncertainty starts at one and decays with observations', () => {
  assert.equal(uncertainty(0), 1);
  assert.ok(uncertainty(20) < uncertainty(5));
  assert.ok(uncertainty(200) > 0);
});

test('expected is one half when ability equals difficulty', () => {
  assert.equal(expected(0, 0), 0.5);
  assert.ok(expected(2, 0) > 0.5);
  assert.ok(expected(0, 2) < 0.5);
});

test('a correct answer raises ability and lowers item difficulty', () => {
  const next = update({ ability: 0, abilityN: 0, difficulty: 0, difficultyN: 0 }, 1);
  assert.ok(next.ability > 0);
  assert.ok(next.difficulty < 0);
  assert.equal(next.abilityN, 1);
  assert.equal(next.difficultyN, 1);
});

test('a wrong answer lowers ability and raises item difficulty', () => {
  const next = update({ ability: 0, abilityN: 0, difficulty: 0, difficultyN: 0 }, 0);
  assert.ok(next.ability < 0);
  assert.ok(next.difficulty > 0);
});

test('a partial answer moves less than a correct one', () => {
  const full = update({ ability: 0, abilityN: 0, difficulty: 0, difficultyN: 0 }, 1);
  const half = update({ ability: 0, abilityN: 0, difficulty: 0, difficultyN: 0 }, 0.5);
  assert.ok(half.ability > 0 && half.ability < full.ability);
});

test('later updates move the estimate less than early ones', () => {
  const early = update({ ability: 0, abilityN: 0, difficulty: 0, difficultyN: 0 }, 1);
  const late = update({ ability: 0, abilityN: 100, difficulty: 0, difficultyN: 100 }, 1);
  assert.ok(Math.abs(late.ability) < Math.abs(early.ability));
});
