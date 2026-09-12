import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openState } from '../core/index.mjs';
import { handle } from './api.mjs';

function home() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sparring-api-import-'));
}

function source(dir, attempts = []) {
  const project = path.join(dir, 'raptor');
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(path.join(project, 'bank.json'), `${JSON.stringify({
    version: 2,
    project: 'raptor',
    repo: '/tmp/raptor',
    generated: '2026-09-05',
    cards: [{
      id: 'c001', level: 2, topic: 'auth', altitude: 'mechanism',
      concept: 'Token verification', ask: 'Why verify the token?',
      rubric: ['verification checks the signed claims'],
      grounding: ['server/auth.mjs:4'], contexts: ['raptor', 'generic'],
      source: { type: 'lesson', ref: '0001' }, retired: false,
    }],
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(project, 'scores.json'), `${JSON.stringify({ attempts }, null, 2)}\n`);
}

async function request(state, route, { method = 'GET', body } = {}) {
  let result;
  const res = {
    headersSent: false,
    writeHead(status) {
      this.status = status;
      this.headersSent = true;
    },
    end(value) {
      result = { status: this.status, body: value ? JSON.parse(value) : null };
    },
  };
  await handle(state, { method, url: route, body }, res);
  return result;
}

test('the API exposes discovery, preview, confirmation and idempotency', async () => {
  const dir = home();
  source(dir, [{ id: 'c001', cardId: 'c001', date: '2026-09-05T14:10:00Z', grade: 'correct', mode: 'drill' }]);
  const state = openState(dir);
  const found = await request(state, '/api/imports');
  assert.equal(found.status, 200);
  assert.deepEqual(found.body[0], {
    project: 'raptor', version: 2, formatVersion: 2, cards: 1, topics: 1, attempts: 1,
    importable: true, error: null,
  });

  const preview = await request(state, '/api/import/dry-run', { method: 'POST', body: { project: 'raptor' } });
  assert.equal(preview.status, 200);
  assert.deepEqual({
    projects: preview.body.projects,
    cards: preview.body.cards,
    topics: preview.body.topics,
    attempts: preview.body.attempts,
    refused: preview.body.refused,
  }, { projects: 1, cards: 1, topics: 1, attempts: 1, refused: [] });

  const imported = await request(state, '/api/import', { method: 'POST', body: { project: 'raptor' } });
  assert.equal(imported.status, 200);
  assert.equal(imported.body.imported, true);
  assert.equal((await request(state, '/api/projects')).body.length, 1);
  const second = await request(state, '/api/import', { method: 'POST', body: { project: 'raptor' } });
  assert.equal(second.status, 200);
  assert.equal(second.body.alreadyImported, true);
  assert.equal(state.db.prepare('select count(*) as n from attempts').get().n, 1);
});

test('the API reports a bad record without appending the bank', async () => {
  const dir = home();
  source(dir, [
    { id: 'c001', cardId: 'c001', date: '2026-09-05T14:10:00Z', grade: 'correct', mode: 'drill' },
    { id: 'c001', cardId: 'c001', date: '2026-09-05T14:11:00Z', grade: 'not-a-grade', mode: 'drill' },
  ]);
  const state = openState(dir);
  const result = await request(state, '/api/import', { method: 'POST', body: { project: 'raptor' } });
  assert.equal(result.status, 200);
  assert.equal(result.body.imported, false);
  assert.equal(result.body.projects, 0);
  assert.ok(result.body.refused.some((item) => item.record === 'attempt 2' && item.reason.includes('grade')));
  assert.equal(fs.existsSync(path.join(dir, 'log')), false);
});
