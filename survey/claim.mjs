import crypto from 'node:crypto';

// A claim is one atomic sentence the survey wants to put on the map, together
// with everything the gate needs in order to disagree with it. Nothing here
// decides whether a claim is true; that is verify.mjs. This file only fixes the
// shape, so that a claim which forgot to carry its evidence is a claim that
// cannot be checked, rather than a claim that quietly passes.

export const CLAIM_TYPES = ['part', 'interaction', 'constraint', 'topic'];

export const CLAIM_STATUSES = ['verified', 'inferred', 'contradicted', 'stale', 'unchecked'];

// `inferred` has only partial evidence, `stale` has evidence whose citation no
// longer matches the repository, and `unchecked` has no mechanical verdict.
// None of those statuses positively disproves the sentence, so the user may
// vouch for them. `contradicted` is deliberately absent: vouching cannot
// overrule evidence that the repository has disproved the claim.
export const VOUCHABLE_CLAIM_STATUSES = ['inferred', 'stale', 'unchecked'];

export function canVouchClaim(status) {
  return VOUCHABLE_CLAIM_STATUSES.includes(status);
}

export const COVERAGE_LABELS = ['inspected', 'excluded', 'generated', 'binary', 'unresolved', 'pending'];

// Worst first. The gate takes the worst status any single check produced, so a
// failing check can never be outvoted by the checks that passed.
const SEVERITY = { contradicted: 0, stale: 1, unchecked: 2, inferred: 3, verified: 4 };

export function severity(status) {
  const rank = SEVERITY[status];
  if (rank === undefined) throw new Error(`unknown claim status: ${status}`);
  return rank;
}

export function worst(a, b) {
  return severity(a) <= severity(b) ? a : b;
}

export function hashText(text) {
  return `sha256:${crypto.createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

// A claim id has to survive a re-survey of the same repository, so it is derived
// from what the claim is about rather than from when it was made. Two runs that
// produce the same sentence about the same span produce the same id, which is
// what lets a card stay attached to its claim across commits.
export function claimId({ type, path = null, fromLine = null, toLine = null, sentence = '' }) {
  const key = [type, path ?? '', fromLine ?? '', toLine ?? '', sentence].join('\u0000');
  const digest = crypto.createHash('sha256').update(key, 'utf8').digest('hex');
  return `${type}-${digest.slice(0, 16)}`;
}

function isPositiveInt(value) {
  return Number.isInteger(value) && value > 0;
}

export function validateClaim(claim) {
  if (!claim || typeof claim !== 'object') throw new Error('claim must be an object');
  if (typeof claim.id !== 'string' || claim.id.length === 0) throw new Error('claim id must be a non-empty string');
  if (!CLAIM_TYPES.includes(claim.type)) throw new Error(`unknown claim type: ${claim.type}`);
  if (!CLAIM_STATUSES.includes(claim.status)) throw new Error(`unknown claim status: ${claim.status}`);
  if (typeof claim.sentence !== 'string') throw new Error('claim sentence must be a string');
  if (claim.path !== null && (typeof claim.path !== 'string' || claim.path.length === 0)) {
    throw new Error('claim path must be null or a non-empty string');
  }
  if (claim.path !== null && (claim.path.startsWith('/') || claim.path.split('/').includes('..'))) {
    throw new Error('claim path must be repository-relative and must not escape the repository');
  }
  if (claim.fromLine !== null && !isPositiveInt(claim.fromLine)) throw new Error('claim fromLine must be a positive integer or null');
  if (claim.toLine !== null && !isPositiveInt(claim.toLine)) throw new Error('claim toLine must be a positive integer or null');
  if (claim.fromLine !== null && claim.toLine !== null && claim.toLine < claim.fromLine) {
    throw new Error('claim toLine must not precede fromLine');
  }
  if (claim.fromLine !== null && claim.path === null) throw new Error('a claim with a line range must cite a path');
  if (claim.commit !== null && typeof claim.commit !== 'string') throw new Error('claim commit must be null or a string');
  if (claim.spanHash !== null && typeof claim.spanHash !== 'string') throw new Error('claim spanHash must be null or a string');
  if (typeof claim.extractor !== 'string' || claim.extractor.length === 0) throw new Error('claim extractor must name what produced it');
  if (!Array.isArray(claim.unresolved)) throw new Error('claim unresolved must be an array');
  if (!Array.isArray(claim.coverage)) throw new Error('claim coverage must be an array');
  for (const covered of claim.coverage) {
    if (typeof covered !== 'string' || covered.length === 0) throw new Error('claim coverage entries must be repository paths');
  }
  if (claim.boundary !== null) {
    if (typeof claim.boundary.dir !== 'string' || claim.boundary.dir.length === 0) throw new Error('claim boundary must name a dir');
    if (!Array.isArray(claim.boundary.neighbours)) throw new Error('claim boundary must carry a neighbours array');
  }
  if (claim.ends !== null) {
    for (const end of ['from', 'to']) {
      const side = claim.ends[end];
      if (!side || typeof side.path !== 'string' || typeof side.symbol !== 'string') {
        throw new Error(`claim ends.${end} must carry a path and a symbol`);
      }
    }
  }
  if (claim.enforcement !== null && typeof claim.enforcement.pattern !== 'string') {
    throw new Error('claim enforcement must carry a pattern string');
  }
  if (claim.falsifier !== null && typeof claim.falsifier.pattern !== 'string') {
    throw new Error('claim falsifier must carry a pattern string');
  }
  if (claim.identifiers != null) {
    if (!Array.isArray(claim.identifiers) || claim.identifiers.length > 64) throw new Error('identifiers must be an array of at most 64 entries');
    for (const item of claim.identifiers) {
      if (!item || !['symbol', 'path', 'module'].includes(item.kind)
          || typeof item.name !== 'string' || !item.name.length || item.name.length > 200) throw new Error('invalid proposition identifier');
      if (item.kind === 'symbol' && !/^[A-Za-z_$][\w$]*$/.test(item.name)) throw new Error('invalid symbol identifier');
    }
  }
  if (claim.ends && Object.keys(claim.ends).some((key) => !['from', 'to'].includes(key))) throw new Error('unknown interaction endpoint');
  if (claim.sentence.length > 4096) throw new Error('sentence exceeds 4096 characters');
  for (const value of [claim.coverage, claim.unresolved, claim.boundary?.neighbours ?? []]) {
    if (value.length > 256) throw new Error('claim collection exceeds 256 entries');
  }
  for (const neighbour of claim.boundary?.neighbours ?? []) {
    if (typeof neighbour !== 'string' || !neighbour.length) throw new Error('invalid neighbour');
  }
  for (const end of Object.values(claim.ends ?? {})) {
    if (!/^[A-Za-z_$][\w$]*$/.test(end.symbol) || end.symbol.length > 200) throw new Error('invalid endpoint symbol');
  }
  return claim;
}

// The default status is `unchecked`, deliberately. A constructor that defaulted
// to `verified` would make forgetting to run the gate look like success, and the
// whole point of this subsystem is that silence never reads as success.
export function makeClaim(fields) {
  const {
    id = null,
    type,
    status = 'unchecked',
    sentence = '',
    path = null,
    fromLine = null,
    toLine = null,
    commit = null,
    spanHash = null,
    extractor = 'unknown',
    unresolved = [],
    coverage = [],
    boundary = null,
    ends = null,
    enforcement = null,
    falsifier = null,
    constraintKind = null,
    identifiers = null,
    predicate = null,
  } = fields || {};
  const claim = {
    id: id || claimId({ type, path, fromLine, toLine, sentence }),
    type,
    status,
    sentence,
    path,
    fromLine,
    toLine: toLine === null && fromLine !== null ? fromLine : toLine,
    commit,
    spanHash,
    extractor,
    unresolved: [...unresolved],
    coverage: [...coverage],
    boundary,
    ends,
    enforcement,
    falsifier,
    constraintKind,
    identifiers,
    predicate,
    reasons: [],
  };
  return validateClaim(claim);
}
