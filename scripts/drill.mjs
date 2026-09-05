#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOME = process.env.INTERVIEW_DRILL_HOME || path.join(os.homedir(), '.interview-drill');
const GRADES = ['correct', 'partial', 'wrong'];
const MODES = ['drill', 'mock'];

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
  return { dir, bank: path.join(dir, 'bank.json'), scores: path.join(dir, 'scores.json'), sessions: path.join(dir, 'sessions') };
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

function loadProject(project) {
  const files = filesFor(project);
  if (!fs.existsSync(files.bank) || !fs.existsSync(files.scores)) fail(`project is not initialized: ${project}`);
  const bank = readJson(files.bank);
  const scores = readJson(files.scores);
  if (!Array.isArray(bank.questions) || !Array.isArray(scores.attempts)) fail('project state has an invalid shape');
  return { ...files, bank, scores };
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

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) fail(`${name} must be a positive integer`);
  return number;
}

function getQuestion(state, id) {
  const question = state.bank.questions.find((item) => item.id === id);
  if (!question) fail(`question not found: ${id}`);
  return question;
}

function attemptsFor(state, id) {
  return state.scores.attempts
    .filter((attempt) => attempt.id === id)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

export function spacingInterval(history) {
  if (!history.length) return 0;
  const latest = history[0].grade;
  if (latest === 'wrong') return 1;
  if (latest === 'partial') return 2;
  if (latest === 'correct') {
    let consecutive = 0;
    for (const attempt of history) {
      if (attempt.grade !== 'correct') break;
      consecutive += 1;
    }
    if (consecutive >= 3) return 16;
    if (consecutive === 2) return 8;
    return 4;
  }
  fail(`invalid grade in score history: ${latest}`);
}

function distinctSessions(attempts) {
  return [...new Set(attempts.map((attempt) => attempt.session))].sort();
}

function dueFor(state, question, sessions = distinctSessions(state.scores.attempts), today = sessionDate()) {
  const history = attemptsFor(state, question.id);
  if (!history.length) return true;
  const lastSession = history[0].session;
  const between = sessions.filter((session) => session > lastSession && session < today).length;
  const todayCounts = today > lastSession ? 1 : 0;
  return between + todayCounts >= spacingInterval(history);
}

function attemptSummary(state, question) {
  const history = attemptsFor(state, question.id);
  return {
    ...question,
    attempts: history.length,
    lastGrade: history[0]?.grade ?? null,
    lastDate: history[0]?.date ?? null,
  };
}

function chooseNew(questions, count) {
  const groups = new Map();
  for (const question of questions) {
    if (!groups.has(question.topic)) groups.set(question.topic, []);
    groups.get(question.topic).push(question);
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
    for (let i = topics.length - 1; i >= 0; i -= 1) if (!groups.get(topics[i]).length) topics.splice(i, 1);
  }
  return result;
}

function publicQuestion(question, state, includeAttempts = true) {
  const output = { id: question.id, level: question.level, topic: question.topic, question: question.question, grounding: question.grounding };
  if (includeAttempts) {
    const summary = attemptSummary(state, question);
    output.attempts = summary.attempts;
    output.lastGrade = summary.lastGrade;
  }
  return output;
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
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

function validateQuestion(item, index) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) fail(`question ${index + 1} must be an object`);
  if ('id' in item || 'added' in item) fail(`question ${index + 1} must omit id and added`);
  if (!Number.isInteger(item.level) || item.level < 1 || item.level > 4) fail(`question ${index + 1} level must be an integer from 1 to 4`);
  if (typeof item.topic !== 'string' || !item.topic.trim() || item.topic !== item.topic.toLowerCase()) fail(`question ${index + 1} topic must be a lowercase tag`);
  if (typeof item.question !== 'string' || !item.question.trim()) fail(`question ${index + 1} question must be non-empty`);
  if (!Array.isArray(item.grounding) || item.grounding.length < 1 || item.grounding.some((value) => typeof value !== 'string' || !/^[^:]+:\d+(-\d+)?$/.test(value))) fail(`question ${index + 1} has invalid grounding`);
  if (typeof item.reference !== 'string' || !item.reference.trim()) fail(`question ${index + 1} reference must be non-empty`);
  if (!Array.isArray(item.followups) || item.followups.length > 3 || item.followups.some((value) => typeof value !== 'string')) fail(`question ${index + 1} followups must contain zero to three strings`);
}

function commandInit(positionals, options) {
  const project = projectName(positionals[0]);
  const files = filesFor(project);
  fs.mkdirSync(files.sessions, { recursive: true });
  const existingBank = fs.existsSync(files.bank) ? readJson(files.bank) : null;
  const repo = options.repo || existingBank?.repo;
  if (!repo) fail('init requires --repo for a new project');
  if (!path.isAbsolute(repo)) fail('--repo must be an absolute path');
  const bank = existingBank || { project, repo, generated: sessionDate(), questions: [] };
  bank.project = project;
  bank.repo = repo;
  if (!bank.generated) bank.generated = sessionDate();
  if (!Array.isArray(bank.questions)) fail('existing bank has an invalid questions array');
  writeJson(files.bank, bank);
  if (!fs.existsSync(files.scores)) writeJson(files.scores, { attempts: [] });
  json({ project, repo, questions: bank.questions.length, initialized: true });
}

function commandAdd(positionals) {
  if (positionals.length < 2) fail('add requires <project> <file.json>');
  const state = loadProject(positionals[0]);
  const input = readJson(path.resolve(positionals[1]));
  if (!Array.isArray(input)) fail('add file must contain a JSON array');
  input.forEach(validateQuestion);
  let nextId = state.bank.questions.reduce((max, item) => Math.max(max, Number(/^q(\d+)$/.exec(item.id)?.[1] || 0)), 0) + 1;
  const questionTexts = new Set(state.bank.questions.map((item) => item.question.trim()));
  let added = 0;
  let skipped = 0;
  for (const item of input) {
    const questionText = item.question.trim();
    if (questionTexts.has(questionText)) {
      skipped += 1;
      continue;
    }
    state.bank.questions.push({ ...item, id: `q${String(nextId).padStart(3, '0')}`, added: sessionDate() });
    questionTexts.add(questionText);
    nextId += 1;
    added += 1;
  }
  writeJson(filesFor(positionals[0]).bank, state.bank);
  json({ added, skipped, total: state.bank.questions.length });
}

function commandNext(positionals, options) {
  const state = loadProject(positionals[0]);
  const n = options.n === undefined ? 12 : positiveInteger(options.n, '--n');
  const newRatio = options['new-ratio'] === undefined ? 0.3 : Number(options['new-ratio']);
  if (!Number.isFinite(newRatio) || newRatio < 0 || newRatio > 1) fail('--new-ratio must be between 0 and 1');
  const level = options.level === undefined ? null : positiveInteger(options.level, '--level');
  if (level !== null && level > 4) fail('--level must be from 1 to 4');
  const questions = state.bank.questions.filter((question) => level === null || question.level === level);
  const sessions = distinctSessions(state.scores.attempts);
  const due = questions.filter((question) => attemptsFor(state, question.id).length && dueFor(state, question, sessions));
  const rank = { wrong: 0, partial: 1, correct: 2 };
  due.sort((a, b) => {
    const ah = attemptsFor(state, a.id); const bh = attemptsFor(state, b.id);
    return rank[ah[0].grade] - rank[bh[0].grade] || new Date(ah[0].date) - new Date(bh[0].date) || a.id.localeCompare(b.id);
  });
  const selected = due.slice(0, n);
  if (selected.length < n) {
    const dueCount = due.length;
    const cap = dueCount ? Math.ceil(n * newRatio) : n;
    const newQuestions = questions.filter((question) => !attemptsFor(state, question.id).length && !selected.includes(question));
    selected.push(...chooseNew(newQuestions, Math.min(n - selected.length, cap)));
  }
  json({ session: sessionDate(), questions: selected.map((question) => publicQuestion(question, state)) });
}

function commandAnswer(positionals) {
  const state = loadProject(positionals[0]);
  const question = getQuestion(state, positionals[1]);
  json({ id: question.id, reference: question.reference, followups: question.followups, grounding: question.grounding });
}

function commandRecord(positionals, options) {
  const state = loadProject(positionals[0]);
  const question = getQuestion(state, positionals[1]);
  if (!GRADES.includes(options.grade)) fail('--grade must be correct, partial, or wrong');
  if (typeof options.answer !== 'string' || typeof options.gap !== 'string') fail('record requires --answer and --gap');
  const mode = options.mode || 'drill';
  if (!MODES.includes(mode)) fail('--mode must be drill or mock');
  const now = clock();
  const session = sessionDate(now);
  const attempt = { id: question.id, date: now.toISOString(), session, grade: options.grade, answer: options.answer, gap: options.gap, mode };
  state.scores.attempts.push(attempt);
  writeJson(filesFor(positionals[0]).scores, state.scores);
  fs.mkdirSync(state.sessions, { recursive: true });
  const line = `- ${question.id} [L${question.level} ${question.topic}] ${options.grade} — ${options.gap}`;
  fs.appendFileSync(path.join(state.sessions, `${session}.md`), `${line}\n`);
  json({ recorded: true, id: question.id, session, grade: options.grade, mode });
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
  const available = shuffle(state.bank.questions);
  const counts = scaledDistribution(Math.min(n, available.length));
  const selected = [];
  for (let level = 1; level <= 4; level += 1) {
    const candidates = available.filter((question) => question.level === level && !selected.includes(question));
    selected.push(...candidates.slice(0, counts[level - 1]));
  }
  if (selected.length < Math.min(n, available.length)) {
    selected.push(...available.filter((question) => !selected.includes(question)).slice(0, Math.min(n, available.length) - selected.length));
  }
  json({ session: sessionDate(), questions: shuffle(selected).map((question) => publicQuestion(question, state, false)) });
}

function accuracy(attempts) {
  if (!attempts.length) return null;
  return attempts.reduce((sum, attempt) => sum + (attempt.grade === 'correct' ? 1 : attempt.grade === 'partial' ? 0.5 : 0), 0) / attempts.length;
}

function sessionLevelStats(state, session) {
  const result = {};
  for (let level = 1; level <= 4; level += 1) {
    const attempts = state.scores.attempts.filter((attempt) => attempt.session === session && state.bank.questions.find((question) => question.id === attempt.id)?.level === level);
    result[level] = { attempts: attempts.length, accuracy: accuracy(attempts) };
  }
  return result;
}

function defensible(state, sessions) {
  const lastTwo = sessions.slice(-2).reverse();
  const fails = [];
  if (lastTwo.length < 2) fails.push('fewer than two sessions with attempts');
  for (const session of lastTwo) {
    const attempts = state.scores.attempts.filter((attempt) => attempt.session === session && (state.bank.questions.find((question) => question.id === attempt.id)?.level || 0) <= 3);
    if (attempts.length < 10) fails.push(`${session} has fewer than 10 level-1-to-3 attempts`);
    else if (accuracy(attempts) < 0.9) fails.push(`${session} level-1-to-3 accuracy is below 0.9`);
  }
  const level4Correct = state.scores.attempts.some((attempt) => lastTwo.includes(attempt.session) && attempt.grade === 'correct' && state.bank.questions.find((question) => question.id === attempt.id)?.level === 4);
  if (!level4Correct) fails.push('no correct level-4 attempt in the last two sessions');
  const lowQuestions = state.bank.questions.filter((question) => question.level <= 3);
  const never = lowQuestions.filter((question) => !attemptsFor(state, question.id).length).length;
  if (!lowQuestions.length || never >= lowQuestions.length * 0.2) fails.push('never-attempted level-1-to-3 questions are at least 20 percent');
  return { verdict: fails.length === 0, fails };
}

function commandStatus(positionals) {
  const state = loadProject(positionals[0]);
  const sessions = distinctSessions(state.scores.attempts);
  const levels = {};
  for (let level = 1; level <= 4; level += 1) levels[level] = state.bank.questions.filter((question) => question.level === level).length;
  const neverAttempted = state.bank.questions.filter((question) => !attemptsFor(state, question.id).length).length;
  const due = state.bank.questions.filter((question) => dueFor(state, question, sessions)).length;
  const topicMap = new Map();
  for (const question of state.bank.questions) {
    if (!topicMap.has(question.topic)) topicMap.set(question.topic, []);
    topicMap.get(question.topic).push(...attemptsFor(state, question.id));
  }
  const topicAccuracy = [...topicMap.entries()].map(([topic, attempts]) => ({ topic, attempts: attempts.length, accuracy: accuracy(attempts) }))
    .sort((a, b) => a.accuracy - b.accuracy || a.attempts - b.attempts || a.topic.localeCompare(b.topic));
  const data = {
    project: state.bank.project,
    bankSize: state.bank.questions.length,
    levelDistribution: levels,
    neverAttempted,
    due,
    sessions: sessions.slice(-2).reverse(),
    perLevelAccuracy: {
      last: sessions.length ? sessionLevelStats(state, sessions.at(-1)) : null,
      previous: sessions.length > 1 ? sessionLevelStats(state, sessions.at(-2)) : null,
    },
    topicAccuracy,
    defensible: defensible(state, sessions),
  };
  console.log(`Project: ${data.project}`);
  console.log(`Bank: ${data.bankSize} questions | Never attempted: ${data.neverAttempted} | Due: ${data.due}`);
  console.log('Level | Questions');
  for (let level = 1; level <= 4; level += 1) console.log(`${level}     | ${levels[level]}`);
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
    case 'add': return commandAdd(positionals, options);
    case 'next': return commandNext(positionals, options);
    case 'answer': return commandAnswer(positionals, options);
    case 'record': return commandRecord(positionals, options);
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
