import crypto from 'node:crypto';
import fs from 'node:fs';
import nodePath from 'node:path';
import { readAll } from '../core/log.mjs';
import { canVouchClaim, validateClaim } from './claim.mjs';
import { canonicalRepositoryPath, filesUnder, languageOf, repositoryRoot, resolveCommit } from './evidence.mjs';

// Where a survey goes after the gate has finished with it, and what the
// interface is allowed to know about one.
//
// The survey itself is performed by the user's own coding agent through MCP, so
// the application's part is to remember the result and to say, honestly, what
// state a repository is in: never surveyed, surveyed at a commit, or surveyed
// and waiting to be confirmed. Nothing here decides whether a claim is true.
// That is survey/verify.mjs, and this file never revisits its verdict.

const MAX_CLAIM_NAME = 64;

/** A survey is filed under the repository and the commit it read. */
export function surveyKey(repo, commit) {
  const canonicalRepo = canonicalRepositoryPath(repo);
  return crypto
    .createHash('sha256')
    .update(`${canonicalRepo}\u0000${commit ?? ''}`, 'utf8')
    .digest('hex')
    .slice(0, 16);
}

function surveysDir(home) {
  return nodePath.join(home, 'surveys');
}

export function storeSurvey(home, repo, result) {
  const dir = surveysDir(home);
  const canonicalRepo = canonicalRepositoryPath(repo);
  fs.mkdirSync(dir, { recursive: true });
  const file = nodePath.join(dir, `${surveyKey(canonicalRepo, result.summary?.commit ?? null)}.json`);
  const document = {
    at: new Date().toISOString(),
    ...result,
    summary: { ...result.summary, repo: canonicalRepo },
  };
  fs.writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
  return file;
}

function readStored(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (!parsed.summary || typeof parsed.summary.repo !== 'string') return null;
    return { ...parsed, summary: { ...parsed.summary, repo: canonicalRepositoryPath(parsed.summary.repo) } };
  } catch {
    // A half-written or hand-edited survey file is skipped rather than crashing
    // the route that lists them. It is a cache of an agent's submission, not a
    // source of truth anything else depends on.
    return null;
  }
}

/** Every stored survey, newest first. */
export function listSurveys(home) {
  const dir = surveysDir(home);
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const surveys = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const file = nodePath.join(dir, name);
    const stored = readStored(file);
    if (stored === null) continue;
    let at = typeof stored.at === 'string' ? stored.at : null;
    if (at === null) {
      try {
        at = fs.statSync(file).mtime.toISOString();
      } catch {
        at = null;
      }
    }
    surveys.push({
      repo: stored.summary.repo,
      commit: stored.summary.commit ?? null,
      at,
      claims: stored.summary.claims ?? 0,
      shownAsFact: stored.summary.shownAsFact ?? 0,
      coverage: stored.summary.coverage ?? null,
    });
  }
  return surveys.sort((left, right) => (left.at ?? '').localeCompare(right.at ?? '')).reverse();
}

function newestFor(home, repo) {
  const dir = surveysDir(home);
  const canonicalRepo = canonicalRepositoryPath(repo);
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return null;
  }
  let best = null;
  let bestAt = '';
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const stored = readStored(nodePath.join(dir, name));
    if (stored === null || stored.summary.repo !== canonicalRepo) continue;
    const at = typeof stored.at === 'string' ? stored.at : '';
    if (best === null || at >= bestAt) {
      best = stored;
      bestAt = at;
    }
  }
  return best;
}

/**
 * Resolve the gate's own claim before a user can vouch for it. The repository
 * and id are selectors supplied by the caller; the survey file is the source
 * of the claim and its status. In particular, an active vouch is not read
 * here, because a second vouch must be judged against the gate result that was
 * stored before any user overlay existed.
 */
export function storedClaimForVouch(home, repo, claimId) {
  if (typeof repo !== 'string' || repo.trim() === '') throw new Error('repo must be a non-empty string');
  if (typeof claimId !== 'string' || claimId.trim() === '') throw new Error('claimId must be a non-empty string');
  const repository = inspectRepository(repo);
  const stored = newestFor(home, repository.root ?? repository.path);
  const claim = (Array.isArray(stored?.claims) ? stored.claims : []).find((item) => item?.id === claimId);
  if (claim === undefined) throw new Error(`claim not found in stored survey: ${claimId}`);
  try {
    validateClaim(claim);
    return claimSnapshotForVouch(claim);
  } catch (error) {
    throw new Error(`stored claim cannot be vouched: ${error.message}`);
  }
}

/**
 * What the application may know about a directory before anything has surveyed
 * it: whether it is a git repository at all, which is the one thing the survey
 * screen has to be able to refuse.
 */
export function inspectRepository(path) {
  if (typeof path !== 'string' || path.trim() === '') throw new Error('path is required');
  const chosen = canonicalRepositoryPath(path);
  let exists = false;
  try {
    exists = fs.statSync(chosen).isDirectory();
  } catch {
    exists = false;
  }
  if (!exists) {
    return { path: chosen, exists: false, git: false, root: null, name: nodePath.basename(chosen), head: null, files: 0, language: null };
  }

  const root = repositoryRoot(chosen);
  if (root === null) {
    return { path: chosen, exists: true, git: false, root: null, name: nodePath.basename(chosen), head: null, files: 0, language: null };
  }

  const head = resolveCommit(root, 'HEAD');
  let files = [];
  try {
    files = filesUnder(root, '.');
  } catch {
    files = [];
  }
  const counted = new Map();
  for (const file of files) {
    const language = languageOf(file);
    if (language === null) continue;
    counted.set(language, (counted.get(language) ?? 0) + 1);
  }
  const language = [...counted.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;

  return {
    path: chosen,
    exists: true,
    git: true,
    root,
    name: nodePath.basename(root),
    head,
    files: files.length,
    language,
  };
}

function tidy(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * A short name for a claim. A claim carries a sentence and its evidence but no
 * title, and a row of five identical sentences is unreadable, so the name is
 * derived from the evidence rather than invented: the boundary a part names,
 * the two ends of an interaction, the file a constraint is enforced in.
 */
export function claimName(claim) {
  const fromBoundary = typeof claim.boundary?.dir === 'string' ? claim.boundary.dir : null;
  const ends = claim.ends;
  // One symbol named at both ends is one symbol, not a journey from itself to
  // itself: "openState to openState" reads as a mistake in the question.
  const fromEnds = ends?.from?.symbol && ends?.to?.symbol
    ? (ends.from.symbol === ends.to.symbol ? ends.from.symbol : `${ends.from.symbol} to ${ends.to.symbol}`)
    : null;
  const fromPath = typeof claim.path === 'string' && claim.path !== ''
    ? nodePath.basename(claim.path).replace(/\.[^.]+$/, '')
    : null;
  const candidate = fromBoundary ?? fromEnds ?? fromPath ?? tidy(claim.sentence).split(' ').slice(0, 5).join(' ');
  const name = tidy(candidate);
  if (name === '') return claim.type;
  return name.length > MAX_CLAIM_NAME ? `${name.slice(0, MAX_CLAIM_NAME - 1)}…` : name;
}

const ALTITUDE_OF = { part: 'map', topic: 'map', interaction: 'boundary', constraint: 'mechanism' };

// Vouched claims join the two gate outcomes that already seed the map. A vouch
// is a separate user judgement, never a promotion to `verified`, but the drill
// must still test the claim so a wrong judgement can surface there.
const SEEDS = new Set(['verified', 'inferred', 'vouched']);

function activeVouches(home) {
  const active = new Map();
  for (const event of readAll(home)) {
    if (event.type === 'claim.vouched') {
      const claim = event.data?.claim;
      if (!claim || typeof claim !== 'object' || Array.isArray(claim)
        || typeof claim.id !== 'string' || !canVouchClaim(claim.status)) continue;
      try {
        validateClaim(claim);
      } catch {
        continue;
      }
      active.set(claim.id, {
        judgement: typeof event.data.judgement === 'string' ? event.data.judgement : '',
        at: event.at,
      });
    } else if (event.type === 'claim.vouch.withdrawn' && typeof event.data?.claim === 'string') {
      active.delete(event.data.claim);
    }
  }
  return active;
}

// The event carries the complete gate claim so the vouch stays meaningful if
// the disposable cache is rebuilt. Keep only the validated claim fields here;
// verification diagnostics can be large and are not needed to replay a vouch.
function claimSnapshotForVouch(claim) {
  return {
    id: claim.id,
    type: claim.type,
    status: claim.status,
    sentence: claim.sentence,
    path: claim.path ?? null,
    fromLine: claim.fromLine ?? null,
    toLine: claim.toLine ?? null,
    commit: claim.commit ?? null,
    spanHash: claim.spanHash ?? null,
    extractor: claim.extractor,
    unresolved: Array.isArray(claim.unresolved) ? [...claim.unresolved] : [],
    coverage: Array.isArray(claim.coverage) ? [...claim.coverage] : [],
    boundary: claim.boundary ?? null,
    ends: claim.ends ?? null,
    enforcement: claim.enforcement ?? null,
    falsifier: claim.falsifier ?? null,
    constraintKind: claim.constraintKind ?? null,
    identifiers: claim.identifiers ?? null,
    predicate: claim.predicate ?? null,
  };
}

function askFor(claim, name) {
  if (claim.type === 'constraint') {
    return `What rule does ${name} hold across this repository, and where is it enforced?`;
  }
  if (claim.type === 'interaction') {
    return `How does ${name} work, and what crosses that edge?`;
  }
  if (claim.type === 'part') {
    return `What does ${name} own, and what does it deliberately leave to something else?`;
  }
  return `What is ${name} responsible for in this codebase?`;
}

/**
 * The topics and cards a confirmed survey becomes. The interface posts these
 * through the ordinary /api/topics and /api/cards routes, so nothing here
 * writes to the state; it only says what would be written.
 *
 * Ids are the claim ids, which are derived from what a claim is about rather
 * than from when it was made, so confirming the same survey twice proposes the
 * same topics rather than a second copy of them.
 */
export function seedFrom(result, { project } = {}) {
  const claims = Array.isArray(result?.claims) ? result.claims : [];
  const projectId = typeof project === 'string' && project.trim() !== ''
    ? project.trim()
    : slug(nodePath.basename(result?.summary?.repo ?? 'project'));
  const topics = [];
  const cards = [];

  for (const claim of claims) {
    if (!SEEDS.has(claim.status)) continue;
    const name = claimName(claim);
    topics.push({
      claim: claim.id,
      topic: claim.id,
      name,
      parent: null,
      kind: 'concept',
      project: projectId,
      gateStatus: claim.gateStatus ?? claim.status,
    });
    if (typeof claim.path !== 'string' || claim.path === '' || !Number.isInteger(claim.fromLine)) continue;
    cards.push({
      claim: claim.id,
      id: `${claim.id}-q1`,
      project: projectId,
      concept: name,
      ask: askFor(claim, name),
      rubric: [tidy(claim.sentence)].filter((line) => line !== ''),
      altitude: ALTITUDE_OF[claim.type] ?? 'map',
      topics: [claim.id],
      grounding: [{ path: claim.path, line: claim.fromLine, commit: claim.commit ?? null }],
      source: { type: 'survey', ref: claim.id, gateStatus: claim.gateStatus ?? claim.status },
    });
  }

  return { project: projectId, topics, cards: cards.filter((card) => card.rubric.length > 0) };
}

export function slug(text) {
  const value = String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return value === '' ? 'project' : value.slice(0, 64);
}

/**
 * Everything the survey screen needs about one repository: what the directory
 * is, what the last survey of it found, and what confirming it would write.
 */
export function surveyState(home, path) {
  const repository = inspectRepository(path);
  const repo = repository.root ?? repository.path;
  const stored = newestFor(home, repo);
  if (stored === null) {
    return { repo, repository, survey: null, seed: null };
  }
  const vouches = activeVouches(home);
  const claims = (Array.isArray(stored.claims) ? stored.claims : []).map((claim) => {
    const vouch = typeof claim.id === 'string' && canVouchClaim(claim.status) ? vouches.get(claim.id) : undefined;
    const isVouched = vouch !== undefined;
    return {
      id: claim.id,
      type: claim.type,
      status: isVouched ? 'vouched' : claim.status,
      gateStatus: isVouched ? claim.status : null,
      vouched: isVouched,
      judgement: isVouched ? vouch.judgement : null,
      vouchedAt: isVouched ? vouch.at : null,
      declaredStatus: claim.declaredStatus ?? null,
      name: claimName(claim),
      sentence: tidy(claim.sentence ?? ''),
      path: claim.path ?? null,
      fromLine: claim.fromLine ?? null,
      toLine: claim.toLine ?? null,
      reasons: Array.isArray(claim.reasons) ? claim.reasons : [],
      claim: claimSnapshotForVouch(claim),
    };
  });
  const seedClaims = claims.map((claim) => claim.status === 'vouched'
    ? { ...claim.claim, status: claim.status, gateStatus: claim.gateStatus }
    : claim.claim);
  return {
    repo,
    repository,
    survey: {
      at: typeof stored.at === 'string' ? stored.at : null,
      summary: stored.summary,
      coverage: stored.coverage?.counts ?? stored.summary?.coverage ?? null,
      claims,
    },
    seed: seedFrom({ ...stored, claims: seedClaims }, { project: slug(repository.name) }),
  };
}

function coverageView(coverage) {
  if (coverage === null || coverage === undefined) return null;
  const counts = {
    inspected: Number(coverage.inspected ?? 0),
    excluded: Number(coverage.excluded ?? 0),
    generated: Number(coverage.generated ?? 0),
    binary: Number(coverage.binary ?? 0),
    unresolved: Number(coverage.unresolved ?? 0),
    pending: Number(coverage.pending ?? 0),
  };
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return {
    counts,
    total,
    segments: [
      { id: 'inspected', label: 'inspected', count: counts.inspected },
      { id: 'generated', label: 'generated', count: counts.generated },
      { id: 'excluded-binary', label: 'excluded / binary', count: counts.excluded + counts.binary },
      { id: 'not-inspected', label: 'not inspected', count: counts.unresolved + counts.pending },
    ],
  };
}

function evidenceFor(claim) {
  return {
    path: claim.path,
    fromLine: claim.fromLine,
    toLine: claim.toLine,
    commit: claim.claim?.commit ?? null,
  };
}

function reasonFor(claim) {
  if (claim.status === 'vouched') {
    return claim.judgement ? `Confirmed by you: ${claim.judgement}` : 'Confirmed by you; the gate did not prove this claim from code.';
  }
  const sameStatus = claim.reasons.find((reason) => reason.status === claim.status);
  if (sameStatus?.detail) return sameStatus.detail;
  const useful = claim.reasons.find((reason) => reason.status !== 'note' && reason.detail.trim() !== '');
  return useful?.detail ?? 'The survey recorded no additional reason.';
}

function mapClaim(claim) {
  return {
    id: claim.id,
    name: claim.name,
    sentence: claim.sentence,
    status: claim.status,
    gateStatus: claim.gateStatus,
    vouched: claim.vouched,
    judgement: claim.judgement,
    evidence: evidenceFor(claim),
    reason: reasonFor(claim),
    reasons: claim.reasons,
    boundary: claim.claim?.boundary ?? null,
  };
}

function endpointPart(parts, endpoint) {
  if (!endpoint || typeof endpoint.path !== 'string') return null;
  const ranked = parts
    .map((part) => {
      const dir = typeof part.boundary?.dir === 'string' ? part.boundary.dir : null;
      const exact = part.evidence.path === endpoint.path ? 3 : 0;
      const under = dir !== null && (endpoint.path === dir || endpoint.path.startsWith(`${dir}/`)) ? 2 : 0;
      const cited = part.evidence.path !== null && endpoint.path.startsWith(`${part.evidence.path}/`) ? 1 : 0;
      return { part, rank: exact + under + cited };
    })
    .filter((item) => item.rank > 0)
    .sort((left, right) => right.rank - left.rank || left.part.id.localeCompare(right.part.id));
  return ranked[0]?.part.id ?? null;
}

/**
 * Read-side projection for the project map. It intentionally reads the
 * disposable survey cache, not the seeded topics: the map must still show
 * claims that were not good enough to seed a card or topic.
 */
export function projectMapState(home, projectId) {
  if (typeof projectId !== 'string' || projectId.trim() === '') throw new Error('project must be a non-empty string');
  const candidate = listSurveys(home).find((survey) => slug(nodePath.basename(survey.repo)) === projectId);
  if (candidate === undefined) return {
    project: projectId, repo: null, survey: null, parts: [], constraints: [], edges: [],
    verifiedParts: 0, verifiedConstraints: 0, vouchedClaims: 0,
  };
  const view = surveyState(home, candidate.repo);
  if (view.survey === null) return {
    project: projectId, repo: null, survey: null, parts: [], constraints: [], edges: [],
    verifiedParts: 0, verifiedConstraints: 0, vouchedClaims: 0,
  };

  const claims = view.survey.claims;
  const parts = claims.filter((claim) => claim.type === 'part').map(mapClaim);
  const constraints = claims.filter((claim) => claim.type === 'constraint').map(mapClaim);
  const interactions = claims.filter((claim) => claim.type === 'interaction').map((claim) => {
    const mapped = mapClaim(claim);
    const fromEndpoint = claim.claim?.ends?.from ?? null;
    const toEndpoint = claim.claim?.ends?.to ?? null;
    return {
      ...mapped,
      from: endpointPart(parts, fromEndpoint),
      to: endpointPart(parts, toEndpoint),
      fromLabel: fromEndpoint?.symbol ?? 'unresolved',
      toLabel: toEndpoint?.symbol ?? 'unresolved',
      fromPath: fromEndpoint?.path ?? null,
      toPath: toEndpoint?.path ?? null,
    };
  });
  const coverage = coverageView(view.survey.coverage);
  return {
    project: projectId,
    repo: view.repo,
    survey: {
      at: view.survey.at,
      commit: view.survey.summary.commit,
      summary: view.survey.summary,
      coverage,
    },
    parts,
    constraints,
    edges: interactions,
    verifiedParts: parts.filter((claim) => claim.status === 'verified').length,
    verifiedConstraints: constraints.filter((claim) => claim.status === 'verified').length,
    vouchedClaims: [...parts, ...constraints, ...interactions].filter((claim) => claim.status === 'vouched').length,
  };
}
