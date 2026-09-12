import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { addDays, today } from './clock.mjs';
import { open as openDatabase } from './db.mjs';
import { append as appendEvent, readAll } from './log.mjs';
import { rebuild } from './reduce.mjs';
import { schedule } from './scheduler.mjs';
import { update } from './elo.mjs';
import { topicsForProject } from './graph.mjs';
import { topicMastery } from './mastery.mjs';
import { canVouchClaim, CLAIM_STATUSES, validateClaim } from '../survey/claim.mjs';
import { COMPONENTS } from '../lesson/schema.mjs';
import { validate as validateLessonDocument } from '../lesson/validate.mjs';
import { discover, discoverBanks, dryRun, dryRunImport, importBank, importProject } from './migrate.mjs';

const CREDIT = { wrong: 0, partial: 0.5, correct: 1 };

// The vocabularies below mirror the CHECK constraints in db.mjs. The schema is
// the authority and stays as it is; this is the write path agreeing with it in
// advance. The log is append-only and is the only durable record, so an event
// the reducer would refuse must never reach it: the caller sees an error and
// believes nothing happened, while the log keeps a line that makes every later
// replay fail and takes the whole history with it.
const GRADES = new Set(['correct', 'partial', 'wrong']);
const MODES = new Set(['drill', 'mock', 'transfer', 'lesson']);
const TOPIC_KINDS = new Set(['technology', 'concept', 'skill']);
const ALTITUDES = new Set(['map', 'boundary', 'mechanism', 'line']);
const GATE_STATUSES = new Set(CLAIM_STATUSES);

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value;
}

// A column that is nullable still refuses an object, and binding one throws
// inside the reducer, which is the same poisoning by a different route.
function optionalText(value, label) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new Error(`${label} must be a string or null`);
  return value;
}

function requireOneOf(value, allowed, label) {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new Error(`${label} must be one of ${[...allowed].join(', ')}`);
  }
  return value;
}

function validateVouch({ claim, judgement } = {}) {
  if (!claim || typeof claim !== 'object' || Array.isArray(claim)) throw new Error('claim must be an object');
  try {
    validateClaim(claim);
  } catch (error) {
    throw new Error(`claim cannot be vouched: ${error.message}`);
  }
  if (!canVouchClaim(claim.status)) throw new Error(`claim status ${claim.status} cannot be vouched`);
  requireText(judgement, 'judgement');
  if (judgement.length > 4096) throw new Error('judgement exceeds 4096 characters');
  return { claim, judgement };
}

export function openState(home) {
  fs.mkdirSync(home, { recursive: true });
  const db = openDatabase(path.join(home, 'cache.db'));
  const state = {
    db,
    home,
    append: (body) => appendEvent(home, body),
    refresh: () => refresh(state),
  };
  return state;
}

export { discover, discoverBanks, dryRun, dryRunImport, importBank, importProject };

function replaySchedules(db) {
  const cards = db.prepare('select id from cards order by id').all();
  const attempts = db.prepare(`
    select card, at, grade from attempts
    order by at, id
  `).all();
  const attemptsByCard = new Map();
  for (const attempt of attempts) {
    if (!attemptsByCard.has(attempt.card)) attemptsByCard.set(attempt.card, []);
    attemptsByCard.get(attempt.card).push(attempt);
  }

  const insert = db.prepare(`
    insert into card_sched
      (card, stability, fsrs_difficulty, due, reps, lapses, last_at, last_grade)
    values (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const card of cards) {
    let state = null;
    for (const attempt of attemptsByCard.get(card.id) ?? []) {
      state = schedule(state, attempt.grade, attempt.at.slice(0, 10));
    }
    if (state) {
      insert.run(
        card.id,
        state.stability,
        state.difficulty,
        state.due,
        state.reps,
        state.lapses,
        state.last_at,
        state.last_grade,
      );
    }
  }
}

function replayRatings(db) {
  const cardRows = db.prepare('select id from cards order by id').all();
  const topicRows = db.prepare('select id from topics order by id').all();
  const cardRatings = new Map(cardRows.map((row) => [row.id, { rating: 0, n: 0 }]));
  const topicRatings = new Map(topicRows.map((row) => [row.id, { rating: 0, n: 0 }]));
  const topicsByCard = new Map();
  const links = db.prepare('select card, topic from card_topics order by card, topic').all();
  for (const link of links) {
    if (!topicsByCard.has(link.card)) topicsByCard.set(link.card, []);
    topicsByCard.get(link.card).push(link.topic);
    if (!topicRatings.has(link.topic)) topicRatings.set(link.topic, { rating: 0, n: 0 });
  }

  const attempts = db.prepare(`
    select card, grade from attempts
    order by at, id
  `).all();
  for (const attempt of attempts) {
    const card = cardRatings.get(attempt.card);
    if (!card) continue;
    const topics = topicsByCard.get(attempt.card) ?? [];
    const previousDifficulty = card.rating;
    const previousDifficultyN = card.n;
    const abilities = topics.map((topic) => topicRatings.get(topic).rating);
    const abilityNs = topics.map((topic) => topicRatings.get(topic).n);
    const ability = abilities.length === 0
      ? 0
      : abilities.reduce((sum, value) => sum + value, 0) / abilities.length;
    const abilityN = abilityNs.length === 0
      ? 0
      : abilityNs.reduce((sum, value) => sum + value, 0) / abilityNs.length;
    const result = update({
      ability,
      abilityN,
      difficulty: previousDifficulty,
      difficultyN: previousDifficultyN,
    }, CREDIT[attempt.grade]);
    card.rating = result.difficulty;
    card.n = result.difficultyN;

    // A multi-topic card is one item observation but contributes the same
    // answer to every topic ability. Keep the item update above singular, and
    // use the pre-update item difficulty for each topic's paired update.
    for (const topicId of topics) {
      const topic = topicRatings.get(topicId);
      const topicResult = update({
        ability: topic.rating,
        abilityN: topic.n,
        difficulty: previousDifficulty,
        difficultyN: previousDifficultyN,
      }, CREDIT[attempt.grade]);
      topic.rating = topicResult.ability;
      topic.n = topicResult.abilityN;
    }
  }

  const insertCard = db.prepare('insert into card_elo (card, rating, n) values (?, ?, ?)');
  for (const [cardId, value] of cardRatings) insertCard.run(cardId, value.rating, value.n);
  const insertTopic = db.prepare('insert into topic_elo (topic, rating, n) values (?, ?, ?)');
  for (const [topicId, value] of topicRatings) insertTopic.run(topicId, value.rating, value.n);
}

export function refresh(state) {
  const { applied, quarantined } = rebuild(state.db, readAll(state.home));
  state.db.exec('begin');
  try {
    // These are projections of the complete attempt history. Replaying them
    // from empty keeps an incremental run identical to a cache rebuild.
    state.db.exec('delete from card_sched; delete from card_elo; delete from topic_elo');
    replaySchedules(state.db);
    replayRatings(state.db);
    state.db.exec('commit');
  } catch (error) {
    try { state.db.exec('rollback'); } catch { /* already rolled back */ }
    throw error;
  }
  // Also hung on the state so a caller that ignores the return value can still
  // report that some history was skipped rather than quietly losing it.
  state.quarantined = quarantined;
  return { applied, quarantined };
}

function cardExists(state, id) {
  return state.db.prepare('select 1 as ok from cards where id = ?').get(id) !== undefined;
}

const LESSON_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function lessonDirectory(state) {
  return path.join(state.home, 'lessons');
}

function lessonFile(state, id) {
  requireText(id, 'lesson');
  if (!LESSON_ID.test(id)) throw new Error('lesson id is invalid');
  return path.join(lessonDirectory(state), `${id}.json`);
}

function readLessonFile(state, id) {
  const file = lessonFile(state, id);
  if (!fs.existsSync(file)) throw new Error(`lesson not found: ${id}`);
  let document;
  try {
    document = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`lesson ${id} is not valid JSON: ${error.message}`);
  }
  const result = validateLessonDocument(document);
  if (!result.ok) throw new Error(`lesson ${id} is invalid: ${result.errors.map((item) => `${item.field} ${item.message}`).join('; ')}`);
  return document;
}

function readLessonFiles(state) {
  const dir = lessonDirectory(state);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -5))
    .filter((id) => LESSON_ID.test(id))
    .sort()
    .map((id) => readLessonFile(state, id));
}

function gradableCount(document) {
  return document.blocks.filter((block) => COMPONENTS[block.type]?.gradable === true).length;
}

function syncLessonProjection(state, documents) {
  state.db.exec('begin');
  try {
    const lesson = state.db.prepare(`insert or replace into lessons
      (id, project, title, created, blocks) values (?, ?, ?, ?, ?)`);
    const topic = state.db.prepare('insert or ignore into lesson_topics (lesson, topic) values (?, ?)');
    for (const document of documents) {
      lesson.run(document.id, document.project, document.title, document.created, document.blocks.length);
      state.db.prepare('delete from lesson_topics where lesson = ?').run(document.id);
      for (const item of document.topics) topic.run(document.id, item);
    }
    state.db.exec('commit');
  } catch (error) {
    try { state.db.exec('rollback'); } catch { /* already rolled back */ }
    throw error;
  }
}

function lessonSummary(document) {
  const blocks = document.blocks.length;
  const gradable = gradableCount(document);
  return {
    id: document.id,
    project: document.project,
    title: document.title,
    topics: [...document.topics],
    blocks,
    gradable,
    blockCount: blocks,
    gradableCount: gradable,
    created: document.created,
  };
}

function redactedBlock(block) {
  const copy = JSON.parse(JSON.stringify(block));
  if (copy.type === 'short') {
    delete copy.rubric;
    delete copy.grounding;
  } else if (copy.type === 'code') {
    delete copy.reviewAgainst;
  } else if (copy.type === 'recall') {
    delete copy.answer;
    delete copy.accept;
  } else if (copy.type === 'lure') {
    copy.options = copy.options.map((option) => {
      const safe = { text: option.text };
      return safe;
    });
  } else if (copy.type === 'order') {
    delete copy.order;
  } else if (copy.type === 'blank') {
    copy.blanks = copy.blanks.map((blank) => ({ distractors: blank.distractors, at: blank.at }));
    delete copy.file;
  } else if (copy.type === 'place') {
    copy.place = copy.place.map((item) => ({ label: item.label }));
  }
  return copy;
}

export function listLessons(state) {
  const documents = readLessonFiles(state);
  syncLessonProjection(state, documents);
  return documents.map(lessonSummary);
}

export const lessons = listLessons;

export function getLesson(state, id) {
  const document = readLessonFile(state, id);
  syncLessonProjection(state, [document]);
  return {
    ...lessonSummary(document),
    blocks: document.blocks.map(redactedBlock),
  };
}

export function revealLessonBlock(state, id, blockIndex, run) {
  const document = readLessonFile(state, id);
  if (!Number.isInteger(blockIndex) || blockIndex < 0 || blockIndex >= document.blocks.length) {
    throw new Error('block must be an integer within the lesson');
  }
  const runIdValue = requireText(run, 'run');
  refresh(state);
  const answer = state.db.prepare('select id, run, lesson, block from lesson_answers where id = ?').get(`${runIdValue}:${blockIndex}`);
  if (!answer || answer.run !== runIdValue || answer.lesson !== id || answer.block !== blockIndex) {
    throw new Error('lesson block must be committed before reveal');
  }
  return { lesson: id, block: blockIndex, data: document.blocks[blockIndex] };
}

function runId(value) {
  return value === undefined || value === null ? crypto.randomUUID() : requireText(value, 'run');
}

function runRow(state, id) {
  const row = state.db.prepare(`select id, lesson, at, completed, stopped_at_block
    from lesson_runs where id = ?`).get(id);
  if (!row) throw new Error(`lesson run not found: ${id}`);
  return {
    id: row.id,
    lesson: row.lesson,
    at: row.at,
    completed: row.completed === 1,
    stoppedAtBlock: row.stopped_at_block,
  };
}

function ensureRun(state, lessonId, id) {
  const document = readLessonFile(state, lessonId);
  refresh(state);
  const row = state.db.prepare('select id, lesson from lesson_runs where id = ?').get(id);
  if (!row) throw new Error(`lesson run not found: ${id}`);
  if (row.lesson !== lessonId) throw new Error('lesson run belongs to another lesson');
  return document;
}

export function startLesson(state, { lesson, run } = {}) {
  const document = readLessonFile(state, lesson);
  const id = runId(run);
  state.append({ type: 'lesson.completed', data: { status: 'started', run: id, lesson: document.id } });
  refresh(state);
  return runRow(state, id);
}

export function abandonLesson(state, { lesson, run, stoppedAtBlock } = {}) {
  const document = ensureRun(state, lesson, requireText(run, 'run'));
  if (!Number.isInteger(stoppedAtBlock) || stoppedAtBlock < 0 || stoppedAtBlock >= document.blocks.length) {
    throw new Error('stoppedAtBlock must be an integer within the lesson');
  }
  state.append({ type: 'lesson.completed', data: {
    status: 'abandoned', run, lesson: document.id, stoppedAtBlock,
  } });
  refresh(state);
  return runRow(state, run);
}

export function completeLesson(state, { lesson, run } = {}) {
  const document = ensureRun(state, lesson, requireText(run, 'run'));
  state.append({ type: 'lesson.completed', data: { status: 'completed', run, lesson: document.id } });
  refresh(state);
  return runRow(state, run);
}

function blockQuestion(block) {
  if (typeof block.ask === 'string') return block.ask;
  if (typeof block.situation === 'string') return block.situation;
  if (typeof block.prompt === 'string') return block.prompt;
  return null;
}

function validateLessonAnswerInput(state, input) {
  const lessonId = requireText(input.lesson, 'lesson');
  const run = requireText(input.run, 'run');
  const document = ensureRun(state, lessonId, run);
  if (!Number.isInteger(input.block) || input.block < 0 || input.block >= document.blocks.length) {
    throw new Error('block must be an integer within the lesson');
  }
  if (typeof input.answer !== 'string') throw new Error('answer must be a string');
  const cardId = input.card === undefined || input.card === null ? null : requireText(input.card, 'card');
  if (cardId !== null && !cardExists(state, cardId)) throw new Error(`card not found: ${cardId}`);
  return { lessonId, run, document, cardId };
}

export function answerLesson(state, input = {}) {
  const { lessonId, run, document, cardId } = validateLessonAnswerInput(state, input);
  const feedback = optionalText(input.feedback, 'feedback');
  const gap = optionalText(input.gap, 'gap');
  const status = input.grade === undefined || input.grade === null ? (input.stored === true ? 'stored' : 'awaiting') : 'graded';
  if (status === 'graded') requireOneOf(input.grade, GRADES, 'grade');
  const answerId = `${run}:${input.block}`;
  state.append({ type: 'lesson.completed', data: {
    status: status === 'graded' ? 'awaiting' : status,
    answerId,
    run,
    lesson: lessonId,
    block: input.block,
    card: cardId,
    answer: input.answer,
  } });
  if (status === 'graded') {
    state.append({ type: 'lesson.completed', data: {
      status: 'graded', answerId, run, lesson: lessonId, block: input.block,
      grade: input.grade, feedback,
    } });
    if (cardId !== null) {
      state.append({ type: 'attempt.recorded', data: {
        card: cardId,
        grade: input.grade,
        question: blockQuestion(document.blocks[input.block]),
        context: lessonId,
        answer: input.answer,
        gap,
        mode: 'lesson',
      } });
    }
  }
  refresh(state);
  return lessonAnswerRow(state, answerId);
}

function lessonAnswerRow(state, id) {
  const row = state.db.prepare(`select id, run, lesson, block, card, answer, status, grade, feedback, at, updated_at
    from lesson_answers where id = ?`).get(id);
  if (!row) throw new Error(`lesson answer not found: ${id}`);
  return {
    id: row.id,
    run: row.run,
    lesson: row.lesson,
    block: row.block,
    card: row.card,
    answer: row.answer,
    status: row.status,
    grade: row.grade,
    feedback: row.feedback,
    at: row.at,
    updatedAt: row.updated_at,
  };
}

export function gradeLessonAnswer(state, { answerId, grade, feedback = null, gap = null } = {}) {
  requireText(answerId, 'answerId');
  requireOneOf(grade, GRADES, 'grade');
  optionalText(feedback, 'feedback');
  optionalText(gap, 'gap');
  refresh(state);
  const row = state.db.prepare('select * from lesson_answers where id = ?').get(answerId);
  if (!row) throw new Error(`lesson answer not found: ${answerId}`);
  state.append({ type: 'lesson.completed', data: {
    status: 'graded', answerId, run: row.run, lesson: row.lesson, block: row.block,
    grade, feedback,
  } });
  if (row.card !== null) {
    const document = readLessonFile(state, row.lesson);
    state.append({ type: 'attempt.recorded', data: {
      card: row.card,
      grade,
      question: blockQuestion(document.blocks[row.block]),
      context: row.lesson,
      answer: row.answer,
      gap: gap ?? null,
      mode: 'lesson',
    } });
  }
  refresh(state);
  return lessonAnswerRow(state, answerId);
}

export function lessonRun(state, lessonId, id) {
  ensureRun(state, lessonId, id);
  const run = runRow(state, id);
  const answers = state.db.prepare(`select id, run, lesson, block, card, answer, status, grade, feedback, at, updated_at
    from lesson_answers where run = ? order by block`).all(id).map((row) => ({
    id: row.id,
    run: row.run,
    lesson: row.lesson,
    block: row.block,
    card: row.card,
    answer: row.answer,
    status: row.status,
    grade: row.grade,
    feedback: row.feedback,
    at: row.at,
    updatedAt: row.updated_at,
  }));
  return { ...run, answers };
}

export function pendingLessonAnswers(state, lessonId = null) {
  refresh(state);
  const rows = lessonId === null
    ? state.db.prepare("select * from lesson_answers where status = 'awaiting' order by at, id").all()
    : state.db.prepare("select * from lesson_answers where status = 'awaiting' and lesson = ? order by at, id").all(lessonId);
  return rows.map((row) => {
    const document = readLessonFile(state, row.lesson);
    return {
      id: row.id,
      run: row.run,
      lesson: row.lesson,
      block: row.block,
      card: row.card,
      answer: row.answer,
      component: document.blocks[row.block],
      at: row.at,
    };
  });
}

export function record(state, {
  card,
  grade,
  question = null,
  context = null,
  answer = null,
  gap = null,
  mode = 'drill',
} = {}) {
  requireText(card, 'card');
  requireOneOf(grade, GRADES, 'grade');
  requireOneOf(mode, MODES, 'mode');
  const data = {
    card,
    grade,
    question: optionalText(question, 'question'),
    context: optionalText(context, 'context'),
    answer: optionalText(answer, 'answer'),
    gap: optionalText(gap, 'gap'),
    mode,
  };
  if (!cardExists(state, card)) {
    // The database is a cache, so a card that is in the log but not yet reduced
    // is not a missing card. Rebuild once before refusing.
    refresh(state);
    if (!cardExists(state, card)) throw new Error(`card not found: ${card}`);
  }
  state.append({ type: 'attempt.recorded', data });
  refresh(state);
  return state.db.prepare('select * from card_sched where card = ?').get(card);
}

export function projects(state) {
  const date = today();
  const rows = state.db.prepare(`
    select p.id, p.name, p.remote, p.added,
      count(c.id) as cards,
      coalesce(sum(case when c.id is not null and (s.due is null or s.due <= ?) then 1 else 0 end), 0) as due
    from projects p
    left join cards c on c.project = p.id and c.retired = 0
    left join card_sched s on s.card = c.id
    group by p.id, p.name, p.remote, p.added
    order by p.id
  `).all(date);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    remote: row.remote,
    added: row.added,
    due: Number(row.due),
    cards: Number(row.cards),
  }));
}

export function topics(state, projectId = null) {
  const ids = projectId === null || projectId === undefined
    ? null
    : topicsForProject(state.db, projectId);
  const topicRows = ids === null
    ? state.db.prepare('select id, name, parent, kind from topics order by id').all()
    : ids.length === 0
      ? []
      : state.db.prepare(`select id, name, parent, kind from topics where id in (${ids.map(() => '?').join(',')}) order by id`).all(...ids);
  const date = today();
  const vouchRows = state.db.prepare('select claim from vouches').all();
  const vouched = new Set(vouchRows.map((row) => row.claim));
  return {
    topics: topicRows.map((row) => {
      const mastery = topicMastery(state.db, row.id, date);
      const gateStatus = state.db.prepare('select gate_status from topic_claims where topic = ?').get(row.id)?.gate_status ?? null;
      return {
        id: row.id,
        name: row.name,
        parent: row.parent,
        kind: row.kind,
        cards: mastery.cards,
        score: mastery.score,
        confidence: mastery.confidence,
        gateStatus,
        vouched: gateStatus !== null && gateStatus !== 'verified' && vouched.has(row.id),
      };
    }),
    edges: (ids === null
      ? state.db.prepare('select topic, requires from topic_prereqs order by topic, requires').all()
      : ids.length === 0
        ? []
        : state.db.prepare(`select topic, requires from topic_prereqs where topic in (${ids.map(() => '?').join(',')}) order by topic, requires`).all(...ids)
    ).map((edge) => ({ topic: edge.topic, requires: edge.requires })),
  };
}

function parseCardValue(value, fallback) {
  if (typeof value !== 'string') return value ?? fallback;
  return JSON.parse(value);
}

export function card(state, id) {
  const row = state.db.prepare('select * from cards where id = ?').get(id);
  if (!row) throw new Error(`card not found: ${id}`);
  const grounding = state.db.prepare(`
    select path, line, commit_sha
    from card_grounding
    where card = ?
    order by path, line
  `).all(id).map((ground) => ({
    path: ground.path,
    line: ground.line,
    commit: ground.commit_sha,
  }));
  return {
    id: row.id,
    project: row.project,
    concept: row.concept,
    ask: row.ask,
    rubric: parseCardValue(row.rubric, []),
    altitude: row.altitude,
    grounding,
    contexts: parseCardValue(row.contexts, []),
    source: parseCardValue(row.source, {}),
    added: row.added,
    retired: row.retired,
    topics: state.db.prepare('select topic from card_topics where card = ? order by topic').all(id).map((link) => link.topic),
  };
}

export function addProject(state, { project, name, remote } = {}) {
  // projects.id, projects.name and projects.added are all not null, and the
  // reducer falls back to the id for the name, so the id is what must hold.
  requireText(project, 'project');
  const data = {
    project,
    name: optionalText(name, 'name') ?? project,
    remote: optionalText(remote, 'remote'),
  };
  state.append({ type: 'project.added', data });
  refresh(state);
  return projects(state).find((item) => item.id === project);
}

export function addTopics(state, entries) {
  if (!Array.isArray(entries)) throw new Error('topics must be an array');
  // The whole batch is checked before a single event is appended, so a bad
  // fifth entry cannot leave the first four in the log.
  const validated = entries.map((entry, index) => {
    const label = `topic ${index + 1}`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`${label} must be an object`);
    const { project, ...topic } = entry;
    requireText(topic.topic, `${label} topic`);
    requireText(topic.name, `${label} name`);
    optionalText(topic.parent, `${label} parent`);
    // The reducer defaults an absent kind to technology; anything else present
    // has to be one the topics table will hold.
    if (topic.kind !== undefined && topic.kind !== null) requireOneOf(topic.kind, TOPIC_KINDS, `${label} kind`);
    if (topic.claim !== undefined && topic.claim !== null) requireText(topic.claim, `${label} claim`);
    if (topic.gateStatus !== undefined && topic.gateStatus !== null) requireOneOf(topic.gateStatus, GATE_STATUSES, `${label} gateStatus`);
    if (project !== undefined && project !== null) requireText(project, `${label} project`);
    return { topic, project: project ?? null };
  });
  for (const { topic, project } of validated) {
    state.append({ type: 'topic.added', data: topic });
    if (project !== null) {
      state.append({ type: 'topic.linked', data: { topic: topic.topic, project } });
    }
  }
  refresh(state);
  return entries.length;
}

function validateAddedCard(item, index, ids) {
  const label = `card ${index + 1}`;
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`${label} must be an object`);
  const id = item.id ?? item.card;
  if (typeof id !== 'string' || !id.trim()) throw new Error(`${label} id must be non-empty`);
  if (item.id !== undefined && item.card !== undefined && item.id !== item.card) throw new Error(`${label} id and card must match`);
  if (ids.has(id)) throw new Error(`${label} id is duplicated`);
  ids.add(id);
  for (const field of ['project', 'concept', 'ask']) {
    if (typeof item[field] !== 'string' || !item[field].trim()) throw new Error(`${label} ${field} must be non-empty`);
  }
  if (!ALTITUDES.has(item.altitude)) throw new Error(`${label} altitude must be one of map, boundary, mechanism, line`);
  if (!Array.isArray(item.rubric) || item.rubric.length === 0 || item.rubric.length > 6 || item.rubric.some((line) => typeof line !== 'string' || !line.trim())) {
    throw new Error(`${label} rubric must contain one to six strings`);
  }
  if (!Array.isArray(item.topics) || item.topics.length === 0 || item.topics.some((topic) => typeof topic !== 'string' || !topic.trim())) {
    throw new Error(`${label} topics must contain at least one topic`);
  }
  if (!Array.isArray(item.grounding) || item.grounding.some((ground) =>
    !ground || typeof ground !== 'object' || Array.isArray(ground)
    || typeof ground.path !== 'string' || !ground.path.trim()
    || !Number.isInteger(ground.line) || ground.line < 1
    || !Object.hasOwn(ground, 'commit')
    || (ground.commit !== null && (typeof ground.commit !== 'string' || !ground.commit.trim())))) {
    throw new Error(`${label} grounding must contain {path, line, commit} entries`);
  }
  // contexts and source are stored as JSON text under a json_valid CHECK. The
  // reducer defaults both, so absent is fine, but a value that JSON.stringify
  // cannot turn into a document would break the append itself.
  if (item.contexts !== undefined && item.contexts !== null
    && (!Array.isArray(item.contexts) || item.contexts.some((context) => typeof context !== 'string' || !context.trim()))) {
    throw new Error(`${label} contexts must be an array of non-empty strings`);
  }
  if (item.source !== undefined && item.source !== null
    && (typeof item.source !== 'object' || Array.isArray(item.source))) {
    throw new Error(`${label} source must be an object`);
  }
  return id;
}

export function addCards(state, cards) {
  if (!Array.isArray(cards)) throw new Error('cards must be an array');
  const ids = new Set();
  const validated = cards.map((item, index) => ({ item, id: validateAddedCard(item, index, ids) }));
  for (const { item, id } of validated) {
    const data = { ...item, card: id };
    delete data.id;
    state.append({ type: 'card.added', data });
  }
  refresh(state);
  return validated.map(({ id }) => id);
}

export function contest(state, { attempt, userGrade } = {}) {
  requireText(attempt, 'attempt');
  // The contest overwrites attempts.grade, which carries the same CHECK the
  // original grade did. An attempt id that matches nothing is not refused here:
  // replay is in timestamp order, so a contest may legitimately arrive before
  // the attempt it contests, and the reducer defers it rather than failing.
  requireOneOf(userGrade, GRADES, 'userGrade');
  state.append({ type: 'grade.contested', data: { attempt, userGrade } });
  refresh(state);
  return state.db.prepare('select * from attempts where id = ?').get(attempt);
}

export function vouch(state, input = {}) {
  const data = validateVouch(input);
  const event = state.append({ type: 'claim.vouched', data });
  refresh(state);
  return {
    claim: data.claim.id,
    status: 'vouched',
    gateStatus: data.claim.status,
    judgement: data.judgement,
    at: event.at,
  };
}

export function withdrawVouch(state, { claim, claimId } = {}) {
  const id = claim ?? claimId;
  requireText(id, 'claim');
  refresh(state);
  const existing = state.db.prepare('select claim_json from vouches where claim = ?').get(id);
  if (!existing) throw new Error(`claim is not vouched: ${id}`);
  let gateStatus = null;
  try {
    gateStatus = JSON.parse(existing.claim_json).status ?? null;
  } catch {
    // A vouch row can only have been written from JSON, but the reducer's
    // quarantine rule means an old hand-written row should not make withdrawal
    // fail after the event itself has been validated.
  }
  state.append({ type: 'claim.vouch.withdrawn', data: { claim: id } });
  refresh(state);
  return { claim: id, status: gateStatus, vouched: false };
}

export function vouchFor(state, claim) {
  const id = typeof claim === 'string' ? claim : claim?.id;
  requireText(id, 'claim');
  refresh(state);
  const row = state.db.prepare('select claim_json, judgement, vouched_at from vouches where claim = ?').get(id);
  if (!row) return null;
  const stored = JSON.parse(row.claim_json);
  return {
    claim: id,
    status: 'vouched',
    gateStatus: stored.status,
    judgement: row.judgement,
    at: row.vouched_at,
  };
}

export function gaps(state, { days = 7 } = {}) {
  const count = Math.max(0, Math.floor(Number(days)));
  const date = today();
  const since = count === 0 ? addDays(date, 1) : addDays(date, -(count - 1));
  const rows = state.db.prepare(`
    select ct.topic, a.id, a.card, a.at, a.grade, a.agent_grade, a.contested,
      a.question, a.context, a.answer, a.gap, a.mode
    from attempts a
    join card_topics ct on ct.card = a.card
    where a.grade in ('wrong', 'partial') and substr(a.at, 1, 10) >= ? and substr(a.at, 1, 10) <= ?
    order by ct.topic, a.at desc, a.id
  `).all(since, date);
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.topic)) groups.set(row.topic, []);
    groups.get(row.topic).push({
      id: row.id,
      card: row.card,
      at: row.at,
      grade: row.grade,
      agent_grade: row.agent_grade,
      contested: row.contested,
      question: row.question,
      context: row.context,
      answer: row.answer,
      gap: row.gap,
      mode: row.mode,
    });
  }
  return [...groups].map(([topic, attempts]) => ({ topic, attempts }));
}

function topicKeys(db, rows) {
  const links = db.prepare(`
    select ct.card, ct.topic, t.parent
    from card_topics ct
    left join topics t on t.id = ct.topic
    where ct.card in (${rows.map(() => '?').join(',')})
    order by ct.card, ct.topic
  `).all(...rows.map((row) => row.id));
  const keys = new Map(rows.map((row) => [row.id, new Set()]));
  for (const link of links) {
    const cardKeys = keys.get(link.card);
    cardKeys.add(`topic:${link.topic}`);
    if (link.parent !== null && link.parent !== undefined) cardKeys.add(`parent:${link.parent}`);
  }
  return keys;
}

function conflicts(left, right, keys) {
  if (left.project === right.project) return true;
  const leftKeys = keys.get(left.id);
  const rightKeys = keys.get(right.id);
  for (const key of leftKeys) if (rightKeys.has(key)) return true;
  return false;
}

// Taking the first card that does not clash with the previous one looks correct
// and is not. It drains the projects it meets first and strands the rest, so a
// queue drawn from three projects ends with the third one's cards in a run.
// Instead take, among the cards that do not clash, whichever belongs to the
// project with the most still waiting. That is the standard rearrangement
// greedy and it leaves no run unless one project holds more than half the queue,
// in which case no arrangement exists and the run is the honest outcome.
function interleave(rows, n, keys) {
  const pending = [...rows];
  const selected = [];
  const remaining = new Map();
  for (const row of pending) remaining.set(row.project, (remaining.get(row.project) ?? 0) + 1);

  while (pending.length > 0 && selected.length < n) {
    const previous = selected[selected.length - 1];
    let index = -1;
    let best = -1;
    for (let i = 0; i < pending.length; i += 1) {
      if (previous !== undefined && conflicts(previous, pending[i], keys)) continue;
      const count = remaining.get(pending[i].project) ?? 0;
      if (count > best) { best = count; index = i; }
    }
    // Every candidate clashes, so one project holds what is left. Take the next
    // in due order rather than returning a short queue.
    if (index < 0) index = 0;
    const [taken] = pending.splice(index, 1);
    remaining.set(taken.project, (remaining.get(taken.project) ?? 1) - 1);
    selected.push(taken);
  }
  return selected;
}

// What a card may carry before it has been answered: enough to ask the question
// and to say how it is scheduled, and nothing that says where the answer is.
//
// This is a list of names and not `c.*` on purpose. Selecting every column and
// then deleting the secret ones is publish-by-default: it leaked `grounding`,
// the file and line the answer lives on, to every queued card, and it would
// leak the next column anyone adds to the cards table in the same way. Naming
// the columns inverts that. A new column is private until someone puts it here.
//
// Deliberately absent: `rubric` and `grounding`, which are the answer and the
// map to the answer, and `source`, whose ref points back at the survey claim or
// the file a card was cut from. GET /api/card/:id is the one route that hands
// over the rubric and the grounding, and it is called after the candidate has
// committed to an answer. That is the exception, and it is the only one.
const QUEUE_COLUMNS = ['id', 'project', 'concept', 'ask', 'altitude', 'contexts'];

export function due(state, { n = 12, includeMature = false } = {}) {
  void includeMature;
  const limit = Math.max(0, Math.floor(Number(n)));
  if (limit === 0) return [];
  const date = today();
  const rows = state.db.prepare(`
    select ${QUEUE_COLUMNS.map((column) => `c.${column}`).join(', ')},
           s.stability, s.fsrs_difficulty, s.due, s.reps, s.lapses, s.last_at, s.last_grade
    from cards c
    left join card_sched s on s.card = c.id
    where c.retired = 0 and (s.due is null or s.due <= ?)
    order by (s.due is not null), s.due, c.id
  `).all(date);
  const keys = topicKeys(state.db, rows);
  return interleave(rows, limit, keys);
}

export function standing(state, projectId) {
  const ids = new Set(topicsForProject(state.db, projectId));
  const cardTopics = state.db.prepare(`
    select distinct ct.topic
    from card_topics ct
    join cards c on c.id = ct.card
    where c.project = ?
    order by ct.topic
  `).all(projectId);
  for (const row of cardTopics) ids.add(row.topic);
  const date = today();
  return {
    project: projectId,
    topics: [...ids].sort().map((topic) => ({
      topic,
      ...topicMastery(state.db, topic, date),
    })),
  };
}
