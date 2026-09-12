import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { discoverBanks, dryRunImport, importBank, openState } from './index.mjs';

function home() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sparring-import-'));
}

function bank(project = 'raptor') {
  return {
    version: 2,
    project,
    repo: `/tmp/${project}`,
    generated: '2026-09-05',
    cards: [
      {
        id: 'c001',
        level: 2,
        topic: 'auth',
        altitude: 'boundary',
        concept: 'Tenant fence',
        ask: 'Where does the tenant fence live?',
        rubric: ['the function checks the authenticated tenant'],
        grounding: ['server/auth.mjs:42'],
        contexts: [project, 'library'],
        source: { type: 'lesson', ref: '0001' },
        retired: false,
      },
    ],
  };
}

function writeBank(homePath, value = bank(), attempts = []) {
  const dir = path.join(homePath, value.project);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'bank.json'), `${JSON.stringify(value, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'scores.json'), `${JSON.stringify({ attempts }, null, 2)}\n`);
}

function files(homePath) {
  const result = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else result.push([path.relative(homePath, file), fs.readFileSync(file)]);
    }
  };
  visit(homePath);
  return result.sort(([left], [right]) => left.localeCompare(right));
}

function attempt(cardId = 'c001', grade = 'partial') {
  return {
    id: cardId,
    cardId,
    date: '2026-09-05T14:10:00Z',
    grade,
    answer: 'the tenant is checked',
    gap: grade === 'partial' ? 'the function boundary' : null,
    mode: 'drill',
    question: 'Where is the fence?',
    context: 'raptor',
  };
}

test('discovery and dry run do not change anything on disk', () => {
  const dir = home();
  writeBank(dir, bank(), [attempt()]);
  const before = files(dir);

  assert.deepEqual(discoverBanks(dir), [{
    project: 'raptor', version: 2, formatVersion: 2, cards: 1, topics: 1, attempts: 1,
    importable: true, error: null,
  }]);
  const preview = dryRunImport(dir, 'raptor');
  assert.equal(preview.dryRun, true);
  assert.equal(preview.projects, 1);
  assert.equal(preview.cards, 1);
  assert.equal(preview.topics, 1);
  assert.equal(preview.attempts, 1);
  assert.deepEqual(preview.refused, []);
  assert.deepEqual(files(dir), before);
});

test('importing twice adds nothing the second time', () => {
  const dir = home();
  writeBank(dir, bank(), [attempt()]);
  const state = openState(dir);
  const first = importBank(state, 'raptor');
  assert.equal(first.imported, true);
  assert.equal(first.events, 4);
  assert.equal(state.db.prepare('select count(*) as n from projects').get().n, 1);
  assert.equal(state.db.prepare('select count(*) as n from cards').get().n, 1);
  assert.equal(state.db.prepare('select count(*) as n from attempts').get().n, 1);

  const logBefore = fs.readFileSync(path.join(dir, 'log', fs.readdirSync(path.join(dir, 'log'))[0]));
  const second = importBank(state, 'raptor');
  assert.equal(second.imported, false);
  assert.equal(second.alreadyImported, true);
  assert.equal(second.events, 0);
  const logAfter = fs.readFileSync(path.join(dir, 'log', fs.readdirSync(path.join(dir, 'log'))[0]));
  assert.equal(logAfter.equals(logBefore), true);
  assert.equal(state.db.prepare('select count(*) as n from attempts').get().n, 1);
});

test('one invalid record refuses the whole bank and names the record', () => {
  const dir = home();
  writeBank(dir, bank(), [attempt(), attempt('c001', 'excellent')]);
  const preview = dryRunImport(dir, 'raptor');
  assert.equal(preview.projects, 0);
  assert.equal(preview.cards, 0);
  assert.equal(preview.attempts, 0);
  assert.ok(preview.refused.some((item) => item.record === 'attempt 2' && item.reason.includes('grade')));
  const result = importBank(dir, 'raptor');
  assert.equal(result.imported, false);
  assert.ok(result.refused.some((item) => item.record === 'attempt 2'));
  assert.equal(fs.existsSync(path.join(dir, 'log')), false);
});

test('an attempt whose card is gone still survives', () => {
  const dir = home();
  writeBank(dir, bank(), [attempt(), attempt('c999', 'wrong')]);
  const state = openState(dir);
  const result = importBank(state, 'raptor');
  assert.equal(result.imported, true);
  assert.equal(state.db.prepare('select count(*) as n from attempts').get().n, 2);
  assert.equal(state.db.prepare('select count(*) as n from attempts where card = ?').get('c999').n, 1);
});

test('source bank files are byte-identical after import', () => {
  const dir = home();
  writeBank(dir, bank(), [attempt()]);
  const before = files(dir).filter(([file]) => file.endsWith('/bank.json') || file.endsWith('/scores.json'));
  const state = openState(dir);
  importBank(state, 'raptor');
  const after = files(dir).filter(([file]) => file.endsWith('/bank.json') || file.endsWith('/scores.json'));
  assert.deepEqual(after, before);
});

test('v1 question banks are discovered and converted without touching the source', () => {
  const dir = home();
  writeBank(dir, {
    project: 'raptor',
    repo: '/tmp/raptor',
    questions: [{
      id: 'q001', level: 2, topic: 'auth', question: 'Why verify the token?',
      reference: 'verification checks the signed claims', grounding: ['server/auth.mjs:4'],
    }],
  }, [attempt('q001', 'correct')]);
  assert.equal(discoverBanks(dir)[0].version, 1);
  const before = files(dir);
  const state = openState(dir);
  const result = importBank(state, 'raptor');
  assert.equal(result.imported, true);
  assert.equal(state.db.prepare('select count(*) as n from cards').get().n, 1);
  assert.equal(state.db.prepare('select count(*) as n from attempts').get().n, 1);
  assert.deepEqual(files(dir).filter(([file]) => file.startsWith('raptor/')), before.filter(([file]) => file.startsWith('raptor/')));
});

test('card ids shared by two CLI projects are namespaced only for the collision', () => {
  const dir = home();
  writeBank(dir, bank('raptor'), [attempt('c001', 'correct')]);
  writeBank(dir, bank('socketio-rooms'), [attempt('c001', 'wrong')]);
  const state = openState(dir);
  importBank(state, 'raptor');
  const second = importBank(state, 'socketio-rooms');
  assert.equal(second.imported, true);
  assert.deepEqual(state.db.prepare('select id from cards order by id').all().map((row) => row.id), ['c001', 'socketio-rooms:c001']);
  assert.deepEqual(state.db.prepare('select card, grade from attempts order by at, id').all().map((row) => ({ card: row.card, grade: row.grade })), [
    { card: 'c001', grade: 'correct' },
    { card: 'socketio-rooms:c001', grade: 'wrong' },
  ]);
});
