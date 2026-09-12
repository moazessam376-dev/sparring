import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openState, refresh } from '../core/index.mjs';
import { handle } from './api.mjs';
import { handle as handleMcp } from './mcp.mjs';
import { corsHeaders, ensureToken, guard, preflight } from './auth.mjs';

// The core takes a home rather than resolving one, and the only other copy of
// this rule lives in scripts/drill.mjs, which is a self-executing CLI and
// cannot be imported. It is stated once here for the sidecar and exported so
// nothing else has to restate it.
export function stateHome() {
  return process.env.SPARRING_HOME || path.join(os.homedir(), '.sparring');
}

// How long a shutdown waits for requests that are still in flight before it
// cuts their connections. The database still closes either way.
const CLOSE_GRACE = 2000;

function sendError(res, status, message) {
  if (res.headersSent) return;
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: message }));
}

// Set on the response before anything is dispatched, so that every answer this
// server gives carries the allow-origin the webview needs in order to be
// allowed to read it: the API's answers, the MCP endpoint's, and the guard's
// own refusals alike. Node merges these with whatever writeHead is given
// later, so no handler has to know about them.
function applyCors(req, res) {
  for (const [name, value] of Object.entries(corsHeaders(req))) res.setHeader(name, value);
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.removeListener('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      resolve(server.address().port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

export async function start({ home, port = 4517 } = {}) {
  if (typeof home !== 'string' || !home) throw new Error('home is required');
  const firstPort = Number(port);
  if (!Number.isInteger(firstPort) || firstPort < 1 || firstPort > 65535) throw new Error('port must be an integer from 1 to 65535');

  const token = ensureToken(home);
  const state = openState(home);
  refresh(state);
  const server = http.createServer((req, res) => {
    void (async () => {
      let pathname;
      try {
        pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
      } catch {
        sendError(res, 400, 'invalid URL');
        return;
      }
      applyCors(req, res);

      // A preflight is answered before the guard and before routing. The
      // interface sends an Authorization header on every call, which is what
      // forces the browser to preflight in the first place; running the guard
      // first would refuse the tokenless preflight and the real request would
      // never be sent. Nothing here reads or writes state, and there is no body.
      const options = preflight(req);
      if (options) {
        if (options.status !== 204) {
          sendError(res, options.status, options.message);
          return;
        }
        res.writeHead(options.status, options.headers);
        res.end();
        return;
      }

      const health = req.method === 'GET' && pathname === '/api/health';
      const guarded = health
        ? guard({ headers: { ...(req.headers ?? {}), authorization: `Bearer ${token}` } }, token)
        : guard(req, token);
      if (guarded) {
        sendError(res, guarded.status, guarded.message);
        return;
      }
      try {
        if (pathname === '/mcp') await handleMcp(state, req, res);
        else await handle(state, req, res);
      } catch (error) {
        sendError(res, 500, error.message || 'internal server error');
      }
    })();
  });

  let actualPort;
  try {
    for (let candidate = firstPort; candidate <= 65535; candidate += 1) {
      try {
        actualPort = await listen(server, candidate);
        break;
      } catch (error) {
        if (error.code !== 'EADDRINUSE') throw error;
      }
    }
    if (actualPort === undefined) throw new Error('no free loopback port');
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(path.join(home, 'port'), `${actualPort}\n`);
  } catch (error) {
    try { state.db.close(); } catch { /* already closed */ }
    throw error;
  }

  let closed = false;
  return {
    port: actualPort,
    token,
    close: () => {
      if (closed) return Promise.resolve();
      closed = true;
      return new Promise((resolve, reject) => {
        // close() waits for connections that are still in flight. A request
        // that never finishes would otherwise be enough to keep an orphaned
        // sidecar alive, so anything still open at the grace period is cut.
        const cut = setTimeout(() => server.closeAllConnections(), CLOSE_GRACE);
        cut.unref();
        server.close((error) => {
          clearTimeout(cut);
          try { state.db.close(); } catch (closeError) { if (!error) error = closeError; }
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}

// How often the sidecar checks that the application that started it is still
// there. A second is cheap: one signal-zero syscall, nothing allocated.
export const PARENT_POLL_INTERVAL = 1000;

// The application kills this process on every exit path it can observe, but it
// cannot observe its own crash or a SIGKILL. An orphaned sidecar holds the
// state directory open and keeps answering an authenticated loopback port that
// nothing owns any more, so the sidecar watches its parent as well.
//
// `linked` says the caller confirmed at startup that this process really is a
// child of `pid`. Only then is reparenting meaningful: when the parent dies the
// kernel hands the orphan to init, so our own parent link stops pointing at the
// recorded pid. That check is the one that survives pid reuse, where signalling
// the recorded pid would find whatever process inherited the number.
export function parentGone(pid, { linked = false, ppid = process.ppid } = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (linked && ppid !== pid) return true;
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    // EPERM means the process is alive and simply not ours to signal.
    return error.code === 'ESRCH';
  }
}

// Returns the timer so a caller can stop watching, or null when there is no
// parent to watch. A sidecar run by hand carries no parent id and must never
// exit on its own, which is what the tests depend on too.
export function watchParent(pid, onGone, interval = PARENT_POLL_INTERVAL) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  const linked = process.ppid === pid;
  const timer = setInterval(() => {
    if (parentGone(pid, { linked })) onGone();
  }, interval);
  // The HTTP server already holds the loop open; this timer must never be the
  // reason the process stays up.
  timer.unref();
  return timer;
}

export function parentPid(env = process.env) {
  const value = Number(env.SPARRING_PARENT_PID);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function isEntryPoint() {
  const argument = process.argv[1];
  if (typeof argument !== 'string' || argument === '') return false;
  const real = (value) => {
    try {
      return fs.realpathSync(value);
    } catch {
      return path.resolve(value);
    }
  };
  return real(fileURLToPath(import.meta.url)) === real(argument);
}

// The desktop shell spawns this file as a sidecar process, so running it as a
// script has to start a server. Importing it must not: a test that imports
// `start` and never calls it binds no port.
export async function main() {
  const server = await start({ home: stateHome() });
  process.stdout.write(`sparring listening on http://127.0.0.1:${server.port}\n`);
  let stopping = false;
  let watch = null;
  const stop = (code) => {
    if (stopping) return;
    stopping = true;
    if (watch) clearInterval(watch);
    // A half-closed database is how a derived cache gets corrupted, so every
    // way out waits for close() rather than letting the process fall over.
    server.close().then(
      () => process.exit(code),
      (error) => {
        process.stderr.write(`${error.message || error}\n`);
        process.exit(1);
      },
    );
  };
  process.on('SIGINT', () => stop(130));
  process.on('SIGTERM', () => stop(0));
  // The parent-gone path takes the same exit as a signal, closing the database
  // rather than calling process.exit directly.
  watch = watchParent(parentPid(), () => {
    process.stderr.write('sparring: the application that started this server is gone; shutting down\n');
    stop(0);
  });
  return server;
}

if (isEntryPoint()) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message || error}\n`);
    process.exit(1);
  });
}
