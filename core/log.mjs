import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { now } from './clock.mjs';

export const EVENT_TYPES = [
  'project.added',
  'topic.added',
  'topic.linked',
  'topic.prereq',
  'card.added',
  'card.updated',
  'card.retired',
  'attempt.recorded',
  'grade.contested',
  'lesson.completed',
  'claim.vouched',
  'claim.vouch.withdrawn',
];

const TYPES = new Set(EVENT_TYPES);

function logDir(home) {
  const dir = path.join(home, 'log');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Lowercase ASCII only: case-insensitive filesystems collide otherwise.
export function deviceId(home) {
  const file = path.join(home, 'device');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const id = crypto.randomBytes(8).toString('hex');
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(file, `${id}\n`);
  return id;
}

export function makeEvent({ type, data, device, seq }) {
  return { id: `${device}:${seq}`, device, seq, at: now().toISOString(), type, v: 1, data };
}

export function validateEvent(event) {
  if (!event || typeof event !== 'object') throw new Error('event must be an object');
  if (!TYPES.has(event.type)) throw new Error(`unknown event type: ${event.type}`);
  if (!/^[a-z0-9]{4,32}$/.test(event.device || '')) throw new Error('event device is invalid');
  if (!Number.isInteger(event.seq) || event.seq < 1) throw new Error('event seq must be a positive integer');
  if (event.id !== `${event.device}:${event.seq}`) throw new Error('event id must be device:seq');
  if (Number.isNaN(Date.parse(event.at || ''))) throw new Error('event at must be a timestamp');
  if (!event.data || typeof event.data !== 'object') throw new Error('event data must be an object');
  if (event.type === 'claim.vouched') {
    if (!event.data.claim || typeof event.data.claim !== 'object' || Array.isArray(event.data.claim)) {
      throw new Error('vouched event claim must be an object');
    }
    if (typeof event.data.claim.id !== 'string' || !event.data.claim.id.trim()) {
      throw new Error('vouched event claim id must be a non-empty string');
    }
    if (typeof event.data.claim.status !== 'string' || !event.data.claim.status.trim()) {
      throw new Error('vouched event claim status must be a non-empty string');
    }
    if (typeof event.data.judgement !== 'string' || !event.data.judgement.trim()) {
      throw new Error('vouched event judgement must be a non-empty string');
    }
    if (event.data.judgement.length > 4096) throw new Error('vouched event judgement exceeds 4096 characters');
  }
  if (event.type === 'claim.vouch.withdrawn'
    && (typeof event.data.claim !== 'string' || !event.data.claim.trim())) {
    throw new Error('vouch withdrawal claim must be a non-empty string');
  }
}

function deviceFile(home, device) {
  return path.join(logDir(home), `${device}.jsonl`);
}

function lastSeq(home, device) {
  const file = deviceFile(home, device);
  if (!fs.existsSync(file)) return 0;
  let max = 0;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (Number.isInteger(parsed.seq) && parsed.seq > max) max = parsed.seq;
    } catch {
      // A malformed line is skipped here and surfaced by readAll.
    }
  }
  return max;
}

export function append(home, { type, data }) {
  const device = deviceId(home);
  const event = makeEvent({ type, data, device, seq: lastSeq(home, device) + 1 });
  validateEvent(event);
  const file = deviceFile(home, device);
  const handle = fs.openSync(file, 'a');
  try {
    fs.writeSync(handle, `${JSON.stringify(event)}\n`);
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
  return event;
}

export function readAll(home) {
  const dir = logDir(home);
  const events = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.jsonl')) continue;
    for (const line of fs.readFileSync(path.join(dir, name), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      try {
        validateEvent(parsed);
      } catch {
        continue;
      }
      events.push(parsed);
    }
  }
  // Commit order is transport history, not causal order. Sort on the event's
  // own fields so every device rebuilds the same state.
  events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.device < b.device ? -1 : a.device > b.device ? 1 : a.seq - b.seq));
  return events;
}
