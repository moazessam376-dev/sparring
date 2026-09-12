import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  addCards,
  addProject,
  addTopics,
  contest,
  openState,
  record,
  refresh,
} from './index.mjs';

// The event log is the only durable record and the database is a disposable
// cache derived from it. An event the reducer cannot apply is therefore not a
// failed request: it is a line that makes every later replay throw, so the
// cache can never be rebuilt and the whole history is gone. These tests hold
// both halves of that: nothing unreducible is ever appended, and an event that
// is already in a log is quarantined rather than fatal.

function home() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sparring-poison-'));
}

function logFile(dir) {
  const logs = path.join(dir, 'log');
  const names = fs.readdirSync(logs).filter((name) => name.endsWith('.jsonl'));
  assert.equal(names.length, 1, 'expected exactly one device log');
  return path.join(logs, names[0]);
}

function seeded() {
  const dir = home();
  const state = openState(dir);
  addProject(state, { project: 'raptor', name: 'Raptor' });
  addTopics(state, [{ topic: 'acks', name: 'Acknowledgements', parent: null, kind: 'concept', project: 'raptor' }]);
  addCards(state, [{
    id: 'c001',
    project: 'raptor',
    concept: 'Ack timeout',
    ask: 'What happens when an acknowledgement never arrives?',
    rubric: ['the callback never fires'],
    altitude: 'mechanism',
    topics: ['acks'],
    grounding: [],
    contexts: ['raptor'],
    source: { type: 'seed', ref: '1' },
  }]);
  return { state, dir };
}

// Assert on the bytes of the log, not merely that an error was thrown. A
// rejected write that still appended is the entire defect.
function refuses(dir, message, action) {
  const file = logFile(dir);
  const before = fs.readFileSync(file);
  assert.throws(action, message);
  const after = fs.readFileSync(file);
  assert.equal(after.equals(before), true, 'the refused write changed the log file');
}

test('an invalid grade is refused and the log is byte-identical afterwards', () => {
  process.env.SPARRING_NOW = '2026-03-10T09:00:00Z';
  const { state, dir } = seeded();
  refuses(dir, /grade must be one of correct, partial, wrong/, () => {
    record(state, { card: 'c001', grade: 'excellent', mode: 'drill' });
  });
  assert.equal(state.db.prepare('select count(*) as n from attempts').get().n, 0);
  delete process.env.SPARRING_NOW;
});

test('an invalid mode is refused and the log is byte-identical afterwards', () => {
  process.env.SPARRING_NOW = '2026-03-10T09:00:00Z';
  const { state, dir } = seeded();
  refuses(dir, /mode must be one of drill, mock, transfer, lesson/, () => {
    record(state, { card: 'c001', grade: 'correct', mode: 'interrogation' });
  });
  assert.equal(state.db.prepare('select count(*) as n from attempts').get().n, 0);
  delete process.env.SPARRING_NOW;
});

test('an attempt against an unknown card is refused and the log is byte-identical afterwards', () => {
  process.env.SPARRING_NOW = '2026-03-10T09:00:00Z';
  const { state, dir } = seeded();
  refuses(dir, /card not found: c404/, () => {
    record(state, { card: 'c404', grade: 'correct', mode: 'drill' });
  });
  assert.equal(state.db.prepare('select count(*) as n from attempts').get().n, 0);
  delete process.env.SPARRING_NOW;
});

test('an invalid altitude is refused by addCards and the log is byte-identical afterwards', () => {
  const { state, dir } = seeded();
  refuses(dir, /altitude must be one of map, boundary, mechanism, line/, () => {
    addCards(state, [{
      id: 'c002', project: 'raptor', concept: 'Reconnect', ask: 'How does reconnect work?',
      rubric: ['it retries'], altitude: 'stratosphere', topics: ['acks'], grounding: [],
    }]);
  });
  assert.equal(state.db.prepare('select count(*) as n from cards').get().n, 1);
});

test('an invalid topic kind is refused by addTopics and the log is byte-identical afterwards', () => {
  const { state, dir } = seeded();
  refuses(dir, /kind must be one of technology, concept, skill/, () => {
    addTopics(state, [{ topic: 'fencing', name: 'Fencing tokens', parent: null, kind: 'vibe', project: 'raptor' }]);
  });
  assert.equal(state.db.prepare('select count(*) as n from topics').get().n, 1);
});

test('a bad entry late in a batch leaves none of the batch in the log', () => {
  const { state, dir } = seeded();
  refuses(dir, /topic 2 kind/, () => {
    addTopics(state, [
      { topic: 'good', name: 'Good', parent: null, kind: 'concept', project: 'raptor' },
      { topic: 'bad', name: 'Bad', parent: null, kind: 'vibe', project: 'raptor' },
    ]);
  });
  assert.equal(state.db.prepare('select count(*) as n from topics').get().n, 1);
});

test('a project without an id and a contest with a bad grade are both refused', () => {
  process.env.SPARRING_NOW = '2026-03-10T09:00:00Z';
  const { state, dir } = seeded();
  refuses(dir, /project must be a non-empty string/, () => addProject(state, { name: 'Nameless' }));
  refuses(dir, /topic 1 name must be a non-empty string/, () => addTopics(state, [{ topic: 'nameless' }]));
  record(state, { card: 'c001', grade: 'wrong', mode: 'drill' });
  const attempt = state.db.prepare('select id from attempts').get().id;
  refuses(dir, /userGrade must be one of correct, partial, wrong/, () => {
    contest(state, { attempt, userGrade: 'excellent' });
  });
  assert.equal(state.db.prepare('select grade from attempts').get().grade, 'wrong');
  delete process.env.SPARRING_NOW;
});

// The recovery path, and the most important test here. Anyone whose log was
// poisoned before the write path was fixed has to get their history back by
// opening the application again, with no manual surgery on the log.
test('a log with a hand-written poisoned event still rebuilds', () => {
  process.env.SPARRING_NOW = '2026-03-10T09:00:00Z';
  const { state, dir } = seeded();
  record(state, { card: 'c001', grade: 'correct', mode: 'drill' });
  state.db.close();

  // Written by hand, exactly as the old record() would have appended it: a
  // grade the attempts CHECK refuses, sitting between two good events.
  const file = logFile(dir);
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter((line) => line.trim());
  const last = JSON.parse(lines[lines.length - 1]);
  const device = last.device;
  const poisoned = {
    id: `${device}:${last.seq + 1}`,
    device,
    seq: last.seq + 1,
    at: '2026-03-10T09:30:00.000Z',
    type: 'attempt.recorded',
    v: 1,
    data: { card: 'c001', grade: 'excellent', question: null, context: null, answer: null, gap: null, mode: 'drill' },
  };
  const good = {
    id: `${device}:${last.seq + 2}`,
    device,
    seq: last.seq + 2,
    at: '2026-03-10T10:00:00.000Z',
    type: 'attempt.recorded',
    v: 1,
    data: { card: 'c001', grade: 'partial', question: null, context: null, answer: null, gap: null, mode: 'drill' },
  };
  fs.appendFileSync(file, `${JSON.stringify(poisoned)}\n${JSON.stringify(good)}\n`);

  // The cache is disposable, so recovery has to work from the log alone.
  fs.rmSync(path.join(dir, 'cache.db'), { force: true });
  fs.rmSync(path.join(dir, 'cache.db-wal'), { force: true });
  fs.rmSync(path.join(dir, 'cache.db-shm'), { force: true });

  let reopened;
  assert.doesNotThrow(() => { reopened = openState(dir); }, 'openState must not throw on a poisoned log');
  let result;
  assert.doesNotThrow(() => { result = refresh(reopened); }, 'refresh must not throw on a poisoned log');

  assert.equal(result.quarantined.length, 1, 'the bad event must be counted, not silently skipped');
  assert.equal(result.quarantined[0].id, poisoned.id);
  assert.equal(result.quarantined[0].type, 'attempt.recorded');
  assert.match(result.quarantined[0].reason, /grade/);
  assert.deepEqual(reopened.quarantined, result.quarantined);

  // Everything around the bad event is intact: the project, the topic, the
  // card, and both good attempts.
  assert.equal(reopened.db.prepare('select count(*) as n from projects').get().n, 1);
  assert.equal(reopened.db.prepare('select count(*) as n from topics').get().n, 1);
  assert.equal(reopened.db.prepare('select count(*) as n from cards').get().n, 1);
  assert.deepEqual(
    reopened.db.prepare('select grade from attempts order by at').all().map((row) => row.grade),
    ['correct', 'partial'],
    'the good attempts on either side of the poison must both survive',
  );
  assert.ok(reopened.db.prepare('select * from card_sched where card = ?').get('c001'), 'the schedule must rebuild');

  // Quarantine is not a one-off repair: the event stays in the log, so every
  // later rebuild has to reach the same state rather than degrade.
  const again = refresh(reopened);
  assert.equal(again.quarantined.length, 1);
  assert.equal(reopened.db.prepare('select count(*) as n from attempts').get().n, 2);
  delete process.env.SPARRING_NOW;
});

test('a poisoned log survives being reopened through record as well as refresh', () => {
  process.env.SPARRING_NOW = '2026-03-10T09:00:00Z';
  const { state, dir } = seeded();
  const file = logFile(dir);
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter((line) => line.trim());
  const last = JSON.parse(lines[lines.length - 1]);
  fs.appendFileSync(file, `${JSON.stringify({
    id: `${last.device}:${last.seq + 1}`,
    device: last.device,
    seq: last.seq + 1,
    at: '2026-03-10T09:15:00.000Z',
    type: 'topic.added',
    v: 1,
    data: { topic: 'broken', name: 'Broken', parent: null, kind: 'vibe' },
  })}\n`);
  state.db.close();

  const reopened = openState(dir);
  const sched = record(reopened, { card: 'c001', grade: 'correct', mode: 'drill' });
  assert.ok(sched, 'a new attempt must still be recordable against a poisoned log');
  assert.equal(reopened.quarantined.length, 1);
  assert.equal(reopened.db.prepare('select count(*) as n from topics').get().n, 1, 'the bad topic must not be materialised');
  delete process.env.SPARRING_NOW;
});
