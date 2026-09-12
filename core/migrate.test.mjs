import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bankToEvents } from './migrate.mjs';

const bank = {
  version: 2,
  project: 'raptor',
  repo: '/tmp/raptor',
  cards: [{
    id: 'c001', level: 2, topic: 'rls', altitude: 'boundary',
    concept: 'Tenant fence', ask: 'Ask where the tenant fence lives',
    rubric: ['the function runs with elevated privileges'],
    grounding: ['supabase/migrations/0031.sql:113'],
    contexts: ['raptor', 'library'],
    source: { type: 'lesson', ref: '0001' },
    added: '2026-09-05', retired: false,
    sched: { interval: 4, ease: 2.5, due: '2026-09-09', reps: 1, lapses: 0, lastGrade: 'correct' },
  }],
};
const scores = {
  attempts: [{ id: 'c001', cardId: 'c001', date: '2026-09-05T14:10:00Z', grade: 'partial', answer: 'a', gap: 'g', mode: 'drill', question: 'q', context: 'raptor' }],
};

test('the project, the topic, the card and the attempt all become events', () => {
  const events = bankToEvents(bank, scores);
  const types = events.map((e) => e.type);
  assert.deepEqual(types, ['project.added', 'topic.added', 'card.added', 'attempt.recorded']);
});

test('the free-text topic becomes a root topic with no invented parent', () => {
  const topic = bankToEvents(bank, scores).find((e) => e.type === 'topic.added');
  assert.equal(topic.data.topic, 'rls');
  assert.equal(topic.data.parent, null);
});

test('grounding is parsed and marked unverified', () => {
  const card = bankToEvents(bank, scores).find((e) => e.type === 'card.added');
  assert.deepEqual(card.data.grounding, [{ path: 'supabase/migrations/0031.sql', line: 113, commit: null }]);
  assert.deepEqual(card.data.topics, ['rls']);
});

test('a retired card still produces its card.retired event and keeps its attempts', () => {
  const retiredBank = { ...bank, cards: [{ ...bank.cards[0], retired: true }] };
  const events = bankToEvents(retiredBank, scores);
  assert.ok(events.some((e) => e.type === 'card.retired'));
  assert.equal(events.filter((e) => e.type === 'attempt.recorded').length, 1);
});

test('every attempt survives, including one whose card is gone', () => {
  const orphan = { attempts: [...scores.attempts, { cardId: 'c999', date: '2026-09-06T00:00:00Z', grade: 'wrong', mode: 'drill' }] };
  const events = bankToEvents(bank, orphan);
  assert.equal(events.filter((e) => e.type === 'attempt.recorded').length, 2);
});
