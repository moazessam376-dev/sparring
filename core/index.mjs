import fs from 'node:fs';
import path from 'node:path';
import { addDays, today } from './clock.mjs';
import { open as openDatabase } from './db.mjs';
import { append as appendEvent, readAll } from './log.mjs';
import { rebuild } from './reduce.mjs';
import { schedule } from './scheduler.mjs';
import { update } from './elo.mjs';
import { topicsForProject } from './graph.mjs';
import { topicMastery } from './mastery.mjs';

const CREDIT = { wrong: 0, partial: 0.5, correct: 1 };

export function openState(home) {
  fs.mkdirSync(home, { recursive: true });
  const db = openDatabase(path.join(home, 'cache.db'));
  return {
    db,
    home,
    append: (body) => appendEvent(home, body),
  };
}

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
  const applied = rebuild(state.db, readAll(state.home));
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
  return applied;
}

export function record(state, {
  card,
  grade,
  question = null,
  context = null,
  answer = null,
  gap = null,
  mode = 'drill',
}) {
  state.append({
    type: 'attempt.recorded',
    data: { card, grade, question, context, answer, gap, mode },
  });
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
  return {
    topics: topicRows.map((row) => {
      const mastery = topicMastery(state.db, row.id, date);
      return {
        id: row.id,
        name: row.name,
        parent: row.parent,
        kind: row.kind,
        cards: mastery.cards,
        score: mastery.score,
        confidence: mastery.confidence,
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

export function addProject(state, { project, name, remote }) {
  state.append({ type: 'project.added', data: { project, name, remote } });
  refresh(state);
  return projects(state).find((item) => item.id === project);
}

export function addTopics(state, entries) {
  if (!Array.isArray(entries)) throw new Error('topics must be an array');
  for (const entry of entries) {
    const { project, ...topic } = entry;
    state.append({ type: 'topic.added', data: topic });
    if (project !== undefined && project !== null) {
      state.append({ type: 'topic.linked', data: { topic: entry.topic, project } });
    }
  }
  refresh(state);
  return entries.length;
}

const ALTITUDES = new Set(['map', 'boundary', 'mechanism', 'line']);

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

export function contest(state, { attempt, userGrade }) {
  state.append({ type: 'grade.contested', data: { attempt, userGrade } });
  refresh(state);
  return state.db.prepare('select * from attempts where id = ?').get(attempt);
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

export function due(state, { n = 12, includeMature = false } = {}) {
  void includeMature;
  const limit = Math.max(0, Math.floor(Number(n)));
  if (limit === 0) return [];
  const date = today();
  const rows = state.db.prepare(`
    select c.*, s.stability, s.fsrs_difficulty, s.due, s.reps, s.lapses, s.last_at, s.last_grade
    from cards c
    left join card_sched s on s.card = c.id
    where c.retired = 0 and (s.due is null or s.due <= ?)
    order by (s.due is not null), s.due, c.id
  `).all(date);
  const keys = topicKeys(state.db, rows);
  const selected = interleave(rows, limit, keys);
  return selected.map(({ rubric, ...card }) => card);
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
