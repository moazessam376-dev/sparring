import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { makeClaim } from './.baseline/claim.mjs';
import { spanAt } from './.baseline/evidence.mjs';
import { verify } from './.baseline/verify.mjs';
import { MAX_PATTERN_LENGTH, matchTexts } from './patterns.mjs';
import { CONSTRAINT_QUERIES } from './queries.mjs';

const repos = [];
after(() => { for (const dir of repos) fs.rmSync(dir, { recursive: true, force: true }); });
function repo(files) {
  const dir = fs.mkdtempSync(fileURLToPath(new URL('./.attack-', import.meta.url)));
  repos.push(dir);
  const git = (args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
    cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { PATH: process.env.PATH, GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid',
      GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' },
  });
  git(['init', '-q']);
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  git(['add', '-A']);
  git(['commit', '-qm', 'fixture']);
  return { dir, commit: git(['rev-parse', 'HEAD']).trim() };
}
function check(fixture, fields) {
  return verify(fixture.dir, fixture.commit, [makeClaim({ commit: fixture.commit, ...fields })]).claims[0];
}
function citation(fixture, path, fromLine = 1, toLine = fromLine) {
  return { path, fromLine, toLine, spanHash: spanAt(fixture.dir, path, fromLine, toLine, fixture.commit).hash };
}
function reference(fixture, symbol, path, fromLine = 1) {
  return { type: 'topic', predicate: 'reference', sentence: `\`${symbol}\` is referenced in \`${path}\`.`,
    identifiers: [{ kind: 'symbol', name: symbol }, { kind: 'path', name: path }],
    ...citation(fixture, path, fromLine) };
}
function transaction(extra = {}) {
  return { type: 'constraint', constraintKind: 'transactions', sentence: 'Every write is wrapped in a transaction.', ...extra };
}

// The record gives attack classes rather than eight archived JSON payloads.
// These eight concrete reproductions each verified under the original gate.
test('original attack 1: an arbitrary export pattern cannot enforce transactions', () => {
  const fixture = repo({ 'store.mjs': 'export function write() { return []; }\n' });
  const out = check(fixture, transaction({ enforcement: { pattern: 'export' } }));
  assert.equal(out.status, 'verified');
});
test('original attack 2: an irrelevant enforcement point plus a dud falsifier buys no credibility', () => {
  const fixture = repo({ 'store.mjs': 'export function withTenant() {}\nexport function write() {}\n' });
  const out = check(fixture, transaction({ enforcement: { pattern: 'withTenant' }, falsifier: { pattern: 'IMPOSSIBLE_SENTINEL' } }));
  assert.equal(out.status, 'verified');
});
test('original attack 3: a true span hash cannot verify invented backoff, jitter and a circuit breaker', () => {
  const fixture = repo({ 'orders.mjs': 'export function loadOrders() { return []; }\n' });
  const out = check(fixture, { type: 'topic', sentence: 'loadOrders implements exponential backoff with jitter and a circuit breaker.',
    identifiers: [{ kind: 'symbol', name: 'loadOrders' }], ...citation(fixture, 'orders.mjs') });
  assert.equal(out.status, 'verified');
});
test('original attack 4: the whole repository cannot be its own neighbour', () => {
  const fixture = repo({ 'a.mjs': "import './b.mjs';\n", 'b.mjs': 'export const b = 1;\n' });
  const out = check(fixture, { type: 'part', sentence: 'The entire repository is a cohesive boundary.',
    boundary: { dir: '.', neighbours: ['.'] }, ...citation(fixture, 'a.mjs') });
  assert.equal(out.status, 'verified');
});
test('original attack 5: commented-out enforcement is weak evidence', () => {
  const fixture = repo({ 'store.mjs': '// beginTransaction();\nexport function write() {}\n' });
  const out = check(fixture, transaction({ enforcement: { pattern: 'beginTransaction' } }));
  assert.equal(out.status, 'verified');
});
test('original attack 6: enforcement quoted in a string is weak evidence', () => {
  const fixture = repo({ 'store.mjs': 'const example = "beginTransaction()";\nexport function write() {}\n' });
  const out = check(fixture, transaction({ enforcement: { pattern: 'beginTransaction' } }));
  assert.equal(out.status, 'verified');
});
test('original attack 7: enforcement found only in a test is weak evidence', () => {
  const fixture = repo({ 'store.test.mjs': 'beginTransaction();\n', 'store.mjs': 'export function write() {}\n' });
  const out = check(fixture, transaction({ enforcement: { pattern: 'beginTransaction' } }));
  assert.equal(out.status, 'verified');
});
test('original attack 8: TODO mentions and commented definitions cannot resolve an interaction', () => {
  const fixture = repo({ 'caller.mjs': '// TODO: doWork();\nexport const caller = 1;\n',
    'worker.mjs': '// function doWork() {}\nexport const worker = 1;\n' });
  const out = check(fixture, { type: 'interaction', sentence: 'The caller calls doWork.',
    ends: { from: { path: 'caller.mjs', symbol: 'doWork' }, to: { path: 'worker.mjs', symbol: 'doWork' } } });
  assert.equal(out.status, 'verified');
});
