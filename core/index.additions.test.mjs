import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  addCards,
  addProject,
  addTopics,
  card,
  contest,
  gaps,
  openState,
  projects,
  record,
  refresh,
  topics,
} from './index.mjs';

function home() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sparring-'));
}

function seeded() {
  const state = openState(home());
  addProject(state, { project: 'raptor', name: 'Raptor', remote: 'https://example.test/raptor' });
  addTopics(state, [
    { topic: 'socketio', name: 'socket.io', parent: null, kind: 'technology', project: 'raptor' },
    { topic: 'acks', name: 'Acknowledgements', parent: 'socketio', kind: 'concept', project: 'raptor' },
  ]);
  addCards(state, [{
    id: 'c001',
    project: 'raptor',
    concept: 'Ack timeout',
    ask: 'What happens when an acknowledgement never arrives?',
    rubric: ['the callback never fires'],
    altitude: 'mechanism',
    topics: ['acks'],
    grounding: [{ path: 'server/io.mjs', line: 42, commit: 'abc123' }],
    contexts: ['raptor', 'library'],
    source: { type: 'lesson', ref: 'acks' },
  }]);
  return state;
}

test('projects counts active cards and cards due today', () => {
  process.env.SPARRING_NOW = '2026-03-10T09:00:00Z';
  const state = seeded();
  addCards(state, [{
    id: 'c002', project: 'raptor', concept: 'Reconnect', ask: 'How does reconnect work?',
    rubric: ['it retries'], altitude: 'boundary', topics: ['socketio'], grounding: [],
  }]);
  record(state, { card: 'c001', grade: 'correct', mode: 'drill' });
  assert.deepEqual(projects(state), [{
    id: 'raptor', name: 'Raptor', remote: 'https://example.test/raptor', added: '2026-03-10', due: 1, cards: 2,
  }]);
  delete process.env.SPARRING_NOW;
});

test('topics filters links, includes mastery, and returns prerequisite edges', () => {
  process.env.SPARRING_NOW = '2026-03-10T09:00:00Z';
  const state = seeded();
  state.append({ type: 'topic.prereq', data: { topic: 'acks', requires: 'socketio' } });
  state.append({ type: 'topic.added', data: { topic: 'unlinked', name: 'Unlinked', parent: null, kind: 'skill' } });
  state.append({ type: 'topic.prereq', data: { topic: 'unlinked', requires: 'acks' } });
  refresh(state);
  record(state, { card: 'c001', grade: 'correct', mode: 'drill' });
  const projectTopics = topics(state, 'raptor');
  assert.deepEqual(projectTopics.topics.map(({ id }) => id), ['acks', 'socketio']);
  assert.deepEqual(projectTopics.edges, [{ topic: 'acks', requires: 'socketio' }]);
  assert.equal(projectTopics.topics.find(({ id }) => id === 'acks').cards, 1);
  assert.equal(projectTopics.topics.find(({ id }) => id === 'acks').confidence, 1 / 12);
  assert.deepEqual(topics(state, null).topics.map(({ id }) => id), ['acks', 'socketio', 'unlinked']);
  delete process.env.SPARRING_NOW;
});

test('card returns parsed private material and grounding rows', () => {
  const result = card(seeded(), 'c001');
  assert.deepEqual(result.rubric, ['the callback never fires']);
  assert.deepEqual(result.grounding, [{ path: 'server/io.mjs', line: 42, commit: 'abc123' }]);
  assert.deepEqual(result.topics, ['acks']);
  assert.equal(typeof result.rubric, 'object');
});

test('addCards validates the whole batch before appending', () => {
  const state = seeded();
  assert.throws(() => addCards(state, [
    { id: 'c002', project: 'raptor', concept: 'One', ask: 'one', rubric: ['one'], altitude: 'map', topics: ['acks'], grounding: [] },
    { id: 'c003', project: 'raptor', concept: 'Two', ask: 'two', rubric: [], altitude: 'line', topics: ['acks'], grounding: [] },
  ]), /rubric/);
  assert.equal(state.db.prepare('select count(*) as n from cards').get().n, 1);
  assert.equal(state.db.prepare('select count(*) as n from events').get().n, 6);
});

test('contest changes the current grade while retaining the agent grade', () => {
  process.env.SPARRING_NOW = '2026-03-10T09:00:00Z';
  const state = seeded();
  record(state, { card: 'c001', grade: 'wrong', mode: 'drill' });
  const attempt = state.db.prepare('select id from attempts').get().id;
  const result = contest(state, { attempt, userGrade: 'correct' });
  assert.equal(result.grade, 'correct');
  assert.equal(result.agent_grade, 'wrong');
  assert.equal(result.contested, 1);
  delete process.env.SPARRING_NOW;
});

test('gaps returns recent wrong and partial attempts grouped by topic', () => {
  process.env.SPARRING_NOW = '2026-03-10T09:00:00Z';
  const state = seeded();
  record(state, { card: 'c001', grade: 'wrong', gap: 'missing timeout', mode: 'drill' });
  process.env.SPARRING_NOW = '2026-03-15T09:00:00Z';
  record(state, { card: 'c001', grade: 'partial', gap: 'named symptom only', mode: 'transfer' });
  assert.deepEqual(gaps(state, { days: 7 }).map((group) => ({
    topic: group.topic,
    grades: group.attempts.map((attempt) => attempt.grade),
  })), [{ topic: 'acks', grades: ['partial', 'wrong'] }]);
  process.env.SPARRING_NOW = '2026-03-25T09:00:00Z';
  assert.deepEqual(gaps(state, { days: 7 }), []);
  delete process.env.SPARRING_NOW;
});
