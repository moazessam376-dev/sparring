import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { makeClaim } from './claim.mjs';
import { spanAt, searchCode, codeOnly, importsOf } from './evidence.mjs';
import { verify, MAX_CLAIMS } from './verify.mjs';
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
  assert.equal(out.status, 'contradicted');
  assert.equal(out.enforcementHits.length, 0);
});

test('original attack 2: an irrelevant enforcement point plus a dud falsifier buys no credibility', () => {
  const fixture = repo({ 'store.mjs': 'export function withTenant() {}\nexport function write() {}\n' });
  const out = check(fixture, transaction({ enforcement: { pattern: 'withTenant' }, falsifier: { pattern: 'IMPOSSIBLE_SENTINEL' } }));
  assert.equal(out.status, 'contradicted');
});

test('original attack 3: a true span hash cannot verify invented backoff, jitter and a circuit breaker', () => {
  const fixture = repo({ 'orders.mjs': 'export function loadOrders() { return []; }\n' });
  const out = check(fixture, { type: 'topic', sentence: 'loadOrders implements exponential backoff with jitter and a circuit breaker.',
    identifiers: [{ kind: 'symbol', name: 'loadOrders' }], ...citation(fixture, 'orders.mjs') });
  assert.equal(out.status, 'unchecked');
  assert.equal(out.reasons.find((r) => r.check === 'span-hash').status, 'verified');
});

test('original attack 4: the whole repository cannot be its own neighbour', () => {
  const fixture = repo({ 'a.mjs': "import './b.mjs';\n", 'b.mjs': 'export const b = 1;\n' });
  const out = check(fixture, { type: 'part', sentence: 'The entire repository is a cohesive boundary.',
    boundary: { dir: '.', neighbours: ['.'] }, ...citation(fixture, 'a.mjs') });
  assert.equal(out.status, 'contradicted');
  assert.match(out.reasons.find((r) => r.check === 'boundary').detail, /degenerate/);
});

test('original attack 5: commented-out enforcement is weak evidence', () => {
  const fixture = repo({ 'store.mjs': '// beginTransaction();\nexport function write() {}\n' });
  const out = check(fixture, transaction({ enforcement: { pattern: 'beginTransaction' } }));
  assert.equal(out.status, 'contradicted');
  assert.equal(out.weakEnforcementHits[0].classification, 'non-code');
});

test('original attack 6: enforcement quoted in a string is weak evidence', () => {
  const fixture = repo({ 'store.mjs': 'const example = "beginTransaction()";\nexport function write() {}\n' });
  const out = check(fixture, transaction({ enforcement: { pattern: 'beginTransaction' } }));
  assert.equal(out.status, 'contradicted');
  assert.equal(out.weakEnforcementHits[0].classification, 'non-code');
});

test('original attack 7: enforcement found only in a test is weak evidence', () => {
  const fixture = repo({ 'store.test.mjs': 'beginTransaction();\n', 'store.mjs': 'export function write() {}\n' });
  const out = check(fixture, transaction({ enforcement: { pattern: 'beginTransaction' } }));
  assert.equal(out.status, 'contradicted');
  assert.equal(out.weakEnforcementHits[0].classification, 'test');
});

test('original attack 8: TODO mentions and commented definitions cannot resolve an interaction', () => {
  const fixture = repo({ 'caller.mjs': '// TODO: doWork();\nexport const caller = 1;\n',
    'worker.mjs': '// function doWork() {}\nexport const worker = 1;\n' });
  const out = check(fixture, { type: 'interaction', sentence: 'The caller calls doWork.',
    ends: { from: { path: 'caller.mjs', symbol: 'doWork' }, to: { path: 'worker.mjs', symbol: 'doWork' } } });
  assert.notEqual(out.status, 'verified');
  assert.equal(out.ends.from.evidence.mentioned, false);
  assert.equal(out.ends.to.evidence.defined, false);
});

// Fresh attacks: these exercise the stricter claim shape as well as old input.
test('new attack: omit the invented identifiers while retaining true ones', () => {
  const fixture = repo({ 'orders.mjs': 'export function loadOrders() { return []; }\n' });
  const out = check(fixture, { ...reference(fixture, 'loadOrders', 'orders.mjs'),
    sentence: 'loadOrders uses circuitBreaker to retry failed requests.' });
  assert.equal(out.status, 'contradicted');
  assert.match(out.reasons.find((r) => r.check === 'proposition-binding').detail, /circuitBreaker/);
});

test('new attack: a symbol elsewhere in the same file cannot bind a cited span', () => {
  const fixture = repo({ 'worker.mjs': 'export const real = 1;\nexport const imaginary = 2;\n' });
  assert.equal(check(fixture, reference(fixture, 'imaginary', 'worker.mjs')).status, 'contradicted');
});

test('new attack: a span beginning inside a multiline comment cannot manufacture a symbol', () => {
  const fixture = repo({ 'worker.mjs': '/*\nfunction phantom() {}\n*/\nexport const real = 1;\n' });
  assert.equal(check(fixture, reference(fixture, 'phantom', 'worker.mjs', 2)).status, 'contradicted');
});

test('new attack: strings, templates, Python docstrings and generated files cannot supply symbols', () => {
  for (const [path, text] of [
    ['worker.mjs', 'const text = "function phantom() {}";\n'],
    ['worker.mjs', 'const text = `function phantom() {}`;\n'],
    ['worker.py', '"""def phantom(): pass"""\n'],
    ['dist/worker.mjs', 'function phantom() {}\n'],
    ['worker.generated.mjs', 'function phantom() {}\n'],
  ]) {
    const fixture = repo({ [path]: text });
    assert.notEqual(check(fixture, reference(fixture, 'phantom', path)).status, 'verified');
  }
});

test('new attack: regex literal text cannot manufacture a symbol or an import', () => {
  const fixture = repo({ 'worker.mjs': "const text = /function phantom() {}/; const imports = /import 'imaginary'/;\n" });
  assert.notEqual(check(fixture, reference(fixture, 'phantom', 'worker.mjs')).status, 'verified');
  assert.deepEqual(importsOf(fixture.dir, 'worker.mjs', fixture.commit), []);
});

test('new attack: a query match in unreachable code does not prove a universal constraint', () => {
  const fixture = repo({ 'store.mjs': 'if (false) { beginTransaction(); }\nexport function write() {}\n' });
  const out = check(fixture, transaction({ identifiers: [{ kind: 'symbol', name: 'beginTransaction' }] }));
  assert.notEqual(out.status, 'verified');
  assert.ok(out.enforcementHits.length > 0); // Known lexical reachability limit, not hidden.
});

test('new attack: a no-op guard and an empty falsifier search do not prove enforcement', () => {
  const fixture = repo({ 'store.mjs': 'function withTransaction(run) { return run(); }\nwithTransaction(() => 1);\n' });
  const out = check(fixture, transaction());
  assert.notEqual(out.status, 'verified');
  assert.ok(out.enforcementHits.length > 0);
  assert.equal(out.falsifierHits.length, 0);
});

test('new attack: agent globs cannot hide gate-owned bypass candidates', () => {
  const fixture = repo({ 'safe/store.mjs': 'beginTransaction();\n', 'unsafe/store.mjs': 'write();\n' });
  const out = check(fixture, transaction({ enforcement: { pattern: 'export', globs: ['safe/*'] },
    falsifier: { pattern: 'IMPOSSIBLE', globs: ['safe/*'] } }));
  assert.notEqual(out.status, 'verified');
  assert.equal(out.falsifierHits[0].path, 'unsafe/store.mjs');
});

test('new attack: missing, unknown and prototype constraint kinds fail closed', () => {
  const fixture = repo({ 'store.mjs': 'export const x = 1;\n' });
  for (const constraintKind of [null, 'custom', '__proto__', 'constructor']) {
    const out = check(fixture, transaction({ constraintKind, enforcement: { pattern: 'export' } }));
    assert.equal(out.status, 'unchecked');
  }
});

test('bounds: excessive claim count is rejected before repository access', () => {
  assert.throws(() => verify('/does/not/exist', 'HEAD', Array(MAX_CLAIMS + 1).fill({})), /at most 100 claims/);
});

test('bounds: oversized, invalid and catastrophic supplemental regexes fail the claim', () => {
  const fixture = repo({ 'worker.mjs': `const real = 1;\n// ${'a'.repeat(40000)}!\n` });
  for (const pattern of ['a'.repeat(MAX_PATTERN_LENGTH + 1), '[', '(a+)+$']) {
    const start = Date.now();
    const out = check(fixture, { ...reference(fixture, 'real', 'worker.mjs'), enforcement: { pattern } });
    assert.equal(out.status, 'unchecked');
    assert.match(out.reasons.find((r) => r.check === 'query').detail, /pattern/);
    assert.ok(Date.now() - start < 5000, 'hostile pattern did not terminate promptly');
  }
});

test('bounds: catastrophic falsifiers also time out and cannot verify a true proposition', () => {
  const fixture = repo({ 'worker.mjs': `const real = 1;\n// ${'a'.repeat(40000)}!\n` });
  const out = check(fixture, { ...reference(fixture, 'real', 'worker.mjs'), falsifier: { pattern: '(a+)+$' } });
  assert.equal(out.status, 'unchecked');
  assert.match(out.reasons.find((r) => r.check === 'query').detail, /timed out/);
});

test('bounds: direct pattern execution has an actual subprocess deadline', () => {
  assert.throws(() => matchTexts('(a+)+$', [`${'a'.repeat(40000)}!`]), /timed out/);
});

test('bounds: malformed collections fail closed without crashing the run', () => {
  const fixture = repo({ 'worker.mjs': 'const real = 1;\n' });
  for (const extra of [{ unresolved: {} }, { coverage: {} }, { identifiers: {} }, { boundary: { dir: 'src', neighbours: [42] } }]) {
    const out = verify(fixture.dir, fixture.commit, [{ ...reference(fixture, 'real', 'worker.mjs'), ...extra }]).claims[0];
    assert.equal(out.status, 'unchecked');
    assert.equal(out.reasons[0].check, 'shape');
  }
});

test('each recognised constraint kind owns both query directions', () => {
  for (const query of Object.values(CONSTRAINT_QUERIES)) {
    assert.ok(query.enforcement && query.falsifier);
    assert.doesNotThrow(() => matchTexts(query.enforcement, ['']));
    assert.doesNotThrow(() => matchTexts(query.falsifier, ['']));
  }
});

test('code filtering retains offsets and newlines for JavaScript and Python', () => {
  for (const [path, text] of [['x.mjs', '// ignored\nconst url = "https://example.test"; /* end */\n'],
    ['x.py', '# ignored\nvalue = "text"\n']]) {
    const code = codeOnly(text, path);
    assert.equal(code.length, text.length);
    assert.equal(code.split('\n').length, text.split('\n').length);
    assert.ok(!code.includes('ignored') && !code.includes('text') && !code.includes('https'));
  }
});

test('generated and test enforcement matches remain visible as weak evidence', () => {
  const fixture = repo({ 'dist/a.mjs': 'beginTransaction();\n', 'tests/a.mjs': 'beginTransaction();\n',
    'src/a.mjs': 'beginTransaction();\n' });
  const result = searchCode(fixture.dir, fixture.commit, CONSTRAINT_QUERIES.transactions.enforcement);
  assert.deepEqual(result.hits.map((hit) => hit.path), ['src/a.mjs']);
  assert.deepEqual(result.weak.map((hit) => hit.classification), ['generated', 'test']);
});

function boundaryClaim(fixture, neighbours = ['api']) {
  return { type: 'part', predicate: 'boundary', sentence: '`db` has denser internal imports than crossing imports.',
    identifiers: ['db', ...neighbours].map((name) => ({ kind: 'module', name })),
    boundary: { dir: 'db', neighbours }, ...citation(fixture, 'db/a.mjs') };
}
const COHESIVE = {
  'db/a.mjs': "import './b.mjs';\n",
  'db/b.mjs': 'export const b = 1;\n',
  'api/a.mjs': "import '../db/a.mjs';\n",
};

test('a supported boundary reports deduplicated directed edges and both density denominators', () => {
  const fixture = repo({ ...COHESIVE, 'db/a.mjs': "import './b.mjs';\nimport './b.mjs';\n" });
  const out = check(fixture, boundaryClaim(fixture));
  assert.equal(out.status, 'verified');
  assert.deepEqual(out.boundaryMetrics, {
    internalEdges: 1, crossingEdges: 1, internalPossible: 2, crossingPossible: 4,
    internalDensity: 0.5, crossingDensity: 0.25, unexplainedCrossings: 0,
    unresolvedEdges: 0, insideFiles: 2, outsideFiles: 1,
  });
});

test('new attack: a single crossing edge does not establish internal cohesion', () => {
  const fixture = repo({ ...COHESIVE, 'db/a.mjs': 'export const a = 1;\n' });
  const out = check(fixture, boundaryClaim(fixture));
  assert.notEqual(out.status, 'verified');
  assert.equal(out.boundaryMetrics.internalEdges, 0);
  assert.equal(out.boundaryMetrics.crossingEdges, 1);
});

test('new attack: omit an inconvenient neighbour from a boundary claim', () => {
  const fixture = repo({ ...COHESIVE, 'other/a.mjs': "import '../db/b.mjs';\n" });
  const out = check(fixture, boundaryClaim(fixture));
  assert.notEqual(out.status, 'verified');
  assert.equal(out.boundaryMetrics.unexplainedCrossings, 1);
});

test('new attack: nested neighbours and whole production trees remain degenerate', () => {
  const fixture = repo({ ...COHESIVE, 'README.md': 'outside the code\n' });
  for (const boundary of [{ dir: 'db', neighbours: ['db/sub'] }, { dir: 'db', neighbours: ['.'] },
    { dir: '.', neighbours: ['api'] }]) {
    const out = check(fixture, { ...boundaryClaim(fixture), boundary });
    assert.equal(out.status, 'contradicted');
    assert.match(out.reasons.find((r) => r.check === 'boundary').detail, /degenerate/);
  }
  const entire = repo({ 'src/a.mjs': "import './b.mjs';\n", 'src/b.mjs': 'export const b = 1;\n', 'README.md': 'docs\n' });
  const out = check(entire, { type: 'part', sentence: 'src is the boundary.',
    boundary: { dir: 'src', neighbours: ['docs'] }, ...citation(entire, 'src/a.mjs') });
  assert.equal(out.status, 'contradicted');
});

test('new attack: computed imports beside literal imports cannot disappear from the graph', () => {
  const fixture = repo({ ...COHESIVE, 'api/a.mjs': "import('../db/a.mjs'); import(chosenModule);\n" });
  const out = check(fixture, boundaryClaim(fixture));
  assert.equal(out.status, 'unchecked');
  assert.ok(out.unresolved.some((edge) => /computed/.test(edge.reason)));
});

test('new attack: unsupported source outside a boundary cannot silently improve its density', () => {
  const fixture = repo({ ...COHESIVE, 'other/service.go': 'package service\n' });
  const out = check(fixture, boundaryClaim(fixture));
  assert.equal(out.status, 'unchecked');
  assert.ok(out.unparsed.includes('other/service.go'));
});

test('new attack: JSX text is uncheckable without a JSX parser', () => {
  const fixture = repo({ 'worker.jsx': 'const view = <div>phantom</div>;\n' });
  assert.notEqual(check(fixture, reference(fixture, 'phantom', 'worker.jsx')).status, 'verified');
});

test('new attack: escaped Python triple quotes cannot terminate a docstring early', () => {
  const fixture = repo({ 'worker.py': '"""example \\""" phantom still in string\n"""\n' });
  assert.equal(check(fixture, reference(fixture, 'phantom', 'worker.py')).status, 'contradicted');
});

test('new attack: a missing surveyed commit or unresolved dependency prevents verification', () => {
  const fixture = repo({ 'worker.mjs': 'const real = 1;\n' });
  for (const extra of [{ commit: null }, { unresolved: [{ kind: 'dynamic', path: 'worker.mjs' }] }]) {
    const out = check(fixture, { ...reference(fixture, 'real', 'worker.mjs'), ...extra });
    assert.equal(out.status, 'unchecked');
  }
});
