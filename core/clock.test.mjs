import { test } from 'node:test';
import assert from 'node:assert/strict';
import { now, today, addDays, daysBetween } from './clock.mjs';

test('now honours SPARRING_NOW', () => {
  process.env.SPARRING_NOW = '2026-03-01T12:00:00Z';
  assert.equal(now().toISOString(), '2026-03-01T12:00:00.000Z');
  delete process.env.SPARRING_NOW;
});

test('today formats as YYYY-MM-DD', () => {
  process.env.SPARRING_NOW = '2026-03-01T12:00:00Z';
  assert.match(today(), /^\d{4}-\d{2}-\d{2}$/);
  delete process.env.SPARRING_NOW;
});

test('addDays and daysBetween are inverses', () => {
  assert.equal(addDays('2026-03-01', 10), '2026-03-11');
  assert.equal(daysBetween('2026-03-01', '2026-03-11'), 10);
  assert.equal(daysBetween('2026-03-11', '2026-03-01'), -10);
});
