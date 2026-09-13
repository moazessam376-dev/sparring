#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalRepositoryPath } from '../survey/evidence.mjs';

const HOME = process.env.SPARRING_HOME || path.join(os.homedir(), '.sparring');
const GRADES = ['correct', 'partial', 'wrong'];
const MODES = ['drill', 'mock', 'transfer'];
const TRANSFER_WORLDS = ['library', 'hospital', 'isp-support', 'ecommerce', 'school', 'bank', 'logistics', 'generic'];
const ALTITUDES = ['map', 'boundary', 'mechanism', 'line'];
const ALTITUDE_WEIGHTS = [3, 3, 3, 1];
const BOOLEAN_FLAGS = new Set(['all', 'include-mature']);
const DAY_MS = 24 * 60 * 60 * 1000;

function clock() {
  return process.env.SPARRING_NOW ? new Date(process.env.SPARRING_NOW) : new Date();
}

export function sessionDate(date = clock()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }).format(date);
}

function json(value) {
  console.log(JSON.stringify(value));
}

function fail(message) {
  throw new Error(message);
}

function projectName(value) {
  if (!value || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) fail('project must be a simple name');
  return value;
}

function projectDir(project) {
  return path.join(HOME, projectName(project));
}

function filesFor(project) {
  const dir = projectDir(project);
  return {
    dir,
    bank: path.join(dir, 'bank.json'),
    scores: path.join(dir, 'scores.json'),
    bankV1: path.join(dir, 'bank.v1.json'),
    scoresV1: path.join(dir, 'scores.v1.json'),
    sessions: path.join(dir, 'sessions'),
  };
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`cannot read JSON ${file}: ${error.message}`);
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function isV2Bank(bank) {
  return bank && bank.version === 2 && Array.isArray(bank.cards);
}

function loadRawProject(project) {
  const files = filesFor(project);
  if (!fs.existsSync(files.bank) || !fs.existsSync(files.scores)) fail(`project is not initialized: ${project}`);
  const bank = readJson(files.bank);
  const scores = readJson(files.scores);
  if (!Array.isArray(scores.attempts)) fail('project state has an invalid attempts array');
  return { ...files, bank, scores };
}

function loadProject(project) {
  const state = loadRawProject(project);
  if (!isV2Bank(state.bank)) fail('bank is v1; run migrate');
  deriveMissingStreaks(state);
  return state;
}

function dateOnly(value = sessionDate()) {
  if (value instanceof Date) return sessionDate(value);
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) fail(`invalid date: ${value}`);
  return sessionDate(date);
}

export function addDays(date, days) {
  const [year, month, day] = dateOnly(date).split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + Number(days)));
  return result.toISOString().slice(0, 10);
}

export function daysBetween(later, earlier) {
  const parse = (value) => {
    const [year, month, day] = dateOnly(value).split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((parse(later) - parse(earlier)) / DAY_MS);
}

export function initialSchedule(today = sessionDate()) {
  return { interval: 0, ease: 2.5, due: dateOnly(today), reps: 0, lapses: 0, lastGrade: null, streak: 0 };
}

export function scheduleState(schedule) {
  if (schedule.reps === 0 && schedule.lapses === 0 && schedule.lastGrade === null) return 'new';
  return schedule.interval < 21 ? 'learning' : 'mature';
}

export const cardState = scheduleState;

export function isNewSchedule(schedule) {
  return scheduleState(schedule) === 'new';
}

export function isRetiredFromDaily(schedule) {
  const streak = Number(schedule?.streak ?? 0);
  const interval = Number(schedule?.interval ?? 0);
  return streak >= 4 && interval >= 21;
}

function roundedEase(value) {
  return Math.round(value * 100) / 100;
}

export function applySchedule(schedule, grade, today = sessionDate()) {
  if (!GRADES.includes(grade)) fail(`invalid grade: ${grade}`);
  const current = {
    interval: Number(schedule?.interval ?? 0),
    ease: Number(schedule?.ease ?? 2.5),
    reps: Number(schedule?.reps ?? 0),
    lapses: Number(schedule?.lapses ?? 0),
    streak: Number(schedule?.streak ?? 0),
  };
  const next = { ...current };
  if (grade === 'wrong') {
    next.interval = 1;
    next.ease = Math.max(1.3, roundedEase(current.ease - 0.2));
    next.lapses = current.lapses + 1;
    next.reps = 0;
    next.streak = 0;
  } else if (grade === 'partial') {
    next.interval = Math.max(2, current.interval);
    next.streak = Math.max(0, current.streak - 1);
  } else {
    next.streak = current.streak + 1;
    next.reps = current.reps + 1;
    next.ease = Math.min(3.0, roundedEase(current.ease + 0.05));
    const ladderInterval = next.streak === 1 ? 4
      : next.streak === 2 ? 12
      : next.streak === 3 ? 21
      : Math.min(90, Math.round(current.interval * next.ease));
    next.interval = Math.max(ladderInterval, current.interval);
  }
  next.due = addDays(today, next.interval);
  next.lastGrade = grade;
  return next;
}

export const scheduleTransition = applySchedule;
export const nextSchedule = applySchedule;

function attemptCardId(attempt) {
  return attempt.cardId ?? attempt.id;
}

function attemptTime(attempt) {
  const time = new Date(attempt.date || `${attempt.session || ''}T00:00:00`).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function attemptsFor(state, id) {
  return state.scores.attempts
    .map((attempt, index) => ({ attempt, index }))
    .filter(({ attempt }) => attemptCardId(attempt) === id)
    .sort((a, b) => attemptTime(b.attempt) - attemptTime(a.attempt) || b.index - a.index)
    .map(({ attempt }) => attempt);
}

function attemptDay(attempt, fallback = sessionDate()) {
  if (typeof attempt.session === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(attempt.session)) return attempt.session;
  if (attempt.date) {
    const date = new Date(attempt.date);
    if (!Number.isNaN(date.getTime())) return sessionDate(date);
  }
  return dateOnly(fallback);
}

export function replaySchedule(attempts, today = sessionDate()) {
  let schedule = initialSchedule(today);
  for (const attempt of attempts) schedule = applySchedule(schedule, attempt.grade, attemptDay(attempt, today));
  return schedule;
}

function deriveStreak(card, attempts, today) {
  const cardAttempts = attempts.filter((attempt) => attemptCardId(attempt) === card.id);
  card.sched.streak = replaySchedule(cardAttempts, today).streak;
}

function deriveMissingStreaks(state, today = sessionDate()) {
  for (const card of state.bank.cards) {
    if (card.sched && card.sched.streak === undefined) deriveStreak(card, state.scores.attempts, today);
  }
  return state;
}

function getCard(state, id) {
  const card = state.bank.cards.find((item) => item.id === id);
  if (!card) fail(`card not found: ${id}`);
  return card;
}

function activeCards(state) {
  return state.bank.cards.filter((card) => card.retired !== true);
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) fail(`${name} must be a positive integer`);
  return number;
}

function nonNegativeInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) fail(`${name} must be a non-negative integer`);
  return number;
}

function parseArgs(args) {
  const positionals = [];
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const equals = token.indexOf('=');
    if (equals !== -1) {
      options[token.slice(2, equals)] = token.slice(equals + 1);
      continue;
    }
    const key = token.slice(2);
    if (BOOLEAN_FLAGS.has(key)) {
      options[key] = true;
      continue;
    }
    if (i + 1 >= args.length || args[i + 1].startsWith('--')) fail(`missing value for --${key}`);
    options[key] = args[++i];
  }
  return { positionals, options };
}

function validateTopic(value, label) {
  if (typeof value !== 'string' || !value.trim() || value !== value.toLowerCase()) fail(`${label} topic must be a lowercase tag`);
}

function validateAltitude(value, label) {
  if (typeof value !== 'string' || !ALTITUDES.includes(value)) fail(`${label} altitude must be one of ${ALTITUDES.join(', ')}`);
}

function validateRubric(value, label) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 6 || value.some((item) => typeof item !== 'string' || !item.trim())) {
    fail(`${label} rubric must contain one to six strings`);
  }
}

function validateGrounding(value, label, required = true) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !/^[^:]+:\d+(-\d+)?$/.test(item))) {
    fail(`${label} has invalid grounding`);
  }
  if (required && value.length === 0) fail(`${label} grounding must contain at least one path`);
}

function allowedContexts(project) {
  return [...new Set([project, ...TRANSFER_WORLDS])];
}

function validateContexts(value, label, project) {
  const allowed = allowedContexts(project);
  const requirements = `${label} contexts must include the bank project "${project}" and at least one transfer world; allowed contexts: ${allowed.join(', ')}`;
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => !allowed.includes(item)) || new Set(value).size !== value.length) {
    fail(`${label} contexts must be a non-empty, duplicate-free subset of ${allowed.join(', ')}`);
  }
  if (!value.includes(project) || !value.some((context) => TRANSFER_WORLDS.includes(context))) fail(requirements);
}

function validateSource(value, label) {
  if (!value || typeof value !== 'object' || typeof value.type !== 'string' || !value.type.trim() || typeof value.ref !== 'string' || !value.ref.trim()) {
    fail(`${label} source must contain type and ref`);
  }
}

function validateCardContent(item, index, { requireGrounding = true, requireSource = true, requireAltitude = true, project } = {}) {
  const label = `card ${index + 1}`;
  if (!item || typeof item !== 'object' || Array.isArray(item)) fail(`${label} must be an object`);
  if (!Number.isInteger(item.level) || item.level < 1 || item.level > 4) fail(`${label} level must be an integer from 1 to 4`);
  if (requireAltitude || 'altitude' in item) validateAltitude(item.altitude, label);
  validateTopic(item.topic, label);
  if (typeof item.concept !== 'string' || !item.concept.trim()) fail(`${label} concept must be non-empty`);
  if (typeof item.ask !== 'string' || !item.ask.trim()) fail(`${label} ask must be non-empty`);
  validateRubric(item.rubric, label);
  if (requireGrounding || 'grounding' in item) validateGrounding(item.grounding, label, requireGrounding);
  validateContexts(item.contexts, label, project);
  if (requireSource || 'source' in item) validateSource(item.source, label);
  if ('needsRewrite' in item && typeof item.needsRewrite !== 'boolean') fail(`${label} needsRewrite must be boolean`);
  if ('retired' in item && typeof item.retired !== 'boolean') fail(`${label} retired must be boolean`);
}

function validateNewCard(item, index, project) {
  const label = `card ${index + 1}`;
  if (!item || typeof item !== 'object' || Array.isArray(item)) validateCardContent(item, index);
  if ('id' in item || 'added' in item || 'sched' in item) fail(`${label} must omit id, added, and sched`);
  validateCardContent(item, index, { project });
}

function chooseNew(cards, count) {
  const groups = new Map();
  for (const card of cards) {
    if (!groups.has(card.topic)) groups.set(card.topic, []);
    groups.get(card.topic).push(card);
  }
  for (const group of groups.values()) group.sort((a, b) => (b.added || '').localeCompare(a.added || '') || a.id.localeCompare(b.id));
  const topics = [...groups.keys()].sort((a, b) => {
    const aNewest = groups.get(a)[0].added || '';
    const bNewest = groups.get(b)[0].added || '';
    return bNewest.localeCompare(aNewest) || a.localeCompare(b);
  });
  const result = [];
  while (result.length < count && topics.length) {
    for (const topic of topics) {
      const item = groups.get(topic).shift();
      if (item) result.push(item);
      if (result.length === count) break;
    }
    for (let index = topics.length - 1; index >= 0; index -= 1) if (!groups.get(topics[index]).length) topics.splice(index, 1);
  }
  return result;
}

function weightedCounts(count, capacities) {
  const total = Math.min(count, capacities.reduce((sum, capacity) => sum + capacity, 0));
  const counts = capacities.map(() => 0);
  let remaining = total;
  while (remaining > 0) {
    const available = capacities
      .map((capacity, index) => (counts[index] < capacity ? index : null))
      .filter((index) => index !== null);
    if (!available.length) break;
    const weightTotal = available.reduce((sum, index) => sum + ALTITUDE_WEIGHTS[index], 0);
    const exact = new Map(available.map((index) => [index, (ALTITUDE_WEIGHTS[index] / weightTotal) * remaining]));
    let assigned = 0;
    for (const index of available) {
      const amount = Math.min(capacities[index] - counts[index], Math.floor(exact.get(index)));
      counts[index] += amount;
      assigned += amount;
    }
    remaining -= assigned;
    if (!remaining) break;
    const ranked = [...available].sort((a, b) => (exact.get(b) - Math.floor(exact.get(b))) - (exact.get(a) - Math.floor(exact.get(a))) || a - b);
    let redistributed = false;
    for (const index of ranked) {
      if (counts[index] >= capacities[index]) continue;
      counts[index] += 1;
      remaining -= 1;
      redistributed = true;
      if (!remaining) break;
    }
    if (!redistributed) break;
  }
  return counts;
}

function chooseWeightedNew(cards, count) {
  const buckets = ALTITUDES.map((altitude) => cards.filter((card) => card.altitude === altitude));
  const counts = weightedCounts(count, buckets.map((bucket) => bucket.length));
  return buckets.flatMap((bucket, index) => chooseNew(bucket, counts[index]));
}

function interleaveByKey(items, keyFn) {
  const buckets = new Map();
  const order = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!buckets.has(key)) { buckets.set(key, []); order.push(key); }
    buckets.get(key).push(item);
  }
  const result = [];
  let lastKey = null;
  while (result.length < items.length) {
    const candidates = order
      .filter((key) => buckets.get(key).length > 0)
      .sort((a, b) => buckets.get(b).length - buckets.get(a).length || order.indexOf(a) - order.indexOf(b));
    const chosenKey = candidates.find((key) => key !== lastKey) ?? candidates[0];
    result.push(buckets.get(chosenKey).shift());
    lastKey = chosenKey;
  }
  return result;
}

function suggestedContext(card, state) {
  const history = attemptsFor(state, card.id);
  const used = new Set(history.slice(0, 2).map((attempt) => attempt.context).filter(Boolean));
  let candidates = card.contexts.filter((context) => !used.has(context));
  if (!candidates.length) candidates = [...card.contexts];
  const homeContext = state.bank.project;
  const hasHomeCorrect = history.some((attempt) => attempt.grade === 'correct' && attempt.context === homeContext);
  if (hasHomeCorrect) return candidates.find((context) => context !== homeContext) || candidates[0];
  return candidates.find((context) => context === homeContext) || candidates[0];
}

function recentQuestions(state, id) {
  return attemptsFor(state, id)
    .slice(0, 3)
    .map((attempt) => attempt.question)
    .filter((question) => typeof question === 'string' && question.trim());
}

function publicCard(card, state, today, includeAttempts = true) {
  const output = {
    id: card.id,
    level: card.level,
    topic: card.topic,
    altitude: card.altitude,
    concept: card.concept,
    ask: card.ask,
    contexts: [...card.contexts],
    suggestedContext: suggestedContext(card, state),
    state: scheduleState(card.sched),
    dueDays: daysBetween(today, card.sched.due),
  };
  if (includeAttempts) {
    output.recentQuestions = recentQuestions(state, card.id);
    output.attempts = attemptsFor(state, card.id).length;
    output.lastGrade = card.sched.lastGrade;
  }
  return output;
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
}

function scaledDistribution(n) {
  const exact = [3, 5, 4, 3].map((value) => (value / 15) * n);
  const counts = exact.map(Math.floor);
  let remaining = n - counts.reduce((sum, value) => sum + value, 0);
  exact.map((value, index) => ({ index, fraction: value - counts[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
    .forEach(({ index }) => {
      if (remaining > 0) {
        counts[index] += 1;
        remaining -= 1;
      }
    });
  return counts;
}

function commandInit(positionals, options) {
  const project = projectName(positionals[0]);
  const files = filesFor(project);
  fs.mkdirSync(files.sessions, { recursive: true });
  const existingBank = fs.existsSync(files.bank) ? readJson(files.bank) : null;
  if (existingBank && !isV2Bank(existingBank)) {
    json({ project, initialized: true, version: 1, warning: 'bank is v1; run migrate' });
    return;
  }
  const requestedRepo = options.repo || existingBank?.repo;
  if (!requestedRepo) fail('init requires --repo for a new project');
  if (!path.isAbsolute(requestedRepo)) fail('--repo must be an absolute path');
  const repo = canonicalRepositoryPath(requestedRepo);
  const bank = existingBank || { version: 2, project, repo, generated: sessionDate(), cards: [] };
  bank.version = 2;
  bank.project = project;
  bank.repo = repo;
  if (!bank.generated) bank.generated = sessionDate();
  if (!Array.isArray(bank.cards)) fail('existing bank has an invalid cards array');
  writeJson(files.bank, bank);
  if (!fs.existsSync(files.scores)) writeJson(files.scores, { attempts: [] });
  json({ project, repo, cards: bank.cards.length, initialized: true });
}

function commandMigrate(positionals) {
  const project = projectName(positionals[0]);
  const state = loadRawProject(project);
  const today = sessionDate();
  if (isV2Bank(state.bank)) {
    let upgraded = 0;
    for (const card of state.bank.cards) {
      let changed = false;
      if (card.altitude === undefined) {
        card.altitude = 'mechanism';
        changed = true;
      }
      if (card.sched && card.sched.streak === undefined) {
        deriveStreak(card, state.scores.attempts, today);
        changed = true;
      }
      if (changed) upgraded += 1;
    }
    if (upgraded) writeJson(filesFor(project).bank, state.bank);
    json({ project, migrated: false, alreadyV2: true, unchanged: upgraded === 0, cards: state.bank.cards.length, upgraded });
    return;
  }
  if (!Array.isArray(state.bank.questions)) fail('project state has an invalid questions array');
  const questions = new Map(state.bank.questions.map((question) => [question.id, question]));
  const attemptsById = new Map();
  for (const attempt of state.scores.attempts) {
    const id = attempt.id ?? attempt.cardId;
    if (!attemptsById.has(id)) attemptsById.set(id, []);
    attemptsById.get(id).push(attempt);
  }
  const cards = state.bank.questions.map((question, index) => {
    if (!question || typeof question !== 'object' || typeof question.id !== 'string') fail(`question ${index + 1} is invalid`);
    if (typeof question.question !== 'string' || !question.question.trim()) fail(`question ${index + 1} question must be non-empty`);
    const followups = Array.isArray(question.followups) ? question.followups : [];
    const rubric = [question.reference, ...followups.map((followup) => `Follow-up: ${followup}`)];
    if (rubric.some((item) => typeof item !== 'string' || !item.trim())) fail(`question ${index + 1} has invalid reference or followups`);
    const attempts = attemptsById.get(question.id) || [];
    return {
      id: question.id,
      level: question.level,
      topic: question.topic,
      concept: question.question,
      ask: question.question,
      rubric,
      grounding: Array.isArray(question.grounding) ? question.grounding : [],
      contexts: [state.bank.project, 'generic'],
      source: { type: 'drill', ref: 'v1' },
      added: question.added || today,
      needsRewrite: true,
      altitude: 'mechanism',
      sched: replaySchedule(attempts, today),
    };
  });
  const scores = {
    ...state.scores,
    attempts: state.scores.attempts.map((attempt) => {
      const oldId = attempt.id ?? attempt.cardId;
      const question = questions.get(oldId);
      return {
        ...attempt,
        question: attempt.question || question?.question || '',
        context: attempt.context || state.bank.project,
        cardId: oldId,
      };
    }),
  };
  const files = filesFor(project);
  if (!fs.existsSync(state.bankV1)) fs.copyFileSync(files.bank, state.bankV1);
  if (!fs.existsSync(state.scoresV1)) fs.copyFileSync(files.scores, state.scoresV1);
  const bank = { ...state.bank, version: 2, cards };
  delete bank.questions;
  if (!bank.generated) bank.generated = today;
  writeJson(files.bank, bank);
  writeJson(files.scores, scores);
  json({ project, migrated: true, cards: cards.length, attempts: scores.attempts.length });
}

function commandAdd(positionals) {
  if (positionals.length < 2) fail('add requires <project> <file.json>');
  const state = loadProject(positionals[0]);
  const input = readJson(path.resolve(positionals[1]));
  if (!Array.isArray(input)) fail('add file must contain a JSON array');
  input.forEach((item, index) => validateNewCard(item, index, state.bank.project));
  let nextId = state.bank.cards.reduce((max, item) => Math.max(max, Number(/^c(\d+)$/.exec(item.id)?.[1] || 0)), 0) + 1;
  const concepts = new Set(state.bank.cards.map((item) => item.concept.trim()));
  let added = 0;
  let skipped = 0;
  const today = sessionDate();
  for (const item of input) {
    const concept = item.concept.trim();
    if (concepts.has(concept)) {
      skipped += 1;
      continue;
    }
    state.bank.cards.push({
      ...item,
      id: `c${String(nextId).padStart(3, '0')}`,
      added: today,
      needsRewrite: item.needsRewrite ?? false,
      sched: initialSchedule(today),
    });
    concepts.add(concept);
    nextId += 1;
    added += 1;
  }
  writeJson(filesFor(positionals[0]).bank, state.bank);
  json({ added, skipped, total: state.bank.cards.length });
}

function commandNext(positionals, options) {
  const n = options.n === undefined ? 12 : positiveInteger(options.n, '--n');
  const newLimit = options.new === undefined ? 6 : nonNegativeInteger(options.new, '--new');
  const level = options.level === undefined ? null : positiveInteger(options.level, '--level');
  if (level !== null && level > 4) fail('--level must be from 1 to 4');
  const topic = options.topic === undefined ? null : options.topic;
  const altitude = options.altitude === undefined ? null : options.altitude;
  if (altitude !== null) validateAltitude(altitude, '--altitude');
  const today = sessionDate();
  const includeMature = Boolean(options['include-mature']);
  const filterCards = (state) => activeCards(state).filter((card) =>
    (level === null || card.level === level)
    && (topic === null || card.topic === topic)
    && (altitude === null || card.altitude === altitude)
    && (includeMature || !isRetiredFromDaily(card.sched))
  );
  const dueComparator = (a, b) => {
    const left = a.card ?? a;
    const right = b.card ?? b;
    const dueDays = daysBetween(today, right.sched.due) - daysBetween(today, left.sched.due);
    return dueDays
      || right.sched.lapses - left.sched.lapses
      || left.level - right.level
      || left.id.localeCompare(right.id)
      || (a.project || '').localeCompare(b.project || '');
  };

  if (options.all) {
    const states = [];
    const projectNames = fs.existsSync(HOME)
      ? fs.readdirSync(HOME, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(entry.name) && fs.existsSync(path.join(HOME, entry.name, 'bank.json')))
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b))
      : [];
    for (const project of projectNames) {
      try {
        states.push(loadProject(project));
      } catch {
        // An invalid project does not prevent other projects from being queued.
      }
    }
    const stateByCard = new Map();
    const due = [];
    const newCards = [];
    for (const state of states) {
      const cards = filterCards(state);
      for (const card of cards) {
        stateByCard.set(card, state);
        if (isNewSchedule(card.sched)) {
          newCards.push(card);
        } else if (card.sched.due <= today) {
          due.push({ card, state, project: state.bank.project });
        }
      }
    }
    due.sort(dueComparator);
    const selectedDue = due.slice(0, n);
    const newCount = Math.min(Math.max(n - selectedDue.length, 0), newLimit);
    const selectedNew = altitude === null ? chooseWeightedNew(newCards, newCount) : chooseNew(newCards, newCount);
    const selected = [
      ...selectedDue,
      ...selectedNew.map((card) => {
        const state = stateByCard.get(card);
        return { card, state, project: state.bank.project };
      }),
    ];
    const interleaved = interleaveByKey(selected, (entry) => entry.project);
    json({
      session: today,
      cards: interleaved.map(({ card, state, project }) => ({ project, ...publicCard(card, state, today) })),
    });
    return;
  }

  const state = loadProject(positionals[0]);
  const cards = filterCards(state);
  const due = cards.filter((card) => !isNewSchedule(card.sched) && card.sched.due <= today);
  due.sort(dueComparator);
  const selected = due.slice(0, n);
  const newCards = cards.filter((card) => isNewSchedule(card.sched));
  const newCount = Math.min(Math.max(n - selected.length, 0), newLimit);
  selected.push(...(altitude === null ? chooseWeightedNew(newCards, newCount) : chooseNew(newCards, newCount)));
  const interleaved = interleaveByKey(selected, (card) => card.topic);
  json({ session: today, cards: interleaved.map((card) => publicCard(card, state, today)) });
}

function commandAnswer(positionals) {
  const state = loadProject(positionals[0]);
  const card = getCard(state, positionals[1]);
  const recentAttempts = attemptsFor(state, card.id).slice(0, 3);
  json({ id: card.id, rubric: card.rubric, grounding: card.grounding, recentAttempts: recentAttempts.map((attempt) => attempt.question) });
}

function commandRecord(positionals, options) {
  const state = loadProject(positionals[0]);
  const card = getCard(state, positionals[1]);
  if (!GRADES.includes(options.grade)) fail('--grade must be correct, partial, or wrong');
  if (typeof options.answer !== 'string' || typeof options.gap !== 'string' || typeof options.question !== 'string' || !options.question.trim()) {
    fail('record requires --answer, --gap, and --question');
  }
  const recordContexts = allowedContexts(state.bank.project);
  if (typeof options.context !== 'string' || !recordContexts.includes(options.context)) fail(`--context must be one of ${recordContexts.join(', ')}`);
  if (!card.contexts.includes(options.context)) fail('--context must be included in the card contexts');
  const mode = options.mode || 'drill';
  if (!MODES.includes(mode)) fail('--mode must be drill, mock, or transfer');
  const now = clock();
  const session = sessionDate(now);
  card.sched = applySchedule(card.sched, options.grade, session);
  const attempt = {
    id: card.id,
    cardId: card.id,
    date: now.toISOString(),
    session,
    grade: options.grade,
    answer: options.answer,
    gap: options.gap,
    mode,
    question: options.question.trim(),
    context: options.context,
  };
  state.scores.attempts.push(attempt);
  writeJson(filesFor(positionals[0]).scores, state.scores);
  fs.mkdirSync(state.sessions, { recursive: true });
  const line = `- ${card.id} [L${card.level} ${card.topic}] ${options.grade}: ${options.gap}`;
  fs.appendFileSync(path.join(state.sessions, `${session}.md`), `${line}\n`);
  writeJson(filesFor(positionals[0]).bank, state.bank);
  json({ recorded: true, id: card.id, cardId: card.id, session, grade: options.grade, mode });
}

function commandRefine(positionals, options) {
  const state = loadProject(positionals[0]);
  const n = options.n === undefined ? 10 : positiveInteger(options.n, '--n');
  json({ cards: activeCards(state).filter((card) => card.needsRewrite === true).slice(0, n) });
}

function commandUpdate(positionals, options) {
  const state = loadProject(positionals[0]);
  if (!options.file) fail('update requires --file <json>');
  const card = getCard(state, positionals[1]);
  const replacement = readJson(path.resolve(options.file));
  if (!replacement || typeof replacement !== 'object' || Array.isArray(replacement)) fail('update file must contain a JSON object');
  for (const field of ['level', 'topic', 'concept', 'ask', 'rubric', 'contexts']) if (!(field in replacement)) fail(`update file must contain ${field}`);
  validateCardContent(replacement, 0, { requireGrounding: false, requireSource: false, requireAltitude: false, project: state.bank.project });
  card.level = replacement.level;
  card.topic = replacement.topic;
  card.concept = replacement.concept;
  card.ask = replacement.ask;
  card.rubric = replacement.rubric;
  card.contexts = replacement.contexts;
  if ('altitude' in replacement) card.altitude = replacement.altitude;
  card.needsRewrite = false;
  writeJson(filesFor(positionals[0]).bank, state.bank);
  json({ updated: true, id: card.id });
}

function commandGaps(positionals, options) {
  const state = loadProject(positionals[0]);
  const days = options.days === undefined ? 7 : positiveInteger(options.days, '--days');
  const today = sessionDate();
  const start = addDays(today, -(days - 1));
  const groups = new Map();
  for (const attempt of state.scores.attempts) {
    const day = attemptDay(attempt, today);
    if (!['wrong', 'partial'].includes(attempt.grade) || day < start || day > today) continue;
    const card = state.bank.cards.find((item) => item.id === attemptCardId(attempt));
    if (!card) continue;
    if (!groups.has(card.id)) groups.set(card.id, { card, attempts: [] });
    groups.get(card.id).attempts.push(attempt);
  }
  const gaps = [...groups.values()].map(({ card, attempts }) => ({
    id: card.id,
    concept: card.concept,
    topic: card.topic,
    level: card.level,
    grades: attempts.map((attempt) => attempt.grade),
    gaps: attempts.map((attempt) => attempt.gap).filter((gap) => typeof gap === 'string' && gap.length > 0),
  }));
  json({ project: state.bank.project, days, gaps });
}

function commandNote(positionals) {
  const state = loadProject(positionals[0]);
  const text = positionals.slice(1).join(' ').trim();
  if (!text) fail('note requires text');
  const session = sessionDate();
  fs.mkdirSync(state.sessions, { recursive: true });
  const file = path.join(state.sessions, `${session}.md`);
  const prefix = fs.existsSync(file) && fs.statSync(file).size ? '\n' : '';
  fs.appendFileSync(file, `${prefix}${text}\n`);
  json({ noted: true, session });
}

function commandRemove(positionals) {
  const state = loadProject(positionals[0]);
  const card = getCard(state, positionals[1]);
  const alreadyRetired = card.retired === true;
  if (!alreadyRetired) {
    card.retired = true;
    writeJson(filesFor(positionals[0]).bank, state.bank);
  }
  json({ removed: true, id: card.id, alreadyRetired });
}

function commandMock(positionals, options) {
  const state = loadProject(positionals[0]);
  const n = options.n === undefined ? 15 : positiveInteger(options.n, '--n');
  const available = shuffle(activeCards(state));
  const target = Math.min(n, available.length);
  const counts = scaledDistribution(target);
  const selected = [];
  for (let level = 1; level <= 4; level += 1) {
    const candidates = available.filter((card) => card.level === level && !selected.includes(card));
    selected.push(...candidates.slice(0, counts[level - 1]));
  }
  if (selected.length < target) selected.push(...available.filter((card) => !selected.includes(card)).slice(0, target - selected.length));
  const today = sessionDate();
  json({ session: today, cards: shuffle(selected).map((card) => publicCard(card, state, today, false)) });
}

function accuracy(attempts) {
  if (!attempts.length) return null;
  return attempts.reduce((sum, attempt) => sum + (attempt.grade === 'correct' ? 1 : attempt.grade === 'partial' ? 0.5 : 0), 0) / attempts.length;
}

function recentAttempts(state, today, days) {
  const start = addDays(today, -(days - 1));
  return state.scores.attempts.filter((attempt) => {
    const day = attemptDay(attempt, today);
    return day >= start && day <= today;
  });
}

function defensible(state, today) {
  const cards = activeCards(state);
  const lowCards = cards.filter((card) => card.level <= 3);
  const ready = lowCards.filter((card) => card.sched.lastGrade === 'correct' && card.sched.interval >= 3).length;
  const readyRatio = lowCards.length ? ready / lowCards.length : 0;
  const level4Start = addDays(today, -6);
  const level4Correct = cards.some((card) => {
    if (card.level !== 4 || card.sched.lastGrade !== 'correct') return false;
    const latest = attemptsFor(state, card.id)[0];
    return latest && latest.grade === 'correct' && attemptDay(latest, today) >= level4Start && attemptDay(latest, today) <= today;
  });
  const mapBoundaryCards = cards.filter((card) => card.altitude === 'map' || card.altitude === 'boundary');
  const mapBoundaryReady = mapBoundaryCards.filter((card) => card.sched.lastGrade === 'correct' && card.sched.interval >= 3).length;
  const mapBoundaryReadyRatio = mapBoundaryCards.length ? mapBoundaryReady / mapBoundaryCards.length : 0;
  const newCards = cards.filter((card) => isNewSchedule(card.sched)).length;
  const newRatio = cards.length ? newCards / cards.length : 1;
  const fails = [];
  if (readyRatio < 0.9) fails.push('fewer than 90 percent of level-1-to-3 cards are correct with interval at least 3');
  if (!level4Correct) fails.push('no correct level-4 card in the last 7 days');
  if (newRatio >= 0.2) fails.push('new cards are not under 20 percent of the bank');
  if (mapBoundaryReadyRatio < 0.9) fails.push('fewer than 90 percent of map and boundary cards are correct with interval at least 3');
  return { verdict: fails.length === 0, fails, level1to3Ready: ready, level1to3Total: lowCards.length, level1to3ReadyRatio: readyRatio, mapBoundaryReady, mapBoundaryTotal: mapBoundaryCards.length, mapBoundaryReadyRatio, level4RecentCorrect: level4Correct, newCards, newRatio };
}

function statusV1(state) {
  const questions = state.bank.questions;
  const attempts = state.scores.attempts;
  const data = {
    version: 1,
    project: state.bank.project,
    bankSize: questions.length,
    attempts: attempts.length,
    warning: 'bank is v1; run migrate',
  };
  console.log('Warning: bank is v1; run migrate');
  console.log(`Project: ${data.project}`);
  console.log(`Bank: ${data.bankSize} questions | Attempts: ${data.attempts}`);
  console.log(JSON.stringify(data));
}

function commandStatus(positionals) {
  const state = loadRawProject(positionals[0]);
  if (!isV2Bank(state.bank)) {
    statusV1(state);
    return;
  }
  deriveMissingStreaks(state);
  const today = sessionDate();
  const cards = activeCards(state);
  const retired = state.bank.cards.filter((card) => card.retired === true).length;
  const keptFromDaily = cards.filter((card) => isRetiredFromDaily(card.sched)).length;
  const states = { new: 0, learning: 0, mature: 0 };
  for (const card of cards) states[scheduleState(card.sched)] += 1;
  const dueCards = cards.filter((card) => card.sched.due <= today);
  const dueToday = cards.filter((card) => card.sched.due === today).length;
  const overdue = cards.filter((card) => card.sched.due < today).length;
  const levelDistribution = {};
  for (let level = 1; level <= 4; level += 1) levelDistribution[level] = cards.filter((card) => card.level === level).length;
  const neverAttempted = cards.filter((card) => attemptsFor(state, card.id).length === 0).length;
  const recent = recentAttempts(state, today, 30);
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const topicMap = new Map(cards.map((card) => [card.topic, []]));
  const altitudeMap = new Map(ALTITUDES.map((altitude) => [altitude, []]));
  for (const attempt of recent) {
    const card = cardsById.get(attemptCardId(attempt));
    if (card) {
      topicMap.get(card.topic).push(attempt);
      altitudeMap.get(card.altitude)?.push(attempt);
    }
  }
  const topicAccuracy = [...topicMap.entries()]
    .map(([topic, attempts]) => ({ topic, attempts: attempts.length, accuracy: accuracy(attempts) }))
    .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0) || a.attempts - b.attempts || a.topic.localeCompare(b.topic));
  const lapsesLeaders = state.bank.cards
    .filter((card) => card.retired !== true && card.sched.lapses > 0)
    .sort((a, b) => b.sched.lapses - a.sched.lapses || a.level - b.level || a.id.localeCompare(b.id))
    .slice(0, 3)
    .map((card) => ({ id: card.id, concept: card.concept, topic: card.topic, lapses: card.sched.lapses }));
  const next7Days = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(today, index);
    return { date, count: cards.filter((card) => card.sched.due === date).length };
  });
  const altitudes = ALTITUDES.map((altitude) => {
    const altitudeCards = cards.filter((card) => card.altitude === altitude);
    return {
      altitude,
      cards: altitudeCards.length,
      new: altitudeCards.filter((card) => isNewSchedule(card.sched)).length,
      due: altitudeCards.filter((card) => !isNewSchedule(card.sched) && card.sched.due <= today).length,
      accuracy: accuracy(altitudeMap.get(altitude)),
    };
  });
  const data = {
    version: 2,
    project: state.bank.project,
    bankSize: cards.length,
    retired,
    keptFromDaily,
    states,
    levelDistribution,
    neverAttempted,
    due: dueCards.length,
    dueToday,
    overdue,
    topicAccuracy,
    altitudes,
    weakestTopics: topicAccuracy.slice(0, 3),
    lapsesLeaders,
    next7Days,
    defensible: defensible(state, today),
  };
  console.log(`Project: ${data.project}`);
  console.log(`Bank: ${data.bankSize} cards | New: ${states.new} | Learning: ${states.learning} | Mature: ${states.mature}`);
  console.log(`Due today: ${data.dueToday} | Overdue: ${data.overdue}`);
  console.log('State | Cards');
  console.log(`new     | ${states.new}`);
  console.log(`learning| ${states.learning}`);
  console.log(`mature  | ${states.mature}`);
  console.log('Altitude | Cards | New | Due | Accuracy');
  for (const item of altitudes) console.log(`${item.altitude.padEnd(9)}| ${String(item.cards).padEnd(7)}| ${String(item.new).padEnd(5)}| ${String(item.due).padEnd(5)}| ${item.accuracy === null ? 'n/a' : item.accuracy.toFixed(2)}`);
  console.log(`Retired: ${data.retired}`);
  console.log(`Kept (retired from daily): ${data.keptFromDaily}`);
  console.log(`Defensible: ${data.defensible.verdict ? 'true' : 'false'}`);
  if (data.defensible.fails.length) console.log(`Fails: ${data.defensible.fails.join('; ')}`);
  console.log(JSON.stringify(data));
}

function main(argv) {
  const [command, ...rest] = argv;
  if (!command) fail('command is required');
  const { positionals, options } = parseArgs(rest);
  switch (command) {
    case 'init': return commandInit(positionals, options);
    case 'migrate': return commandMigrate(positionals, options);
    case 'add': return commandAdd(positionals, options);
    case 'next': return commandNext(positionals, options);
    case 'answer': return commandAnswer(positionals, options);
    case 'record': return commandRecord(positionals, options);
    case 'remove': return commandRemove(positionals, options);
    case 'refine': return commandRefine(positionals, options);
    case 'update': return commandUpdate(positionals, options);
    case 'gaps': return commandGaps(positionals, options);
    case 'note': return commandNote(positionals, options);
    case 'mock': return commandMock(positionals, options);
    case 'status': return commandStatus(positionals, options);
    default: fail(`unknown command: ${command}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.log(JSON.stringify({ error: error.message }));
    process.exitCode = 1;
  }
}
