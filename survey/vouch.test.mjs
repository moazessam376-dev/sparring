import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { addCards, addProject, addTopics, openState, topics, vouch, withdrawVouch } from '../core/index.mjs';
import { readAll } from '../core/log.mjs';
import { makeClaim } from './claim.mjs';
import { seedFrom, storeSurvey, surveyState } from './store.mjs';
import { handle } from '../server/api.mjs';

function temp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function uncheckedClaim(id = 'topic-unchecked') {
  return makeClaim({
    id,
    type: 'topic',
    status: 'unchecked',
    sentence: 'The repository has this architectural property.',
    path: 'src/index.mjs',
    fromLine: 1,
    toLine: 1,
    extractor: 'test',
  });
}

function stored(home, repo, claims) {
  const byStatus = { verified: 0, inferred: 0, stale: 0, unchecked: 0, contradicted: 0 };
  for (const item of claims) byStatus[item.status] += 1;
  storeSurvey(home, repo, {
    claims,
    coverage: { counts: {} },
    summary: {
      repo,
      commit: null,
      claims: claims.length,
      byStatus,
      shownAsFact: byStatus.verified,
      shownQualified: claims.length - byStatus.verified,
      dropped: 0,
      trackedFiles: 0,
      coverage: {},
    },
  });
}

function logFile(dir) {
  const name = fs.readdirSync(path.join(dir, 'log')).find((entry) => entry.endsWith('.jsonl'));
  assert.ok(name);
  return path.join(dir, 'log', name);
}

function baseline(state) {
  addProject(state, { project: 'baseline', name: 'Baseline' });
  return logFile(state.home);
}

async function request(state, body) {
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
  await handle(state, { method: 'POST', url: '/api/vouch', body }, res);
  return result;
}

test('an unchecked claim is seeded after a vouch without changing the gate summary', () => {
  const home = temp('sparring-vouch-survey-');
  const repo = temp('sparring-vouch-repo-');
  const claim = uncheckedClaim();
  stored(home, repo, [claim]);
  const state = openState(home);
  const before = surveyState(home, repo);

  vouch(state, { claim, judgement: 'I built this repository and know the design.' });
  const after = surveyState(home, repo);

  assert.equal(after.survey.claims[0].status, 'vouched');
  assert.equal(after.survey.claims[0].gateStatus, 'unchecked');
  assert.equal(after.survey.claims[0].vouched, true);
  assert.equal(after.survey.summary.byStatus.verified, before.survey.summary.byStatus.verified);
  assert.equal(after.survey.summary.shownAsFact, before.survey.summary.shownAsFact);
  assert.equal(after.seed.topics.length, 1);
  assert.equal(after.seed.cards.length, 1);

  const verified = seedFrom({ summary: { repo }, claims: [{ ...claim, status: 'verified' }] });
  assert.equal(after.seed.topics.length, verified.topics.length);
  assert.equal(after.seed.cards.length, verified.cards.length);
  assert.equal(after.seed.cards[0].ask, verified.cards[0].ask);
  assert.deepEqual(after.seed.cards[0].grounding, verified.cards[0].grounding);

  addProject(state, { project: after.seed.project, name: 'Vouched repository' });
  addTopics(state, after.seed.topics);
  addCards(state, after.seed.cards);
  assert.deepEqual(topics(state, after.seed.project).topics[0], {
    id: claim.id,
    name: 'index',
    parent: null,
    kind: 'concept',
    cards: 1,
    score: 0.2689414213699951,
    confidence: 0,
    gateStatus: 'unchecked',
    vouched: true,
  });
});

test('withdrawing a survey vouch removes the overlay and restores the gate status', () => {
  const home = temp('sparring-vouch-survey-');
  const repo = temp('sparring-vouch-repo-');
  const claim = uncheckedClaim('topic-withdraw');
  stored(home, repo, [claim]);
  const state = openState(home);
  vouch(state, { claim, judgement: 'I know this because I built it.' });
  withdrawVouch(state, { claim: claim.id });

  const restored = surveyState(home, repo);
  assert.equal(restored.survey.claims[0].status, 'unchecked');
  assert.equal(restored.survey.claims[0].gateStatus, null);
  assert.equal(restored.survey.claims[0].vouched, false);
  assert.equal(restored.seed.topics.length, 0);
  assert.equal(restored.seed.cards.length, 0);
});

test('a request naming a stored contradicted claim is refused without changing the log', async () => {
  const home = temp('sparring-vouch-survey-');
  const repo = temp('sparring-vouch-repo-');
  const target = uncheckedClaim('topic-contradicted');
  target.status = 'contradicted';
  stored(home, repo, [target]);
  const state = openState(home);
  const file = baseline(state);
  const before = fs.readFileSync(file);

  const refused = await request(state, {
    repo,
    claimId: target.id,
    judgement: 'The stored gate result still wins.',
  });
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /claim status contradicted cannot be vouched/);
  assert.equal(fs.readFileSync(file).equals(before), true);
});

test('a forged unchecked claim cannot vouch for a stored contradicted claim', async () => {
  const home = temp('sparring-vouch-survey-');
  const repo = temp('sparring-vouch-repo-');
  const target = uncheckedClaim('topic-forged-contradiction');
  target.status = 'contradicted';
  stored(home, repo, [target]);
  const state = openState(home);
  const file = baseline(state);
  const before = fs.readFileSync(file);

  const refused = await request(state, {
    repo,
    claimId: target.id,
    status: 'unchecked',
    claim: { ...target, status: 'unchecked' },
    judgement: 'The forged status must not influence the gate decision.',
  });
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /claim status contradicted cannot be vouched/);
  assert.equal(fs.readFileSync(file).equals(before), true);
});

test('a request naming a claim absent from the stored survey is refused', async () => {
  const home = temp('sparring-vouch-survey-');
  const repo = temp('sparring-vouch-repo-');
  stored(home, repo, [uncheckedClaim('topic-present')]);
  const state = openState(home);
  const file = baseline(state);
  const before = fs.readFileSync(file);

  const refused = await request(state, {
    repo,
    claimId: 'topic-missing',
    judgement: 'There is no stored claim for this id.',
  });
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /claim not found in stored survey/);
  assert.equal(fs.readFileSync(file).equals(before), true);
});

test('an honest vouch uses the stored unchecked claim and leaves verified counts unchanged', async () => {
  const home = temp('sparring-vouch-survey-');
  const repo = temp('sparring-vouch-repo-');
  const verified = uncheckedClaim('topic-verified');
  verified.status = 'verified';
  const target = uncheckedClaim('topic-honest');
  stored(home, repo, [verified, target]);
  const state = openState(home);
  baseline(state);
  const before = surveyState(home, repo);

  const vouched = await request(state, {
    repo,
    claimId: target.id,
    judgement: 'I built this repository and know this claim is true.',
  });
  assert.equal(vouched.status, 200);
  assert.equal(vouched.body.status, 'vouched');
  assert.equal(vouched.body.claim, target.id);
  assert.equal(vouched.body.gateStatus, 'unchecked');

  const after = surveyState(home, repo);
  assert.equal(after.survey.summary.byStatus.verified, before.survey.summary.byStatus.verified);
  assert.equal(after.survey.summary.shownAsFact, before.survey.summary.shownAsFact);
  assert.equal(after.survey.claims.find((claim) => claim.id === target.id).status, 'vouched');
  assert.equal(after.seed.topics.some((topic) => topic.claim === target.id), true);
  assert.equal(readAll(home).at(-1).data.claim.status, 'unchecked');
});
