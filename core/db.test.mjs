import { test } from 'node:test';
import assert from 'node:assert/strict';
import { open, SCHEMA_VERSION } from './db.mjs';

test('open creates every table and records the schema version', () => {
  const db = open(':memory:');
  const names = db.prepare("select name from sqlite_master where type='table' order by name").all().map((r) => r.name);
  for (const expected of ['attempts', 'card_elo', 'card_grounding', 'card_sched', 'card_topics', 'cards', 'events', 'lesson_answers', 'lesson_runs', 'lesson_topics', 'lessons', 'meta', 'projects', 'topic_elo', 'topic_prereqs', 'topic_projects', 'topics']) {
    assert.ok(names.includes(expected), `missing table ${expected}`);
  }
  assert.equal(db.prepare("select value from meta where key='schema_version'").get().value, String(SCHEMA_VERSION));
});

test('a misspelled grade is rejected rather than silently scoring zero', () => {
  const db = open(':memory:');
  const insert = db.prepare('insert into attempts (id, card, at, grade, mode) values (?, ?, ?, ?, ?)');
  insert.run('a:1', 'c1', '2026-01-01T00:00:00.000Z', 'correct', 'drill');
  assert.throws(() => insert.run('a:2', 'c1', '2026-01-01T00:00:00.000Z', 'Correct', 'drill'), /CHECK/i);
  assert.throws(() => insert.run('a:3', 'c1', '2026-01-01T00:00:00.000Z', 'correct', 'quiz'), /CHECK/i);
});

test('a contested grade keeps the grade the agent gave', () => {
  const db = open(':memory:');
  db.prepare('insert into attempts (id, card, at, grade, agent_grade, contested, mode) values (?, ?, ?, ?, ?, 1, ?)')
    .run('a:1', 'c1', '2026-01-01T00:00:00.000Z', 'correct', 'wrong', 'drill');
  const row = db.prepare('select grade, agent_grade, contested from attempts where id = ?').get('a:1');
  assert.equal(row.grade, 'correct');
  assert.equal(row.agent_grade, 'wrong');
  assert.equal(row.contested, 1);
});

test('grounding is queryable by commit rather than buried in json', () => {
  const db = open(':memory:');
  db.prepare('insert into card_grounding (card, path, line, commit_sha) values (?, ?, ?, ?)').run('c1', 'server/io.js', 42, 'abc1234');
  db.prepare('insert into card_grounding (card, path, line, commit_sha) values (?, ?, ?, ?)').run('c2', 'db/rls.sql', 7, 'def5678');
  const stale = db.prepare('select card from card_grounding where commit_sha != ?').all('abc1234');
  assert.deepEqual(stale.map((r) => r.card), ['c2']);
});

test('events are unique per device and sequence', () => {
  const db = open(':memory:');
  const insert = db.prepare('insert into events (device, seq, at, type, v, data) values (?, ?, ?, ?, ?, ?)');
  insert.run('aaaaaaaa', 1, '2026-01-01T00:00:00.000Z', 'project.added', 1, '{}');
  assert.throws(() => insert.run('aaaaaaaa', 1, '2026-01-01T00:00:00.000Z', 'project.added', 1, '{}'), /UNIQUE/i);
});
