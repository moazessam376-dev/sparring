import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { makeClaim, hashText } from './claim.mjs';
import { spanAt } from './evidence.mjs';
import { verify } from './verify.mjs';

const repos = [];
after(() => { for (const dir of repos) fs.rmSync(dir, { recursive: true, force: true }); });

function git(dir, args) {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_AUTHOR_NAME: 'Honest fixture',
      GIT_AUTHOR_EMAIL: 'honest@example.invalid',
      GIT_COMMITTER_NAME: 'Honest fixture',
      GIT_COMMITTER_EMAIL: 'honest@example.invalid',
      LC_ALL: 'C',
    },
  });
}

function makeRepo(files) {
  const dir = fs.mkdtempSync(fileURLToPath(new URL('./.honest-', import.meta.url)));
  repos.push(dir);
  git(dir, ['init', '-q']);
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-qm', 'fixture']);
  return { dir, commit: git(dir, ['rev-parse', 'HEAD']).trim() };
}

const FILES = {
  'core/index.mjs': [
    "import fs from 'node:fs';",
    "import { clock } from './clock.mjs';",
    "import packageThing from 'installed-package';",
    'export function coreThing() { return clock() + Boolean(fs) + Boolean(packageThing); }',
    '',
  ].join('\n'),
  'core/clock.mjs': [
    "import { DatabaseSync } from 'node:sqlite';",
    'export function clock() { return new DatabaseSync; }',
    '',
  ].join('\n'),
  'server/index.mjs': [
    "import http from 'node:http';",
    "import { coreThing } from '../core/index.mjs';",
    "import { handle } from './api.mjs';",
    'export function start() { return http && coreThing() && handle(); }',
    '',
  ].join('\n'),
  'server/api.mjs': [
    "import os from 'node:os';",
    "import { coreThing } from '../core/index.mjs';",
    'export function handle() { return os && coreThing(); }',
    '',
  ].join('\n'),
  'lesson/store.mjs': [
    "import fs from 'node:fs';",
    'export function validateLesson(doc) { return { ok: Boolean(doc) }; }',
    'export function storeLesson(doc) { fs.writeFileSync(\'lesson.json\', JSON.stringify(doc)); }',
    'export function saveLesson(doc) {',
    '  const checked = validateLesson(doc);',
    '  if (!checked.ok) return false;',
    '  storeLesson(doc);',
    '  return true;',
    '}',
    '',
  ].join('\n'),
  'python/stdlib.py': [
    'import json',
    'from installed_package import helper',
    'def render(value):',
    '    return json.dumps(helper(value))',
    '',
  ].join('\n'),
  'README.md': 'A repository fixture.\n',
};

function citation(fixture, file, fromLine = 1, toLine = fromLine) {
  const span = spanAt(fixture.dir, file, fromLine, toLine, fixture.commit);
  return { path: file, fromLine, toLine, spanHash: span.hash };
}

function boundary(fixture, dir, neighbour, citationPath) {
  return makeClaim({
    type: 'part',
    sentence: `\`${dir}\` has denser internal imports than crossing imports.`,
    predicate: 'boundary',
    identifiers: [{ kind: 'module', name: dir }, { kind: 'module', name: neighbour }],
    boundary: { dir, neighbours: [neighbour] },
    ...citation(fixture, citationPath),
    commit: fixture.commit,
    extractor: 'honest-fixture',
  });
}

function interaction(fixture, symbol, from, to) {
  const lines = fs.readFileSync(path.join(fixture.dir, from), 'utf8').trimEnd().split('\n').length;
  return makeClaim({
    type: 'interaction',
    sentence: `\`${symbol}\` is referenced in \`${from}\` and defined in \`${to}\`.`,
    predicate: 'reference',
    identifiers: [{ kind: 'symbol', name: symbol }, { kind: 'path', name: from }, { kind: 'path', name: to }],
    ends: { from: { path: from, symbol }, to: { path: to, symbol } },
    ...citation(fixture, from, 1, lines),
    commit: fixture.commit,
    extractor: 'honest-fixture',
  });
}

function validationClaim(fixture) {
  return makeClaim({
    type: 'constraint',
    sentence: 'Lesson documents are validated before storage.',
    constraintKind: 'validation-before-persistence',
    identifiers: [{ kind: 'path', name: 'lesson/store.mjs' }],
    ...citation(fixture, 'lesson/store.mjs', 4, 8),
    commit: fixture.commit,
    extractor: 'honest-fixture',
  });
}

test('an honest survey verifies boundaries with visible external imports and the real ordered constraint', () => {
  const fixture = makeRepo(FILES);
  const boundaries = verify(fixture.dir, fixture.commit, [
    boundary(fixture, 'core', 'server', 'core/index.mjs'),
    boundary(fixture, 'server', 'core', 'server/index.mjs'),
  ]).claims;
  const constraint = verify(fixture.dir, fixture.commit, [validationClaim(fixture)]).claims[0];
  const trivial = verify(fixture.dir, fixture.commit, [
    interaction(fixture, 'coreThing', 'server/index.mjs', 'core/index.mjs'),
    interaction(fixture, 'handle', 'server/index.mjs', 'server/api.mjs'),
    interaction(fixture, 'validateLesson', 'lesson/store.mjs', 'lesson/store.mjs'),
    interaction(fixture, 'storeLesson', 'lesson/store.mjs', 'lesson/store.mjs'),
  ]).claims;

  assert.equal(boundaries[0].status, 'verified');
  assert.equal(boundaries[1].status, 'verified');
  assert.ok(boundaries[0].boundaryMetrics.externalEdges > 0);
  assert.ok(boundaries[1].boundaryMetrics.externalEdges > 0);
  assert.equal(boundaries[0].boundaryMetrics.unresolvedEdges, 0);
  assert.equal(boundaries[1].boundaryMetrics.unresolvedEdges, 0);
  assert.ok(boundaries[0].external.some((edge) => edge.spec === 'node:fs'));
  assert.ok(boundaries[0].external.some((edge) => edge.spec === 'installed-package'));
  assert.ok(boundaries[0].external.some((edge) => edge.path === 'python/stdlib.py' && edge.spec === 'json'));
  assert.ok(boundaries[0].external.some((edge) => edge.path === 'python/stdlib.py' && edge.spec === 'installed_package'));
  assert.equal(constraint.status, 'verified');
  assert.equal(constraint.structuralEvidence.verified, true);
  assert.deepEqual(trivial.map((claim) => claim.status), ['verified', 'verified', 'verified', 'verified']);
});

test('a validator elsewhere in the file cannot stand in for validation on the write path', () => {
  const fixture = makeRepo({
    'lesson/store.mjs': [
      "import fs from 'node:fs';",
      'export function validateLesson(doc) { return { ok: Boolean(doc) }; }',
      'export function storeLesson(doc) { fs.writeFileSync(\'lesson.json\', JSON.stringify(doc)); }',
      'export function saveLesson(doc) {',
      '  storeLesson(doc);',
      '  return true;',
      '}',
      'export function inspectLesson(doc) {',
      '  return validateLesson(doc);',
      '}',
      '',
    ].join('\n'),
  });
  const result = verify(fixture.dir, fixture.commit, [validationClaim({ ...fixture })]);
  const claim = result.claims[0];
  assert.notEqual(claim.status, 'verified');
  assert.equal(claim.structuralEvidence.verified, false);
  assert.match(claim.reasons.find((reason) => reason.check === 'enforcement').detail, /every path/);
});

test('the citation helper hashes the same bytes the gate verifies', () => {
  const fixture = makeRepo(FILES);
  const span = spanAt(fixture.dir, 'core/index.mjs', 1, 1, fixture.commit);
  assert.equal(span.hash, hashText(span.text));
});
