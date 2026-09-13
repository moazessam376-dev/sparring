import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openState, record, due, standing, refresh } from './index.mjs';

function home() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sparring-'));
}

function seedTwoProjects(state) {
  // Two projects, three cards each, so interleaving has something to do.
  for (const project of ['alpha', 'beta', 'gamma']) {
    state.append({ type: 'project.added', data: { project, name: project } });
    state.append({ type: 'topic.added', data: { topic: `${project}-t`, name: project, parent: null, kind: 'technology' } });
    for (let i = 1; i <= 3; i += 1) {
      state.append({ type: 'card.added', data: {
        card: `${project}-${i}`, project, concept: 'c', ask: 'a', rubric: ['r'], altitude: 'mechanism',
        topics: [`${project}-t`], grounding: [], contexts: [project], source: { type: 'seed', ref: '1' },
      } });
    }
  }
  refresh(state);
}

test('a recorded attempt lands in the log, the database and the schedule', () => {
  process.env.SPARRING_NOW = '2026-03-01T09:00:00Z';
  const state = openState(home());
  seedTwoProjects(state);
  record(state, { card: 'alpha-1', grade: 'correct', question: 'q', context: 'alpha', mode: 'drill' });
  const row = state.db.prepare('select * from card_sched where card = ?').get('alpha-1');
  assert.ok(row.due > '2026-03-01');
  assert.equal(state.db.prepare('select count(*) as n from attempts').get().n, 1);
  assert.ok(state.db.prepare('select rating from card_elo where card = ?').get('alpha-1').rating < 0);
  delete process.env.SPARRING_NOW;
});

test('rebuilding from the log reproduces the same state', () => {
  process.env.SPARRING_NOW = '2026-03-01T09:00:00Z';
  const dir = home();
  const first = openState(dir);
  seedTwoProjects(first);
  record(first, { card: 'alpha-1', grade: 'correct', mode: 'drill' });
  const before = first.db.prepare('select card, due from card_sched order by card').all();
  first.db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(path.join(dir, `cache.db${suffix}`), { force: true });
  const second = openState(dir);
  refresh(second);
  assert.deepEqual(second.db.prepare('select card, due from card_sched order by card').all(), before);
  delete process.env.SPARRING_NOW;
});

test('the due queue never puts two cards from one project together', () => {
  process.env.SPARRING_NOW = '2026-03-01T09:00:00Z';
  const state = openState(home());
  seedTwoProjects(state);
  const queue = due(state, { n: 9 });
  assert.equal(queue.length, 9);
  for (let i = 1; i < queue.length; i += 1) {
    assert.notEqual(queue[i].project, queue[i - 1].project, 'consecutive cards shared a project');
  }
  delete process.env.SPARRING_NOW;
});

test('the due queue never exposes a rubric', () => {
  process.env.SPARRING_NOW = '2026-03-01T09:00:00Z';
  const state = openState(home());
  seedTwoProjects(state);
  for (const card of due(state, { n: 9 })) {
    assert.equal(card.rubric, undefined, 'the queue leaked a rubric');
  }
  delete process.env.SPARRING_NOW;
});

test('the due queue never exposes a grounding reference', () => {
  process.env.SPARRING_NOW = '2026-03-01T09:00:00Z';
  const state = openState(home());
  state.append({ type: 'project.added', data: { project: 'delta', name: 'delta' } });
  state.append({ type: 'topic.added', data: { topic: 'delta-t', name: 'delta', parent: null, kind: 'technology' } });
  state.append({ type: 'card.added', data: {
    card: 'delta-1', project: 'delta', concept: 'c', ask: 'a', rubric: ['THE ANSWER ITSELF'],
    altitude: 'mechanism', topics: ['delta-t'],
    // A path nothing else in this file could produce, so a substring match on
    // the serialised queue is proof and not a coincidence.
    grounding: [{ path: 'src/WHERE-THE-ANSWER-LIVES.mjs', line: 42, commit: 'abc1234' }],
    contexts: ['delta'], source: { type: 'seed', ref: 'THE-SOURCE-REF' },
  } });
  refresh(state);

  const queue = due(state, { n: 9 });
  assert.equal(queue.length, 1);
  const [card] = queue;
  assert.equal(card.grounding, undefined, 'the queue leaked a grounding reference');
  assert.equal(card.rubric, undefined, 'the queue leaked a rubric');
  const serialised = JSON.stringify(queue);
  assert.equal(serialised.includes('WHERE-THE-ANSWER-LIVES'), false, 'the queue leaked the file the answer lives in');
  assert.equal(serialised.includes('THE ANSWER ITSELF'), false);
  assert.equal(serialised.includes('THE-SOURCE-REF'), false, 'the queue leaked the source a card was cut from');

  // The queue is a named list of columns, so a column added to the cards table
  // later is private until someone puts it on that list. This is the test that
  // fails if anyone goes back to select *.
  state.db.exec("alter table cards add column secret_hint text not null default 'THE FUTURE LEAK'");
  const after = due(state, { n: 9 });
  assert.equal(after[0].secret_hint, undefined, 'a new cards column reached the queue by default');
  assert.equal(JSON.stringify(after).includes('THE FUTURE LEAK'), false);
  delete process.env.SPARRING_NOW;
});

test('standing reports mastery per topic with its confidence', () => {
  process.env.SPARRING_NOW = '2026-03-01T09:00:00Z';
  const state = openState(home());
  seedTwoProjects(state);
  record(state, { card: 'alpha-1', grade: 'correct', mode: 'drill' });
  const report = standing(state, 'alpha');
  assert.equal(report.topics.length, 1);
  assert.ok(report.topics[0].score > 0 && report.topics[0].score < 1);
  assert.ok(report.topics[0].confidence < 1, 'one attempt must not read as confident');
  delete process.env.SPARRING_NOW;
});
