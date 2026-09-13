import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeClaim } from '../survey/claim.mjs';
import { openState, refresh, standing } from './index.mjs';

function home() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sparring-standing-'));
}

function seed(state) {
  state.append({ type: 'project.added', data: { project: 'raptor', name: 'Raptor' } });
  state.append({ type: 'topic.added', data: {
    topic: 'verified-topic', name: 'Verified', parent: null, kind: 'concept',
    claim: 'verified-claim', gateStatus: 'verified',
  } });
  state.append({ type: 'topic.added', data: {
    topic: 'vouched-claim', name: 'Vouched', parent: null, kind: 'concept',
    claim: 'vouched-claim', gateStatus: 'inferred',
  } });
  state.append({ type: 'topic.linked', data: { topic: 'verified-topic', project: 'raptor' } });
  state.append({ type: 'topic.linked', data: { topic: 'vouched-claim', project: 'raptor' } });
  state.append({ type: 'card.added', data: {
    card: 'calibration-card', project: 'raptor', concept: 'Calibration', ask: 'What is it?',
    rubric: ['it is a test'], altitude: 'map', topics: ['verified-topic'], grounding: [],
    contexts: [], source: {},
  } });
  state.append({ type: 'card.added', data: {
    card: 'vouched-card', project: 'raptor', concept: 'Vouched', ask: 'What is it?',
    rubric: ['it is a test'], altitude: 'map', topics: ['vouched-claim'], grounding: [],
    contexts: [], source: {},
  } });
  refresh(state);
}

test('calibration with too few scheduled reviews reports that instead of points', () => {
  process.env.SPARRING_NOW = '2026-03-10T09:00:00Z';
  const state = openState(home());
  try {
    seed(state);
    const report = standing(state, 'raptor').calibration;
    assert.equal(report.ready, false);
    assert.equal(report.points.length, 0);
    assert.match(report.reason, /at least 5 scheduled reviews/i);
  } finally {
    delete process.env.SPARRING_NOW;
  }
});

test('a vouched claim is not counted in the verified standing figure', () => {
  const state = openState(home());
  seed(state);
  const claim = makeClaim({ type: 'topic', id: 'vouched-claim', status: 'inferred', sentence: 'The user knows this.', extractor: 'test' });
  state.append({ type: 'claim.vouched', data: { claim, judgement: 'I built it.' } });
  refresh(state);
  const report = standing(state, 'raptor');
  assert.equal(report.verifiedTopics, 1);
  assert.equal(report.vouchedTopics, 1);
  assert.equal(report.topics.find((topic) => topic.topic === 'vouched-claim').vouched, true);
});

test('calibration replays scheduler retrievability and carries outcome doubt', () => {
  const state = openState(home());
  seed(state);
  const reviews = [[1, 'correct'], [3, 'correct'], [6, 'wrong'], [8, 'partial'], [12, 'correct'], [15, 'correct']];
  for (const [day, grade] of reviews) {
    process.env.SPARRING_NOW = `2026-03-${String(day).padStart(2, '0')}T00:00:00Z`;
    state.append({ type: 'attempt.recorded', data: {
      card: 'calibration-card', grade, question: null, context: null, answer: null, gap: null, mode: 'drill',
    } });
  }
  refresh(state);
  try {
    const report = standing(state, 'raptor').calibration;
    assert.equal(report.ready, true);
    assert.equal(report.attempts, 5);
    assert.ok(report.points.length > 0);
    const point = report.points[0];
    assert.ok(point.actualLow <= point.actual && point.actual <= point.actualHigh);
    assert.ok(report.points.every((item) => item.actualLow < item.actualHigh), 'each calibration point carries doubt');
  } finally {
    delete process.env.SPARRING_NOW;
  }
});
