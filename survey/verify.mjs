import nodePath from 'node:path';
import { matchTexts, validatePattern, MAX_QUERY_BYTES } from './patterns.mjs';
import { CONSTRAINT_QUERIES, QUERY_VERSION } from './queries.mjs';
import { CLAIM_STATUSES, COVERAGE_LABELS, validateClaim, worst } from './claim.mjs';
import {
  codeOnly,
  importResolution,
  sourceClass,
  pathSensitiveConstraint,
  searchCode,
  fileAt,
  filesAt,
  filesUnder,
  importsOf,
  unresolvedImportsOf,
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
  if (spec.startsWith('/')) {
    const stem = normalise(spec).replace(/^\/+/, '');
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

function symbolEvidence(repo, commit, end) {
  const raw = fileAt(repo, end.path, commit);
  const text = raw === null || sourceClass(end.path, raw) !== 'production' ? null : codeOnly(raw, end.path);
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
  const mentionedAt = [];
  for (const match of matchTexts(mention.source, [text])[0]) mentionedAt.push(text.slice(0, match.index).split('\n').length);
  return {
    path: end.path,
    symbol: end.symbol,
    exists: true,
    mentioned: mentionedAt.length > 0,
    defined: matchTexts(definition.source, [text])[0].length > 0,
    lines: mentionedAt.slice(0, 10),
  };
}

function checkBoundary(repo, commit, claim, tracked, record, context) {
  const boundary = claim.boundary;
  if (!boundary?.dir || !boundary.neighbours?.length) {
    record('boundary', 'unchecked', 'a part claim must name a boundary and neighbours');
    return;
  }
  const all = [...tracked];
  const insideAll = all.filter((path) => under(path, boundary.dir));
  if (!insideAll.length) {
    record('boundary', 'contradicted', `no tracked file lives under the claimed boundary ${boundary.dir}`);
    return;
  }
  if (insideAll.length === all.length || boundary.neighbours.some((nb) => under(nb, boundary.dir) || under(boundary.dir, nb))) {
    record('boundary', 'contradicted', 'degenerate boundary: whole repository or overlapping/self neighbour');
    return;
  }
  const paths = all.filter((path) => {
    if (Date.now() > context.deadline) throw new Error('verification time budget exceeded');
    return sourceClass(path, fileAt(repo, path, commit) ?? '') === 'production';
  });
  const inside = paths.filter((path) => under(path, boundary.dir));
  const outside = paths.filter((path) => !under(path, boundary.dir));
  // Covering all production code is also a whole-repository cut even when a
  // README, tests, or build output lives outside the claimed directory.
  if (!outside.length) {
    record('boundary', 'contradicted', 'degenerate boundary: covers all production code');
    return;
  }
  claim.unparsed = all.filter((path) => !supportsImports(path) && (under(path, boundary.dir)
    || /\.(?:go|rs|java|rb|c|cc|cpp|h|cs|php|swift|kt|scala|sh|vue|svelte|jsx|tsx)$/i.test(path)));
  const internal = [], crossing = [], external = [], unknown = [], seen = new Set();
  for (const path of paths) {
    if (Date.now() > context.deadline) throw new Error('verification time budget exceeded');
    let parsed = context.imports.get(path);
    if (!parsed) {
      const imports = importsOf(repo, path, commit) ?? [];
      parsed = { imports, unknown: unresolvedImportsOf(repo, path, commit, imports) };
      context.imports.set(path, parsed);
    }
    unknown.push(...parsed.unknown);
    for (const imported of parsed.imports) {
      const target = resolveSpec(path, imported.spec, tracked);
      const resolution = importResolution(imported.spec, path, target);
      if (resolution === 'external') {
        external.push({ kind: 'external-import', path, spec: imported.spec, line: imported.line,
          reason: imported.spec.startsWith('node:') ? 'platform module' : 'package or runtime dependency outside the repository' });
        continue;
      }
      if (target === null) {
        unknown.push({ kind: 'import', path, spec: imported.spec, reason: 'unresolved module specifier' });
        continue;
      }
      const key = `${path}\0${target}`;
      if (seen.has(key) || path === target || !paths.includes(target)) continue;
      seen.add(key);
      const fromInside = under(path, boundary.dir), toInside = under(target, boundary.dir);
      const edge = { from: path, to: target, line: imported.line };
      if (fromInside && toInside) internal.push(edge);
      else if (fromInside !== toInside) crossing.push(edge);
    }
  }
  const unexplained = crossing.filter((edge) => !boundary.neighbours.some((nb) => under(under(edge.from, boundary.dir) ? edge.to : edge.from, nb)));
  const internalPossible = inside.length * (inside.length - 1);
  const crossingPossible = 2 * inside.length * outside.length;
  const internalDensity = internalPossible ? internal.length / internalPossible : 0;
  const crossingDensity = crossingPossible ? crossing.length / crossingPossible : 0;
  claim.boundaryMetrics = { internalEdges: internal.length, crossingEdges: crossing.length,
    internalPossible, crossingPossible, internalDensity, crossingDensity,
    unexplainedCrossings: unexplained.length, unresolvedEdges: unknown.length,
    insideFiles: inside.length, outsideFiles: outside.length };
  // Keep the long-standing zero-external metrics shape stable for consumers;
  // when external imports exist, their count and the concrete edges are
  // explicitly present in the evidence rather than being folded into unknown.
  if (external.length) claim.boundaryMetrics.externalEdges = external.length;
  claim.edges = [...internal, ...crossing].slice(0, 50);
  claim.external = external.slice(0, 100);
  claim.unresolved.push(...unknown.slice(0, 100));
  const missingNeighbours = boundary.neighbours.filter((nb) => !crossing.some((edge) => under(edge.from, nb) || under(edge.to, nb)));
  for (const nb of missingNeighbours) claim.unresolved.push({ kind: 'boundary', from: boundary.dir, to: nb, reason: 'no import edge found' });
  if (!crossing.length || !internal.length || internalDensity <= crossingDensity || unexplained.length || missingNeighbours.length) {
    record('boundary', 'inferred', `no defensible cut: ${internal.length} internal and ${crossing.length} crossing edges; densities ${internalDensity} and ${crossingDensity}`);
  } else if (unknown.length || claim.unparsed.length) {
    record('boundary', 'unchecked', 'boundary graph contains unresolved imports or unsupported files');
  } else {
    record('boundary', 'verified', `internal density ${internalDensity} exceeds crossing density ${crossingDensity}; all crossing edges explained`);
  }
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

function checkConstraint(repo, commit, claim, record, context) {
  const query = Object.hasOwn(CONSTRAINT_QUERIES, claim.constraintKind ?? '') ? CONSTRAINT_QUERIES[claim.constraintKind] : null;
  if (!query) {
    record('enforcement', 'unchecked', 'missing or unsupported constraintKind; agent patterns cannot verify a constraint');
    return;
  }
  claim.query = { version: QUERY_VERSION, kind: claim.constraintKind, ...query };
  const enforcement = searchCode(repo, commit, query.enforcement, context);
  const falsifier = searchCode(repo, commit, query.falsifier, context);
  claim.enforcementHits = enforcement.hits;
  claim.weakEnforcementHits = enforcement.weak;
  claim.falsifierHits = falsifier.hits;
  claim.weakFalsifierHits = falsifier.weak;
  if (query.structure === 'validation-before-write') {
    // The validator hit identifies the policy-bearing flow to inspect. The
    // writer query still searches repository-wide for bypass evidence, but
    // unrelated writers in other subsystems must not turn a lesson-specific
    // path claim into a claim about every persistence operation in the tree.
    claim.structuralEvidence = pathSensitiveConstraint(repo, commit, query.enforcement, query.falsifier, {
      ...context,
      paths: claim.path
        ? [claim.path]
        : [...new Set(enforcement.hits.map((hit) => hit.path))],
      focus: claim.path && claim.fromLine !== null
        ? { path: claim.path, fromLine: claim.fromLine, toLine: claim.toLine }
        : null,
    });
    if (!claim.structuralEvidence.verified) {
      record('enforcement', 'contradicted', 'the gate-owned validator is not on every path to a gate-owned write');
    } else {
      record('enforcement', 'verified', 'a gate-owned validator reaches every gate-owned write on every analysed path');
    }
  } else if (!enforcement.hits.length) {
    record('enforcement', 'contradicted', 'no production code matches the gate-owned enforcement query');
  } else {
    record('enforcement', 'inferred', `${enforcement.hits.length} enforcement candidate(s); lexical matches do not prove a runtime invariant`);
  }
  // Falsifiers are candidates as well: a write may be inside a transaction.
  // For the ordered validator query, writes are the events whose paths were
  // just analysed, so their presence is expected evidence rather than a
  // downgrade. They remain visible, but are only a note.
  record('contradiction', query.structure ? 'note' : falsifier.hits.length ? 'inferred' : 'note',
    `${falsifier.hits.length} gate-owned bypass candidate(s); absence is not proof`);
}

function checkExtraPatterns(repo, commit, claim, record, context) {
  for (const field of ['enforcement', 'falsifier']) {
    if (!claim[field]) continue;
    validatePattern(claim[field].pattern);
    const result = searchCode(repo, commit, claim[field].pattern, context);
    claim[`${field}ExtraHits`] = result;
    // An agent-proposed counterexample can lower confidence, never raise it.
    if (field === 'falsifier' && result.hits.length) record('extra-pattern', 'inferred', 'agent-proposed falsifier requires review');
  }
}

// Binding is necessary but not entailment. Exact controlled sentences are the
// only mechanically verified prose; arbitrary descriptions remain unchecked.
// This closes the omitted-identifier attack without pretending to parse English.
function checkProposition(repo, commit, claim, record) {
  const declared = claim.identifiers;
  const span = claim.path && claim.fromLine !== null ? spanAt(repo, claim.path, claim.fromLine, claim.toLine, commit) : null;
  const raw = span ? fileAt(repo, claim.path, commit) : null;
  const fullCode = raw === null ? null : codeOnly(raw, claim.path);
  const spanCode = fullCode === null ? '' : linesOf(fullCode).slice(claim.fromLine - 1, claim.toLine).join('\n');
  const evidencePaths = new Set([...(span ? [claim.path] : []),
    ...Object.values(claim.ends ?? {}).filter((end) => end.evidence?.mentioned).map((end) => end.path),
    ...(claim.enforcementHits ?? []).map((hit) => hit.path),
    ...(claim.falsifierHits ?? []).map((hit) => hit.path),
    ...(claim.edges ?? []).flatMap((edge) => [edge.from, edge.to])]);
  // Recover obvious code identifiers even if an agent leaves them off its list.
  const mentioned = claim.sentence.match(/\b[A-Za-z_$][\w$]*(?:[A-Z][\w$]*|_[\w$]+)\b/g) ?? [];
  const automatic = mentioned.filter((name) => /[a-z][A-Z]|_/.test(name)).map((name) => ({ kind: 'symbol', name }));
  const identifiers = [...(declared ?? []), ...automatic];
  const missing = [];
  for (const item of identifiers) {
    let found;
    if (item.kind === 'symbol') {
      const pattern = `(?<![\\w$])${escapeRegExp(item.name)}(?![\\w$])`;
      // When a span is cited, symbols must be in that exact span, not elsewhere
      // in the file or in unrelated enforcement hits.
      const texts = span ? [spanCode] : [
        ...Object.values(claim.ends ?? {}).filter((end) => end.evidence?.mentioned && end.symbol === item.name).map(() => item.name),
        ...(claim.enforcementHits ?? []).map((hit) => hit.text),
        ...(claim.falsifierHits ?? []).map((hit) => hit.text),
      ];
      found = matchTexts(pattern, texts).some((matches) => matches.length);
    } else if (item.kind === 'path') found = evidencePaths.has(item.name);
    else found = [...evidencePaths].some((path) => under(path, item.name));
    if (!found) missing.push(item.name);
  }
  if (missing.length) record('proposition-binding', 'contradicted', `identifiers absent from own evidence: ${[...new Set(missing)].join(', ')}`);
  else if (!declared?.length) record('proposition-binding', 'unchecked', 'explicit proposition identifiers are required');
  else record('proposition-binding', 'verified', 'all asserted identifiers occur in the claim evidence');

  let expected = null;
  const symbols = (declared ?? []).filter((item) => item.kind === 'symbol');
  const includes = (kind, name) => declared?.some((item) => item.kind === kind && item.name === name);
  if (claim.type === 'topic' && claim.predicate === 'reference' && symbols.length === 1 && includes('path', claim.path)) {
    expected = `\`${symbols[0].name}\` is referenced in \`${claim.path}\`.`;
    if (!span || raw === null || sourceClass(claim.path, raw) !== 'production' || fullCode === null) record('proposition', 'unchecked', 'reference requires a production code span');
  } else if (claim.type === 'interaction' && claim.predicate === 'reference' && claim.ends
      && claim.ends.from.symbol === claim.ends.to.symbol
      && includes('symbol', claim.ends.from.symbol) && includes('path', claim.ends.from.path) && includes('path', claim.ends.to.path)) {
    expected = `\`${claim.ends.from.symbol}\` is referenced in \`${claim.ends.from.path}\` and defined in \`${claim.ends.to.path}\`.`;
  } else if (claim.type === 'part' && claim.predicate === 'boundary' && claim.boundary
      && includes('module', claim.boundary.dir) && claim.boundary.neighbours.every((nb) => includes('module', nb))) {
    expected = `\`${claim.boundary.dir}\` has denser internal imports than crossing imports.`;
  } else if (claim.type === 'constraint') {
    const controlled = {
      'validation-before-persistence': 'Lesson documents are validated before storage.',
      'validation-before-storage': 'Lesson documents are validated before storage.',
      'authentication-before-handler': 'Authentication precedes every handler.',
      transactions: 'Every write is wrapped in a transaction.',
      idempotency: 'Repeated requests are handled idempotently.',
      'rate-limiting': 'Requests are rate limited.',
      tenancy: 'Every read is scoped to a tenant.',
      'tenant-scoping': 'Every read is scoped to a tenant.',
      'tenant-scoped-read': 'Every read is scoped to a tenant.',
      'input-sanitisation': 'Input is sanitised before use.',
      'input-sanitisation-before-use': 'Input is sanitised before use.',
    }[claim.constraintKind];
    if (controlled) expected = controlled;
  }
  const normaliseSentence = (sentence) => sentence.trim().replace(/[.!?]+$/, '').toLowerCase();
  if (expected === null || normaliseSentence(claim.sentence) !== normaliseSentence(expected)) {
    record('proposition', 'unchecked', 'sentence is outside the mechanically checkable proposition vocabulary');
  }
  else record('proposition', 'verified', 'sentence exactly states the checked proposition');
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
    constraintKind: input?.constraintKind ?? null,
    identifiers: input?.identifiers ?? null,
    predicate: input?.predicate ?? null,
  };
}

function checkClaim(repo, commit, input, tracked, context) {
  const claim = {
    ...normaliseInput(input),
    unresolved: Array.isArray(input?.unresolved) ? [...input.unresolved] : input?.unresolved ?? [],
    coverage: Array.isArray(input?.coverage) ? [...input.coverage] : input?.coverage ?? [],
    reasons: [],
  };
  // The status an agent wrote is the thing under test, so it is thrown away
  // before any check runs and rebuilt from the repository alone.
  claim.declaredStatus = CLAIM_STATUSES.includes(input?.status) ? input.status : 'unchecked';
  claim.status = 'unchecked';
  let status = 'verified';
  const record = (check, floor, detail) => {
    claim.reasons.push({ check, status: floor, detail });
    if (floor !== 'note') status = worst(status, floor);
  };

  try {
    validateClaim({ ...claim, status: 'unchecked' });
  } catch (error) {
    claim.reasons.push({ check: 'shape', status: 'unchecked', detail: `claim is malformed: ${error.message}` });
    claim.status = 'unchecked';
    return claim;
  }

  if (Date.now() > context.deadline) {
    claim.reasons.push({ check: 'budget', status: 'unchecked', detail: 'verification time budget exceeded' });
    return claim;
  }

  if (commit === null) {
    claim.reasons.push({ check: 'commit', status: 'unchecked', detail: 'the surveyed commit does not resolve in this repository, so nothing could be checked against it' });
    claim.status = 'unchecked';
    return claim;
  }

  if (claim.commit === null) record('commit', 'unchecked', 'claim does not name its surveyed commit');
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

  try {
    checkExtraPatterns(repo, commit, claim, record, context);
    if (claim.type === 'part') checkBoundary(repo, commit, claim, tracked, record, context);
    else if (claim.type === 'interaction') checkInteraction(repo, commit, claim, record);
    else if (claim.type === 'constraint') checkConstraint(repo, commit, claim, record, context);
    checkProposition(repo, commit, claim, record);
    if (claim.unresolved.length) record('unresolved', 'unchecked', 'claim depends on unresolved evidence');
  } catch (error) {
    record('query', 'unchecked', `could not complete verification: ${error.message}`);
  }

  claim.status = status;
  return claim;
}

function excludedBy(path, rules) {
  for (const rule of rules) {
    if (rule instanceof RegExp && matchTexts(rule.source, [path], rule.flags)[0].length) return true;
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
    for (const edge of Array.isArray(claim.unresolved) ? claim.unresolved : []) {
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

export const MAX_CLAIMS = 100;
export const MAX_RUN_MS = 30000;

export function verify(repo, commit, claims, options = {}) {
  if (!Array.isArray(claims ?? []) || (claims?.length ?? 0) > MAX_CLAIMS) throw new Error(`verification accepts at most ${MAX_CLAIMS} claims`);
  const context = { deadline: Date.now() + MAX_RUN_MS, cache: new Map(), sources: new Map(), imports: new Map() };
  const resolved = resolveCommit(repo, commit);
  const tracked = new Set(resolved === null ? filesUnder(repo, '.') : filesAt(repo, resolved, '.'));
  const inventory = resolved === null ? [] : treeAt(repo, resolved);
  if (inventory.length > 2000 || inventory.reduce((n, entry) => n + (entry.size ?? 0), 0) > MAX_QUERY_BYTES) throw new Error('repository verification budget exceeded');
  const checked = (claims ?? []).map((claim) => checkClaim(repo, resolved, claim, tracked, context));
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
