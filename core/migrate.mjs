import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { append, validateEvent } from './log.mjs';

const SAFE_PROJECT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const GRADES = new Set(['correct', 'partial', 'wrong']);
const MODES = new Set(['drill', 'mock', 'transfer', 'lesson']);
const ALTITUDES = new Set(['map', 'boundary', 'mechanism', 'line']);
const GROUNDING = /^[^:]+:\d+(?:-\d+)?$/;
const IMPORT_VERSION = 1;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function optionalText(value, label) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new Error(`${label} must be a string or null`);
  return value;
}

function oneOf(value, values, label) {
  if (typeof value !== 'string' || !values.has(value)) {
    throw new Error(`${label} must be one of ${[...values].join(', ')}`);
  }
  return value;
}

function projectName(value) {
  if (typeof value !== 'string' || !SAFE_PROJECT.test(value)) {
    throw new Error('project must be a simple name');
  }
  return value;
}

function formatVersion(bank) {
  if (isObject(bank) && bank.version === 2 && Array.isArray(bank.cards)) return 2;
  if (isObject(bank) && (bank.version === undefined || bank.version === 1) && Array.isArray(bank.questions)) return 1;
  return null;
}

function sourcePaths(home, project) {
  const safe = projectName(project);
  const dir = path.join(home, safe);
  return {
    dir,
    bank: path.join(dir, 'bank.json'),
    scores: path.join(dir, 'scores.json'),
  };
}

function regularFile(file) {
  try {
    return fs.lstatSync(file).isFile();
  } catch {
    return false;
  }
}

function readJsonFile(file, label) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    throw new Error(`cannot read ${label}: ${error.message}`);
  }
  try {
    return { value: JSON.parse(text), text };
  } catch (error) {
    throw new Error(`cannot parse ${label}: ${error.message}`);
  }
}

function sourceFor(home, project) {
  const files = sourcePaths(home, project);
  if (!regularFile(files.bank) || !regularFile(files.scores)) {
    throw new Error(`project is not an importable bank: ${project}`);
  }
  const bankFile = readJsonFile(files.bank, `${project}/bank.json`);
  const scoresFile = readJsonFile(files.scores, `${project}/scores.json`);
  const version = formatVersion(bankFile.value);
  const attempts = isObject(scoresFile.value) ? scoresFile.value.attempts : undefined;
  const fingerprint = crypto.createHash('sha256')
    .update(bankFile.text)
    .update('\0')
    .update(scoresFile.text)
    .digest('hex');
  return {
    ...files,
    bank: bankFile.value,
    scores: scoresFile.value,
    bankText: bankFile.text,
    scoresText: scoresFile.text,
    version,
    fingerprint,
    attempts,
  };
}

function parseGrounding(entry) {
  const match = /^(.*):(\d+)(?:-(\d+))?$/.exec(entry);
  if (!match) return { path: entry, line: null, commit: null };
  // The v1 and v2 bank formats carry no commit, so the reference is unverified
  // until the agent re-grounds it against a known revision.
  return { path: match[1], line: Number(match[2]), commit: null };
}

function normaliseV1(bank, scores) {
  const questions = bank.questions;
  const byId = new Map(questions.map((question) => [question?.id, question]));
  return {
    project: bank.project,
    cards: questions.map((question) => {
      const followups = Array.isArray(question.followups) ? question.followups : [];
      return {
        id: question.id,
        topic: question.topic,
        concept: question.question,
        ask: question.question,
        rubric: [question.reference, ...followups.map((followup) => `Follow-up: ${followup}`)],
        altitude: 'mechanism',
        grounding: question.grounding ?? [],
        contexts: [bank.project, 'generic'],
        source: { type: 'drill', ref: 'v1' },
        retired: false,
      };
    }),
    attempts: scores.attempts.map((attempt) => {
      const id = attempt.cardId ?? attempt.id;
      const question = byId.get(id);
      return {
        ...attempt,
        cardId: id,
        question: attempt.question || question?.question || '',
        context: attempt.context || bank.project,
      };
    }),
  };
}

function normalise(bank, scores) {
  const version = formatVersion(bank);
  if (version === 1) return normaliseV1(bank, scores);
  if (version === 2) {
    return {
      project: bank.project,
      cards: bank.cards,
      attempts: scores.attempts,
    };
  }
  throw new Error('bank must be a v1 question bank or a v2 card bank');
}

export function bankToEvents(bank, scores) {
  const state = normalise(bank, scores);
  const events = [{ type: 'project.added', data: { project: state.project, name: state.project, remote: null } }];
  const seenTopics = new Set();
  for (const card of state.cards ?? []) {
    if (card.topic && !seenTopics.has(card.topic)) {
      seenTopics.add(card.topic);
      events.push({ type: 'topic.added', data: { topic: card.topic, name: card.topic, parent: null, kind: 'technology' } });
    }
  }
  for (const card of state.cards ?? []) {
    events.push({
      type: 'card.added',
      data: {
        card: card.id, project: state.project, concept: card.concept, ask: card.ask,
        rubric: card.rubric, altitude: card.altitude ?? 'mechanism',
        topics: card.topic ? [card.topic] : [],
        grounding: (card.grounding ?? []).map(parseGrounding),
        contexts: card.contexts ?? [state.project],
        source: card.source ?? { type: 'migrated', ref: 'bank.json' },
      },
    });
    if (card.retired) events.push({ type: 'card.retired', data: { card: card.id } });
  }
  for (const attempt of state.attempts ?? []) {
    events.push({
      type: 'attempt.recorded',
      data: {
        card: attempt.cardId ?? attempt.id, grade: attempt.grade, question: attempt.question ?? null,
        context: attempt.context ?? null, answer: attempt.answer ?? null, gap: attempt.gap ?? null,
        mode: attempt.mode ?? 'drill', originalDate: attempt.date ?? null,
      },
    });
  }
  return events;
}

function validateGrounding(value, label) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !GROUNDING.test(entry))) {
    throw new Error(`${label} grounding must contain path:line references`);
  }
}

function validateV2Card(card, index, project) {
  const label = `card ${index + 1}`;
  if (!isObject(card)) throw new Error(`${label} must be an object`);
  requireText(card.id, `${label} id`);
  requireText(card.topic, `${label} topic`);
  requireText(card.concept, `${label} concept`);
  requireText(card.ask, `${label} ask`);
  if (card.altitude !== undefined && card.altitude !== null) oneOf(card.altitude, ALTITUDES, `${label} altitude`);
  if (!Array.isArray(card.rubric) || card.rubric.length < 1 || card.rubric.length > 6
    || card.rubric.some((line) => typeof line !== 'string' || !line.trim())) {
    throw new Error(`${label} rubric must contain one to six strings`);
  }
  validateGrounding(card.grounding ?? [], label);
  if (card.contexts !== undefined && card.contexts !== null
    && (!Array.isArray(card.contexts) || card.contexts.some((context) => typeof context !== 'string' || !context.trim()))) {
    throw new Error(`${label} contexts must be an array of non-empty strings`);
  }
  if (card.source !== undefined && card.source !== null && !isObject(card.source)) {
    throw new Error(`${label} source must be an object`);
  }
  if (card.retired !== undefined && typeof card.retired !== 'boolean') {
    throw new Error(`${label} retired must be boolean`);
  }
  void project;
}

function validateV1Card(card, index) {
  const label = `card ${index + 1}`;
  if (!isObject(card)) throw new Error(`${label} must be an object`);
  requireText(card.id, `${label} id`);
  if (!Number.isInteger(card.level) || card.level < 1 || card.level > 4) {
    throw new Error(`${label} level must be an integer from 1 to 4`);
  }
  requireText(card.topic, `${label} topic`);
  requireText(card.question, `${label} question`);
  requireText(card.reference, `${label} reference`);
  if (card.followups !== undefined && (!Array.isArray(card.followups)
    || card.followups.some((followup) => typeof followup !== 'string' || !followup.trim()))) {
    throw new Error(`${label} followups must be an array of non-empty strings`);
  }
  validateGrounding(card.grounding ?? [], label);
}

function validateAttempt(attempt, index) {
  const label = `attempt ${index + 1}`;
  if (!isObject(attempt)) throw new Error(`${label} must be an object`);
  requireText(attempt.cardId ?? attempt.id, `${label} card`);
  oneOf(attempt.grade, GRADES, `${label} grade`);
  oneOf(attempt.mode ?? 'drill', MODES, `${label} mode`);
  for (const field of ['question', 'context', 'answer', 'gap']) optionalText(attempt[field], `${label} ${field}`);
  if (attempt.date !== undefined && attempt.date !== null
    && (typeof attempt.date !== 'string' || Number.isNaN(Date.parse(attempt.date)))) {
    throw new Error(`${label} date must be a timestamp`);
  }
}

function validateSource(source, project) {
  const refusals = [];
  const bank = source.bank;
  const scores = source.scores;
  if (!isObject(bank)) refusals.push({ record: 'bank', reason: 'bank must be an object' });
  if (source.version === null) refusals.push({ record: 'bank', reason: 'bank must be a v1 question bank or a v2 card bank' });
  if (isObject(bank)) {
    try { requireText(bank.project, 'bank project'); } catch (error) { refusals.push({ record: 'bank', reason: error.message }); }
    if (typeof bank.project === 'string' && bank.project !== project) {
      refusals.push({ record: 'bank project', reason: `bank project must match directory ${project}` });
    }
    if (source.version === 1) {
      bank.questions.forEach((card, index) => {
        try { validateV1Card(card, index); } catch (error) { refusals.push({ record: `card ${index + 1}`, reason: error.message }); }
      });
    }
    if (source.version === 2) {
      bank.cards.forEach((card, index) => {
        try { validateV2Card(card, index, project); } catch (error) { refusals.push({ record: `card ${index + 1}`, reason: error.message }); }
      });
    }
  }
  if (!isObject(scores) || !Array.isArray(scores.attempts)) {
    refusals.push({ record: 'scores.attempts', reason: 'scores.attempts must be an array' });
  } else {
    scores.attempts.forEach((attempt, index) => {
      try { validateAttempt(attempt, index); } catch (error) { refusals.push({ record: `attempt ${index + 1}`, reason: error.message }); }
    });
  }
  return refusals;
}

function validateEventData(type, data) {
  if (type === 'project.added') {
    requireText(data.project, 'project');
    optionalText(data.name, 'name');
    optionalText(data.remote, 'remote');
    return;
  }
  if (type === 'topic.added') {
    requireText(data.topic, 'topic');
    requireText(data.name, 'topic name');
    optionalText(data.parent, 'topic parent');
    oneOf(data.kind ?? 'technology', new Set(['technology', 'concept', 'skill']), 'topic kind');
    return;
  }
  if (type === 'card.added') {
    requireText(data.card, 'card id');
    requireText(data.project, 'card project');
    requireText(data.concept, 'card concept');
    requireText(data.ask, 'card ask');
    oneOf(data.altitude, ALTITUDES, 'card altitude');
    if (!Array.isArray(data.rubric) || data.rubric.length < 1 || data.rubric.length > 6
      || data.rubric.some((line) => typeof line !== 'string' || !line.trim())) throw new Error('card rubric must contain one to six strings');
    if (!Array.isArray(data.topics) || data.topics.length === 0 || data.topics.some((topic) => typeof topic !== 'string' || !topic.trim())) throw new Error('card topics must contain at least one topic');
    if (!Array.isArray(data.grounding) || data.grounding.some((ground) => !isObject(ground) || typeof ground.path !== 'string' || !ground.path.trim() || !Number.isInteger(ground.line) || ground.line < 1 || !Object.hasOwn(ground, 'commit') || (ground.commit !== null && (typeof ground.commit !== 'string' || !ground.commit.trim())))) throw new Error('card grounding must contain {path, line, commit} entries');
    if (data.contexts !== undefined && (!Array.isArray(data.contexts) || data.contexts.some((context) => typeof context !== 'string' || !context.trim()))) throw new Error('card contexts must be an array of non-empty strings');
    if (data.source !== undefined && !isObject(data.source)) throw new Error('card source must be an object');
    return;
  }
  if (type === 'card.retired') {
    requireText(data.card, 'retired card');
    return;
  }
  if (type === 'attempt.recorded') {
    requireText(data.card, 'attempt card');
    oneOf(data.grade, GRADES, 'attempt grade');
    oneOf(data.mode ?? 'drill', MODES, 'attempt mode');
    for (const field of ['question', 'context', 'answer', 'gap']) optionalText(data[field], `attempt ${field}`);
    return;
  }
  throw new Error(`unsupported import event: ${type}`);
}

function validateBodies(bodies) {
  const refusals = [];
  const ids = new Set();
  bodies.forEach((body, index) => {
    try {
      validateEventData(body.type, body.data);
      if (body.type === 'card.added') {
        if (ids.has(body.data.card)) throw new Error(`card ${body.data.card} is duplicated`);
        ids.add(body.data.card);
      }
      const event = {
        id: `import:${index + 1}`,
        device: 'import',
        seq: index + 1,
        at: '1970-01-01T00:00:00.000Z',
        type: body.type,
        v: 1,
        data: body.data,
      };
      validateEvent(event);
    } catch (error) {
      const record = body.type === 'card.added' ? `card ${index + 1}` : body.type;
      refusals.push({ record, reason: error.message });
    }
  });
  return refusals;
}

function logEvents(home) {
  const dir = path.join(home, 'log');
  if (!fs.existsSync(dir)) return [];
  const events = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.jsonl')) continue;
    let text;
    try { text = fs.readFileSync(path.join(dir, name), 'utf8'); } catch { continue; }
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        validateEvent(event);
        events.push(event);
      } catch {
        // The normal rebuild path quarantines malformed lines. They cannot be
        // an import marker, so ignoring them here is the safe answer too.
      }
    }
  }
  return events;
}

function existingImport(home, project, fingerprint) {
  let projectExists = false;
  const cards = new Set();
  for (const event of logEvents(home)) {
    if (event.type === 'project.added' && event.data.project === project) {
      projectExists = true;
      const marker = event.data.import;
      if (isObject(marker) && marker.version === IMPORT_VERSION && marker.project === project && marker.fingerprint === fingerprint) return { marker: true, projectExists, cards };
    }
    if (event.type === 'card.added' && typeof event.data.card === 'string') cards.add(event.data.card);
  }
  return { marker: false, projectExists, cards };
}

function namespacedBodies(bodies, existingCards, project) {
  const used = new Set(existingCards);
  const ids = new Map();
  const idFor = (original) => {
    const known = ids.get(original);
    if (known !== undefined) return known;
    let candidate = original;
    if (used.has(candidate)) {
      candidate = `${project}:${original}`;
      let suffix = 2;
      while (used.has(candidate)) candidate = `${project}:${original}:${suffix++}`;
    }
    used.add(candidate);
    ids.set(original, candidate);
    return candidate;
  };

  // A CLI bank's ids are local to its project. The application card table is
  // global, so preserve an id when it is free and namespace only the ids that
  // would otherwise replace another project's card. Missing-card attempts are
  // mapped too, so every reference remains stable within this import.
  for (const body of bodies) {
    if (body.type === 'card.added' || body.type === 'card.retired' || body.type === 'attempt.recorded') {
      idFor(body.data.card);
    }
  }
  return bodies.map((body) => {
    if (body.type !== 'card.added' && body.type !== 'card.retired' && body.type !== 'attempt.recorded') return body;
    return { ...body, data: { ...body.data, card: idFor(body.data.card) } };
  });
}

function report(source, project, values) {
  return {
    project,
    version: source.version,
    formatVersion: source.version,
    fingerprint: source.fingerprint,
    dryRun: values.dryRun,
    imported: values.imported,
    alreadyImported: values.alreadyImported,
    projects: values.projects,
    cards: values.cards,
    topics: values.topics,
    attempts: values.attempts,
    events: values.events,
    refused: values.refused,
  };
}

function homeOf(homeOrState) {
  if (typeof homeOrState === 'string') return { home: homeOrState, state: null };
  if (isObject(homeOrState) && typeof homeOrState.home === 'string') return { home: homeOrState.home, state: homeOrState };
  throw new Error('state home is required');
}

/**
 * Read-only discovery. It deliberately does not call logDir, deviceId or
 * openState: merely looking for a bank must not create a file or directory.
 */
export function discoverBanks(home) {
  if (typeof home !== 'string' || !home || !fs.existsSync(home)) return [];
  let entries;
  try { entries = fs.readdirSync(home, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((entry) => entry.isDirectory() && SAFE_PROJECT.test(entry.name))
    .filter((entry) => regularFile(path.join(home, entry.name, 'bank.json')) && regularFile(path.join(home, entry.name, 'scores.json')))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      try {
        const source = sourceFor(home, entry.name);
        const cards = source.version === 2 ? source.bank.cards : source.version === 1 ? source.bank.questions : [];
        const topics = new Set(cards.filter(isObject).map((card) => card.topic).filter((topic) => typeof topic === 'string' && topic.trim()));
        return {
          project: entry.name,
          version: source.version,
          formatVersion: source.version,
          cards: cards.length,
          topics: topics.size,
          attempts: Array.isArray(source.attempts) ? source.attempts.length : 0,
          importable: source.version !== null && Array.isArray(source.attempts),
          error: null,
        };
      } catch (error) {
        return {
          project: entry.name,
          version: null,
          formatVersion: null,
          cards: 0,
          topics: 0,
          attempts: 0,
          importable: false,
          error: error.message,
        };
      }
    });
}

/**
 * Dry-run and real import share the same validation. No append happens until
 * the complete bank, every converted event, and all collision checks pass.
 */
export function importBank(homeOrState, project, options = {}) {
  const { home, state } = homeOf(homeOrState);
  const dryRun = typeof options === 'boolean' ? options : options.dryRun === true;
  const safeProject = projectName(project);
  const source = sourceFor(home, safeProject);
  const sourceRefusals = validateSource(source, safeProject);
  if (sourceRefusals.length > 0) return report(source, safeProject, {
    dryRun, imported: false, alreadyImported: false, projects: 0, cards: 0, topics: 0,
    attempts: 0, events: 0, refused: sourceRefusals,
  });

  const existing = existingImport(home, safeProject, source.fingerprint);
  if (existing.marker) return report(source, safeProject, {
    dryRun, imported: false, alreadyImported: true, projects: 0, cards: 0, topics: 0,
    attempts: 0, events: 0, refused: [],
  });

  const collisions = [];
  if (existing.projectExists) collisions.push({ record: 'project', reason: `project already exists: ${safeProject}` });
  const bodies = sourceRefusals.length === 0 ? bankToEvents(source.bank, source.scores) : [];
  const eventRefusals = validateBodies(bodies);
  const refusals = [...eventRefusals, ...collisions];
  if (refusals.length > 0) return report(source, safeProject, {
    dryRun, imported: false, alreadyImported: false, projects: 0, cards: 0, topics: 0,
    attempts: 0, events: 0, refused: refusals,
  });

  const mappedBodies = namespacedBodies(bodies, existing.cards, safeProject);
  const topics = new Set(mappedBodies.filter((body) => body.type === 'topic.added').map((body) => body.data.topic));
  const marker = { version: IMPORT_VERSION, project: safeProject, fingerprint: source.fingerprint };
  const marked = mappedBodies.map((body, index) => index === 0 && body.type === 'project.added'
    ? { ...body, data: { ...body.data, import: marker } }
    : body);
  if (!dryRun) {
    for (const body of marked) append(home, body);
    if (state && typeof state.refresh === 'function') state.refresh();
  }
  return report(source, safeProject, {
    dryRun, imported: !dryRun, alreadyImported: false, projects: 1, cards: mappedBodies.filter((body) => body.type === 'card.added').length,
    topics: topics.size, attempts: mappedBodies.filter((body) => body.type === 'attempt.recorded').length,
    events: mappedBodies.length, refused: [],
  });
}

export function dryRunImport(homeOrState, project) {
  return importBank(homeOrState, project, { dryRun: true });
}

// Names kept explicit for callers that treat discovery and preview as the
// import surface rather than as implementation details of the API.
export const discover = discoverBanks;
export const dryRun = dryRunImport;
export const importProject = importBank;

export function migrate(home, project, options = {}) {
  const result = importBank(home, project, options);
  if (options === true || (isObject(options) && options.dryRun === true)) return result;
  if (result.refused.length > 0) {
    throw new Error(result.refused.map((item) => `${item.record}: ${item.reason}`).join('; '));
  }
  return { events: result.events, cards: result.cards, attempts: result.attempts };
}
