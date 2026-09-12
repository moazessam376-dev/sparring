import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { openState, refresh } from '../core/index.mjs';
import { handle } from './api.mjs';
import { ensureToken, guard } from './auth.mjs';

function sendError(res, status, message) {
  if (res.headersSent) return;
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: message }));
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
      const health = req.method === 'GET' && pathname === '/api/health';
      const guarded = health
        ? guard({ headers: { ...(req.headers ?? {}), authorization: `Bearer ${token}` } }, token)
        : guard(req, token);
      if (guarded) {
        sendError(res, guarded.status, guarded.message);
        return;
      }
      try {
        await handle(state, req, res);
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
        server.close((error) => {
          try { state.db.close(); } catch (closeError) { if (!error) error = closeError; }
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}
