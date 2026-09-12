import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { CLAIM_STATUSES, COVERAGE_LABELS, claimId, hashText, makeClaim, severity, worst } from './claim.mjs';
import {
  fileAt,
  filesAt,
  filesUnder,
  grepFor,
  importsOf,
  linesOf,
  resolveCommit,
  spanAt,
  supportsImports,
  treeAt,
} from './evidence.mjs';
import { classifyCoverage, verify } from './verify.mjs';

// The gate is only as good as the git it drives, so the fixtures are real
// repositories in a temporary directory with real commits. Nothing here is
// mocked: every check in this file runs against a tree git actually stores.

function git(dir, args) {
  return execFileSync('git', args, {
    cwd: dir,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_AUTHOR_NAME: 'Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'Fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
      GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
      LC_ALL: 'C',
    },
  });
}

function makeRepo(files, message = 'first') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sparring-survey-'));
  git(dir, ['init', '-q']);
  git(dir, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
  writeAll(dir, files);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', message]);
  const commit = git(dir, ['rev-parse', 'HEAD']).trim();
  return { dir, commit };
}

function writeAll(dir, files) {
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    if (Buffer.isBuffer(content)) fs.writeFileSync(full, content);
    else fs.writeFileSync(full, content);
  }
}

function commitAll(dir, files, message) {
  writeAll(dir, files);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', message]);
  return git(dir, ['rev-parse', 'HEAD']).trim();
}

// A small repository with a real module boundary, a real call path and a real
// enforced constraint. Every positive test in this file cites it.
const FIXTURE = {
  'api/server.mjs': [
    "import { withTenant } from '../db/tenant.mjs';",
    "import { loadOrders } from '../db/orders.mjs';",
    '',
    'export async function handleOrders(request) {',
    '  return withTenant(request.tenantId, () => loadOrders(request.tenantId));',
    '}',
    '',
  ].join('\n'),
  'db/orders.mjs': [
    "import { withTenant } from './tenant.mjs';",
    '',
    'export function loadOrders(tenantId) {',
    '  return withTenant(tenantId, () => []);',
    '}',
    '',
  ].join('\n'),
  'db/tenant.mjs': [
    '// Every read and write passes through here.',
    'export function withTenant(tenantId, run) {',
    '  if (!tenantId) throw new Error("tenant is required");',
    '  return run();',
    '}',
    '',
  ].join('\n'),
  'tools/report.py': [
    'from db.helpers import summarise',
    'import json, os',
    '',
    'def report(rows):',
    '    return json.dumps(summarise(rows))',
    '',
  ].join('\n'),
  'db/helpers.py': [
    'def summarise(rows):',
    '    return {"n": len(rows)}',
    '',
  ].join('\n'),
  'docs/notes.md': 'Notes about the service.\n',
  'README.md': 'Fixture repository.\n',
};

function fixture() {
  return makeRepo(FIXTURE);
}

// ---------------------------------------------------------------- claim shape

test('claim statuses order worst first and worst() takes the worse of two', () => {
  assert.ok(severity('contradicted') < severity('stale'));
  assert.ok(severity('stale') < severity('unchecked'));
  assert.ok(severity('unchecked') < severity('inferred'));
  assert.ok(severity('inferred') < severity('verified'));
  assert.equal(worst('verified', 'stale'), 'stale');
  assert.equal(worst('contradicted', 'unchecked'), 'contradicted');
  assert.equal(worst('verified', 'verified'), 'verified');
});

test('a claim is unchecked until something checks it', () => {
  const claim = makeClaim({ type: 'topic', sentence: 'The service is multi-tenant.' });
  assert.equal(claim.status, 'unchecked');
  assert.ok(CLAIM_STATUSES.includes(claim.status));
});

test('claim ids are stable across runs and differ by content', () => {
  const fields = { type: 'part', path: 'db/tenant.mjs', fromLine: 2, toLine: 5, sentence: 'Tenancy lives here.' };
  assert.equal(claimId(fields), claimId({ ...fields }));
  assert.notEqual(claimId(fields), claimId({ ...fields, sentence: 'Something else.' }));
});

test('makeClaim rejects a bad type, a bad range and an escaping path', () => {
  assert.throws(() => makeClaim({ type: 'vibe' }), /unknown claim type/);
  assert.throws(() => makeClaim({ type: 'part', path: 'a.mjs', fromLine: 9, toLine: 2 }), /toLine must not precede/);
  assert.throws(() => makeClaim({ type: 'part', path: '../outside.mjs' }), /must not escape/);
  assert.throws(() => makeClaim({ type: 'part', fromLine: 3 }), /must cite a path/);
});

// ------------------------------------------------------------------- evidence

test('spanAt returns the exact text at a commit and hashes it', () => {
  const { dir, commit } = fixture();
  const span = spanAt(dir, 'db/tenant.mjs', 2, 3, commit);
  assert.equal(span.text, 'export function withTenant(tenantId, run) {\n  if (!tenantId) throw new Error("tenant is required");');
  assert.equal(span.hash, hashText(span.text));
  assert.equal(span.fileLines, 5);
});

test('spanAt returns null for a path that is not in the tree and for a range past its end', () => {
  const { dir, commit } = fixture();
  assert.equal(spanAt(dir, 'db/nope.mjs', 1, 1, commit), null);
  assert.equal(spanAt(dir, 'db/tenant.mjs', 1, 500, commit), null);
  assert.equal(spanAt(dir, 'db/tenant.mjs', 0, 1, commit), null);
});

test('linesOf does not count a trailing newline as a final empty line', () => {
  assert.equal(linesOf('a\nb\nc\n').length, 3);
  assert.equal(linesOf('a\nb\nc').length, 3);
  assert.equal(linesOf('').length, 0);
});

test('importsOf reads static, dynamic, require and re-export forms in JavaScript', () => {
  const { dir, commit } = makeRepo({
    'a.mjs': [
      "import { one } from './one.mjs';",
      "import './side-effect.mjs';",
      "export { two } from './two.mjs';",
      "const three = require('./three.cjs');",
      "const four = await import('./four.mjs');",
      "// import { lie } from './not-real.mjs';",
      "const text = 'import { alsoNotReal } from \"./nope.mjs\"';",
      '',
    ].join('\n'),
  });
  const specs = importsOf(dir, 'a.mjs', commit).map((entry) => entry.spec);
  assert.deepEqual(
    [...new Set(specs)].sort(),
    ['./four.mjs', './one.mjs', './side-effect.mjs', './three.cjs', './two.mjs'],
  );
  assert.equal(importsOf(dir, 'a.mjs', commit).find((entry) => entry.spec === './two.mjs').line, 3);
});

test('importsOf reads Python import and from forms and skips comments', () => {
  const { dir, commit } = fixture();
  const specs = importsOf(dir, 'tools/report.py', commit).map((entry) => entry.spec).sort();
  assert.deepEqual(specs, ['db.helpers', 'json', 'os']);
});

test('importsOf distinguishes a file it cannot parse from a file with no imports', () => {
  const { dir, commit } = makeRepo({ 'main.go': 'package main\nimport "fmt"\n', 'empty.mjs': '// nothing\n' });
  assert.equal(supportsImports('main.go'), false);
  assert.equal(supportsImports('empty.mjs'), true);
  assert.deepEqual(importsOf(dir, 'main.go', commit), []);
  assert.deepEqual(importsOf(dir, 'empty.mjs', commit), []);
  assert.equal(importsOf(dir, 'gone.mjs', commit), null);
});

test('grepFor returns path and line pairs and nothing when there is no match', () => {
  const { dir, commit } = fixture();
  const hits = grepFor(dir, 'withTenant\\(', ['*.mjs'], commit);
  assert.ok(hits.length >= 3);
  assert.ok(hits.every((hit) => hit.path.endsWith('.mjs') && Number.isInteger(hit.line)));
  assert.deepEqual(grepFor(dir, 'thisStringIsNotInTheFixture', [], commit), []);
});

test('grepFor searches only tracked content, so an ignored file can never be evidence', () => {
  const { dir, commit } = fixture();
  fs.writeFileSync(path.join(dir, '.gitignore'), 'secret.mjs\n');
  fs.writeFileSync(path.join(dir, 'secret.mjs'), 'export const enforceTheThing = 1;\n');
  assert.deepEqual(grepFor(dir, 'enforceTheThing', [], commit), []);
  assert.deepEqual(grepFor(dir, 'enforceTheThing', []), []);
});

test('filesUnder and filesAt list tracked files', () => {
  const { dir, commit } = fixture();
  assert.deepEqual(filesUnder(dir, 'db'), ['db/helpers.py', 'db/orders.mjs', 'db/tenant.mjs']);
  assert.deepEqual(filesAt(dir, commit, 'db'), ['db/helpers.py', 'db/orders.mjs', 'db/tenant.mjs']);
  assert.equal(filesAt(dir, commit).length, Object.keys(FIXTURE).length);
  assert.ok(treeAt(dir, commit).every((entry) => entry.type === 'blob'));
});

test('nothing in the surveyed repository is executed, even when it asks to be', () => {
  const { dir, commit } = fixture();
  const marker = path.join(dir, 'EXECUTED');
  // A textconv driver is the classic way a repository turns a read into an
  // execution. The gate must never pass --textconv, and must never let the
  // repository's own config decide.
  fs.writeFileSync(path.join(dir, '.gitattributes'), '* diff=hostile\n');
  git(dir, ['config', 'diff.hostile.textconv', `sh -c 'touch ${marker}; cat'`]);
  git(dir, ['config', 'core.fsmonitor', `sh -c 'touch ${marker}'`]);
  fs.mkdirSync(path.join(dir, '.git', 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.git', 'hooks', 'post-index-change'), `#!/bin/sh\ntouch ${marker}\n`, { mode: 0o755 });

  const span = spanAt(dir, 'db/tenant.mjs', 1, 1, commit);
  assert.equal(span.text, '// Every read and write passes through here.');
  filesUnder(dir, '.');
  grepFor(dir, 'withTenant', [], commit);
  importsOf(dir, 'db/orders.mjs', commit);
  assert.equal(fs.existsSync(marker), false, 'the surveyed repository was executed');
});

// -------------------------------------------------------------- verify checks

function surveyed(commit, extra = {}) {
  return { commit, extractor: 'fixture', ...extra };
}

test('check: the cited path must exist at the surveyed commit', () => {
  const { dir, commit } = fixture();
  const claims = [
    makeClaim({ type: 'topic', sentence: 'Tenancy is a topic.', path: 'db/tenant.mjs', fromLine: 2, toLine: 2, ...surveyed(commit) }),
    makeClaim({ type: 'topic', sentence: 'A file that is not there.', path: 'db/ghost.mjs', fromLine: 1, toLine: 1, ...surveyed(commit) }),
  ];
  const { claims: out } = verify(dir, commit, claims);
  assert.equal(out[0].reasons.find((r) => r.check === 'path').status, 'verified');
  assert.equal(out[1].status, 'contradicted');
  assert.match(out[1].reasons.find((r) => r.check === 'path').detail, /does not exist at/);
});

test('check: the line range must be inside the file at that commit', () => {
  const { dir, commit } = fixture();
  const claim = makeClaim({ type: 'topic', sentence: 'Line 400 says something.', path: 'db/tenant.mjs', fromLine: 400, toLine: 401, ...surveyed(commit) });
  const { claims: out } = verify(dir, commit, [claim]);
  assert.equal(out[0].status, 'contradicted');
  assert.match(out[0].reasons.find((r) => r.check === 'range').detail, /fall outside db\/tenant\.mjs, which has 5 line/);
});

test('check: a span hash mismatch is stale, not contradicted', () => {
  const { dir, commit } = fixture();
  const span = spanAt(dir, 'db/tenant.mjs', 2, 5, commit);
  const good = makeClaim({ type: 'topic', sentence: 'withTenant guards every read.', path: 'db/tenant.mjs', fromLine: 2, toLine: 5, spanHash: span.hash, ...surveyed(commit) });
  const drifted = makeClaim({ type: 'topic', sentence: 'withTenant guards every read.', path: 'db/tenant.mjs', fromLine: 2, toLine: 5, spanHash: hashText('something the file never said'), ...surveyed(commit) });
  const { claims: out } = verify(dir, commit, [good, drifted]);
  assert.equal(out[0].status, 'verified');
  assert.equal(out[1].status, 'stale');
  assert.equal(out[1].reasons.find((r) => r.check === 'span-hash').status, 'stale');
});

test('check: a claim with no span hash is unchecked, never verified', () => {
  const { dir, commit } = fixture();
  const claim = makeClaim({ type: 'topic', sentence: 'No hash was recorded.', path: 'db/tenant.mjs', fromLine: 2, toLine: 5, ...surveyed(commit) });
  const { claims: out } = verify(dir, commit, [claim]);
  assert.equal(out[0].status, 'unchecked');
  assert.equal(out[0].reasons.find((r) => r.check === 'span-hash').status, 'unchecked');
});

test('check: a part claim whose boundary has a real import edge is verified', () => {
  const { dir, commit } = fixture();
  const span = spanAt(dir, 'db/tenant.mjs', 2, 5, commit);
  const claim = makeClaim({
    type: 'part',
    sentence: 'db is the persistence boundary and the api layer goes through it.',
    path: 'db/tenant.mjs',
    fromLine: 2,
    toLine: 5,
    spanHash: span.hash,
    boundary: { dir: 'db', neighbours: ['api'] },
    coverage: ['db/orders.mjs', 'db/tenant.mjs'],
    ...surveyed(commit),
  });
  const { claims: out } = verify(dir, commit, [claim]);
  assert.equal(out[0].status, 'verified');
  assert.ok(out[0].edges.some((edge) => edge.from === 'api/server.mjs' && edge.to === 'db/tenant.mjs'));
});

test('check: a part claim with no supporting import edge is downgraded to inferred', () => {
  const { dir, commit } = fixture();
  const span = spanAt(dir, 'docs/notes.md', 1, 1, commit);
  const claim = makeClaim({
    type: 'part',
    sentence: 'docs is a module that the api layer depends on.',
    path: 'docs/notes.md',
    fromLine: 1,
    toLine: 1,
    spanHash: span.hash,
    boundary: { dir: 'docs', neighbours: ['api'] },
    ...surveyed(commit),
  });
  const { claims: out } = verify(dir, commit, [claim]);
  assert.equal(out[0].status, 'inferred');
  assert.match(out[0].reasons.find((r) => r.check === 'boundary').detail, /no import edge joins docs to api/);
  assert.ok(out[0].unresolved.some((edge) => edge.kind === 'boundary' && edge.to === 'api'));
});

test('check: a part claim that names no boundary is unchecked, not verified', () => {
  const { dir, commit } = fixture();
  const span = spanAt(dir, 'db/tenant.mjs', 2, 5, commit);
  const claim = makeClaim({ type: 'part', sentence: 'db does persistence.', path: 'db/tenant.mjs', fromLine: 2, toLine: 5, spanHash: span.hash, ...surveyed(commit) });
  const { claims: out } = verify(dir, commit, [claim]);
  assert.equal(out[0].status, 'unchecked');
  assert.equal(out[0].reasons.find((r) => r.check === 'boundary').status, 'unchecked');
});

test('check: a boundary with no tracked file under it is contradicted', () => {
  const { dir, commit } = fixture();
  const claim = makeClaim({
    type: 'part',
    sentence: 'The scheduler package coordinates jobs.',
    boundary: { dir: 'scheduler', neighbours: ['api'] },
    ...surveyed(commit),
  });
  const { claims: out } = verify(dir, commit, [claim]);
  assert.equal(out[0].status, 'contradicted');
  assert.match(out[0].reasons.find((r) => r.check === 'boundary').detail, /no tracked file lives under/);
});

test('check: an interaction whose symbols resolve at both ends is verified', () => {
  const { dir, commit } = fixture();
  const span = spanAt(dir, 'api/server.mjs', 4, 6, commit);
  const claim = makeClaim({
    type: 'interaction',
    sentence: 'handleOrders calls loadOrders.',
    path: 'api/server.mjs',
    fromLine: 4,
    toLine: 6,
    spanHash: span.hash,
    ends: { from: { path: 'api/server.mjs', symbol: 'loadOrders' }, to: { path: 'db/orders.mjs', symbol: 'loadOrders' } },
    ...surveyed(commit),
  });
  const { claims: out } = verify(dir, commit, [claim]);
  assert.equal(out[0].status, 'verified');
  assert.deepEqual(out[0].unresolved, []);
});

test('check: an interaction with an unresolvable end keeps the edge and is downgraded', () => {
  const { dir, commit } = fixture();
  const span = spanAt(dir, 'api/server.mjs', 4, 6, commit);
  const claim = makeClaim({
    type: 'interaction',
    sentence: 'handleOrders calls the audit logger.',
    path: 'api/server.mjs',
    fromLine: 4,
    toLine: 6,
    spanHash: span.hash,
    ends: { from: { path: 'api/server.mjs', symbol: 'handleOrders' }, to: { path: 'db/orders.mjs', symbol: 'writeAuditRecord' } },
    ...surveyed(commit),
  });
  const { claims: out } = verify(dir, commit, [claim]);
  assert.equal(out[0].status, 'inferred');
  const edge = out[0].unresolved.find((item) => item.kind === 'interaction');
  assert.equal(edge.end, 'to');
  assert.equal(edge.symbol, 'writeAuditRecord');
});

test('check: an interaction whose called end is only mentioned, never defined, is downgraded', () => {
  const { dir, commit } = makeRepo({
    'caller.mjs': "import { doWork } from './worker.mjs';\nexport function run() { return doWork(); }\n",
    'worker.mjs': '// doWork used to live here\nexport function doSomethingElse() { return 1; }\n',
  });
  const claim = makeClaim({
    type: 'interaction',
    sentence: 'run calls doWork in worker.mjs.',
    ends: { from: { path: 'caller.mjs', symbol: 'doWork' }, to: { path: 'worker.mjs', symbol: 'doWork' } },
    ...surveyed(commit),
  });
  const { claims: out } = verify(dir, commit, [claim]);
  assert.equal(out[0].status, 'inferred');
  assert.match(out[0].reasons.find((r) => r.check === 'interaction').detail, /no definition of it was found/);
});

test('check: an interaction that names no symbols is unchecked', () => {
  const { dir, commit } = fixture();
  const claim = makeClaim({ type: 'interaction', sentence: 'The api calls the database.', ...surveyed(commit) });
  const { claims: out } = verify(dir, commit, [claim]);
  assert.equal(out[0].status, 'unchecked');
});

test('check: a constraint with a matching enforcement point is verified', () => {
  const { dir, commit } = fixture();
  const claim = makeClaim({
    type: 'constraint',
    sentence: 'Every query passes through withTenant.',
    enforcement: { pattern: 'export function withTenant', globs: ['db/*.mjs'] },
    ...surveyed(commit),
  });
  const { claims: out } = verify(dir, commit, [claim]);
  assert.equal(out[0].status, 'verified');
  assert.equal(out[0].enforcementHits[0].path, 'db/tenant.mjs');
});

test('check: a constraint nothing enforces is contradicted, not merely downgraded', () => {
  const { dir, commit } = fixture();
  const claim = makeClaim({
    type: 'constraint',
    sentence: 'Every write runs inside a transaction.',
    enforcement: { pattern: 'beginTransaction', globs: [] },
    ...surveyed(commit),
  });
  const { claims: out } = verify(dir, commit, [claim]);
  assert.equal(out[0].status, 'contradicted');
  assert.match(out[0].reasons.find((r) => r.check === 'enforcement').detail, /no tracked file at .* matches the enforcement pattern/);
});

test('check: a constraint that supplies no enforcement pattern at all is contradicted', () => {
  const { dir, commit } = fixture();
  const claim = makeClaim({ type: 'constraint', sentence: 'Nothing may bypass the service layer.', ...surveyed(commit) });
  const { claims: out } = verify(dir, commit, [claim]);
  assert.equal(out[0].status, 'contradicted');
  assert.match(out[0].reasons.find((r) => r.check === 'enforcement').detail, /supplies no enforcement pattern/);
});

test('check: a falsifying pattern that matches contradicts the claim', () => {
  const { dir, commit } = fixture();
  const holds = makeClaim({
    type: 'constraint',
    sentence: 'No code talks to the database outside db/.',
    enforcement: { pattern: 'export function withTenant', globs: ['db/*.mjs'] },
    falsifier: { pattern: 'new Pool\\(', globs: [] },
    ...surveyed(commit),
  });
  const broken = makeClaim({
    type: 'constraint',
    sentence: 'Nothing in api/ imports db/ directly.',
    enforcement: { pattern: 'export function withTenant', globs: ['db/*.mjs'] },
    falsifier: { pattern: "from '\\.\\./db/", globs: ['api/*.mjs'] },
    ...surveyed(commit),
  });
  const { claims: out } = verify(dir, commit, [holds, broken]);
  assert.equal(out[0].status, 'verified');
  assert.equal(out[0].reasons.find((r) => r.check === 'contradiction').status, 'verified');
  assert.equal(out[1].status, 'contradicted');
  assert.equal(out[1].falsifierHits[0].path, 'api/server.mjs');
});

test('check: when the surveyed commit does not resolve, every claim is unchecked', () => {
  const { dir } = fixture();
  const claim = makeClaim({ type: 'topic', sentence: 'Anything.', path: 'db/tenant.mjs', fromLine: 1, toLine: 1, commit: 'deadbeef', extractor: 'fixture' });
  const result = verify(dir, 'deadbeef', [claim]);
  assert.equal(result.claims[0].status, 'unchecked');
  assert.equal(result.summary.commitResolved, false);
  assert.match(result.claims[0].reasons[0].detail, /does not resolve/);
});

test('check: a claim made against an older commit is marked stale when re-checked', () => {
  const { dir, commit } = fixture();
  const later = commitAll(dir, { 'db/tenant.mjs': `${FIXTURE['db/tenant.mjs']}export const VERSION = 2;\n` }, 'second');
  const span = spanAt(dir, 'db/tenant.mjs', 2, 5, commit);
  const claim = makeClaim({ type: 'topic', sentence: 'withTenant guards reads.', path: 'db/tenant.mjs', fromLine: 2, toLine: 5, spanHash: span.hash, commit, extractor: 'fixture' });
  const { claims: out } = verify(dir, later, [claim]);
  assert.equal(out[0].status, 'stale');
  assert.equal(out[0].reasons.find((r) => r.check === 'commit').status, 'stale');
});

test('the gate never trusts the status the claim arrived with', () => {
  const { dir, commit } = fixture();
  const lie = {
    id: 'hand-written',
    type: 'constraint',
    status: 'verified',
    sentence: 'Everything is fine.',
    path: 'db/tenant.mjs',
    fromLine: 1,
    toLine: 1,
    commit,
    spanHash: null,
    extractor: 'an agent that asserts',
    unresolved: [],
    coverage: [],
    boundary: null,
    ends: null,
    enforcement: { pattern: 'noSuchEnforcementExists', globs: [] },
    falsifier: null,
  };
  const { claims: out, summary } = verify(dir, commit, [lie]);
  assert.equal(out[0].declaredStatus, 'verified');
  assert.equal(out[0].status, 'contradicted');
  assert.equal(summary.downgradedFromVerified, 1);
  assert.equal(summary.shownAsFact, 0);
  assert.equal(summary.dropped, 1);
});

test('the worst check wins over the checks that passed', () => {
  const { dir, commit } = fixture();
  const claim = makeClaim({
    type: 'part',
    sentence: 'db is the persistence boundary.',
    path: 'db/tenant.mjs',
    fromLine: 2,
    toLine: 5,
    spanHash: hashText('stale text'),
    boundary: { dir: 'db', neighbours: ['api'] },
    ...surveyed(commit),
  });
  const { claims: out } = verify(dir, commit, [claim]);
  assert.equal(out[0].reasons.find((r) => r.check === 'boundary').status, 'verified');
  assert.equal(out[0].status, 'stale');
});

test('provenance rule: a span is the only provenance a part or topic claim has', () => {
  const { dir, commit } = fixture();
  // The boundary is real, but the sentence points at nowhere the learner can
  // open, so it cannot be shown as fact.
  const part = makeClaim({
    type: 'part',
    sentence: 'db is the persistence boundary.',
    boundary: { dir: 'db', neighbours: ['api'] },
    ...surveyed(commit),
  });
  // A constraint takes its provenance from its enforcement points instead, so
  // the missing span is recorded as a note and imposes no floor.
  const constraint = makeClaim({
    type: 'constraint',
    sentence: 'Every query passes through withTenant.',
    enforcement: { pattern: 'export function withTenant', globs: ['db/*.mjs'] },
    ...surveyed(commit),
  });
  const { claims: out } = verify(dir, commit, [part, constraint]);
  assert.equal(out[0].status, 'unchecked');
  assert.equal(out[0].reasons.find((r) => r.check === 'path').status, 'unchecked');
  assert.equal(out[1].status, 'verified');
  assert.equal(out[1].reasons.find((r) => r.check === 'path').status, 'note');
});

test('a malformed claim is unchecked rather than an exception', () => {
  const { dir, commit } = fixture();
  const { claims: out } = verify(dir, commit, [{ type: 'part', path: '/etc/passwd', commit }]);
  assert.equal(out[0].status, 'unchecked');
  assert.equal(out[0].reasons[0].check, 'shape');
});

// -------------------------------------------------------------------- coverage

test('coverage classifications sum to the tracked file count', () => {
  const { dir, commit } = fixture();
  const span = spanAt(dir, 'db/tenant.mjs', 2, 5, commit);
  const claims = [
    makeClaim({
      type: 'part',
      sentence: 'db is the persistence boundary.',
      path: 'db/tenant.mjs',
      fromLine: 2,
      toLine: 5,
      spanHash: span.hash,
      boundary: { dir: 'db', neighbours: ['api'] },
      coverage: ['db/orders.mjs', 'api/server.mjs'],
      ...surveyed(commit),
    }),
  ];
  const { coverage } = verify(dir, commit, claims);
  const summed = COVERAGE_LABELS.reduce((acc, label) => acc + coverage.counts[label], 0);
  assert.equal(summed, coverage.total);
  assert.equal(coverage.total, Object.keys(FIXTURE).length);
  assert.equal(Object.keys(coverage.paths).length, coverage.total);
  assert.ok(COVERAGE_LABELS.every((label) => Number.isInteger(coverage.counts[label])));
});

test('coverage sums with every label populated at once', () => {
  const { dir, commit } = makeRepo({
    'src/app.mjs': "import './lib.mjs';\n",
    'src/lib.mjs': 'export const one = 1;\n',
    'src/legacy.go': 'package legacy\n',
    'dist/bundle.js': 'var a=1;\n',
    'package-lock.json': '{}\n',
    'assets/logo.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]),
    'third_party/thing.mjs': 'export const x = 1;\n',
    'untouched.mjs': 'export const y = 2;\n',
  });
  const span = spanAt(dir, 'src/app.mjs', 1, 1, commit);
  const claims = [
    makeClaim({
      type: 'part',
      sentence: 'src is the application.',
      path: 'src/app.mjs',
      fromLine: 1,
      toLine: 1,
      spanHash: span.hash,
      boundary: { dir: 'src', neighbours: ['third_party'] },
      coverage: ['src/app.mjs', 'src/lib.mjs'],
      ...surveyed(commit),
    }),
  ];
  const { coverage } = verify(dir, commit, claims, { exclude: ['third_party'] });
  const summed = COVERAGE_LABELS.reduce((acc, label) => acc + coverage.counts[label], 0);
  assert.equal(summed, coverage.total);
  assert.equal(coverage.total, 8);
  assert.equal(coverage.paths['dist/bundle.js'], 'generated');
  assert.equal(coverage.paths['package-lock.json'], 'generated');
  assert.equal(coverage.paths['assets/logo.png'], 'binary');
  assert.equal(coverage.paths['third_party/thing.mjs'], 'excluded');
  assert.equal(coverage.paths['src/app.mjs'], 'inspected');
  assert.equal(coverage.paths['untouched.mjs'], 'pending');
  // The Go file sits inside a claimed boundary and the import reader cannot
  // read it, so it is unresolved rather than quietly inspected.
  assert.equal(coverage.paths['src/legacy.go'], 'unresolved');
  assert.equal(coverage.counts.unresolved >= 1, true);
});

test('a binary file with no telling extension is still classified as binary', () => {
  const { dir, commit } = makeRepo({
    'notes.md': 'text\n',
    'blob.data': Buffer.from([0x00, 0x01, 0x02, 0x00, 0xff, 0xfe]),
  });
  const { coverage } = verify(dir, commit, []);
  assert.equal(coverage.paths['blob.data'], 'binary');
  assert.equal(coverage.paths['notes.md'], 'pending');
});

test('a contradicted claim buys no coverage for the file it misread', () => {
  const { dir, commit } = fixture();
  const claim = makeClaim({
    type: 'constraint',
    sentence: 'Writes are transactional.',
    path: 'db/orders.mjs',
    fromLine: 3,
    toLine: 5,
    enforcement: { pattern: 'beginTransaction', globs: [] },
    coverage: ['db/orders.mjs'],
    ...surveyed(commit),
  });
  const { coverage, claims: out } = verify(dir, commit, [claim]);
  assert.equal(out[0].status, 'contradicted');
  assert.equal(coverage.paths['db/orders.mjs'], 'pending');
  assert.equal(coverage.counts.inspected, 0);
});

test('classifyCoverage refuses to return a total it cannot account for', () => {
  const { dir, commit } = fixture();
  const coverage = classifyCoverage(dir, commit, [], {});
  assert.equal(coverage.counts.pending, coverage.total);
  assert.equal(coverage.counts.inspected, 0);
});

test('a submodule is unresolved, because it is a repository we did not enter', () => {
  const inner = makeRepo({ 'inner.mjs': 'export const inner = 1;\n' }, 'inner');
  const outer = makeRepo({ 'outer.mjs': 'export const outer = 1;\n' }, 'outer');
  git(outer.dir, ['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', inner.dir, 'vendored']);
  const commit = commitAll(outer.dir, {}, 'add submodule');
  const { coverage } = verify(outer.dir, commit, []);
  assert.equal(coverage.paths.vendored, 'unresolved');
});

// -------------------------------------------------------------------- summary

test('the summary separates what may be shown as fact from what is dropped', () => {
  const { dir, commit } = fixture();
  const span = spanAt(dir, 'db/tenant.mjs', 2, 5, commit);
  const claims = [
    makeClaim({ type: 'topic', sentence: 'Tenancy.', path: 'db/tenant.mjs', fromLine: 2, toLine: 5, spanHash: span.hash, ...surveyed(commit) }),
    makeClaim({ type: 'constraint', sentence: 'Transactions everywhere.', enforcement: { pattern: 'beginTransaction' }, ...surveyed(commit) }),
    makeClaim({ type: 'interaction', sentence: 'Something calls something.', ...surveyed(commit) }),
  ];
  const { summary } = verify(dir, commit, claims);
  assert.equal(summary.claims, 3);
  assert.equal(summary.byStatus.verified, 1);
  assert.equal(summary.byStatus.contradicted, 1);
  assert.equal(summary.byStatus.unchecked, 1);
  assert.equal(summary.shownAsFact, 1);
  assert.equal(summary.dropped, 1);
  assert.equal(summary.shownQualified, 1);
  assert.equal(summary.commit, commit);
});
