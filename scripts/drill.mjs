#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOME = process.env.INTERVIEW_DRILL_HOME || path.join(os.homedir(), '.interview-drill');
const GRADES = ['correct', 'partial', 'wrong'];
const MODES = ['drill', 'mock', 'transfer'];
const CONTEXTS = ['raptor', 'wiretrace', 'crosstalk', 'library', 'hospital', 'isp-support', 'ecommerce', 'school', 'generic'];
const DAY_MS = 24 * 60 * 60 * 1000;

function clock() {
  return process.env.INTERVIEW_DRILL_NOW ? new Date(process.env.INTERVIEW_DRILL_NOW) : new Date();
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
  return { interval: 0, ease: 2.5, due: dateOnly(today), reps: 0, lapses: 0, lastGrade: null };
}

export function scheduleState(schedule) {
  if (schedule.reps === 0 && schedule.lapses === 0 && schedule.lastGrade === null) return 'new';
  return schedule.interval < 21 ? 'learning' : 'mature';
}

export const cardState = scheduleState;

export function isNewSchedule(schedule) {
  return scheduleState(schedule) === 'new';
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
  };
  const next = { ...current };
  if (grade === 'wrong') {
    next.interval = 1;
    next.ease = Math.max(1.3, roundedEase(current.ease - 0.2));
    next.lapses = current.lapses + 1;
    next.reps = 0;
  } else if (grade === 'partial') {
    next.interval = Math.max(1, Math.round(current.interval * 1.2));
    next.ease = Math.max(1.3, roundedEase(current.ease - 0.05));
    next.reps = current.reps + 1;
  } else {
    next.interval = current.reps === 0 ? 1 : current.reps === 1 ? 3 : Math.round(current.interval * current.ease);
    next.ease = Math.min(3.0, roundedEase(current.ease + 0.05));
    next.reps = current.reps + 1;
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

function getCard(state, id) {
  const card = state.bank.cards.find((item) => item.id === id);
  if (!card) fail(`card not found: ${id}`);
  return card;
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
    if (i + 1 >= args.length || args[i + 1].startsWith('--')) fail(`missing value for --${key}`);
    options[key] = args[++i];
  }
  return { positionals, options };
}

function validateTopic(value, label) {
  if (typeof value !== 'string' || !value.trim() || value !== value.toLowerCase()) fail(`${label} topic must be a lowercase tag`);
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

function validateContexts(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => !CONTEXTS.includes(item)) || new Set(value).size !== value.length) {
    fail(`${label} contexts must be a non-empty subset of the supported contexts`);
  }
}

function validateSource(value, label) {
  if (!value || typeof value !== 'object' || typeof value.type !== 'string' || !value.type.trim() || typeof value.ref !== 'string' || !value.ref.trim()) {
    fail(`${label} source must contain type and ref`);
  }
}

function validateCardContent(item, index, { requireGrounding = true, requireSource = true } = {}) {
  const label = `card ${index + 1}`;
  if (!item || typeof item !== 'object' || Array.isArray(item)) fail(`${label} must be an object`);
  if (!Number.isInteger(item.level) || item.level < 1 || item.level > 4) fail(`${label} level must be an integer from 1 to 4`);
  validateTopic(item.topic, label);
  if (typeof item.concept !== 'string' || !item.concept.trim()) fail(`${label} concept must be non-empty`);
  if (typeof item.ask !== 'string' || !item.ask.trim()) fail(`${label} ask must be non-empty`);
  validateRubric(item.rubric, label);
  if (requireGrounding || 'grounding' in item) validateGrounding(item.grounding, label, requireGrounding);
  validateContexts(item.contexts, label);
  if (requireSource || 'source' in item) validateSource(item.source, label);
  if ('needsRewrite' in item && typeof item.needsRewrite !== 'boolean') fail(`${label} needsRewrite must be boolean`);
}

function validateNewCard(item, index) {
  const label = `card ${index + 1}`;
  if (!item || typeof item !== 'object' || Array.isArray(item)) validateCardContent(item, index);
  if ('id' in item || 'added' in item || 'sched' in item) fail(`${label} must omit id, added, and sched`);
  validateCardContent(item, index);
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

function suggestedContext(card, state) {
  const history = attemptsFor(state, card.id);
  const used = new Set(history.slice(0, 2).map((attempt) => attempt.context).filter(Boolean));
  let candidates = card.contexts.filter((context) => !used.has(context));
  if (!candidates.length) candidates = [...card.contexts];
  const hasRaptorCorrect = history.some((attempt) => attempt.grade === 'correct' && attempt.context === 'raptor');
  if (hasRaptorCorrect) return candidates.find((context) => context !== 'raptor') || candidates[0];
  return candidates.find((context) => context === 'raptor') || candidates[0];
}

function publicCard(card, state, today, includeAttempts = true) {
  const output = {
    id: card.id,
    level: card.level,
    topic: card.topic,
    concept: card.concept,
    ask: card.ask,
    contexts: [...card.contexts],
    suggestedContext: suggestedContext(card, state),
    state: scheduleState(card.sched),
    dueDays: daysBetween(today, card.sched.due),
  };
  if (includeAttempts) {
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
  const repo = options.repo || existingBank?.repo;
  if (!repo) fail('init requires --repo for a new project');
  if (!path.isAbsolute(repo)) fail('--repo must be an absolute path');
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
  if (isV2Bank(state.bank)) {
    json({ project, migrated: false, alreadyV2: true, unchanged: true, cards: state.bank.cards.length });
    return;
  }
  if (!Array.isArray(state.bank.questions)) fail('project state has an invalid questions array');
  const today = sessionDate();
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
      contexts: ['raptor', 'generic', 'other-domain'],
      source: { type: 'drill', ref: 'v1' },
      added: question.added || today,
      needsRewrite: true,
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
        context: attempt.context || 'raptor',
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
  input.forEach(validateNewCard);
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
  const state = loadProject(positionals[0]);
  const n = options.n === undefined ? 12 : positiveInteger(options.n, '--n');
  const newLimit = options.new === undefined ? 6 : nonNegativeInteger(options.new, '--new');
  const level = options.level === undefined ? null : positiveInteger(options.level, '--level');
  if (level !== null && level > 4) fail('--level must be from 1 to 4');
  const topic = options.topic === undefined ? null : options.topic;
  const today = sessionDate();
  const cards = state.bank.cards.filter((card) => (level === null || card.level === level) && (topic === null || card.topic === topic));
  const due = cards.filter((card) => !isNewSchedule(card.sched) && card.sched.due <= today);
  due.sort((a, b) => {
    const dueDays = daysBetween(today, b.sched.due) - daysBetween(today, a.sched.due);
    return dueDays || b.sched.lapses - a.sched.lapses || a.level - b.level || a.id.localeCompare(b.id);
  });
  const selected = due.slice(0, n);
  const newCards = cards.filter((card) => isNewSchedule(card.sched));
  selected.push(...chooseNew(newCards, Math.min(n - selected.length, newLimit)));
  json({ session: today, cards: selected.map((card) => publicCard(card, state, today)) });
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
  if (typeof options.context !== 'string' || (!CONTEXTS.includes(options.context) && options.context !== 'other-domain')) fail('--context must be a supported context');
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
  const line = `- ${card.id} [L${card.level} ${card.topic}] ${options.grade} — ${options.gap}`;
  fs.appendFileSync(path.join(state.sessions, `${session}.md`), `${line}\n`);
  writeJson(filesFor(positionals[0]).bank, state.bank);
  json({ recorded: true, id: card.id, cardId: card.id, session, grade: options.grade, mode });
}

function commandRefine(positionals, options) {
  const state = loadProject(positionals[0]);
  const n = options.n === undefined ? 10 : positiveInteger(options.n, '--n');
  json({ cards: state.bank.cards.filter((card) => card.needsRewrite === true).slice(0, n) });
}

function commandUpdate(positionals, options) {
  const state = loadProject(positionals[0]);
  if (!options.file) fail('update requires --file <json>');
  const card = getCard(state, positionals[1]);
  const replacement = readJson(path.resolve(options.file));
  if (!replacement || typeof replacement !== 'object' || Array.isArray(replacement)) fail('update file must contain a JSON object');
  for (const field of ['level', 'topic', 'concept', 'ask', 'rubric', 'contexts']) if (!(field in replacement)) fail(`update file must contain ${field}`);
  validateCardContent(replacement, 0, { requireGrounding: false, requireSource: false });
  card.level = replacement.level;
  card.topic = replacement.topic;
  card.concept = replacement.concept;
  card.ask = replacement.ask;
  card.rubric = replacement.rubric;
  card.contexts = replacement.contexts;
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

function commandMock(positionals, options) {
  const state = loadProject(positionals[0]);
  const n = options.n === undefined ? 15 : positiveInteger(options.n, '--n');
  const available = shuffle(state.bank.cards);
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
  const lowCards = state.bank.cards.filter((card) => card.level <= 3);
  const ready = lowCards.filter((card) => card.sched.lastGrade === 'correct' && card.sched.interval >= 3).length;
  const readyRatio = lowCards.length ? ready / lowCards.length : 0;
  const level4Start = addDays(today, -6);
  const level4Correct = state.bank.cards.some((card) => {
    if (card.level !== 4 || card.sched.lastGrade !== 'correct') return false;
    const latest = attemptsFor(state, card.id)[0];
    return latest && latest.grade === 'correct' && attemptDay(latest, today) >= level4Start && attemptDay(latest, today) <= today;
  });
  const newCards = state.bank.cards.filter((card) => isNewSchedule(card.sched)).length;
  const newRatio = state.bank.cards.length ? newCards / state.bank.cards.length : 1;
  const fails = [];
  if (readyRatio < 0.9) fails.push('fewer than 90 percent of level-1-to-3 cards are correct with interval at least 3');
  if (!level4Correct) fails.push('no correct level-4 card in the last 7 days');
  if (newRatio >= 0.2) fails.push('new cards are not under 20 percent of the bank');
  return { verdict: fails.length === 0, fails, level1to3Ready: ready, level1to3Total: lowCards.length, level1to3ReadyRatio: readyRatio, level4RecentCorrect: level4Correct, newCards, newRatio };
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
  const today = sessionDate();
  const states = { new: 0, learning: 0, mature: 0 };
  for (const card of state.bank.cards) states[scheduleState(card.sched)] += 1;
  const dueCards = state.bank.cards.filter((card) => card.sched.due <= today);
  const dueToday = state.bank.cards.filter((card) => card.sched.due === today).length;
  const overdue = state.bank.cards.filter((card) => card.sched.due < today).length;
  const levelDistribution = {};
  for (let level = 1; level <= 4; level += 1) levelDistribution[level] = state.bank.cards.filter((card) => card.level === level).length;
  const neverAttempted = state.bank.cards.filter((card) => attemptsFor(state, card.id).length === 0).length;
  const topicMap = new Map(state.bank.cards.map((card) => [card.topic, []]));
  for (const attempt of recentAttempts(state, today, 30)) {
    const card = state.bank.cards.find((item) => item.id === attemptCardId(attempt));
    if (card) topicMap.get(card.topic).push(attempt);
  }
  const topicAccuracy = [...topicMap.entries()]
    .map(([topic, attempts]) => ({ topic, attempts: attempts.length, accuracy: accuracy(attempts) }))
    .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0) || a.attempts - b.attempts || a.topic.localeCompare(b.topic));
  const lapsesLeaders = state.bank.cards
    .filter((card) => card.sched.lapses > 0)
    .sort((a, b) => b.sched.lapses - a.sched.lapses || a.level - b.level || a.id.localeCompare(b.id))
    .slice(0, 3)
    .map((card) => ({ id: card.id, concept: card.concept, topic: card.topic, lapses: card.sched.lapses }));
  const next7Days = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(today, index);
    return { date, count: state.bank.cards.filter((card) => card.sched.due === date).length };
  });
  const data = {
    version: 2,
    project: state.bank.project,
    bankSize: state.bank.cards.length,
    states,
    levelDistribution,
    neverAttempted,
    due: dueCards.length,
    dueToday,
    overdue,
    topicAccuracy,
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
