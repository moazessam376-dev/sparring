import fs from 'node:fs';
import path from 'node:path';
import { append } from './log.mjs';

function parseGrounding(entry) {
  const match = /^(.*):(\d+)(?:-(\d+))?$/.exec(entry);
  if (!match) return { path: entry, line: null, commit: null };
  // The v1 and v2 bank formats carry no commit, so the reference is unverified
  // until the agent re-grounds it against a known revision.
  return { path: match[1], line: Number(match[2]), commit: null };
}

export function bankToEvents(bank, scores) {
  const events = [{ type: 'project.added', data: { project: bank.project, name: bank.project, remote: null } }];
  const seenTopics = new Set();
  for (const card of bank.cards ?? []) {
    if (card.topic && !seenTopics.has(card.topic)) {
      seenTopics.add(card.topic);
      events.push({ type: 'topic.added', data: { topic: card.topic, name: card.topic, parent: null, kind: 'technology' } });
    }
  }
  for (const card of bank.cards ?? []) {
    events.push({
      type: 'card.added',
      data: {
        card: card.id, project: bank.project, concept: card.concept, ask: card.ask,
        rubric: card.rubric, altitude: card.altitude ?? 'mechanism',
        topics: card.topic ? [card.topic] : [],
        grounding: (card.grounding ?? []).map(parseGrounding),
        contexts: card.contexts ?? [bank.project],
        source: card.source ?? { type: 'migrated', ref: 'bank.json' },
      },
    });
    if (card.retired) events.push({ type: 'card.retired', data: { card: card.id } });
  }
  for (const attempt of scores.attempts ?? []) {
    events.push({
      type: 'attempt.recorded',
      data: {
        card: attempt.cardId ?? attempt.id, grade: attempt.grade, question: attempt.question ?? null,
        context: attempt.context ?? null, answer: attempt.answer ?? null, gap: attempt.gap ?? null,
        mode: attempt.mode ?? 'drill', originalDate: attempt.date ?? null,
      },
    });
  }
  return events;
}

export function migrate(home, project) {
  const dir = path.join(home, project);
  const bank = JSON.parse(fs.readFileSync(path.join(dir, 'bank.json'), 'utf8'));
  const scores = JSON.parse(fs.readFileSync(path.join(dir, 'scores.json'), 'utf8'));
  const bodies = bankToEvents(bank, scores);
  for (const body of bodies) append(home, body);
  return {
    events: bodies.length,
    cards: bodies.filter((e) => e.type === 'card.added').length,
    attempts: bodies.filter((e) => e.type === 'attempt.recorded').length,
  };
}
