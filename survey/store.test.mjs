import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeClaim } from './claim.mjs';
import { verify } from './verify.mjs';
import { canonicalRepositoryPath } from './evidence.mjs';
import {
  claimName,
  inspectRepository,
  listSurveys,
  projectMapState,
  seedFrom,
  slug,
  storeSurvey,
  surveyKey,
  surveyState,
} from './store.mjs';
import { openState, vouch } from '../core/index.mjs';

function temp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function git(repo, ...args) {
  execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
}

function repository() {
  const repo = fs.realpathSync(temp('sparring-repo-'));
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.email', 'test@example.com');
  git(repo, 'config', 'user.name', 'Test');
  fs.mkdirSync(path.join(repo, 'db'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'db', 'tenant.mjs'), 'export function withTenant(id) {\n  return id;\n}\n');
  fs.writeFileSync(path.join(repo, 'index.mjs'), "import { withTenant } from './db/tenant.mjs';\nexport default withTenant;\n");
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'first');
  return repo;
}

test('a directory that is not a git repository is reported as one, not guessed at', () => {
  const plain = temp('sparring-plain-');
  const inspected = inspectRepository(plain);
  assert.equal(inspected.exists, true);
  assert.equal(inspected.git, false);
  assert.equal(inspected.root, null);

  const missing = inspectRepository(path.join(plain, 'nothing-here'));
  assert.equal(missing.exists, false);
  assert.equal(missing.git, false);
});

test('a directory inside a repository answers with the repository root', () => {
  const repo = repository();
  const inspected = inspectRepository(path.join(repo, 'db'));
  assert.equal(inspected.git, true);
  assert.equal(inspected.root, canonicalRepositoryPath(repo));
  assert.equal(inspected.name, path.basename(repo));
  assert.equal(inspected.files, 2);
  assert.equal(inspected.language, 'js');
  assert.match(inspected.head ?? '', /^[0-9a-f]{40,64}$/);
});

test('a stored survey is found again by repository, newest first', () => {
  const home = temp('sparring-home-');
  const repo = repository();
  const result = verify(repo, 'HEAD', [makeClaim({
    type: 'part',
    sentence: 'The tenant helper scopes every read.',
    path: 'db/tenant.mjs',
    fromLine: 1,
    toLine: 3,
    extractor: 'test',
    boundary: { dir: 'db', neighbours: ['index.mjs'] },
  })]);
  storeSurvey(home, repo, result);

  const listed = listSurveys(home);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].repo, canonicalRepositoryPath(repo));

  const state = surveyState(home, repo);
  assert.equal(state.repo, canonicalRepositoryPath(repo));
  assert.equal(state.repository.git, true);
  assert.notEqual(state.survey, null);
  assert.equal(state.survey.claims.length, 1);
  assert.equal(state.survey.claims[0].name, 'db');
});

test('no survey for a repository is null rather than an empty survey', () => {
  const home = temp('sparring-home-');
  const repo = repository();
  const state = surveyState(home, repo);
  assert.equal(state.survey, null);
  assert.equal(state.seed, null);
});

test('the project map reports no stored survey instead of inventing an empty map', () => {
  const home = temp('sparring-home-');
  const map = projectMapState(home, 'raptor');
  assert.equal(map.survey, null);
  assert.deepEqual(map.parts, []);
  assert.deepEqual(map.constraints, []);
  assert.deepEqual(map.edges, []);
});

test('the key is stable for a repository and commit', () => {
  assert.equal(surveyKey('/a', 'abc'), surveyKey('/a', 'abc'));
  assert.notEqual(surveyKey('/a', 'abc'), surveyKey('/a', 'abd'));
  assert.notEqual(surveyKey('/a', 'abc'), surveyKey('/b', 'abc'));
});

test('only a verified or inferred claim seeds a topic or a card', () => {
  const seed = seedFrom({
    summary: { repo: '/tmp/raptor' },
    claims: [
      { id: 'part-1', type: 'part', status: 'verified', sentence: 'The hub holds the sockets.', path: 'server/hub.js', fromLine: 31, commit: 'abc', boundary: { dir: 'server', neighbours: [] } },
      { id: 'part-2', type: 'part', status: 'contradicted', sentence: 'The pool reads Postgres.', path: 'workers/index.js', fromLine: 19, commit: 'abc' },
      { id: 'part-3', type: 'part', status: 'unchecked', sentence: 'Inferred from configuration.', path: 'infra/cdn.tf', fromLine: 88, commit: 'abc' },
      { id: 'con-4', type: 'constraint', status: 'inferred', sentence: 'Every read carries the tenant.', path: 'db/policies.sql', fromLine: 42, commit: 'abc' },
    ],
  });
  assert.deepEqual(seed.topics.map((topic) => topic.topic), ['part-1', 'con-4']);
  assert.deepEqual(seed.cards.map((card) => card.id), ['part-1-q1', 'con-4-q1']);
  assert.equal(seed.cards[0].altitude, 'map');
  assert.equal(seed.cards[1].altitude, 'mechanism');
  assert.deepEqual(seed.cards[0].grounding, [{ path: 'server/hub.js', line: 31, commit: 'abc' }]);
  assert.deepEqual(seed.cards[0].rubric, ['The hub holds the sockets.']);
  assert.equal(seed.project, 'raptor');
});

test('a claim without a cited line seeds a topic but never a card', () => {
  const seed = seedFrom({
    summary: { repo: '/tmp/raptor' },
    claims: [{ id: 'topic-1', type: 'topic', status: 'verified', sentence: 'Scheduling lives here.', path: null, fromLine: null }],
  });
  assert.equal(seed.topics.length, 1);
  assert.equal(seed.cards.length, 0);
});

test('a claim is named from its evidence rather than from its sentence when it can be', () => {
  assert.equal(claimName({ type: 'part', sentence: 'x', boundary: { dir: 'server/realtime' } }), 'server/realtime');
  assert.equal(
    claimName({ type: 'interaction', sentence: 'x', ends: { from: { symbol: 'publish' }, to: { symbol: 'consume' } } }),
    'publish to consume',
  );
  assert.equal(claimName({ type: 'constraint', sentence: 'x', path: 'db/policies/sessions.sql' }), 'sessions');
  assert.equal(claimName({ type: 'topic', sentence: 'One two three four five six', path: null }), 'One two three four five');
});

test('the project map keeps every claim status and excludes a vouch from verified counts', () => {
  const home = temp('sparring-home-');
  const repo = repository();
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  const claims = [
    makeClaim({ id: 'part-verified', type: 'part', status: 'verified', sentence: 'The verified part owns the boundary.', path: 'index.mjs', fromLine: 1, toLine: 1, commit, extractor: 'test', boundary: { dir: '.', neighbours: [] } }),
    makeClaim({ id: 'part-vouched', type: 'part', status: 'inferred', sentence: 'The user confirms this part.', path: 'index.mjs', fromLine: 1, toLine: 1, commit, extractor: 'test', boundary: { dir: '.', neighbours: [] } }),
    makeClaim({ id: 'part-stale', type: 'part', status: 'stale', sentence: 'The stale part remains visible.', path: 'index.mjs', fromLine: 1, toLine: 1, commit, extractor: 'test', boundary: { dir: '.', neighbours: [] } }),
    makeClaim({ id: 'part-unchecked', type: 'part', status: 'unchecked', sentence: 'The unchecked part remains visible.', path: 'index.mjs', fromLine: 1, toLine: 1, commit, extractor: 'test', boundary: { dir: '.', neighbours: [] } }),
    makeClaim({ id: 'part-contradicted', type: 'part', status: 'contradicted', sentence: 'The contradicted part remains visible.', path: 'index.mjs', fromLine: 1, toLine: 1, commit, extractor: 'test', boundary: { dir: '.', neighbours: [] } }),
    makeClaim({ id: 'constraint-inferred', type: 'constraint', status: 'inferred', sentence: 'A constraint remains visible.', path: 'index.mjs', fromLine: 1, toLine: 1, commit, extractor: 'test' }),
    makeClaim({ id: 'interaction-verified', type: 'interaction', status: 'verified', sentence: 'One part calls another.', path: 'index.mjs', fromLine: 1, toLine: 1, commit, extractor: 'test', ends: { from: { path: 'index.mjs', symbol: 'one' }, to: { path: 'index.mjs', symbol: 'two' } } }),
  ];
  storeSurvey(home, repo, {
    summary: { repo, commit, claims: claims.length, shownAsFact: 2, shownQualified: 5, dropped: 0, trackedFiles: 2 },
    coverage: { counts: { inspected: 1, excluded: 0, generated: 0, binary: 0, unresolved: 0, pending: 1 } },
    claims,
  });
  const state = openState(home);
  vouch(state, { claim: claims[1], judgement: 'I built this part.' });
  const map = projectMapState(home, slug(path.basename(repo)));
  assert.deepEqual(new Set(map.parts.map((part) => part.status)), new Set(['verified', 'vouched', 'stale', 'unchecked', 'contradicted']));
  assert.deepEqual(map.edges.map((edge) => edge.status), ['verified']);
  assert.equal(map.verifiedParts, 1);
  assert.equal(map.vouchedClaims, 1);
  assert.equal(map.survey.coverage.segments.find((segment) => segment.id === 'not-inspected').count, 1);
});
