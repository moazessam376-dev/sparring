import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { COMPONENTS, SCHEMA_VERSION } from './schema.mjs';
import { validate } from './validate.mjs';

const recall = (n = 1) => ({
  type: 'recall',
  situation: `Situation ${n}`,
  answer: `answer ${n}`,
  accept: [`answer ${n}`],
});

const documentWith = (blocks) => ({
  version: SCHEMA_VERSION,
  id: 'test-lesson',
  project: 'test-project',
  title: 'A test lesson',
  topics: ['testing'],
  blocks,
  created: '2026-09-12T00:00:00Z',
});

const fields = (type) => Object.keys(COMPONENTS[type].required);

function hasError(result, field, text) {
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.field === field && error.message.includes(text)), result.errors);
}

test('the exported catalogue contains the fifteen frozen component definitions', () => {
  assert.equal(Object.isFrozen(COMPONENTS), true);
  assert.deepEqual(Object.keys(COMPONENTS), [
    'prose', 'diagram', 'trace', 'terminal', 'short', 'code', 'recall', 'lure',
    'order', 'blank', 'place', 'explainself', 'schema', 'timeline', 'reqres',
  ]);
  for (const component of Object.values(COMPONENTS)) {
    assert.ok(component.required);
    assert.ok(component.optional);
    assert.equal(typeof component.gradable, 'boolean');
    assert.equal(typeof component.grading, 'string');
  }
});

test('rejects an unknown component type', () => {
  const result = validate(documentWith([recall(1), recall(2), { type: 'not-in-catalogue' }, recall(3)]));
  hasError(result, 'type', 'unknown component type');
});

test('rejects a block with a missing required field', () => {
  const block = recall();
  delete block.answer;
  const result = validate(documentWith([block, recall(2), recall(3)]));
  hasError(result, 'answer', 'required');
});

test('rejects a field with the wrong type', () => {
  const block = recall();
  block.accept = 'answer 1';
  const result = validate(documentWith([block, recall(2), recall(3)]));
  hasError(result, 'accept', 'array');
});

test('rejects an unknown extra field', () => {
  const block = recall();
  block.unexpected = true;
  const result = validate(documentWith([block, recall(2), recall(3)]));
  hasError(result, 'unexpected', 'unknown field');
});

test('rejects a lesson with no gradable block', () => {
  const result = validate(documentWith([
    { type: 'prose', heading: 'One', body: 'Text', names: [] },
    { type: 'explainself', prompt: 'Explain it.' },
    { type: 'schema', columns: ['a'], rows: [['b']], highlight: [] },
  ]));
  hasError(result, 'blocks', 'at least one gradable block');
});

test('rejects a lure with no correct answer', () => {
  const lure = {
    type: 'lure',
    ask: 'Which option is correct?',
    options: [
      { text: 'Wrong one', correct: false, why: 'It is a misconception.' },
      { text: 'Another wrong one', correct: false, why: 'It confuses two ideas.' },
    ],
  };
  const result = validate(documentWith([lure, recall(2), recall(3)]));
  hasError(result, 'options', 'exactly one');
});

test('rejects a lure with more than one correct answer', () => {
  const lure = {
    type: 'lure',
    ask: 'Which options are correct?',
    options: [
      { text: 'Correct one', correct: true },
      { text: 'Also marked correct', correct: true },
    ],
  };
  const result = validate(documentWith([lure, recall(2), recall(3)]));
  hasError(result, 'options', 'exactly one');
});

test('requires a misconception explanation on every wrong lure option', () => {
  const lure = {
    type: 'lure',
    ask: 'Which option is correct?',
    options: [
      { text: 'Correct one', correct: true },
      { text: 'Wrong without an explanation', correct: false },
    ],
  };
  const result = validate(documentWith([lure, recall(2), recall(3)]));
  hasError(result, 'options[1].why', 'required');
});

test('rejects an order that is not a permutation of its step indices', () => {
  const block = { type: 'order', ask: 'Order these.', steps: ['a', 'b', 'c'], order: [0, 0, 3] };
  const result = validate(documentWith([block, recall(2), recall(3)]));
  hasError(result, 'order', 'permutation');
});

test('rejects a blank position that is outside the snippet', () => {
  const block = {
    type: 'blank',
    snippet: 'SET key',
    blanks: [{ at: 99, answer: 'key', distractors: ['SET']}],
    file: { path: 'src/locks.mjs', line: 1 },
  };
  const result = validate(documentWith([block, recall(2), recall(3)]));
  hasError(result, 'blanks[0].at', 'position in the snippet');
});

test('rejects a grounding reference without the required shape', () => {
  const block = {
    type: 'short',
    ask: 'Why?',
    rubric: ['Because.'],
    grounding: { path: 'src/locks.mjs', line: 1 },
  };
  const result = validate(documentWith([block, recall(2), recall(3)]));
  hasError(result, 'grounding.commit', 'required');
});

test('rejects a grounding reference with an empty commit', () => {
  const block = {
    type: 'short',
    ask: 'Why?',
    rubric: ['Because.'],
    grounding: { path: 'src/locks.mjs', line: 1, commit: '' },
  };
  const result = validate(documentWith([block, recall(2), recall(3)]));
  hasError(result, 'grounding.commit', 'non-empty');
});

test('rejects a document with more than forty blocks', () => {
  const result = validate(documentWith(Array.from({ length: 41 }, (_, index) => recall(index))));
  hasError(result, 'blocks', '40 blocks');
});

test('rejects a document with fewer than three gradable blocks', () => {
  const result = validate(documentWith([recall(1), recall(2)]));
  hasError(result, 'blocks', 'at least 3 gradable blocks');
});

test('rejects a document with more than twelve gradable blocks', () => {
  const result = validate(documentWith(Array.from({ length: 13 }, (_, index) => recall(index))));
  hasError(result, 'blocks', 'no more than 12 gradable blocks');
});

test('reports all independent errors in one validation run', () => {
  const broken = documentWith([
    { type: 'not-real' },
    { type: 'recall', situation: 42, accept: 'not-an-array' },
    {
      type: 'lure',
      ask: 'Pick one.',
      options: [{ text: 'Wrong', correct: false }],
    },
  ]);
  const result = validate(broken);
  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 5, result.errors);
  assert.ok(result.errors.some((error) => error.field === 'type'));
  assert.ok(result.errors.some((error) => error.field === 'situation'));
  assert.ok(result.errors.some((error) => error.field === 'accept'));
  assert.ok(result.errors.some((error) => error.field === 'options'));
  assert.ok(result.errors.some((error) => error.field === 'options[0].why'));
});

test('a new component can be added at runtime without changing the validator', () => {
  const extended = {
    ...COMPONENTS,
    custom: {
      required: { prompt: 'string', tags: 'string[]' },
      optional: {},
      gradable: true,
      grading: 'exact',
    },
  };
  const result = validate(documentWith([
    { type: 'custom', prompt: 'One', tags: ['a'] },
    { type: 'custom', prompt: 'Two', tags: ['b'] },
    { type: 'custom', prompt: 'Three', tags: ['c'] },
  ]), extended);
  assert.deepEqual(result, { ok: true });
});

test('the complete Redis locking example validates cleanly', () => {
  const example = JSON.parse(fs.readFileSync(new URL('./examples/redis-locking.json', import.meta.url), 'utf8'));
  assert.deepEqual(validate(example), { ok: true });
});

test('the catalogue fields remain the published field names', () => {
  assert.deepEqual(fields('prose'), ['heading', 'body', 'names']);
  assert.deepEqual(fields('diagram'), ['nodes', 'edges', 'caption']);
  assert.deepEqual(fields('trace'), ['steps', 'commit']);
  assert.deepEqual(fields('terminal'), ['lines', 'cwd']);
  assert.deepEqual(fields('short'), ['ask', 'rubric', 'grounding']);
  assert.deepEqual(fields('code'), ['ask', 'languages', 'starter', 'reviewAgainst']);
  assert.deepEqual(fields('recall'), ['situation', 'answer', 'accept']);
  assert.deepEqual(fields('lure'), ['ask', 'options']);
  assert.deepEqual(fields('order'), ['ask', 'steps', 'order']);
  assert.deepEqual(fields('blank'), ['snippet', 'blanks', 'file']);
  assert.deepEqual(fields('place'), ['diagram', 'place']);
  assert.deepEqual(fields('explainself'), ['prompt']);
  assert.deepEqual(fields('schema'), ['columns', 'rows', 'highlight']);
  assert.deepEqual(fields('timeline'), ['events', 'unit']);
  assert.deepEqual(fields('reqres'), ['request', 'response', 'focus']);
});
