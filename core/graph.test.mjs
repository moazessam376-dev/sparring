import { test } from 'node:test';
import assert from 'node:assert/strict';
import { open } from './db.mjs';
import { descendants, ancestors, topicsForProject, cardsForTopic } from './graph.mjs';

function seed() {
  const db = open(':memory:');
  const topic = db.prepare('insert into topics (id, name, parent, kind) values (?, ?, ?, ?)');
  topic.run('socketio', 'socket.io', null, 'technology');
  topic.run('acks', 'acknowledgements', 'socketio', 'technology');
  topic.run('ackto', 'ack timeouts', 'acks', 'technology');
  topic.run('redis', 'redis', null, 'technology');
  db.prepare('insert into topic_projects (topic, project) values (?, ?)').run('socketio', 'raptor');
  db.prepare(`insert into cards (id, project, concept, ask, rubric, altitude, grounding, contexts, source, added, retired)
    values (?, 'raptor', 'c', 'a', '[]', 'mechanism', '[]', '[]', '{}', '2026-01-01', 0)`).run('c1');
  db.prepare('insert into card_topics (card, topic) values (?, ?)').run('c1', 'ackto');
  return db;
}

test('descendants covers the whole subtree including the topic itself', () => {
  const db = seed();
  assert.deepEqual(descendants(db, 'socketio').sort(), ['acks', 'ackto', 'socketio']);
  assert.deepEqual(descendants(db, 'redis'), ['redis']);
});

test('ancestors walks up to the root', () => {
  assert.deepEqual(ancestors(seed(), 'ackto'), ['ackto', 'acks', 'socketio']);
});

test('a card on a leaf counts toward its ancestor topics', () => {
  const db = seed();
  assert.equal(cardsForTopic(db, 'socketio').length, 1);
  assert.equal(cardsForTopic(db, 'redis').length, 0);
});

test('a cycle does not hang the query', () => {
  const db = seed();
  db.prepare('update topics set parent = ? where id = ?').run('ackto', 'socketio');
  const result = descendants(db, 'socketio');
  assert.ok(result.length <= 64, 'the depth bound must stop a cycle');
});

test('topicsForProject returns the linked topics', () => {
  assert.deepEqual(topicsForProject(seed(), 'raptor'), ['socketio']);
});
