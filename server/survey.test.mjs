import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openState } from '../core/index.mjs';
import { slug, storeSurvey } from '../survey/store.mjs';
import { makeClaim } from '../survey/claim.mjs';
import { verify } from '../survey/verify.mjs';
import { handle } from './api.mjs';
import { dispatch } from './mcp.mjs';
import { PRESENCE_WINDOW_MS, forgetAgent, noteAgent, presence } from './presence.mjs';

function home() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sparring-')));
}

function repository() {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sparring-repo-')));
  const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  fs.writeFileSync(path.join(repo, 'index.mjs'), 'export const value = 1;\n');
  git('add', '-A');
  git('commit', '-qm', 'first');
  return repo;
}

async function request(state, route) {
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
  await handle(state, { method: 'GET', url: route }, res);
  return result;
}

test('the survey route reports a directory that is not a repository rather than inventing one', async () => {
  const state = openState(home());
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'sparring-plain-'));
  const answer = await request(state, `/api/survey?repo=${encodeURIComponent(plain)}`);
  assert.equal(answer.status, 200);
  assert.equal(answer.body.repository.git, false);
  assert.equal(answer.body.survey, null);
});

test('the survey route hands back the stored survey and what confirming it would write', async () => {
  const where = home();
  const state = openState(where);
  const repo = repository();
  const result = verify(repo, 'HEAD', [makeClaim({
    type: 'part',
    sentence: 'The entry point exports one value.',
    path: 'index.mjs',
    fromLine: 1,
    toLine: 1,
    extractor: 'test',
  })]);
  storeSurvey(where, repo, result);

  const answer = await request(state, `/api/survey?repo=${encodeURIComponent(repo)}`);
  assert.equal(answer.status, 200);
  assert.equal(answer.body.repository.git, true);
  assert.equal(answer.body.survey.claims.length, 1);
  assert.equal(typeof answer.body.seed.project, 'string');

  const listed = await request(state, '/api/surveys');
  assert.equal(listed.body.length, 1);
  assert.equal(listed.body[0].repo, repo);

  const inspected = await request(state, `/api/repository?path=${encodeURIComponent(repo)}`);
  assert.equal(inspected.body.git, true);
  assert.equal(inspected.body.files, 1);

  const map = await request(state, `/api/project-map?project=${encodeURIComponent(slug(path.basename(repo)))}`);
  assert.equal(map.status, 200);
  assert.equal(map.body.parts.length, 1);
  assert.equal(map.body.verifiedParts, 0, 'the gate did not verify this boundary claim');
  assert.equal(map.body.survey.coverage.segments.find((segment) => segment.id === 'not-inspected').count, 1);
});

test('presence is an observation with a window, not a claim that outlives the process', () => {
  forgetAgent();
  assert.deepEqual(presence().connected, false);
  assert.equal(presence().lastSeen, null);

  const at = Date.parse('2026-03-10T09:00:00Z');
  noteAgent(at);
  assert.equal(presence(at + 1000).connected, true);
  assert.equal(presence(at + PRESENCE_WINDOW_MS + 1).connected, false);
  assert.equal(presence(at).lastSeen, '2026-03-10T09:00:00.000Z');
  forgetAgent();
});

test('an MCP message is what marks an agent present, and the API route reports it', async () => {
  forgetAgent();
  const state = openState(home());
  const before = await request(state, '/api/agent');
  assert.equal(before.body.connected, false);

  dispatch(state, { jsonrpc: '2.0', id: 1, method: 'ping' });
  const after = await request(state, '/api/agent');
  assert.equal(after.body.connected, true);
  forgetAgent();
});
