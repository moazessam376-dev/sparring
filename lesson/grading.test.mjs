import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeDeterministic } from '../app/src/lesson/grading.ts';

test('deterministic lesson graders accept the right answer and reject a wrong one', () => {
  const cases = [
    [{ type: 'recall', situation: 'command', answer: 'SET lock NX', accept: ['SET lock NX'] }, 'SET lock NX', 'not the command'],
    [{ type: 'lure', ask: 'NX?', options: [{ text: 'create only', correct: true }, { text: 'renew', correct: false, why: 'not renewal' }] }, '0', '1'],
    [{ type: 'order', ask: 'steps', steps: ['claim', 'work', 'release'], order: [0, 1, 2] }, '[0,1,2]', '[2,1,0]'],
    [{ type: 'blank', snippet: 'SET lock NX', blanks: [{ at: 4, answer: 'lock', distractors: ['NX'] }], file: { path: 'locks.mjs', line: 1 } }, '["lock"]', '["NX"]'],
    [{ type: 'place', diagram: 'block:1', place: [{ label: 'owner', target: 'a' }] }, '{"owner":"a"}', '{"owner":"b"}'],
  ];
  for (const [block, correct, wrong] of cases) {
    assert.equal(gradeDeterministic(block, correct), 'correct');
    assert.equal(gradeDeterministic(block, wrong), 'wrong');
  }
});
