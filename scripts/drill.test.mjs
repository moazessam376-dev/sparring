import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { spacingInterval } from './drill.mjs';

const script = path.resolve(new URL('./drill.mjs', import.meta.url).pathname);

function home() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'interview-drill-'));
}

function run(testHome, args, date = '2026-09-05T12:00:00Z') {
  const output = execFileSync(process.execPath, [script, ...args], {
    env: { ...process.env, INTERVIEW_DRILL_HOME: testHome, INTERVIEW_DRILL_NOW: date },
    encoding: 'utf8',
  });
  const lines = output.trim().split('\n');
  return JSON.parse(lines.at(-1));
}

function runFail(testHome, args) {
  try {
    run(testHome, args);
  } catch (error) {
    assert.deepEqual(JSON.parse(error.stdout.toString().trim()), { error: 'question 1 has invalid grounding' });
    return;
  }
  assert.fail('command unexpectedly succeeded');
}

function questions(count, levels = [1]) {
  return Array.from({ length: count }, (_, index) => {
    const level = Array.isArray(levels) ? levels[index % levels.length] : levels(index);
    return {
      level,
      topic: `topic${level}`,
      question: `Synthetic question ${level}-${index + 1}`,
      grounding: [`src/file${index + 1}.js:${index + 1}`],
      reference: `Synthetic reference for question ${index + 1}. It cites src/file${index + 1}.js:${index + 1}.`,
      followups: ['What changes if this assumption fails?'],
    };
  });
}

function add(testHome, project, items) {
  const file = path.join(testHome, 'input.json');
  fs.writeFileSync(file, JSON.stringify(items));
  return run(testHome, ['add', project, file]);
}

test('init is idempotent', () => {
  const testHome = home();
  const first = run(testHome, ['init', 'demo', '--repo', '/tmp']);
  add(testHome, 'demo', questions(1, [2]));
  const second = run(testHome, ['init', 'demo', '--repo', '/tmp']);
  assert.equal(first.questions, 0);
  assert.equal(second.questions, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(testHome, 'demo', 'scores.json'))), { attempts: [] });
});

test('add rejects bad grounding and assigns sequential ids', () => {
  const testHome = home();
  run(testHome, ['init', 'demo', '--repo', '/tmp']);
  fs.writeFileSync(path.join(testHome, 'bad.json'), JSON.stringify([{ ...questions(1)[0], grounding: ['bad-grounding'] }]));
  runFail(testHome, ['add', 'demo', path.join(testHome, 'bad.json')]);
  add(testHome, 'demo', questions(2, [1, 2]));
  add(testHome, 'demo', questions(1, [3]));
  const bank = JSON.parse(fs.readFileSync(path.join(testHome, 'demo', 'bank.json')));
  assert.deepEqual(bank.questions.map((question) => question.id), ['q001', 'q002', 'q003']);
});

test('add skips duplicate question text', () => {
  const testHome = home();
  run(testHome, ['init', 'demo', '--repo', '/tmp']);
  const question = questions(1)[0];
  add(testHome, 'demo', [question]);
  const result = add(testHome, 'demo', [{ ...question, question: `  ${question.question}  ` }]);
  assert.deepEqual(result, { added: 0, skipped: 1, total: 1 });
});

test('next never includes reference', () => {
  const testHome = home();
  run(testHome, ['init', 'demo', '--repo', '/tmp']);
  add(testHome, 'demo', questions(1));
  const result = run(testHome, ['next', 'demo', '--n', '1']);
  assert.equal(result.questions.length, 1);
  assert.equal('reference' in result.questions[0], false);
  assert.equal('followups' in result.questions[0], false);
});

test('spacing intervals follow wrong, partial, correct, correct, correct', () => {
  assert.equal(spacingInterval([]), 0);
  assert.equal(spacingInterval([{ grade: 'wrong' }]), 1);
  assert.equal(spacingInterval([{ grade: 'partial' }]), 2);
  assert.equal(spacingInterval([{ grade: 'correct' }]), 4);
  assert.equal(spacingInterval([{ grade: 'correct' }, { grade: 'correct' }]), 8);
  assert.equal(spacingInterval([{ grade: 'correct' }, { grade: 'correct' }, { grade: 'correct' }]), 16);
  assert.equal(spacingInterval([{ grade: 'correct' }, { grade: 'correct' }, { grade: 'partial' }]), 8);
});

test('due counting follows the corrected session math', () => {
  let testHome = home();
  run(testHome, ['init', 'demo', '--repo', '/tmp']);
  add(testHome, 'demo', questions(1));
  run(testHome, ['record', 'demo', 'q001', '--grade', 'wrong', '--answer', 'x', '--gap', 'g'], '2026-09-04T12:00:00Z');
  let status = run(testHome, ['status', 'demo'], '2026-09-05T12:00:00Z');
  assert.equal(status.due, 1);

  testHome = home();
  run(testHome, ['init', 'demo', '--repo', '/tmp']);
  add(testHome, 'demo', questions(2));
  run(testHome, ['record', 'demo', 'q001', '--grade', 'partial', '--answer', 'x', '--gap', 'g'], '2026-09-03T12:00:00Z');
  run(testHome, ['record', 'demo', 'q002', '--grade', 'correct', '--answer', 'x', '--gap', ''], '2026-09-04T12:00:00Z');
  status = run(testHome, ['status', 'demo'], '2026-09-05T12:00:00Z');
  assert.equal(status.due, 1);

  testHome = home();
  run(testHome, ['init', 'demo', '--repo', '/tmp']);
  add(testHome, 'demo', questions(1));
  run(testHome, ['record', 'demo', 'q001', '--grade', 'correct', '--answer', 'x', '--gap', ''], '2026-09-04T12:00:00Z');
  status = run(testHome, ['status', 'demo'], '2026-09-05T12:00:00Z');
  assert.equal(status.due, 0);

  testHome = home();
  run(testHome, ['init', 'demo', '--repo', '/tmp']);
  add(testHome, 'demo', questions(4));
  for (const [id, date] of [['q001', '2026-09-01T12:00:00Z'], ['q002', '2026-09-02T12:00:00Z'], ['q003', '2026-09-03T12:00:00Z'], ['q004', '2026-09-04T12:00:00Z']]) {
    run(testHome, ['record', 'demo', id, '--grade', 'correct', '--answer', 'x', '--gap', ''], date);
  }
  status = run(testHome, ['status', 'demo'], '2026-09-05T12:00:00Z');
  assert.equal(status.due, 1);
});

test('mock ignores scores and returns the requested distribution', () => {
  const testHome = home();
  run(testHome, ['init', 'demo', '--repo', '/tmp']);
  add(testHome, 'demo', [...questions(3, [1]), ...questions(5, [2]), ...questions(4, [3]), ...questions(3, [4])]);
  for (let index = 1; index <= 15; index += 1) run(testHome, ['record', 'demo', `q${String(index).padStart(3, '0')}`, '--grade', 'wrong', '--answer', 'x', '--gap', 'g']);
  const result = run(testHome, ['mock', 'demo', '--n', '15']);
  const distribution = [1, 2, 3, 4].map((level) => result.questions.filter((question) => question.level === level).length);
  assert.deepEqual(distribution, [3, 5, 4, 3]);
  assert.equal(result.questions[0].attempts, undefined);
});

test('status defensible verdict flips true only when all conditions hold', () => {
  const testHome = home();
  run(testHome, ['init', 'demo', '--repo', '/tmp']);
  add(testHome, 'demo', [...questions(10, [1]), ...questions(10, [2]), questions(1, [3])[0], questions(1, [4])[0]]);
  for (const date of ['2026-08-01T12:00:00Z', '2026-08-02T12:00:00Z']) {
    for (let index = 1; index <= 21; index += 1) {
      const level = index === 22 ? 4 : index <= 10 ? 1 : index <= 20 ? 2 : 3;
      const id = `q${String(index).padStart(3, '0')}`;
      run(testHome, ['record', 'demo', id, '--grade', level === 4 ? 'correct' : 'correct', '--answer', 'x', '--gap', ''], date);
    }
  }
  // Add the level-4 success separately; the two sessions above cover all level 1-3 questions.
  run(testHome, ['record', 'demo', 'q022', '--grade', 'correct', '--answer', 'x', '--gap', ''], '2026-08-02T12:01:00Z');
  let status = run(testHome, ['status', 'demo']);
  assert.equal(status.defensible.verdict, true);
  run(testHome, ['record', 'demo', 'q001', '--grade', 'wrong', '--answer', 'x', '--gap', 'missing'], '2026-08-03T12:00:00Z');
  status = run(testHome, ['status', 'demo']);
  assert.equal(status.defensible.verdict, false);
});
