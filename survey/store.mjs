import crypto from 'node:crypto';
import fs from 'node:fs';
import nodePath from 'node:path';
import { filesUnder, languageOf, repositoryRoot, resolveCommit } from './evidence.mjs';

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
  return crypto
    .createHash('sha256')
    .update(`${repo}\u0000${commit ?? ''}`, 'utf8')
    .digest('hex')
    .slice(0, 16);
}

function surveysDir(home) {
  return nodePath.join(home, 'surveys');
}

export function storeSurvey(home, repo, result) {
  const dir = surveysDir(home);
  fs.mkdirSync(dir, { recursive: true });
  const file = nodePath.join(dir, `${surveyKey(repo, result.summary?.commit ?? null)}.json`);
  const document = { at: new Date().toISOString(), ...result };
  fs.writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
  return file;
}

function readStored(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (!parsed.summary || typeof parsed.summary.repo !== 'string') return null;
    return parsed;
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
    if (stored === null || stored.summary.repo !== repo) continue;
    const at = typeof stored.at === 'string' ? stored.at : '';
    if (best === null || at >= bestAt) {
      best = stored;
      bestAt = at;
    }
  }
  return best;
}

/**
 * What the application may know about a directory before anything has surveyed
 * it: whether it is a git repository at all, which is the one thing the survey
 * screen has to be able to refuse.
 */
export function inspectRepository(path) {
  if (typeof path !== 'string' || path.trim() === '') throw new Error('path is required');
  const chosen = nodePath.resolve(path);
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

// Only these two statuses may seed anything. The rule is the skill's, not this
// file's: a card seeded from a claim the gate could not stand behind would ask
// the candidate to defend a sentence nobody has checked.
const SEEDS = new Set(['verified', 'inferred']);

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
      source: { type: 'survey', ref: claim.id },
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
  const claims = (Array.isArray(stored.claims) ? stored.claims : []).map((claim) => ({
    id: claim.id,
    type: claim.type,
    status: claim.status,
    declaredStatus: claim.declaredStatus ?? null,
    name: claimName(claim),
    sentence: tidy(claim.sentence ?? ''),
    path: claim.path ?? null,
    fromLine: claim.fromLine ?? null,
    toLine: claim.toLine ?? null,
    reasons: Array.isArray(claim.reasons) ? claim.reasons : [],
  }));
  return {
    repo,
    repository,
    survey: {
      at: typeof stored.at === 'string' ? stored.at : null,
      summary: stored.summary,
      coverage: stored.coverage?.counts ?? stored.summary?.coverage ?? null,
      claims,
    },
    seed: seedFrom(stored, { project: slug(repository.name) }),
  };
}
