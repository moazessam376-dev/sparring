import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openState } from '../core/index.mjs';
import { handle } from './api.mjs';

function home() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sparring-'));
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

test('API serves health and returns JSON for unknown routes', async () => {
  const state = openState(home());
  assert.deepEqual((await request(state, '/api/health')).body, { ok: true, version: 1, node: process.version });
  assert.equal((await request(state, '/api/unknown')).status, 404);
});

test('API wraps the core and due never exposes a rubric', async () => {
  process.env.SPARRING_NOW = '2026-03-10T09:00:00Z';
  const state = openState(home());
  try {
    assert.equal((await request(state, '/api/projects', { method: 'POST', body: {
      project: 'raptor', name: 'Raptor', remote: null,
    } })).status, 200);
    assert.equal((await request(state, '/api/topics', { method: 'POST', body: [{
      topic: 'auth', name: 'Authentication', parent: null, kind: 'concept', project: 'raptor',
    }] })).body, 1);
    const added = await request(state, '/api/cards', { method: 'POST', body: [{
      id: 'c001', project: 'raptor', concept: 'Bearer token', ask: 'Why use a bearer token?',
      rubric: ['the server authenticates the request'], altitude: 'boundary', topics: ['auth'],
      grounding: [{ path: 'server/auth.mjs', line: 10, commit: 'abc123' }],
    }] });
    assert.deepEqual(added.body, ['c001']);

    const due = await request(state, '/api/due?n=1');
    assert.equal(due.status, 200);
    assert.equal(due.body.length, 1);
    assert.equal(Object.hasOwn(due.body[0], 'rubric'), false);
    assert.equal(JSON.stringify(due.body).includes('the server authenticates the request'), false);

    const full = await request(state, '/api/card/c001');
    assert.deepEqual(full.body.rubric, ['the server authenticates the request']);
    assert.deepEqual(full.body.grounding, [{ path: 'server/auth.mjs', line: 10, commit: 'abc123' }]);

    const before = await request(state, '/api/standing?project=raptor');
    const attempt = await request(state, '/api/attempt', { method: 'POST', body: {
      card: 'c001', grade: 'correct', question: 'Why?', context: 'raptor', answer: 'It authenticates.',
      gap: null, mode: 'drill',
    } });
    assert.equal(attempt.status, 200);
    const after = await request(state, '/api/standing?project=raptor');
    assert.notEqual(after.body.topics[0].score, before.body.topics[0].score);
    assert.equal((await request(state, '/api/unknown')).status, 404);
  } finally {
    delete process.env.SPARRING_NOW;
  }
});
