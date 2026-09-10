import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { addDays, applySchedule, initialSchedule, isRetiredFromDaily, replaySchedule, scheduleState } from './drill.mjs';

const script = path.resolve(new URL('./drill.mjs', import.meta.url).pathname);
const NOW = '2026-09-05T12:00:00Z';

function home() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sparring-'));
}

function run(testHome, args, date = NOW) {
  const output = execFileSync(process.execPath, [script, ...args], {
    env: { ...process.env, SPARRING_HOME: testHome, SPARRING_NOW: date },
    encoding: 'utf8',
  });
  return JSON.parse(output.trim().split('\n').at(-1));
}

function runFail(testHome, args, message = 'bank is v1; run migrate') {
  try {
    run(testHome, args);
  } catch (error) {
    assert.deepEqual(JSON.parse(error.stdout.toString().trim()), { error: message });
    return;
  }
  assert.fail('command unexpectedly succeeded');
}

function cards(count, levels = [1], contexts = ['demo', 'library', 'hospital'], altitudes = ['mechanism']) {
  return Array.from({ length: count }, (_, index) => {
    const level = Array.isArray(levels) ? levels[index % levels.length] : levels(index);
    const altitude = Array.isArray(altitudes) ? altitudes[index % altitudes.length] : altitudes(index);
    return {
      level,
      topic: `topic${level}`,
      altitude,
      concept: `Synthetic concept ${level}-${index + 1}`,
      ask: `Explain synthetic concept ${level}-${index + 1} in the suggested context.`,
      rubric: [`The answer names the mechanism for concept ${index + 1}.`, 'The answer explains why the mechanism is correct.'],
      grounding: [`src/file${index + 1}.js:${index + 1}`],
      contexts,
      source: { type: 'lesson', ref: `synthetic-${index + 1}` },
    };
  });
}

function add(testHome, project, items) {
  const file = path.join(testHome, 'input.json');
  fs.writeFileSync(file, JSON.stringify(items));
  return run(testHome, ['add', project, file]);
}

function record(testHome, id, grade, date = NOW, question = `Fresh wording for ${id}`, context = 'demo', gap = grade === 'correct' ? '' : 'missing mechanism') {
  return run(testHome, ['record', 'demo', id, '--grade', grade, '--answer', 'candidate answer', '--gap', gap, '--question', question, '--context', context], date);
}

test('init is idempotent and writes a v2 bank', () => {
  const testHome = home();
  const first = run(testHome, ['init', 'demo', '--repo', '/tmp']);
  add(testHome, 'demo', cards(1, [2]));
  const second = run(testHome, ['init', 'demo', '--repo', '/tmp']);
  const bank = JSON.parse(fs.readFileSync(path.join(testHome, 'demo', 'bank.json')));
  assert.equal(first.cards, 0);
  assert.equal(second.cards, 1);
  assert.equal(bank.version, 2);
  assert.equal(Array.isArray(bank.cards), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(testHome, 'demo', 'scores.json'))), { attempts: [] });
});

test('add validates contexts, skips duplicate concepts, and assigns card ids', () => {
  const testHome = home();
  run(testHome, ['init', 'demo', '--repo', '/tmp']);
  const bad = { ...cards(1)[0], contexts: ['mars'] };
  fs.writeFileSync(path.join(testHome, 'bad.json'), JSON.stringify([bad]));
  runFail(testHome, ['add', 'demo', path.join(testHome, 'bad.json')], 'card 1 contexts must be a non-empty, duplicate-free subset of demo, library, hospital, isp-support, ecommerce, school, bank, logistics, generic');
  add(testHome, 'demo', cards(2, [1, 2]));
  const duplicate = { ...cards(1)[0], concept: '  Synthetic concept 1-1  ' };
  const result = add(testHome, 'demo', [duplicate, cards(1, [3])[0]]);
  const bank = JSON.parse(fs.readFileSync(path.join(testHome, 'demo', 'bank.json')));
  assert.deepEqual(result, { added: 1, skipped: 1, total: 3 });
  assert.deepEqual(bank.cards.map((card) => card.id), ['c001', 'c002', 'c003']);
  assert.deepEqual(bank.cards[0].sched, { interval: 0, ease: 2.5, due: '2026-09-05', reps: 0, lapses: 0, lastGrade: null, streak: 0 });
});

test('add rejects another project name as a context', () => {
  const testHome = home();
  run(testHome, ['init', 'demo', '--repo', '/tmp']);
  const input = path.join(testHome, 'other-project.json');
  fs.writeFileSync(input, JSON.stringify([{ ...cards(1)[0], contexts: ['demo-two', 'library'] }]));
  runFail(testHome, ['add', 'demo', input], 'card 1 contexts must be a non-empty, duplicate-free subset of demo, library, hospital, isp-support, ecommerce, school, bank, logistics, generic');
});

test('add rejects cards without the bank project context', () => {
  const testHome = home();
  run(testHome, ['init', 'demo', '--repo', '/tmp']);
  const input = path.join(testHome, 'missing-project.json');
  fs.writeFileSync(input, JSON.stringify([{ ...cards(1)[0], contexts: ['library', 'hospital'] }]));
  runFail(testHome, ['add', 'demo', input], 'card 1 contexts must include the bank project "demo" and at least one transfer world; allowed contexts: demo, library, hospital, isp-support, ecommerce, school, bank, logistics, generic');
});

test('add requires a valid altitude on every card', () => {
  const testHome = home();
  run(testHome, ['init', 'demo', '--repo', '/tmp']);
  const missing = { ...cards(1)[0] };
  delete missing.altitude;
  const missingFile = path.join(testHome, 'missing-altitude.json');
  fs.writeFileSync(missingFile, JSON.stringify([missing, cards(1)[0]]));
  runFail(testHome, ['add', 'demo', missingFile], 'card 1 altitude must be one of map, boundary, mechanism, line');
  const invalid = { ...cards(1)[0], altitude: 'summit' };
  const invalidFile = path.join(testHome, 'invalid-altitude.json');
  fs.writeFileSync(invalidFile, JSON.stringify([invalid]));
  runFail(testHome, ['add', 'demo', invalidFile], 'card 1 altitude must be one of map, boundary, mechanism, line');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(testHome, 'demo', 'bank.json'))).cards, []);
});

test('v1 commands fail, while status warns and migrate converts with backups', () => {
  const testHome = home();
  const dir = path.join(testHome, 'demo');
  fs.mkdirSync(path.join(dir, 'sessions'), { recursive: true });
  const bank = {
    project: 'demo',
    repo: '/tmp',
    generated: '2026-09-01',
    questions: [{
      id: 'q001',
      level: 2,
      topic: 'auth',
      question: 'Why does the server verify the token?',
      grounding: ['src/auth.js:4-8'],
      reference: 'Verification proves the signed claims were not changed.',
      followups: ['What if the token is only decoded?'],
      added: '2026-09-01',
    }],
  };
  const scores = { attempts: [
    { id: 'q001', date: '2026-09-03T12:00:00Z', session: '2026-09-03', grade: 'correct', answer: 'a', gap: '', mode: 'drill' },
    { id: 'q001', date: '2026-09-04T12:00:00Z', session: '2026-09-04', grade: 'correct', answer: 'a', gap: '', mode: 'drill' },
  ] };
  fs.writeFileSync(path.join(dir, 'bank.json'), JSON.stringify(bank));
  fs.writeFileSync(path.join(dir, 'scores.json'), JSON.stringify(scores));
  runFail(testHome, ['next', 'demo']);
  const status = run(testHome, ['status', 'demo']);
  assert.equal(status.version, 1);
  assert.equal(status.warning, 'bank is v1; run migrate');
  const migrated = run(testHome, ['migrate', 'demo']);
  assert.deepEqual(migrated, { project: 'demo', migrated: true, cards: 1, attempts: 2 });
  assert.equal(fs.existsSync(path.join(dir, 'bank.v1.json')), true);
  assert.equal(fs.existsSync(path.join(dir, 'scores.v1.json')), true);
  const v2Bank = JSON.parse(fs.readFileSync(path.join(dir, 'bank.json')));
  const v2Scores = JSON.parse(fs.readFileSync(path.join(dir, 'scores.json')));
  assert.equal(v2Bank.version, 2);
  assert.equal(v2Bank.cards[0].id, 'q001');
  assert.deepEqual(v2Bank.cards[0].rubric, ['Verification proves the signed claims were not changed.', 'Follow-up: What if the token is only decoded?']);
  assert.deepEqual(v2Bank.cards[0].contexts, ['demo', 'generic']);
  assert.equal(v2Bank.cards[0].sched.interval, 12);
  assert.equal(v2Bank.cards[0].needsRewrite, true);
  assert.equal(v2Bank.cards[0].altitude, 'mechanism');
  assert.equal(v2Scores.attempts[0].cardId, 'q001');
  assert.equal(v2Scores.attempts[0].question, 'Why does the server verify the token?');
  assert.equal(v2Scores.attempts[0].context, 'demo');
  assert.deepEqual(run(testHome, ['record', 'demo', 'q001', '--grade', 'correct', '--answer', 'a', '--gap', '', '--question', 'A fresh migrated-bank question', '--context', 'demo']), {
    recorded: true,
    id: 'q001',
    cardId: 'q001',
    session: '2026-09-05',
    grade: 'correct',
    mode: 'drill',
  });
  const before = fs.readFileSync(path.join(dir, 'bank.json'), 'utf8');
  assert.deepEqual(run(testHome, ['migrate', 'demo']), { project: 'demo', migrated: false, alreadyV2: true, unchanged: true, cards: 1, upgraded: 0 });
  assert.equal(fs.readFileSync(path.join(dir, 'bank.json'), 'utf8'), before);
});

test('migrate upgrades missing v2 altitudes and is idempotent', () => {
  const testHome = home();
  run(testHome, ['init', 'demo', '--repo', '/tmp']);
  add(testHome, 'demo', cards(3, [1, 2, 3], ['demo', 'library'], ['map', 'boundary', 'line']));
  const bankFile = path.join(testHome, 'demo', 'bank.json');
  const bank = JSON.parse(fs.readFileSync(bankFile));
  delete bank.cards[0].altitude;
  delete bank.cards[1].altitude;
  delete bank.cards[0].sched.streak;
  delete bank.cards[1].sched.streak;
  fs.writeFileSync(bankFile, JSON.stringify(bank));
  const upgraded = run(testHome, ['migrate', 'demo']);
  assert.equal(upgraded.upgraded, 2);
  assert.equal(upgraded.unchanged, false);
  const upgradedBank = JSON.parse(fs.readFileSync(bankFile));
  assert.deepEqual(upgradedBank.cards.map((card) => card.altitude), ['mechanism', 'mechanism', 'line']);
  assert.equal(upgradedBank.cards.every((card) => card.sched.streak === 0), true);
  const before = fs.readFileSync(bankFile, 'utf8');
  const second = run(testHome, ['migrate', 'demo']);
  assert.deepEqual(second, { project: 'demo', migrated: false, alreadyV2: true, unchanged: true, cards: 3, upgraded: 0 });
  assert.equal(fs.readFileSync(bankFile, 'utf8'), before);
});

test('schedule transitions follow the v2 table and card states', () => {
  let schedule = initialSchedule('2026-09-05');
  assert.deepEqual(schedule, { interval: 0, ease: 2.5, due: '2026-09-05', reps: 0, lapses: 0, lastGrade: null, streak: 0 });
  assert.equal(scheduleState(schedule), 'new');
  schedule = applySchedule(schedule, 'partial', '2026-09-05');
  assert.deepEqual(schedule, { interval: 2, ease: 2.5, due: '2026-09-07', reps: 0, lapses: 0, lastGrade: 'partial', streak: 0 });
  schedule = applySchedule(schedule, 'correct', '2026-09-07');
  assert.deepEqual(schedule, { interval: 4, ease: 2.55, due: '2026-09-11', reps: 1, lapses: 0, lastGrade: 'correct', streak: 1 });
  schedule = applySchedule(schedule, 'correct', '2026-09-11');
  assert.deepEqual(schedule, { interval: 12, ease: 2.6, due: '2026-09-23', reps: 2, lapses: 0, lastGrade: 'correct', streak: 2 });
  schedule = applySchedule(schedule, 'correct', '2026-09-23');
  assert.deepEqual(schedule, { interval: 21, ease: 2.65, due: '2026-10-14', reps: 3, lapses: 0, lastGrade: 'correct', streak: 3 });
  assert.equal(scheduleState(schedule), 'mature');
  assert.equal(isRetiredFromDaily(schedule), true);
  schedule = applySchedule(schedule, 'correct', '2026-10-14');
  assert.deepEqual(schedule, { interval: 57, ease: 2.7, due: '2026-12-10', reps: 4, lapses: 0, lastGrade: 'correct', streak: 4 });
  schedule = applySchedule(schedule, 'wrong', '2026-12-10');
  assert.deepEqual(schedule, { interval: 1, ease: 2.5, due: '2026-12-11', reps: 0, lapses: 1, lastGrade: 'wrong', streak: 0 });
  schedule = applySchedule(schedule, 'correct', '2026-12-11');
  assert.deepEqual(schedule, { interval: 4, ease: 2.55, due: '2026-12-15', reps: 1, lapses: 1, lastGrade: 'correct', streak: 1 });
  schedule = applySchedule(schedule, 'partial', '2026-12-15');
  assert.deepEqual(schedule, { interval: 4, ease: 2.55, due: '2026-12-19', reps: 1, lapses: 1, lastGrade: 'partial', streak: 0 });
  const nearCap = { interval: 40, ease: 2.95, reps: 5, lapses: 0, streak: 4 };
  const capped = applySchedule(nearCap, 'correct', '2026-01-01');
  assert.equal(capped.streak, 5);
  assert.equal(capped.ease, 3.0);
  assert.equal(capped.interval, 90);
  assert.equal(addDays('2026-09-30', 3), '2026-10-03');
  const replayed = replaySchedule([{ grade: 'correct', session: '2026-09-04' }, { grade: 'correct', session: '2026-09-05' }], '2026-09-05');
  assert.equal(replayed.interval, 12);
  assert.equal(replayed.streak, 2);
});

test('isRetiredFromDaily requires three correct recalls and a 21-day interval', () => {
  assert.equal(isRetiredFromDaily({ streak: 3, interval: 21 }), true);
  assert.equal(isRetiredFromDaily({ streak: 2, interval: 21 }), false);
  assert.equal(isRetiredFromDaily({ streak: 3, interval: 20 }), false);
  assert.equal(isRetiredFromDaily({ interval: 90 }), false);
});

test('next excludes retired-from-daily cards unless include-mature is passed', () => {
  const testHome = home();
  run(testHome, ['init', 'demo', '--repo', '/tmp']);
  add(testHome, 'demo', cards(2));
  const bankFile = path.join(testHome, 'demo', 'bank.json');
  const bank = JSON.parse(fs.readFileSync(bankFile));
  bank.cards[0].sched = { interval: 1, ease: 2.5, due: '2026-09-05', reps: 1, lapses: 0, lastGrade: 'correct', streak: 1 };
  bank.cards[1].sched = { interval: 21, ease: 2.5, due: '2026-09-05', reps: 3, lapses: 0, lastGrade: 'correct', streak: 3 };
  fs.writeFileSync(bankFile, JSON.stringify(bank));
  const daily = run(testHome, ['next', 'demo', '--n', '2']);
  assert.equal(daily.cards.some((card) => card.id === 'c002'), false);
  const withMature = run(testHome, ['next', 'demo', '--n', '2', '--include-mature']);
  assert.equal(withMature.cards.some((card) => card.id === 'c002'), true);
});

test('next interleaves due cards by topic deterministically', () => {
  const testHome = home();
  run(testHome, ['init', 'demo', '--repo', '/tmp']);
  add(testHome, 'demo', cards(6, [1]).map((card, index) => ({
    ...card,
    topic: index < 3 ? 'alpha' : index < 5 ? 'beta' : 'gamma',
    concept: `Topic interleave ${index + 1}`,
  })));
  const bankFile = path.join(testHome, 'demo', 'bank.json');
  const bank = JSON.parse(fs.readFileSync(bankFile));
  for (const card of bank.cards) card.sched = { interval: 1, ease: 2.5, due: '2026-09-05', reps: 1, lapses: 0, lastGrade: 'correct', streak: 1 };
  fs.writeFileSync(bankFile, JSON.stringify(bank));
  const result = run(testHome, ['next', 'demo', '--n', '6']);
  assert.deepEqual(result.cards.map((card) => card.id), ['c001', 'c004', 'c002', 'c005', 'c003', 'c006']);
});

test('next all interleaves queues by project deterministically', () => {
  const testHome = home();
  for (const [project, prefix] of [['alpha', 'a'], ['beta', 'b']]) {
    run(testHome, ['init', project, '--repo', '/tmp']);
    add(testHome, project, cards(3, [1], [project, 'library']).map((card, index) => ({
      ...card,
      concept: `${project} concept ${index + 1}`,
    })));
    const bankFile = path.join(testHome, project, 'bank.json');
    const bank = JSON.parse(fs.readFileSync(bankFile));
    bank.cards.forEach((card, index) => {
      card.id = `${prefix}${String(index + 1).padStart(3, '0')}`;
      card.sched = { interval: 1, ease: 2.5, due: '2026-09-05', reps: 1, lapses: 0, lastGrade: 'correct', streak: 1 };
    });
    fs.writeFileSync(bankFile, JSON.stringify(bank));
  }
  const result = run(testHome, ['next', '--n', '6', '--all']);
  assert.equal(result.cards.length, 6);
  assert.equal(result.cards.every((card) => Boolean(card.project)), true);
  assert.deepEqual(result.cards.map((card) => card.project), ['alpha', 'beta', 'alpha', 'beta', 'alpha', 'beta']);
  assert.deepEqual(result.cards.map((card) => card.id), ['a001', 'b001', 'a002', 'b002', 'a003', 'b003']);
});

test('next hides rubric and grounding, orders overdue cards, caps new cards, and rotates contexts', () => {
  const testHome = home();
  run(testHome, ['init', 'demo', '--repo', '/tmp']);
  add(testHome, 'demo', [
    ...cards(4, [1, 2, 3, 4]),
    { ...cards(1, [2])[0], concept: 'new extra', topic: 'extra' },
  ]);
  record(testHome, 'c001', 'wrong', '2026-09-01T12:00:00Z');
  record(testHome, 'c002', 'wrong', '2026-09-04T12:00:00Z');
  record(testHome, 'c003', 'partial', '2026-09-02T12:00:00Z');
  const result = run(testHome, ['next', 'demo', '--n', '4', '--new', '1']);
  assert.equal(result.cards.length, 4);
  assert.deepEqual(result.cards.slice(0, 3).map((card) => card.id), ['c001', 'c003', 'c002']);
  assert.equal(result.cards.filter((card) => card.state === 'new').length, 1);
  assert.equal('rubric' in result.cards[0], false);
  assert.equal('grounding' in result.cards[0], false);
  assert.deepEqual(result.cards[0].recentQuestions, ['Fresh wording for c001']);
  assert.equal(result.cards[0].suggestedContext, 'library');
  record(testHome, 'c001', 'partial', '2026-09-03T13:00:00Z', 'Second wording for c001', 'library');
  const rotated = run(testHome, ['next', 'demo', '--n', '1', '--topic', 'topic1']);
  assert.equal(rotated.cards[0].id, 'c001');
  assert.equal(rotated.cards[0].suggestedContext, 'hospital');
  assert.deepEqual(rotated.cards[0].recentQuestions, ['Second wording for c001', 'Fresh wording for c001']);
});

test('suggested context prefers a transfer world after a correct home-context attempt', () => {
  const testHome = home();
  run(testHome, ['init', 'demo', '--repo', '/tmp']);
  add(testHome, 'demo', cards(1));
  record(testHome, 'c001', 'correct', NOW, 'Home-context question', 'demo');
  const result = run(testHome, ['next', 'demo', '--n', '1'], '2026-09-09T12:00:00Z');
  assert.equal(result.cards[0].suggestedContext, 'library');
  assert.notEqual(result.cards[0].suggestedContext, 'demo');
});

test('remove retires cards without deleting attempts or listing them', () => {
  const testHome = home();
  run(testHome, ['init', 'demo', '--repo', '/tmp']);
  add(testHome, 'demo', cards(3));
  record(testHome, 'c001', 'wrong', '2026-09-01T12:00:00Z');
  assert.deepEqual(run(testHome, ['remove', 'demo', 'c001']), { removed: true, id: 'c001', alreadyRetired: false });
  assert.deepEqual(run(testHome, ['remove', 'demo', 'c001']), { removed: true, id: 'c001', alreadyRetired: true });
  const next = run(testHome, ['next', 'demo', '--n', '3', '--new', '3']);
  assert.equal(next.cards.some((card) => card.id === 'c001'), false);
  const mock = run(testHome, ['mock', 'demo', '--n', '3']);
  assert.equal(mock.cards.some((card) => card.id === 'c001'), false);
  const scores = JSON.parse(fs.readFileSync(path.join(testHome, 'demo', 'scores.json')));
  assert.equal(scores.attempts.length, 1);
  assert.equal(scores.attempts[0].cardId, 'c001');
  const bank = JSON.parse(fs.readFileSync(path.join(testHome, 'demo', 'bank.json')));
  assert.equal(bank.cards[0].retired, true);
  const status = run(testHome, ['status', 'demo']);
  assert.equal(status.bankSize, 2);
  assert.equal(status.retired, 1);
  assert.equal(status.altitudes.find((item) => item.altitude === 'mechanism').cards, 2);
});

test('next weights new cards by altitude and filters due and new cards', () => {
  const testHome = home();
  run(testHome, ['init', 'demo', '--repo', '/tmp']);
  add(testHome, 'demo', cards(40, [1], ['demo', 'library'], ['map', 'boundary', 'mechanism', 'line']).map((card, index) => ({
    ...card,
    concept: `Altitude concept ${index + 1}`,
  })));
  const weighted = run(testHome, ['next', 'demo', '--n', '10', '--new', '10']);
  assert.deepEqual(['map', 'boundary', 'mechanism', 'line'].map((altitude) => weighted.cards.filter((card) => card.altitude === altitude).length), [3, 3, 3, 1]);
  record(testHome, 'c004', 'wrong', '2026-09-01T12:00:00Z');
  const lineOnly = run(testHome, ['next', 'demo', '--n', '5', '--new', '4', '--altitude', 'line']);
  assert.equal(lineOnly.cards.length, 5);
  assert.equal(lineOnly.cards.every((card) => card.altitude === 'line'), true);
  assert.equal(lineOnly.cards[0].id, 'c004');
  assert.equal(lineOnly.cards[0].state, 'learning');
});

test('record stores v2 attempt fields and answer returns only recent wording plus hidden material', () => {
  const testHome = home();
  run(testHome, ['init', 'demo', '--repo', '/tmp']);
  add(testHome, 'demo', cards(1));
  record(testHome, 'c001', 'correct', NOW, 'A fresh transfer question', 'library');
  const scores = JSON.parse(fs.readFileSync(path.join(testHome, 'demo', 'scores.json')));
  assert.equal(scores.attempts[0].cardId, 'c001');
  assert.equal(scores.attempts[0].question, 'A fresh transfer question');
  assert.equal(scores.attempts[0].context, 'library');
  assert.equal(scores.attempts[0].mode, 'drill');
  const answer = run(testHome, ['answer', 'demo', 'c001']);
  assert.deepEqual(answer.recentAttempts, ['A fresh transfer question']);
  assert.equal(Array.isArray(answer.rubric), true);
  assert.equal(Array.isArray(answer.grounding), true);
});

test('refine returns legacy cards and update preserves scheduling', () => {
  const testHome = home();
  run(testHome, ['init', 'demo', '--repo', '/tmp']);
  add(testHome, 'demo', [{ ...cards(1)[0], needsRewrite: true }]);
  record(testHome, 'c001', 'wrong', NOW, 'Wording before rewrite', 'demo');
  const before = JSON.parse(fs.readFileSync(path.join(testHome, 'demo', 'bank.json'))).cards[0].sched;
  const refine = run(testHome, ['refine', 'demo']);
  assert.equal(refine.cards.length, 1);
  assert.equal(Array.isArray(refine.cards[0].rubric), true);
  const updateFile = path.join(testHome, 'update.json');
  fs.writeFileSync(updateFile, JSON.stringify({
    level: 2,
    topic: 'security',
    concept: 'Tenant fence',
    ask: 'Where does the tenant fence live in a privileged function?',
    rubric: ['The function runs with elevated privileges.', 'The body applies the tenant predicate.'],
    contexts: ['demo', 'hospital', 'school'],
  }));
  assert.deepEqual(run(testHome, ['update', 'demo', 'c001', '--file', updateFile]), { updated: true, id: 'c001' });
  const card = JSON.parse(fs.readFileSync(path.join(testHome, 'demo', 'bank.json'))).cards[0];
  assert.equal(card.concept, 'Tenant fence');
  assert.equal(card.altitude, 'mechanism');
  assert.equal(card.needsRewrite, false);
  assert.deepEqual(card.sched, before);
});

test('gaps groups wrong and partial attempts by card and transfer mode is accepted', () => {
  const testHome = home();
  run(testHome, ['init', 'demo', '--repo', '/tmp']);
  add(testHome, 'demo', cards(2));
  record(testHome, 'c001', 'wrong', '2026-09-03T12:00:00Z', 'Scenario one', 'demo', 'missing tenant check');
  record(testHome, 'c001', 'partial', '2026-09-05T12:00:00Z', 'Scenario two', 'hospital', 'vague boundary');
  record(testHome, 'c001', 'correct', '2026-09-05T12:01:00Z', 'Transfer question', 'library', '', 'transfer');
  record(testHome, 'c002', 'wrong', '2026-08-01T12:00:00Z', 'Old wording', 'demo', 'old gap');
  const result = run(testHome, ['gaps', 'demo', '--days', '7']);
  assert.equal(result.gaps.length, 1);
  assert.deepEqual(result.gaps[0], { id: 'c001', concept: 'Synthetic concept 1-1', topic: 'topic1', level: 1, grades: ['wrong', 'partial'], gaps: ['missing tenant check', 'vague boundary'] });
});

test('mock ignores scheduling and returns a level-distributed card set without answers', () => {
  const testHome = home();
  run(testHome, ['init', 'demo', '--repo', '/tmp']);
  add(testHome, 'demo', [...cards(3, [1]), ...cards(5, [2]), ...cards(4, [3]), ...cards(3, [4])].map((card, index) => ({ ...card, concept: `${card.concept}-${index}` })));
  for (let index = 1; index <= 15; index += 1) record(testHome, `c${String(index).padStart(3, '0')}`, 'wrong');
  const result = run(testHome, ['mock', 'demo', '--n', '15']);
  const distribution = [1, 2, 3, 4].map((level) => result.cards.filter((card) => card.level === level).length);
  assert.deepEqual(distribution, [3, 5, 4, 3]);
  assert.equal(result.cards[0].attempts, undefined);
  assert.equal(result.cards[0].lastGrade, undefined);
  assert.equal('rubric' in result.cards[0], false);
  assert.equal('grounding' in result.cards[0], false);
});

test('status reports v2 states and the defensible verdict', () => {
  const testHome = home();
  run(testHome, ['init', 'demo', '--repo', '/tmp']);
  add(testHome, 'demo', [...cards(3, [1, 2, 3], ['demo', 'library', 'hospital'], ['mechanism', 'map', 'boundary']), ...cards(1, [4], ['demo', 'library', 'hospital'], ['line'])].map((card, index) => ({ ...card, concept: `status-${index}` })));
  record(testHome, 'c001', 'correct', '2026-09-01T12:00:00Z');
  record(testHome, 'c001', 'correct', '2026-09-02T12:00:00Z');
  record(testHome, 'c001', 'correct', '2026-09-03T12:00:00Z');
  record(testHome, 'c001', 'correct', '2026-09-04T12:00:00Z');
  record(testHome, 'c002', 'partial', NOW);
  let status = run(testHome, ['status', 'demo']);
  assert.deepEqual(status.states, { new: 2, learning: 1, mature: 1 });
  assert.equal(status.dueToday, 2);
  assert.equal(status.overdue, 0);
  assert.equal(status.defensible.verdict, false);

  const extra = cards(8, [1]).map((card, index) => ({ ...card, concept: `extra-${index}`, topic: 'foundation' }));
  add(testHome, 'demo', extra);
  for (let index = 0; index < 12; index += 1) {
    const id = `c${String(index + 1).padStart(3, '0')}`;
    record(testHome, id, 'correct', '2026-08-01T12:00:00Z');
    record(testHome, id, 'correct', '2026-08-02T12:00:00Z');
  }
  record(testHome, 'c004', 'correct', NOW);
  status = run(testHome, ['status', 'demo']);
  assert.equal(status.defensible.verdict, true);
  assert.equal(status.defensible.newCards < status.bankSize * 0.2, true);
  assert.equal(status.next7Days.length, 7);
  assert.equal(Array.isArray(status.weakestTopics), true);
});

test('status reports altitude counts and the map-boundary defensible condition', () => {
  const testHome = home();
  run(testHome, ['init', 'demo', '--repo', '/tmp']);
  add(testHome, 'demo', [
    ...cards(8, [1, 2, 3], ['demo', 'library'], ['mechanism']),
    ...cards(2, [4], ['demo', 'library'], ['map', 'boundary']),
  ].map((card, index) => ({ ...card, concept: `altitude-status-${index}` })));
  const bankFile = path.join(testHome, 'demo', 'bank.json');
  const scoresFile = path.join(testHome, 'demo', 'scores.json');
  const bank = JSON.parse(fs.readFileSync(bankFile));
  const readySchedule = { interval: 3, ease: 2.5, due: '2026-09-08', reps: 2, lapses: 0, lastGrade: 'correct' };
  for (const card of bank.cards) card.sched = { ...readySchedule };
  bank.cards[9].sched = { interval: 1, ease: 2.5, due: '2026-09-05', reps: 1, lapses: 0, lastGrade: 'partial' };
  fs.writeFileSync(bankFile, JSON.stringify(bank));
  fs.writeFileSync(scoresFile, JSON.stringify({ attempts: [{ id: 'c009', cardId: 'c009', date: NOW, session: '2026-09-05', grade: 'correct', answer: 'a', gap: '', mode: 'drill', question: 'Fresh map question', context: 'demo' }] }));
  let status = run(testHome, ['status', 'demo']);
  assert.deepEqual(status.altitudes.map((item) => ({ altitude: item.altitude, cards: item.cards, new: item.new, due: item.due })), [
    { altitude: 'map', cards: 1, new: 0, due: 0 },
    { altitude: 'boundary', cards: 1, new: 0, due: 1 },
    { altitude: 'mechanism', cards: 8, new: 0, due: 0 },
    { altitude: 'line', cards: 0, new: 0, due: 0 },
  ]);
  assert.equal(status.altitudes[0].accuracy, 1);
  assert.equal(status.defensible.mapBoundaryReadyRatio, 0.5);
  assert.equal(status.defensible.fails.some((reason) => reason.includes('map and boundary')), true);
  bank.cards[9].sched = { ...readySchedule };
  fs.writeFileSync(bankFile, JSON.stringify(bank));
  status = run(testHome, ['status', 'demo']);
  assert.equal(status.defensible.mapBoundaryReadyRatio, 1);
  assert.equal(status.defensible.verdict, true);
  assert.equal(status.defensible.fails.some((reason) => reason.includes('map and boundary')), false);
});
