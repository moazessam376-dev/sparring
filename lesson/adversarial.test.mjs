// Characterisation tests, written after the validator was finished and against
// its actual behaviour rather than against the spec it was built from. A test
// written from the same sentence as the code shares that sentence's blind spots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from './validate.mjs';
import { COMPONENTS } from './schema.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const example = JSON.parse(fs.readFileSync(path.join(here, 'examples/redis-locking.json'), 'utf8'));
const clone = () => JSON.parse(JSON.stringify(example));
const gradable = (b) => Boolean(COMPONENTS[b.type]?.gradable);

function rejects(mutate) {
  const doc = clone();
  mutate(doc);
  return validate(doc);
}

test('the shipped example is valid, or nothing below means anything', () => {
  assert.deepEqual(validate(example), { ok: true });
});

test('the catalogue is the fifteen components the design names', () => {
  assert.equal(Object.keys(COMPONENTS).length, 15);
  for (const type of ['prose','diagram','trace','terminal','short','code','recall','lure','order','blank','place','explainself','schema','timeline','reqres']) {
    assert.ok(COMPONENTS[type], `catalogue is missing ${type}`);
  }
});

test('a component type nobody implemented is refused', () => {
  assert.equal(rejects((d) => { d.blocks[0].type = 'nonsense'; }).ok, false);
});

test('a field nobody declared is refused, so a typo cannot pass as content', () => {
  assert.equal(rejects((d) => { d.blocks[0].unexpectedField = 1; }).ok, false);
});

test('a lesson with nothing to answer is not a lesson', () => {
  assert.equal(rejects((d) => { d.blocks = d.blocks.filter((b) => !gradable(b)); }).ok, false);
});

test('a misconception check needs exactly one right answer', () => {
  const both = rejects((d) => { d.blocks.find((b) => b.type === 'lure').options.forEach((o) => { o.correct = true; }); });
  const none = rejects((d) => { d.blocks.find((b) => b.type === 'lure').options.forEach((o) => { o.correct = false; }); });
  assert.equal(both.ok, false);
  assert.equal(none.ok, false);
});

test('a wrong option without a stated misconception is a distractor, and refused', () => {
  assert.equal(rejects((d) => {
    const lure = d.blocks.find((b) => b.type === 'lure');
    delete lure.options.find((o) => !o.correct).why;
  }).ok, false);
});

test('an ordering whose answer is not a permutation is refused', () => {
  assert.equal(rejects((d) => {
    const order = d.blocks.find((b) => b.type === 'order');
    order.order = order.steps.map(() => 0);
  }).ok, false);
});

test('grounding without a commit cannot be re-verified later, and is refused', () => {
  assert.equal(rejects((d) => {
    for (const b of d.blocks) if (b.grounding) { b.grounding.commit = ''; return; }
    throw new Error('the example lost its grounding, so this test proves nothing');
  }).ok, false);
});

test('a lesson longer than working memory is refused at both ends', () => {
  const long = rejects((d) => { while (d.blocks.length < 41) d.blocks.push(JSON.parse(JSON.stringify(d.blocks[0]))); });
  const many = rejects((d) => {
    const g = d.blocks.find(gradable);
    while (d.blocks.filter(gradable).length < 13) d.blocks.push(JSON.parse(JSON.stringify(g)));
  });
  assert.equal(long.ok, false);
  assert.equal(many.ok, false);
});

test('validation is total, because an agent fixing one error at a time costs money', () => {
  const result = rejects((d) => { d.blocks[0].type = 'nonsense'; d.blocks[1].unexpectedField = 1; d.title = 42; });
  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 3, `expected at least three errors, got ${result.errors.length}`);
});
