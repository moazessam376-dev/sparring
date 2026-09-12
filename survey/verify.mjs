import nodePath from 'node:path';
import { CLAIM_STATUSES, COVERAGE_LABELS, validateClaim, worst } from './claim.mjs';
import {
  fileAt,
  filesAt,
  filesUnder,
  grepFor,
  importsOf,
  languageOf,
  linesOf,
  resolveCommit,
  spanAt,
  supportsImports,
  textFilesAt,
  treeAt,
} from './evidence.mjs';

// The mechanical verification gate. An agent surveys a repository and returns
// claims about it; nothing in this file believes any of them. Each claim is
// re-derived from the repository itself, and the claim's own declared status is
// discarded before checking, because a status an agent wrote is exactly the
// thing under test.
//
// Three rules decide every outcome.
//
//   1. The worst check wins. A claim whose boundary check passed and whose span
//      hash failed is stale, not verified.
//   2. Uncheckable is `unchecked`, never `verified`. A claim that did not carry
//      the evidence its own type requires cannot pass by default, because the
//      interface draws `unchecked` as unverified and silence must never read as
//      success.
//   3. A claim never becomes better than the repository says it is. Statuses
//      only move downward from `verified`.

const NOT_SHOWN_AS_FACT = new Set(['inferred', 'contradicted', 'stale', 'unchecked']);

const GENERATED = [
  /(^|\/)node_modules\//,
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /(^|\/)out\//,
  /(^|\/)target\//,
  /(^|\/)vendor\//,
  /(^|\/)__pycache__\//,
  /(^|\/)\.next\//,
  /\.min\.(js|css)$/,
  /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Cargo\.lock|Gemfile\.lock|composer\.lock|go\.sum)$/,
  /\.generated\./,
  /\.pb\.go$/,
  /_pb2(_grpc)?\.py$/,
  /\.snap$/,
];

const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.avif', '.tif', '.tiff',
  '.pdf', '.zip', '.gz', '.bz2', '.xz', '.7z', '.tar', '.rar',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.mp3', '.mp4', '.wav', '.ogg', '.mov', '.avi', '.webm',
  '.so', '.dylib', '.dll', '.exe', '.class', '.jar', '.wasm', '.bin', '.o', '.a', '.lib', '.pyc',
  '.sqlite', '.db', '.parquet',
]);

function shortSha(sha) {
  return typeof sha === 'string' ? sha.slice(0, 12) : String(sha);
}

function normalise(path) {
  return nodePath.posix.normalize(path).replace(/^\.\//, '').replace(/\/+$/, '');
}

function under(path, dir) {
  if (typeof path !== 'string' || typeof dir !== 'string') return false;
  const base = normalise(dir);
  const target = normalise(path);
  if (base === '.' || base === '') return true;
  return target === base || target.startsWith(`${base}/`);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Resolve a module specifier to a tracked repository path where that is
// mechanically possible. A bare specifier that names no tracked file is
// returned unresolved rather than guessed at.
const JS_CANDIDATE_SUFFIXES = [
  '', '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts',
  '/index.js', '/index.mjs', '/index.ts', '/index.tsx',
];

function resolveSpec(fromPath, spec, tracked) {
  const lang = languageOf(fromPath);
  const dir = nodePath.posix.dirname(normalise(fromPath));
  if (lang === 'py') {
    const leading = /^\.+/.exec(spec);
    if (leading) {
      const ups = leading[0].length - 1;
      const remainder = spec.slice(leading[0].length).split('.').filter(Boolean);
      const base = normalise([dir, ...Array.from({ length: ups }, () => '..')].join('/'));
      const stem = normalise([base, ...remainder].join('/'));
      for (const suffix of ['.py', '/__init__.py', '.pyi']) {
        if (tracked.has(`${stem}${suffix}`)) return `${stem}${suffix}`;
      }
      return null;
    }
    const stem = spec.split('.').filter(Boolean).join('/');
    for (const suffix of ['.py', '/__init__.py', '.pyi']) {
      if (tracked.has(`${stem}${suffix}`)) return `${stem}${suffix}`;
    }
    return null;
  }
  if (spec.startsWith('.')) {
    const stem = normalise(nodePath.posix.join(dir, spec));
    for (const suffix of JS_CANDIDATE_SUFFIXES) {
      if (tracked.has(`${stem}${suffix}`)) return `${stem}${suffix}`;
    }
    return null;
  }
  const stem = normalise(spec);
  for (const suffix of JS_CANDIDATE_SUFFIXES) {
    if (tracked.has(`${stem}${suffix}`)) return `${stem}${suffix}`;
  }
  return null;
}

// A specifier can name a boundary without resolving to a file, for instance a
// workspace package whose directory is the boundary.
function specNames(spec, dir) {
  const base = normalise(dir);
  const candidates = [normalise(spec), normalise(spec.split('.').filter(Boolean).join('/'))];
  return candidates.some((candidate) => candidate === base || candidate.startsWith(`${base}/`));
}

function symbolEvidence(repo, commit, end) {
  const text = fileAt(repo, end.path, commit);
  if (text === null) return { path: end.path, symbol: end.symbol, exists: false, mentioned: false, defined: false, lines: [] };
  const symbol = escapeRegExp(end.symbol);
  const mention = new RegExp(`(?<![\\w$])${symbol}(?![\\w$])`);
  const definition = new RegExp(
    [
      `(?:function|class|def|interface|type|enum|struct|trait|impl)\\s+${symbol}(?![\\w$])`,
      `(?:const|let|var)\\s+${symbol}(?![\\w$])`,
      `export\\s+(?:default\\s+)?(?:async\\s+)?(?:function\\*?|class|const|let|var)\\s+${symbol}(?![\\w$])`,
      `(?<![\\w$])${symbol}\\s*[:=]\\s*(?:async\\s*)?(?:function\\*?\\b|\\(|[\\w$]+\\s*=>)`,
      `^\\s*(?:async\\s+)?(?:static\\s+)?${symbol}\\s*\\([^)]*\\)\\s*\\{`,
    ].join('|'),
    'm',
  );
  const lines = linesOf(text);
  const mentionedAt = [];
  for (let i = 0; i < lines.length; i += 1) if (mention.test(lines[i])) mentionedAt.push(i + 1);
  return {
    path: end.path,
    symbol: end.symbol,
    exists: true,
    mentioned: mentionedAt.length > 0,
    defined: definition.test(text),
    lines: mentionedAt.slice(0, 10),
  };
}

function checkBoundary(repo, commit, claim, tracked, record) {
  const boundary = claim.boundary;
  if (!boundary || !boundary.dir || !Array.isArray(boundary.neighbours) || boundary.neighbours.length === 0) {
    record('boundary', 'unchecked', 'a part claim that names no module boundary and no neighbours has nothing to check against the import graph');
    return;
  }
  const paths = [...tracked];
  const inside = paths.filter((path) => under(path, boundary.dir));
  const unparsed = [];
  const edges = [];
  const collect = (path, direction, neighbourOfPath) => {
    if (!supportsImports(path)) {
      unparsed.push(path);
      return;
    }
    const imports = importsOf(repo, path, commit);
    if (imports === null) return;
    for (const imported of imports) {
      const target = resolveSpec(path, imported.spec, tracked);
      if (direction === 'out') {
        const neighbour = boundary.neighbours.find((nb) => (target !== null && under(target, nb)) || specNames(imported.spec, nb));
        if (neighbour) edges.push({ direction: 'out', from: path, to: target ?? imported.spec, neighbour, line: imported.line });
      } else if ((target !== null && under(target, boundary.dir)) || specNames(imported.spec, boundary.dir)) {
        edges.push({ direction: 'in', from: path, to: target ?? imported.spec, neighbour: neighbourOfPath, line: imported.line });
      }
    }
  };
  for (const path of inside) collect(path, 'out', null);
  for (const neighbour of boundary.neighbours) {
    for (const path of paths.filter((candidate) => under(candidate, neighbour))) {
      if (under(path, boundary.dir)) continue;
      collect(path, 'in', neighbour);
    }
  }
  claim.edges = edges.slice(0, 50);
  claim.unparsed = unparsed;
  if (inside.length === 0) {
    record('boundary', 'contradicted', `no tracked file lives under the claimed boundary ${boundary.dir} at ${shortSha(commit)}`);
    return;
  }
  if (edges.length === 0) {
    const tail = unparsed.length > 0 ? `; ${unparsed.length} file(s) inside are in a language the import reader cannot parse` : '';
    record('boundary', 'inferred', `no import edge joins ${boundary.dir} to ${boundary.neighbours.join(', ')}${tail}`);
    for (const neighbour of boundary.neighbours) {
      claim.unresolved.push({ kind: 'boundary', from: boundary.dir, to: neighbour, reason: 'no import edge found' });
    }
    return;
  }
  record('boundary', 'verified', `${edges.length} import edge(s) join ${boundary.dir} and its named neighbours`);
}

function checkInteraction(repo, commit, claim, record) {
  const ends = claim.ends;
  if (!ends || !ends.from || !ends.to || !ends.from.symbol || !ends.to.symbol) {
    record('interaction', 'unchecked', 'an interaction claim that does not name a symbol at both ends cannot have either end resolved');
    return;
  }
  const from = symbolEvidence(repo, commit, ends.from);
  const to = symbolEvidence(repo, commit, ends.to);
  claim.ends = { from: { ...ends.from, evidence: from }, to: { ...ends.to, evidence: to } };
  const missing = [];
  // The calling end has to mention the symbol; the called end has to define it.
  if (!from.exists) missing.push({ end: 'from', reason: `${ends.from.path} does not exist at ${shortSha(commit)}` });
  else if (!from.mentioned) missing.push({ end: 'from', reason: `${ends.from.path} never names ${ends.from.symbol}` });
  if (!to.exists) missing.push({ end: 'to', reason: `${ends.to.path} does not exist at ${shortSha(commit)}` });
  else if (!to.defined) {
    missing.push({
      end: 'to',
      reason: to.mentioned
        ? `${ends.to.path} mentions ${ends.to.symbol} but no definition of it was found there`
        : `${ends.to.path} never names ${ends.to.symbol}`,
    });
  }
  if (missing.length > 0) {
    for (const item of missing) {
      claim.unresolved.push({ kind: 'interaction', end: item.end, path: ends[item.end].path, symbol: ends[item.end].symbol, reason: item.reason });
    }
    record('interaction', 'inferred', missing.map((item) => item.reason).join('; '));
    return;
  }
  record('interaction', 'verified', `${ends.from.symbol} is named in ${ends.from.path} and ${ends.to.symbol} is defined in ${ends.to.path}`);
}

function checkConstraint(repo, commit, claim, record) {
  const enforcement = claim.enforcement;
  // A constraint with no searchable enforcement point is not an unchecked
  // claim, it is a false one. "Everything goes through the repository layer"
  // with nothing that makes it so is the most dangerous sentence a map can
  // carry, because a learner will believe it and write code against it.
  if (!enforcement || typeof enforcement.pattern !== 'string' || enforcement.pattern.length === 0) {
    record('enforcement', 'contradicted', 'a constraint claim that supplies no enforcement pattern names no mechanism that enforces it');
    return;
  }
  let hits;
  try {
    hits = grepFor(repo, enforcement.pattern, enforcement.globs ?? [], commit);
  } catch (error) {
    record('enforcement', 'unchecked', `the enforcement search could not be run: ${error.message}`);
    return;
  }
  if (hits.length === 0) {
    const scope = (enforcement.globs ?? []).length > 0 ? ` within ${(enforcement.globs ?? []).join(', ')}` : '';
    record('enforcement', 'contradicted', `no tracked file at ${shortSha(commit)} matches the enforcement pattern ${enforcement.pattern}${scope}`);
    return;
  }
  claim.enforcementHits = hits.slice(0, 20);
  record('enforcement', 'verified', `${hits.length} enforcement point(s), first at ${hits[0].path}:${hits[0].line}`);
}

function checkContradiction(repo, commit, claim, record) {
  const falsifier = claim.falsifier;
  if (!falsifier || typeof falsifier.pattern !== 'string' || falsifier.pattern.length === 0) return;
  let hits;
  try {
    hits = grepFor(repo, falsifier.pattern, falsifier.globs ?? [], commit);
  } catch (error) {
    record('contradiction', 'unchecked', `the contradiction search could not be run: ${error.message}`);
    return;
  }
  if (hits.length > 0) {
    claim.falsifierHits = hits.slice(0, 20);
    record('contradiction', 'contradicted', `the falsifying pattern ${falsifier.pattern} matched ${hits.length} time(s), first at ${hits[0].path}:${hits[0].line}`);
    return;
  }
  record('contradiction', 'verified', `the falsifying pattern ${falsifier.pattern} matched nothing`);
}

// Fill in the fields a hand-written or agent-written claim may have left out,
// so that a missing optional field is a missing check rather than a crash. What
// is never filled in is the status: that is recomputed from the repository.
function normaliseInput(input) {
  return {
    id: typeof input?.id === 'string' && input.id.length > 0 ? input.id : 'unidentified',
    type: input?.type,
    sentence: typeof input?.sentence === 'string' ? input.sentence : '',
    path: input?.path ?? null,
    fromLine: input?.fromLine ?? null,
    toLine: input?.toLine ?? input?.fromLine ?? null,
    commit: input?.commit ?? null,
    spanHash: input?.spanHash ?? null,
    extractor: typeof input?.extractor === 'string' && input.extractor.length > 0 ? input.extractor : 'unknown',
    boundary: input?.boundary ?? null,
    ends: input?.ends ?? null,
    enforcement: input?.enforcement ?? null,
    falsifier: input?.falsifier ?? null,
  };
}

function checkClaim(repo, commit, input, tracked) {
  const claim = {
    ...normaliseInput(input),
    unresolved: [...(input?.unresolved ?? [])],
    coverage: [...(input?.coverage ?? [])],
    reasons: [],
  };
  // The status an agent wrote is the thing under test, so it is thrown away
  // before any check runs and rebuilt from the repository alone.
  claim.declaredStatus = CLAIM_STATUSES.includes(input?.status) ? input.status : 'unchecked';
  claim.status = 'unchecked';
  let status = 'verified';
  const record = (check, floor, detail) => {
    claim.reasons.push({ check, status: floor, detail });
    status = worst(status, floor);
  };

  try {
    validateClaim({ ...claim, status: 'unchecked' });
  } catch (error) {
    claim.reasons.push({ check: 'shape', status: 'unchecked', detail: `claim is malformed: ${error.message}` });
    claim.status = 'unchecked';
    return claim;
  }

  if (commit === null) {
    claim.reasons.push({ check: 'commit', status: 'unchecked', detail: 'the surveyed commit does not resolve in this repository, so nothing could be checked against it' });
    claim.status = 'unchecked';
    return claim;
  }

  if (claim.commit !== null && claim.commit !== commit && !commit.startsWith(claim.commit)) {
    record('commit', 'stale', `the claim was made against ${shortSha(claim.commit)} and is being checked against ${shortSha(commit)}`);
  }

  // Whether a missing span citation is fatal depends on what the claim is. A
  // `topic` or `part` sentence is a sentence about a place, so with no place it
  // has no provenance at all and cannot be checked. An `interaction` takes its
  // provenance from the two ends it names and a `constraint` from its
  // enforcement points, so for those a span is extra evidence rather than the
  // only evidence, and its absence is a note rather than a floor.
  const spanIsTheOnlyProvenance = claim.type === 'topic' || claim.type === 'part';
  const missingSpan = (check, detail) => {
    if (spanIsTheOnlyProvenance) record(check, 'unchecked', detail);
    else claim.reasons.push({ check, status: 'note', detail: `${detail}; provenance for a ${claim.type} claim comes from its structural evidence instead` });
  };

  const text = claim.path === null ? null : fileAt(repo, claim.path, commit);
  if (claim.path === null) {
    missingSpan('path', 'the claim cites no path');
  } else if (text === null) {
    record('path', 'contradicted', `${claim.path} does not exist at ${shortSha(commit)}`);
  } else {
    record('path', 'verified', `${claim.path} exists at ${shortSha(commit)}`);
  }

  if (text !== null) {
    if (claim.fromLine === null) {
      missingSpan('range', 'the claim cites no line range, so its span cannot be resolved or hashed');
    } else {
      const span = spanAt(repo, claim.path, claim.fromLine, claim.toLine, commit);
      if (span === null) {
        record('range', 'contradicted', `lines ${claim.fromLine}-${claim.toLine} fall outside ${claim.path}, which has ${linesOf(text).length} line(s) at ${shortSha(commit)}`);
      } else {
        record('range', 'verified', `lines ${claim.fromLine}-${claim.toLine} exist in ${claim.path} at ${shortSha(commit)}`);
        claim.spanFound = { hash: span.hash, fileLines: span.fileLines };
        if (claim.spanHash === null) {
          missingSpan('span-hash', 'the claim carries no span hash, so the cited text cannot be compared with the code');
        } else if (claim.spanHash !== span.hash) {
          // Not a contradiction. The sentence may still be true of code that
          // moved; what has expired is the citation, not necessarily the claim.
          record('span-hash', 'stale', `the cited span hashes to ${span.hash.slice(0, 19)} but the claim carries ${claim.spanHash.slice(0, 19)}`);
        } else {
          record('span-hash', 'verified', 'the cited span still hashes to what the claim recorded');
        }
      }
    }
  }

  if (claim.type === 'part') checkBoundary(repo, commit, claim, tracked, record);
  else if (claim.type === 'interaction') checkInteraction(repo, commit, claim, record);
  else if (claim.type === 'constraint') checkConstraint(repo, commit, claim, record);
  else record('type', 'verified', 'a topic claim carries no structural check beyond its citation');

  checkContradiction(repo, commit, claim, record);

  claim.status = status;
  return claim;
}

function excludedBy(path, rules) {
  for (const rule of rules) {
    if (rule instanceof RegExp && rule.test(path)) return true;
    if (typeof rule === 'string' && (path === normalise(rule) || under(path, rule))) return true;
  }
  return false;
}

// Coverage is exhaustive by construction. Every tracked path at the surveyed
// commit gets exactly one label and the labels sum to the file count. An
// omission that carries no label is the one failure this design cannot tolerate,
// because a directory nobody looked at would otherwise render as a part of the
// system that is empty.
export function classifyCoverage(repo, commit, checked, options = {}) {
  const exclude = options.exclude ?? [];
  const entries = commit === null ? filesUnder(repo, '.').map((path) => ({ path, type: 'blob', size: null, mode: '100644' })) : treeAt(repo, commit, '.');
  const textFiles = commit === null ? null : textFilesAt(repo, commit);

  const inspected = new Set();
  const unresolved = new Set();
  for (const claim of checked) {
    // A contradicted or unchecked claim confers no inspection. Counting it
    // would let a false sentence buy coverage for the file it misread.
    const confers = claim.status === 'verified' || claim.status === 'inferred' || claim.status === 'stale';
    if (confers) {
      if (claim.path) inspected.add(normalise(claim.path));
      for (const covered of claim.coverage ?? []) inspected.add(normalise(covered));
    }
    for (const edge of claim.unresolved ?? []) {
      if (edge && typeof edge.path === 'string') unresolved.add(normalise(edge.path));
    }
    for (const path of claim.unparsed ?? []) unresolved.add(normalise(path));
  }

  const paths = {};
  const counts = Object.fromEntries(COVERAGE_LABELS.map((label) => [label, 0]));
  for (const entry of entries) {
    const path = entry.path;
    let label;
    if (entry.type === 'commit') label = 'unresolved'; // a submodule is a repository we did not enter
    else if (excludedBy(path, exclude)) label = 'excluded';
    else if (GENERATED.some((pattern) => pattern.test(path))) label = 'generated';
    else if (BINARY_EXT.has(nodePath.extname(path).toLowerCase())) label = 'binary';
    else if (textFiles !== null && entry.size !== null && entry.size > 0 && !textFiles.has(path)) label = 'binary';
    else if (inspected.has(path)) label = 'inspected';
    else if (unresolved.has(path)) label = 'unresolved';
    else label = 'pending';
    paths[path] = label;
    counts[label] += 1;
  }

  const total = entries.length;
  const summed = COVERAGE_LABELS.reduce((acc, label) => acc + counts[label], 0);
  if (summed !== total) {
    throw new Error(`coverage is not exhaustive: ${summed} labelled of ${total} tracked paths`);
  }
  return { commit, total, counts, paths };
}

export function verify(repo, commit, claims, options = {}) {
  const resolved = resolveCommit(repo, commit);
  const tracked = new Set(resolved === null ? filesUnder(repo, '.') : filesAt(repo, resolved, '.'));
  const checked = (claims ?? []).map((claim) => checkClaim(repo, resolved, claim, tracked));
  const coverage = classifyCoverage(repo, resolved, checked, options);

  const byStatus = Object.fromEntries(CLAIM_STATUSES.map((status) => [status, 0]));
  for (const claim of checked) byStatus[claim.status] += 1;
  const downgraded = checked.filter((claim) => claim.declaredStatus === 'verified' && claim.status !== 'verified').length;

  const summary = {
    repo,
    commit: resolved,
    requestedCommit: commit,
    commitResolved: resolved !== null,
    claims: checked.length,
    byStatus,
    // What the interface may print without a qualifier.
    shownAsFact: byStatus.verified,
    // Kept, but drawn as unverified.
    shownQualified: checked.filter((claim) => claim.status !== 'contradicted' && NOT_SHOWN_AS_FACT.has(claim.status)).length,
    // The sentence is dropped. A contradicted claim is never rendered.
    dropped: byStatus.contradicted,
    downgradedFromVerified: downgraded,
    coverage: coverage.counts,
    trackedFiles: coverage.total,
  };
  return { claims: checked, coverage, summary };
}
