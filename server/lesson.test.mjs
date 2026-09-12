import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openState } from '../core/index.mjs';
import { handle } from './api.mjs';

function home() { return fs.mkdtempSync(path.join(os.tmpdir(), 'sparring-lesson-api-')); }
async function request(state, route, { method = 'GET', body } = {}) {
  let result;
  const res = { headersSent: false, writeHead(status) { this.status = status; this.headersSent = true; }, end(value) { result = { status: this.status, body: value ? JSON.parse(value) : null }; } };
  await handle(state, { method, url: route, body }, res);
  return result;
}

test('lesson list, get, start, reveal, answer and complete routes keep answers behind commitment', async () => {
  const state = openState(home());
  const doc = JSON.parse(fs.readFileSync(new URL('../lesson/examples/redis-locking.json', import.meta.url), 'utf8'));
  fs.mkdirSync(path.join(state.home, 'lessons'));
  fs.writeFileSync(path.join(state.home, 'lessons', `${doc.id}.json`), `${JSON.stringify(doc)}\n`);
  const list = await request(state, '/api/lessons');
  assert.equal(list.status, 200);
  assert.equal(list.body[0].blocks, 15);
  const safe = await request(state, `/api/lessons/${doc.id}`);
  assert.equal(safe.status, 200);
  assert.equal(Object.hasOwn(safe.body.blocks[6], 'answer'), false);
  assert.equal(Object.hasOwn(safe.body.blocks[5], 'reviewAgainst'), false);
  assert.equal(Object.hasOwn(safe.body.blocks[9], 'file'), false);
  const started = await request(state, `/api/lessons/${doc.id}/start`, { method: 'POST', body: { run: 'api-run' } });
  assert.equal(started.body.id, 'api-run');
  const beforeCommit = await request(state, `/api/lessons/${doc.id}/reveal`, { method: 'POST', body: { run: 'api-run', block: 5 } });
  assert.equal(beforeCommit.status, 400);
  const codeAnswer = await request(state, `/api/lessons/${doc.id}/answer`, { method: 'POST', body: { run: 'api-run', block: 5, answer: '{"language":"lua","code":"return"}', stored: true } });
  assert.equal(codeAnswer.body.status, 'stored');
  const codeReveal = await request(state, `/api/lessons/${doc.id}/reveal`, { method: 'POST', body: { run: 'api-run', block: 5 } });
  assert.deepEqual(codeReveal.body.data.reviewAgainst, doc.blocks[5].reviewAgainst);
  const beforeRecallCommit = await request(state, `/api/lessons/${doc.id}/reveal`, { method: 'POST', body: { run: 'api-run', block: 6 } });
  assert.equal(beforeRecallCommit.status, 400);
  const recallAnswer = await request(state, `/api/lessons/${doc.id}/answer`, { method: 'POST', body: { run: 'api-run', block: 6, answer: 'commit', stored: true } });
  assert.equal(recallAnswer.body.status, 'stored');
  const revealed = await request(state, `/api/lessons/${doc.id}/reveal`, { method: 'POST', body: { run: 'api-run', block: 6 } });
  assert.equal(revealed.body.data.answer, doc.blocks[6].answer);
  const completed = await request(state, `/api/lessons/${doc.id}/complete`, { method: 'POST', body: { run: 'api-run' } });
  assert.equal(completed.body.completed, true);
});
