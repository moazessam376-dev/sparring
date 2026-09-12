import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureToken, guard } from './auth.mjs';

function home() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sparring-'));
}

test('ensureToken creates a stable private token', () => {
  const dir = home();
  const first = ensureToken(dir);
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(ensureToken(dir), first);
  assert.equal(fs.statSync(path.join(dir, 'token')).mode & 0o777, 0o600);
});

test('guard accepts a matching bearer token without an Origin', () => {
  assert.equal(guard({ headers: { authorization: 'Bearer secret' } }, 'secret'), null);
  assert.equal(guard({ headers: { authorization: 'bearer secret', origin: 'http://127.0.0.1:4517' } }, 'secret'), null);
});

test('guard rejects missing and wrong authorization', () => {
  assert.equal(guard({ headers: {} }, 'secret').status, 401);
  assert.equal(guard({ headers: { authorization: 'Bearer other' } }, 'secret').status, 401);
  assert.equal(guard({ headers: { authorization: 'Basic secret' } }, 'secret').status, 401);
});

test('guard rejects non-loopback origins to prevent DNS rebinding', () => {
  assert.equal(guard({ headers: { authorization: 'Bearer secret', origin: 'https://attacker.example' } }, 'secret').status, 403);
  assert.equal(guard({ headers: { authorization: 'Bearer secret', origin: 'http://127.0.0.1.attacker.example' } }, 'secret').status, 403);
  assert.equal(guard({ headers: { authorization: 'Bearer secret', origin: 'null' } }, 'secret').status, 403);
});
