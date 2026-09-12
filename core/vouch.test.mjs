import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeClaim } from '../survey/claim.mjs';
import {
  addCards,
  addProject,
  addTopics,
  openState,
  projects,
  refresh,
  topics,
  vouch,
  vouchFor,
  withdrawVouch,
} from './index.mjs';
import { readAll } from './log.mjs';

function home() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sparring-vouch-'));
}

function claim(status = 'unchecked') {
  return makeClaim({
    id: `claim-${status}`,
    type: 'topic',
    status,
    sentence: 'The repository has this architectural property.',
    extractor: 'test',
  });
}

function logFile(dir) {
  const name = fs.readdirSync(path.join(dir, 'log')).find((entry) => entry.endsWith('.jsonl'));
  assert.ok(name);
  return path.join(dir, 'log', name);
}

function seeded() {
  const dir = home();
  const state = openState(dir);
  addProject(state, { project: 'raptor', name: 'Raptor' });
  addTopics(state, [{ topic: 'acks', name: 'Acknowledgements', parent: null, kind: 'concept', project: 'raptor' }]);
  addCards(state, [{
    id: 'c001', project: 'raptor', concept: 'Acknowledgements', ask: 'What is acknowledged?',
    rubric: ['the callback fires'], altitude: 'map', topics: ['acks'], grounding: [],
  }]);
  return { dir, state };
}

test('vouching is a third state and leaves every verified count unchanged', () => {
  const { state } = seeded();
  const beforeProjects = projects(state);
  const beforeTopics = topics(state, 'raptor');
  const target = claim();

  const result = vouch(state, { claim: target, judgement: 'I built this repository and know this boundary.' });

  assert.equal(result.status, 'vouched');
  assert.equal(result.gateStatus, 'unchecked');
  assert.equal(projects(state)[0].cards, beforeProjects[0].cards);
  assert.equal(topics(state, 'raptor').topics[0].cards, beforeTopics.topics[0].cards);
  assert.equal(state.db.prepare('select count(*) as n from vouches').get().n, 1);
  assert.equal(vouchFor(state, target.id).status, 'vouched');
  assert.equal(readAll(state.home).filter((event) => event.type === 'claim.vouched').length, 1);
});

test('a contradicted claim cannot be vouched and the log stays byte-identical', () => {
  const { dir, state } = seeded();
  const before = fs.readFileSync(logFile(dir));
  assert.throws(
    () => vouch(state, { claim: claim('contradicted'), judgement: 'I know this is true.' }),
    /claim status contradicted cannot be vouched/,
  );
  assert.equal(fs.readFileSync(logFile(dir)).equals(before), true);
  assert.equal(state.db.prepare('select count(*) as n from vouches').get().n, 0);
});

test('a vouch event survives rebuilding the cache from the append-only log', () => {
  const { dir, state } = seeded();
  const target = claim();
  vouch(state, { claim: target, judgement: 'I wrote the code.' });
  state.db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(path.join(dir, `cache.db${suffix}`), { force: true });

  const rebuilt = openState(dir);
  refresh(rebuilt);
  assert.deepEqual(vouchFor(rebuilt, target.id), {
    claim: target.id,
    status: 'vouched',
    gateStatus: 'unchecked',
    judgement: 'I wrote the code.',
    at: readAll(dir).find((event) => event.type === 'claim.vouched').at,
  });
});

test('withdrawing a vouch is an event and returns the claim to its gate status', () => {
  const { state } = seeded();
  const target = claim('stale');
  vouch(state, { claim: target, judgement: 'The code moved, but the design is mine.' });
  const withdrawn = withdrawVouch(state, { claim: target.id });
  assert.equal(withdrawn.status, 'stale');
  assert.equal(vouchFor(state, target.id), null);
  assert.equal(state.db.prepare('select count(*) as n from vouches').get().n, 0);
  assert.deepEqual(readAll(state.home).map((event) => event.type).slice(-2), ['claim.vouched', 'claim.vouch.withdrawn']);
});

test('a malformed vouch request is refused before it can change the log', () => {
  const { dir, state } = seeded();
  const before = fs.readFileSync(logFile(dir));
  assert.throws(
    () => vouch(state, { claim: { id: 'not-a-claim', status: 'unchecked' }, judgement: 'I know.' }),
    /claim cannot be vouched/,
  );
  assert.equal(fs.readFileSync(logFile(dir)).equals(before), true);
});
