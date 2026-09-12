import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openState, listLessons, getLesson, startLesson, abandonLesson, completeLesson, answerLesson, refresh, addProject, addTopics, addCards } from './index.mjs';

function home() { return fs.mkdtempSync(path.join(os.tmpdir(), 'sparring-lessons-')); }
function document() { return JSON.parse(fs.readFileSync(new URL('../lesson/examples/redis-locking.json', import.meta.url), 'utf8')); }
function stored() {
  const dir = home();
  const doc = document();
  fs.mkdirSync(path.join(dir, 'lessons'));
  fs.writeFileSync(path.join(dir, 'lessons', `${doc.id}.json`), `${JSON.stringify(doc)}\n`);
  return { dir, doc, state: openState(dir) };
}
function logFile(dir) {
  const name = fs.readdirSync(path.join(dir, 'log')).find((entry) => entry.endsWith('.jsonl'));
  assert.ok(name);
  return path.join(dir, 'log', name);
}

test('lessons list with counts and get redacts every answer before commitment', () => {
  const { state, doc } = stored();
  const list = listLessons(state);
  assert.deepEqual(list[0], {
    id: doc.id,
    project: doc.project,
    title: doc.title,
    topics: doc.topics,
    blocks: 15,
    gradable: 7,
    blockCount: 15,
    gradableCount: 7,
    created: doc.created,
  });
  const safe = getLesson(state, doc.id);
  assert.equal(Object.hasOwn(safe.blocks[5], 'rubric'), false);
  assert.equal(Object.hasOwn(safe.blocks[5], 'reviewAgainst'), false);
  assert.equal(Object.hasOwn(safe.blocks[6], 'answer'), false);
  assert.equal(Object.hasOwn(safe.blocks[6], 'accept'), false);
  assert.equal(Object.hasOwn(safe.blocks[7].options[0], 'correct'), false);
  assert.equal(Object.hasOwn(safe.blocks[8], 'order'), false);
  assert.equal(Object.hasOwn(safe.blocks[9].blanks[0], 'answer'), false);
  assert.equal(Object.hasOwn(safe.blocks[9], 'file'), false);
  assert.equal(Object.hasOwn(safe.blocks[10].place[0], 'target'), false);
  assert.equal(Object.hasOwn(safe.blocks[5], 'grounding'), false);
});

test('a lesson run starts, records abandonment, completes, and replays from the log', () => {
  const { state, dir, doc } = stored();
  startLesson(state, { lesson: doc.id, run: 'run-replay' });
  abandonLesson(state, { lesson: doc.id, run: 'run-replay', stoppedAtBlock: 4 });
  completeLesson(state, { lesson: doc.id, run: 'run-replay' });
  state.db.close();
  fs.rmSync(path.join(dir, 'cache.db'), { force: true });
  fs.rmSync(path.join(dir, 'cache.db-wal'), { force: true });
  fs.rmSync(path.join(dir, 'cache.db-shm'), { force: true });
  const reopened = openState(dir);
  refresh(reopened);
  const run = reopened.db.prepare('select id, lesson, completed, stopped_at_block from lesson_runs').get();
  assert.deepEqual({ id: run.id, lesson: run.lesson, completed: run.completed, stopped_at_block: run.stopped_at_block }, {
    id: 'run-replay', lesson: doc.id, completed: 1, stopped_at_block: null,
  });
});

test('an answered lesson block records an attempt in lesson mode when it names a card', () => {
  const { state, doc } = stored();
  addProject(state, { project: doc.project, name: doc.project });
  addTopics(state, [{ topic: doc.topics[0], name: doc.topics[0], kind: 'concept', project: doc.project }]);
  addCards(state, [{ id: 'lesson-card', project: doc.project, concept: 'lock command', ask: 'What is the command?', rubric: ['the command'], altitude: 'line', topics: [doc.topics[0]], grounding: [] }]);
  startLesson(state, { lesson: doc.id, run: 'run-attempt' });
  answerLesson(state, { lesson: doc.id, run: 'run-attempt', block: 6, answer: doc.blocks[6].answer, grade: 'correct', card: 'lesson-card' });
  const attempt = state.db.prepare('select card, grade, mode from attempts').get();
  assert.deepEqual({ card: attempt.card, grade: attempt.grade, mode: attempt.mode }, { card: 'lesson-card', grade: 'correct', mode: 'lesson' });
});

test('a malformed run event is refused with the log byte-identical', () => {
  const { state, dir, doc } = stored();
  startLesson(state, { lesson: doc.id, run: 'run-safe' });
  const file = logFile(dir);
  const before = fs.readFileSync(file);
  assert.throws(() => state.append({ type: 'lesson.completed', data: { status: 'abandoned', run: 'run-safe', lesson: doc.id, stoppedAtBlock: -1 } }), /stoppedAtBlock/);
  assert.equal(fs.readFileSync(file).equals(before), true);
});
