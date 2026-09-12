import { test } from 'node:test';
import assert from 'node:assert/strict';
import { open } from './db.mjs';
import { apply, rebuild } from './reduce.mjs';

function ev(seq, type, data) {
  return { id: `aaaaaaaa:${seq}`, device: 'aaaaaaaa', seq, at: `2026-01-0${seq}T00:00:00.000Z`, type, v: 1, data };
}

test('apply is idempotent', () => {
  const db = open(':memory:');
  const event = ev(1, 'project.added', { project: 'raptor', name: 'Raptor' });
  assert.equal(apply(db, event), true);
  assert.equal(apply(db, event), false);
  assert.equal(db.prepare('select count(*) as n from projects').get().n, 1);
});

test('rebuild materialises projects, topics, cards and attempts', () => {
  const db = open(':memory:');
  const applied = rebuild(db, [
    ev(1, 'project.added', { project: 'raptor', name: 'Raptor' }),
    ev(2, 'topic.added', { topic: 'socketio', name: 'socket.io', parent: null, kind: 'technology' }),
    ev(3, 'topic.added', { topic: 'acks', name: 'acknowledgements', parent: 'socketio', kind: 'technology' }),
    ev(4, 'topic.linked', { topic: 'socketio', project: 'raptor' }),
    ev(5, 'card.added', {
      card: 'c001', project: 'raptor', concept: 'Ack timeout', ask: 'Ask what happens when an ack never arrives',
      rubric: ['the emit callback never fires'], altitude: 'mechanism', topics: ['acks'],
      grounding: [{ path: 'server/io.js', line: 42, commit: 'abc1234' }], contexts: ['raptor', 'library'],
      source: { type: 'lesson', ref: '0001' },
    }),
    ev(6, 'attempt.recorded', { card: 'c001', grade: 'partial', question: 'What happens', context: 'raptor', answer: 'it hangs', gap: 'no timeout named', mode: 'drill' }),
  ]);
  assert.equal(applied, 6);
  assert.equal(db.prepare('select count(*) as n from cards').get().n, 1);
  assert.equal(db.prepare('select parent from topics where id=?').get('acks').parent, 'socketio');
  assert.equal(db.prepare('select count(*) as n from card_topics').get().n, 1);
  assert.equal(db.prepare('select grade from attempts').get().grade, 'partial');
});

test('updating a card rewrites its grounding index, not just its json', () => {
  const db = open(':memory:');
  rebuild(db, [
    ev(1, 'project.added', { project: 'raptor', name: 'Raptor' }),
    ev(2, 'card.added', { card: 'c001', project: 'raptor', concept: 'c', ask: 'a', rubric: ['r'], altitude: 'mechanism', topics: [], grounding: [{ path: 'old.js', line: 1, commit: 'aaa' }], contexts: ['raptor'], source: { type: 'lesson', ref: '1' } }),
    ev(3, 'card.updated', { card: 'c001', grounding: [{ path: 'new.js', line: 9, commit: 'bbb' }] }),
  ]);
  // node:sqlite returns null-prototype rows, which assert/strict's deepEqual
  // refuses to match against an object literal. Project them, as db.test.mjs does.
  const rows = db.prepare('select path, commit_sha from card_grounding where card = ?').all('c001');
  assert.deepEqual(rows.map((r) => ({ path: r.path, commit_sha: r.commit_sha })), [{ path: 'new.js', commit_sha: 'bbb' }]);
});

test('card.retired sets the flag and keeps the attempts', () => {
  const db = open(':memory:');
  rebuild(db, [
    ev(1, 'project.added', { project: 'raptor', name: 'Raptor' }),
    ev(2, 'card.added', { card: 'c001', project: 'raptor', concept: 'c', ask: 'a', rubric: ['r'], altitude: 'mechanism', topics: [], grounding: [], contexts: ['raptor'], source: { type: 'lesson', ref: '1' } }),
    ev(3, 'attempt.recorded', { card: 'c001', grade: 'correct', mode: 'drill' }),
    ev(4, 'card.retired', { card: 'c001' }),
  ]);
  assert.equal(db.prepare('select retired from cards where id=?').get('c001').retired, 1);
  assert.equal(db.prepare('select count(*) as n from attempts').get().n, 1);
});
