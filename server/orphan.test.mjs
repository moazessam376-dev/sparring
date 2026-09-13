import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parentGone, parentPid, watchParent } from './index.mjs';

const SERVER = fileURLToPath(new URL('./index.mjs', import.meta.url));

function home() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sparring-orphan-'));
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function until(predicate, { timeout = 15000, step = 50 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await predicate();
    if (value) return value;
    if (Date.now() >= deadline) return null;
    await sleep(step);
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}

// A fresh connection every time: a keep-alive pool would hold the sidecar's
// sockets open and blur the line between a server that closed and one that did
// not answer.
function health(port) {
  return new Promise((resolve) => {
    const request = http.get(
      { host: '127.0.0.1', port, path: '/api/health', agent: false, timeout: 1000 },
      (response) => {
        response.resume();
        response.on('end', () => resolve(response.statusCode));
      },
    );
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(null));
  });
}

async function startSidecar(env, { stdin = 'ignore' } = {}) {
  const state = home();
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, SPARRING_HOME: state, ...env },
    stdio: [stdin, 'ignore', 'ignore'],
    detached: true,
  });
  const portFile = path.join(state, 'port');
  const port = await until(() => {
    if (!fs.existsSync(portFile)) return null;
    const value = Number(fs.readFileSync(portFile, 'utf8').trim());
    return Number.isInteger(value) && value > 0 ? value : null;
  });
  assert.ok(port, 'the sidecar wrote no port file');
  assert.equal(await health(port), 200, 'the sidecar did not answer /api/health');
  return { child, port, state };
}

function reap(child) {
  if (child.exitCode === null && child.signalCode === null) {
    try { process.kill(child.pid, 'SIGKILL'); } catch { /* already gone */ }
  }
}

test('a pid with no parent recorded is never reported gone', () => {
  // A sidecar run by hand carries no parent id, and must behave exactly as it
  // does today: it exits when it is told to and not before.
  assert.equal(parentGone(null), false);
  assert.equal(parentGone(0), false);
  assert.equal(parentGone(Number.NaN), false);
  assert.equal(parentGone(-1), false);
  assert.equal(watchParent(null, () => { throw new Error('must not fire'); }), null);
  assert.equal(watchParent(0, () => { throw new Error('must not fire'); }), null);

  assert.equal(parentPid({}), null);
  assert.equal(parentPid({ SPARRING_PARENT_PID: '' }), null);
  assert.equal(parentPid({ SPARRING_PARENT_PID: 'not a pid' }), null);
  assert.equal(parentPid({ SPARRING_PARENT_PID: '0' }), null);
  assert.equal(parentPid({ SPARRING_PARENT_PID: '4242' }), 4242);
});

test('a living parent is not gone, and a reaped one is', async () => {
  assert.equal(parentGone(process.pid), false);

  const doomed = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
  const exited = new Promise((resolve) => { doomed.once('exit', resolve); });
  doomed.kill('SIGKILL');
  await exited;

  assert.equal(parentGone(doomed.pid), true);
});

test('reparenting to init reports the parent gone even when the pid is live', () => {
  // This is the case that matters: the application dies, the sidecar is handed
  // to init, and the recorded pid may by then belong to some unrelated process.
  // The parent link is what tells the truth, so a live pid we are no longer a
  // child of still counts as gone.
  assert.equal(parentGone(process.pid, { linked: true, ppid: 1 }), true);
  assert.equal(parentGone(process.pid, { linked: true, ppid: process.pid }), false);
  // Without the link confirmed at startup, a strange ppid proves nothing.
  assert.equal(parentGone(process.pid, { linked: false, ppid: 1 }), false);
});

test('the sidecar shuts down on its own when its parent is gone', async () => {
  // The parent here is killed outright, which is the case the application's own
  // exit handler cannot cover: no handler runs on SIGKILL or on a crash.
  const parent = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
  const sidecar = await startSidecar({ SPARRING_PARENT_PID: String(parent.pid) });

  try {
    const parentExited = new Promise((resolve) => { parent.once('exit', resolve); });
    parent.kill('SIGKILL');
    await parentExited;

    const stopped = await until(() => !alive(sidecar.child.pid), { timeout: 10000 });
    assert.ok(stopped, 'the sidecar outlived its parent');
    assert.equal(await health(sidecar.port), null, 'the port still answers');
  } finally {
    reap(sidecar.child);
    reap(parent);
  }
});

test('the sidecar closes its database rather than falling over', async () => {
  // The parent-gone path must take the same exit a signal takes. A clean exit
  // code is the visible half of that; the database closing is the half that
  // keeps the derived cache from being corrupted.
  const parent = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
  const sidecar = await startSidecar({ SPARRING_PARENT_PID: String(parent.pid) });

  try {
    const exit = new Promise((resolve) => {
      sidecar.child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    parent.kill('SIGKILL');
    const result = await Promise.race([exit, sleep(10000).then(() => null)]);
    assert.ok(result, 'the sidecar never exited');
    assert.deepEqual(result, { code: 0, signal: null });
  } finally {
    reap(sidecar.child);
    reap(parent);
  }
});

test('a sidecar started without a parent id keeps running', async () => {
  // The tests and anyone running the server by hand depend on this.
  const windows = process.platform === 'win32';
  const sidecar = await startSidecar(
    { SPARRING_PARENT_PID: '', ...(windows ? { SPARRING_STDIN_SHUTDOWN: '1' } : {}) },
    { stdin: windows ? 'pipe' : 'ignore' },
  );

  try {
    await sleep(3000);
    assert.ok(alive(sidecar.child.pid), 'the sidecar exited with no parent to watch');
    assert.equal(await health(sidecar.port), 200);

    const exit = new Promise((resolve) => {
      sidecar.child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    if (windows) sidecar.child.stdin.end();
    else sidecar.child.kill('SIGTERM');
    assert.deepEqual(await exit, { code: 0, signal: null });
  } finally {
    reap(sidecar.child);
  }
});
