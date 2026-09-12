import {
  addCards,
  addProject,
  addTopics,
  card,
  contest,
  due,
  discoverBanks,
  dryRunImport,
  importBank,
  gaps,
  projects,
  record,
  standing,
  topics,
  vouch,
  withdrawVouch,
} from '../core/index.mjs';
import { inspectRepository, listSurveys, storedClaimForVouch, surveyState } from '../survey/store.mjs';
import { presence } from './presence.mjs';

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
    // Whether a coding agent is talking to this server. The survey waits for
    // one, so the interface has to be able to say that none is there.
    if (req.method === 'GET' && url.pathname === '/api/agent') {
      send(res, 200, presence());
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/surveys') {
      send(res, 200, listSurveys(state.home));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/repository') {
      send(res, 200, inspectRepository(url.searchParams.get('path') ?? ''));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/survey') {
      send(res, 200, surveyState(state.home, url.searchParams.get('repo') ?? ''));
      return;
    }

    if (req.method === 'GET' && (url.pathname === '/api/imports' || url.pathname === '/api/import')) {
      send(res, 200, discoverBanks(state.home));
      return;
    }

    const segments = pathSegments(url);
    if (req.method === 'POST' && (url.pathname === '/api/import/dry-run' || url.pathname === '/api/imports/dry-run')) {
      const body = await readBody(req);
      send(res, 200, dryRunImport(state, body?.project));
      return;
    }
    if (req.method === 'POST' && (url.pathname === '/api/import' || url.pathname === '/api/imports')) {
      const body = await readBody(req);
      send(res, 200, importBank(state, body?.project));
      return;
    }
    if (req.method === 'GET' && segments.length === 4 && segments[0] === 'api' && segments[1] === 'imports' && segments[3] === 'dry-run') {
      send(res, 200, dryRunImport(state, decodeURIComponent(segments[2])));
      return;
    }
    if (req.method === 'POST' && segments.length === 3 && segments[0] === 'api' && segments[1] === 'imports') {
      send(res, 200, importBank(state, decodeURIComponent(segments[2])));
      return;
    }
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
    if (req.method === 'POST' && url.pathname === '/api/vouch') {
      const body = await readBody(req);
      const claim = storedClaimForVouch(state.home, body?.repo, body?.claimId);
      send(res, 200, vouch(state, { claim, judgement: body?.judgement }));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/vouch/withdraw') {
      send(res, 200, withdrawVouch(state, await readBody(req)));
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
