import {
  addCards,
  addProject,
  addTopics,
  card,
  contest,
  due,
  gaps,
  projects,
  record,
  standing,
  topics,
} from '../core/index.mjs';

const MAX_BODY = 2 * 1024 * 1024;

function send(res, status, value) {
  if (res.headersSent) return;
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value === undefined ? null : value));
}

function notFound(res) {
  send(res, 404, { error: 'not found' });
}

function readBody(req) {
  if (req.body !== undefined) {
    return Promise.resolve(typeof req.body === 'string' || Buffer.isBuffer(req.body)
      ? JSON.parse(req.body.toString())
      : req.body);
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('request body is too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : null);
      } catch {
        reject(Object.assign(new Error('request body must be valid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function pathSegments(url) {
  return url.pathname.split('/').filter(Boolean);
}

export async function handle(state, req, res) {
  let url;
  try {
    url = new URL(req.url ?? '/', 'http://127.0.0.1');
  } catch {
    send(res, 400, { error: 'invalid URL' });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    send(res, 200, { ok: true, version: 1, node: process.version });
    return;
  }

  try {
    if (req.method === 'GET' && url.pathname === '/api/projects') {
      send(res, 200, projects(state));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/topics') {
      send(res, 200, topics(state, url.searchParams.get('project') || null));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/due') {
      send(res, 200, due(state, {
        n: url.searchParams.get('n') ?? undefined,
        includeMature: url.searchParams.get('includeMature') === 'true',
      }));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/standing') {
      send(res, 200, standing(state, url.searchParams.get('project') || null));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/gaps') {
      send(res, 200, gaps(state, { days: url.searchParams.get('days') ?? undefined }));
      return;
    }

    const segments = pathSegments(url);
    if (req.method === 'GET' && segments.length === 3 && segments[0] === 'api' && segments[1] === 'card') {
      send(res, 200, card(state, decodeURIComponent(segments[2])));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/projects') {
      send(res, 200, addProject(state, await readBody(req)));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/topics') {
      send(res, 200, addTopics(state, await readBody(req)));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/cards') {
      send(res, 200, addCards(state, await readBody(req)));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/attempt') {
      send(res, 200, record(state, await readBody(req)));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/contest') {
      send(res, 200, contest(state, await readBody(req)));
      return;
    }
    notFound(res);
  } catch (error) {
    if (error.status) {
      send(res, error.status, { error: error.message });
      return;
    }
    if (error.message?.startsWith('card not found:')) {
      send(res, 404, { error: error.message });
      return;
    }
    send(res, 400, { error: error.message || 'bad request' });
  }
}
