import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deviceId, append, readAll, validateEvent, makeEvent } from './log.mjs';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sparring-'));
}

test('device id is stable and ascii', () => {
  const home = tmp();
  const first = deviceId(home);
  assert.match(first, /^[a-z0-9]{8,32}$/);
  assert.equal(deviceId(home), first);
});

test('append allocates increasing sequences and readAll returns them in order', () => {
  const home = tmp();
  const a = append(home, { type: 'project.added', data: { project: 'p1', name: 'One' } });
  const b = append(home, { type: 'project.added', data: { project: 'p2', name: 'Two' } });
  assert.equal(b.seq, a.seq + 1);
  const all = readAll(home);
  assert.deepEqual(all.map((e) => e.data.project), ['p1', 'p2']);
  assert.equal(all[0].id, `${a.device}:${a.seq}`);
});

test('readAll merges two device files deterministically', () => {
  const home = tmp();
  fs.mkdirSync(path.join(home, 'log'), { recursive: true });
  const one = makeEvent({ type: 'project.added', data: { project: 'x' }, device: 'bbbb', seq: 1 });
  const two = makeEvent({ type: 'project.added', data: { project: 'y' }, device: 'aaaa', seq: 1 });
  one.at = '2026-01-01T00:00:00.000Z';
  two.at = '2026-01-01T00:00:00.000Z';
  fs.writeFileSync(path.join(home, 'log', 'bbbb.jsonl'), `${JSON.stringify(one)}\n`);
  fs.writeFileSync(path.join(home, 'log', 'aaaa.jsonl'), `${JSON.stringify(two)}\n`);
  assert.deepEqual(readAll(home).map((e) => e.device), ['aaaa', 'bbbb']);
});

test('readAll skips a malformed line and keeps the rest', () => {
  const home = tmp();
  const good = append(home, { type: 'project.added', data: { project: 'p1' } });
  fs.appendFileSync(path.join(home, 'log', `${good.device}.jsonl`), 'not json\n');
  const second = append(home, { type: 'project.added', data: { project: 'p2' } });
  assert.equal(readAll(home).length, 2);
  assert.equal(second.seq, good.seq + 1);
});

test('validateEvent rejects an unknown type', () => {
  assert.throws(() => validateEvent(makeEvent({ type: 'nope', data: {}, device: 'aaaa', seq: 1 })), /unknown event type/);
});
