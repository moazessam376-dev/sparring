import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { addProject, openState } from '../core/index.mjs';
import { readAll } from '../core/log.mjs';
import { makeClaim } from '../survey/claim.mjs';
import { storeSurvey } from '../survey/store.mjs';
import { handle } from './api.mjs';

function home() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sparring-vouch-api-'));
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

function stored(home, repo, claim) {
  storeSurvey(home, repo, {
    claims: [claim],
    coverage: { counts: {} },
    summary: {
      repo,
      commit: null,
      claims: 1,
      byStatus: { verified: 0, inferred: 0, stale: 0, unchecked: 1, contradicted: 0 },
      shownAsFact: 0,
      shownQualified: 1,
      dropped: 0,
      trackedFiles: 0,
      coverage: {},
    },
  });
}

async function request(state, route, body) {
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
  await handle(state, { method: 'POST', url: route, body }, res);
  return result;
}

test('API vouch routes delegate vouching and withdrawal to the core', async () => {
  const dir = home();
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'sparring-vouch-repo-'));
  const state = openState(dir);
  const target = claim();
  stored(dir, repo, target);

  const vouched = await request(state, '/api/vouch', {
    repo,
    claimId: target.id,
    judgement: 'I built this repository and know this boundary.',
  });
  assert.equal(vouched.status, 200);
  assert.equal(vouched.body.status, 'vouched');
  assert.equal(vouched.body.gateStatus, 'unchecked');
  assert.equal(readAll(dir).at(-1).type, 'claim.vouched');

  const withdrawn = await request(state, '/api/vouch/withdraw', { claim: target.id });
  assert.equal(withdrawn.status, 200);
  assert.equal(withdrawn.body.status, 'unchecked');
  assert.equal(withdrawn.body.vouched, false);
  assert.equal(readAll(dir).at(-1).type, 'claim.vouch.withdrawn');
});

test('a malformed vouch request is rejected without changing the log', async () => {
  const dir = home();
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'sparring-vouch-repo-'));
  const state = openState(dir);
  const target = claim();
  stored(dir, repo, target);
  addProject(state, { project: 'baseline', name: 'Baseline' });
  const file = logFile(dir);
  const before = fs.readFileSync(file);

  const malformed = await request(state, '/api/vouch', {
    repo,
    claimId: target.id,
    judgement: '',
  });
  assert.equal(malformed.status, 400);
  assert.match(malformed.body.error, /judgement must be a non-empty string/);
  assert.equal(fs.readFileSync(file).equals(before), true);
});

test('the API refuses a contradicted claim without appending an event', async () => {
  const dir = home();
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'sparring-vouch-repo-'));
  const state = openState(dir);
  const target = claim('contradicted');
  stored(dir, repo, target);
  addProject(state, { project: 'baseline', name: 'Baseline' });
  const file = logFile(dir);
  const before = fs.readFileSync(file);

  const refused = await request(state, '/api/vouch', {
    repo,
    claimId: target.id,
    judgement: 'The user cannot overrule a contradiction.',
  });
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /claim status contradicted cannot be vouched/);
  assert.equal(fs.readFileSync(file).equals(before), true);
});
