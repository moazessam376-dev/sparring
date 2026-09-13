import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { allowedOrigin, corsHeaders, ensureToken, guard, preflight } from './auth.mjs';
import { start } from './index.mjs';

function home() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sparring-'));
}

test('ensureToken creates a stable private token', () => {
  const dir = home();
  const first = ensureToken(dir);
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(ensureToken(dir), first);
  // Windows has no POSIX permission bits; the file lives under the user profile instead.
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(path.join(dir, 'token')).mode & 0o777, 0o600);
  }
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

test('guard accepts the origin a Tauri webview actually sends', () => {
  // The packaged application is a webview, and a webview sends
  // tauri://localhost. Refusing it is what made the shipped application unable
  // to reach the sidecar it had just started.
  assert.equal(guard({ headers: { authorization: 'Bearer secret', origin: 'tauri://localhost' } }, 'secret'), null);
  assert.equal(guard({ headers: { authorization: 'Bearer secret', Origin: 'tauri://localhost' } }, 'secret'), null);
  // The token is still the lock: the scheme alone buys nothing.
  assert.equal(guard({ headers: { origin: 'tauri://localhost' } }, 'secret').status, 401);
  assert.equal(guard({ headers: { authorization: 'Bearer wrong', origin: 'tauri://localhost' } }, 'secret').status, 401);
});

test('an allowed origin is echoed back, and nothing else is', () => {
  // Without this header the request succeeds on the wire and the browser throws
  // the answer away, which looks exactly like a refusal from inside the app.
  assert.equal(corsHeaders({ headers: { origin: 'tauri://localhost' } })['access-control-allow-origin'], 'tauri://localhost');
  assert.equal(corsHeaders({ headers: { origin: 'http://127.0.0.1:1420' } })['access-control-allow-origin'], 'http://127.0.0.1:1420');
  // Echoed, never a wildcard.
  for (const origin of ['tauri://localhost', 'http://localhost:1420']) {
    assert.notEqual(corsHeaders({ headers: { origin } })['access-control-allow-origin'], '*');
  }
  assert.equal(corsHeaders({ headers: { origin: 'https://attacker.example' } })['access-control-allow-origin'], undefined);
  assert.equal(corsHeaders({ headers: {} })['access-control-allow-origin'], undefined);
});

test('a preflight is answered without a token and a hostile one is not', () => {
  const options = preflight({ method: 'OPTIONS', headers: {
    origin: 'tauri://localhost',
    'access-control-request-method': 'GET',
    'access-control-request-headers': 'authorization, content-type',
  } });
  assert.equal(options.status, 204);
  assert.equal(options.headers['access-control-allow-origin'], 'tauri://localhost');
  // The browser asked about these two; an answer that does not cover them makes
  // it drop the real request before sending it.
  assert.equal(options.headers['access-control-allow-headers'], 'authorization, content-type');
  assert.match(options.headers['access-control-allow-methods'], /GET/);

  assert.equal(preflight({ method: 'OPTIONS', headers: { origin: 'https://attacker.example' } }).status, 403);
  // Anything that is not a preflight falls through to the guard untouched.
  assert.equal(preflight({ method: 'GET', headers: { origin: 'tauri://localhost' } }), null);
});

test('allowedOrigin still refuses everything the loopback rule refused', () => {
  for (const origin of [
    'https://attacker.example',
    'http://127.0.0.1.attacker.example',
    'https://tauri.localhost.attacker.example',
    'null',
    'file://',
    '',
  ]) {
    assert.equal(allowedOrigin(origin), false, `${origin} was allowed`);
  }
  assert.equal(allowedOrigin('tauri://localhost'), true);
  assert.equal(allowedOrigin('http://127.0.0.1:1420'), true);
});

// The three checks above are about the rules. These drive the real server over
// real HTTP, because the bug was never in the rules alone: the guard ran before
// routing, so the preflight the Authorization header forces was refused before
// anything could answer it.
test('the running server answers a Tauri webview end to end', async () => {
  const dir = home();
  const server = await start({ home: dir });
  const base = `http://127.0.0.1:${server.port}`;
  const origin = 'tauri://localhost';
  try {
    const logBefore = fs.existsSync(path.join(dir, 'log.jsonl'))
      ? fs.readFileSync(path.join(dir, 'log.jsonl'), 'utf8') : '';

    // 1. The preflight the browser sends first, with no token on it at all.
    const options = await fetch(`${base}/api/due`, { method: 'OPTIONS', headers: {
      origin,
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'authorization',
    } });
    assert.ok(options.status === 204 || options.status === 200, `preflight was ${options.status}`);
    assert.equal(options.headers.get('access-control-allow-origin'), origin);
    assert.match(options.headers.get('access-control-allow-headers') ?? '', /authorization/i);
    assert.match(options.headers.get('access-control-allow-methods') ?? '', /GET/);
    assert.equal(await options.text(), '', 'a preflight must have no body');

    // 2. The real request the browser then sends, which the webview only keeps
    //    because the allow-origin header comes back with it.
    const real = await fetch(`${base}/api/due?n=5`, { headers: { origin, Authorization: `Bearer ${server.token}` } });
    assert.equal(real.status, 200);
    assert.equal(real.headers.get('access-control-allow-origin'), origin);
    assert.deepEqual(await real.json(), []);

    // 3. The hostile origin is refused either way, and never echoed.
    for (const headers of [{ origin: 'https://attacker.example' },
      { origin: 'https://attacker.example', Authorization: `Bearer ${server.token}` }]) {
      const refused = await fetch(`${base}/api/due`, { headers });
      assert.equal(refused.status, 403, `attacker got ${refused.status}`);
      assert.equal(refused.headers.get('access-control-allow-origin'), null);
    }
    const refusedOptions = await fetch(`${base}/api/due`, { method: 'OPTIONS', headers: { origin: 'https://attacker.example' } });
    assert.equal(refusedOptions.status, 403);
    assert.equal(refusedOptions.headers.get('access-control-allow-origin'), null);

    // The preflight read and wrote nothing: the log is byte for byte what it was.
    const logAfter = fs.existsSync(path.join(dir, 'log.jsonl'))
      ? fs.readFileSync(path.join(dir, 'log.jsonl'), 'utf8') : '';
    assert.equal(logAfter, logBefore, 'a preflight touched state');
  } finally {
    await server.close();
  }
});
