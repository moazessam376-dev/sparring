import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openState } from '../core/index.mjs';
import {
  PROTOCOL_VERSION,
  STREAMABLE_HTTP_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  handle,
  toolDefinitions,
} from './mcp.mjs';

function home() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sparring-mcp-'));
}

async function post(state, message, { headers = {}, method = 'POST' } = {}) {
  let result;
  const res = {
    headersSent: false,
    writeHead(status, sent) {
      this.status = status;
      this.headers = sent ?? {};
      this.headersSent = true;
    },
    end(value) {
      result = { status: this.status, headers: this.headers, text: value ?? '' };
    },
  };
  await handle(state, {
    method,
    url: '/mcp',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
    body: message === undefined ? undefined : message,
  }, res);
  return result;
}

async function rpc(state, method, params, options) {
  const response = await post(state, { jsonrpc: '2.0', id: 1, method, params }, options);
  return { ...response, body: response.text ? JSON.parse(response.text) : null };
}

async function callTool(state, name, args, options) {
  const response = await rpc(state, 'tools/call', { name, arguments: args }, options);
  const payload = response.body.result;
  const text = payload ? payload.content[0].text : '';
  let value = text;
  try {
    value = JSON.parse(text);
  } catch {
    // A refusal is a plain sentence the agent has to read, not a JSON document.
  }
  return { ...response, isError: payload?.isError, value };
}

function seed(state) {
  const call = (name, args) => callTool(state, name, args);
  return (async () => {
    await call('sparring_add_topics', { topics: [{ topic: 'locks', name: 'Locks', parent: null, kind: 'concept' }] });
    await call('sparring_add_cards', { cards: [{
      id: 'c001',
      project: 'raptor',
      concept: 'Lease expiry',
      ask: 'What happens when the lease expires mid-write?',
      rubric: ['THE HIDDEN RUBRIC LINE'],
      altitude: 'mechanism',
      topics: ['locks'],
      grounding: [{ path: 'lock.mjs', line: 12, commit: 'abc1234' }],
      contexts: ['raptor'],
      source: { type: 'test', ref: '1' },
    }] });
  })();
}

test('MCP negotiates every Streamable HTTP revision and lists every promised tool', async () => {
  const state = openState(home());

  for (const revision of SUPPORTED_PROTOCOL_VERSIONS) {
    const initialized = await rpc(state, 'initialize', {
      protocolVersion: revision,
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    });
    assert.equal(initialized.status, 200);
    assert.equal(initialized.body.result.protocolVersion, revision);
    assert.equal(initialized.body.result.serverInfo.name, 'sparring');
    assert.ok(initialized.body.result.capabilities.tools);
  }

  const newer = await rpc(state, 'initialize', {
    protocolVersion: '2099-01-01',
    capabilities: {},
    clientInfo: { name: 'future-test', version: '1' },
  });
  assert.equal(newer.status, 200);
  assert.equal(newer.body.error, undefined);
  assert.equal(newer.body.result.protocolVersion, PROTOCOL_VERSION);

  const wrong = await rpc(state, 'initialize', { protocolVersion: '2024-11-05', capabilities: {} });
  assert.equal(wrong.body.error.code, -32602);
  assert.match(wrong.body.error.message, /2024-11-05 predates Streamable HTTP/);
  assert.match(wrong.body.error.message, /HTTP\+SSE transport is not supported/);
  assert.equal(wrong.body.error.data.requested, '2024-11-05');
  assert.deepEqual(wrong.body.error.data.supported, [...SUPPORTED_PROTOCOL_VERSIONS]);

  const declared = await rpc(state, 'ping', {}, { headers: { 'mcp-protocol-version': '2024-11-05' } });
  assert.equal(declared.status, 400);
  assert.equal(declared.body.error.code, -32602);
  assert.match(declared.body.error.message, /predates Streamable HTTP/);

  const listed = await rpc(state, 'tools/list', {});
  const names = listed.body.result.tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, [
    'sparring_add_cards',
    'sparring_add_topics',
    'sparring_author_lesson',
    'sparring_contest',
    'sparring_due',
    'sparring_projects',
    'sparring_record',
    'sparring_rubric',
    'sparring_survey_submit',
    'sparring_topics',
  ]);
  for (const tool of listed.body.result.tools) {
    assert.ok(tool.description.length > 60, `${tool.name} needs a description an agent will read`);
    assert.equal(tool.inputSchema.type, 'object');
  }
  const rubric = listed.body.result.tools.find((tool) => tool.name === 'sparring_rubric');
  assert.match(rubric.description, /after the candidate has committed an answer/i);
  const survey = listed.body.result.tools.find((tool) => tool.name === 'sparring_survey_submit');
  assert.match(survey.description, /never silently dropped/i);
  assert.match(survey.description, /never upgraded/i);
});

test('older accepted revisions do not receive newer response fields', async () => {
  const state = openState(home());
  const old = await rpc(state, 'initialize', {
    protocolVersion: STREAMABLE_HTTP_VERSION,
    capabilities: {},
    clientInfo: { name: 'old-client', version: '1' },
  });
  assert.equal(old.body.result.serverInfo.title, undefined);

  const oldListed = await rpc(state, 'tools/list', {}, {
    headers: { 'mcp-protocol-version': STREAMABLE_HTTP_VERSION },
  });
  assert.equal(oldListed.body.result.tools.some((tool) => 'title' in tool), false);

  const oldCall = await callTool(state, 'sparring_add_topics', {
    topics: [{ topic: 'old-field-test', name: 'old-field-test', parent: null, kind: 'concept' }],
  }, { headers: { 'mcp-protocol-version': STREAMABLE_HTTP_VERSION } });
  assert.equal(oldCall.isError, false);
  assert.equal(oldCall.body.result.structuredContent, undefined);

  const currentCall = await callTool(state, 'sparring_add_topics', {
    topics: [{ topic: 'current-field-test', name: 'current-field-test', parent: null, kind: 'concept' }],
  });
  assert.equal(currentCall.isError, false);
  assert.deepEqual(currentCall.body.result.structuredContent, { added: 1 });
});

test('MCP request logs include only method, initialize version and response status', async () => {
  const state = openState(home());
  const token = 'Bearer test-token-never-log-this';
  const secretArgument = 'rubric-and-user-answer-never-log-this';
  const writes = [];
  const originalWrite = process.stderr.write;
  process.stderr.write = (chunk) => {
    writes.push(String(chunk));
    return true;
  };
  try {
    await rpc(state, 'initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'log-test', version: '1' },
    }, { headers: { authorization: token } });
    await callTool(state, 'sparring_add_topics', {
      topics: [{ topic: 'logs', name: secretArgument, parent: null, kind: 'concept' }],
    }, { headers: { authorization: token } });
  } finally {
    process.stderr.write = originalWrite;
  }

  assert.equal(writes.length, 2);
  assert.match(writes[0], /mcp method=initialize protocolVersion=2026-07-28 status=200/);
  assert.match(writes[1], /mcp method=tools\/call status=200/);
  const log = writes.join('');
  assert.equal(log.includes(token), false);
  assert.equal(log.includes(secretArgument), false);
});

test('the MCP queue never carries a rubric and sparring_rubric is the only way to one', async () => {
  process.env.SPARRING_NOW = '2026-03-10T09:00:00Z';
  const state = openState(home());
  try {
    await seed(state);

    const queue = await callTool(state, 'sparring_due', { n: 5 });
    assert.equal(queue.isError, false);
    assert.equal(queue.value.length, 1);
    assert.equal(Object.hasOwn(queue.value[0], 'rubric'), false);
    assert.equal(queue.text.includes('HIDDEN RUBRIC'), false);
    assert.equal(queue.text.includes('rubric'), false);

    // Every other read-side tool is checked too: the queue is not the only way
    // out of this server.
    for (const [name, args] of [['sparring_projects', {}], ['sparring_topics', {}], ['sparring_topics', { project: 'raptor' }]]) {
      const response = await callTool(state, name, args);
      assert.equal(response.text.includes('HIDDEN RUBRIC'), false, `${name} leaked a rubric`);
    }

    const full = await callTool(state, 'sparring_rubric', { card: 'c001' });
    assert.equal(full.isError, false);
    assert.deepEqual(full.value.rubric, ['THE HIDDEN RUBRIC LINE']);

    const missing = await callTool(state, 'sparring_rubric', { card: 'nope' });
    assert.equal(missing.isError, true);
    assert.equal(missing.value, 'card not found: nope');
  } finally {
    delete process.env.SPARRING_NOW;
  }
});

test('MCP records an attempt, contests it, and never leaks a rubric doing either', async () => {
  process.env.SPARRING_NOW = '2026-03-10T09:00:00Z';
  const state = openState(home());
  try {
    await seed(state);
    const recorded = await callTool(state, 'sparring_record', {
      card: 'c001', grade: 'wrong', question: 'What happens?', context: 'raptor',
      answer: 'Nothing.', gap: 'missed the fencing token', mode: 'drill',
    });
    assert.equal(recorded.isError, false);
    assert.equal(recorded.value.card, 'c001');
    assert.equal(recorded.text.includes('HIDDEN RUBRIC'), false);

    const attempts = state.db.prepare('select id from attempts order by id').all();
    assert.equal(attempts.length, 1);
    const contested = await callTool(state, 'sparring_contest', { attempt: attempts[0].id, userGrade: 'partial' });
    assert.equal(contested.isError, false);
    assert.equal(contested.value.grade, 'partial');
    assert.equal(contested.text.includes('HIDDEN RUBRIC'), false);

    // A grade the schedule cannot hold is refused at the boundary. Appending it
    // first and discovering the database will not have it is how an append-only
    // log stops replaying.
    const bad = await callTool(state, 'sparring_record', { card: 'c001', grade: 'excellent' });
    assert.equal(bad.isError, true);
    assert.equal(bad.value, 'grade must be one of wrong, partial, correct');
    assert.equal(state.db.prepare('select count(*) as n from attempts').get().n, 1);
    const stray = await callTool(state, 'sparring_due', { n: 5 });
    assert.equal(stray.isError, false, 'the log still replays after a refused grade');
  } finally {
    delete process.env.SPARRING_NOW;
  }
});

test('an invalid lesson is refused with every error and nothing is stored', async () => {
  const state = openState(home());
  const refused = await callTool(state, 'sparring_author_lesson', {
    lesson: {
      version: 1,
      id: 'broken',
      project: 'raptor',
      title: 'Broken',
      topics: ['locks'],
      created: '2026-03-10T09:00:00Z',
      blocks: [
        { type: 'prose', heading: 'Hello' },
        { type: 'nonsense', body: 'x' },
      ],
    },
  });
  assert.equal(refused.isError, false);
  assert.equal(refused.value.ok, false);
  assert.equal(refused.value.stored, false);
  assert.ok(refused.value.errors.length >= 3);
  assert.ok(refused.value.errors.every((error) => 'block' in error && 'field' in error && 'message' in error));
  assert.ok(refused.value.errors.some((error) => error.message.includes('unknown component type "nonsense"')));
  assert.ok(refused.value.errors.some((error) => error.message.includes('gradable')));
  assert.equal(fs.existsSync(path.join(state.home, 'lessons')), false);

  const valid = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../lesson/examples/redis-locking.json', import.meta.url)), 'utf8'));
  const accepted = await callTool(state, 'sparring_author_lesson', { lesson: valid });
  assert.equal(accepted.value.ok, true);
  assert.equal(accepted.value.stored, true);
  const stored = path.join(state.home, 'lessons', `${valid.id}.json`);
  assert.deepEqual(JSON.parse(fs.readFileSync(stored, 'utf8')), valid);

  // A lesson id is a file name before it is anything else.
  const traversal = await callTool(state, 'sparring_author_lesson', { lesson: { ...valid, id: '../../escaped' } });
  assert.equal(traversal.value.ok, false);
  assert.equal(traversal.value.stored, false);
  assert.equal(traversal.value.errors[0].field, 'id');
  assert.equal(fs.existsSync(path.join(state.home, '..', '..', 'escaped.json')), false);
});

function git(dir, args) {
  return execFileSync('git', args, {
    cwd: dir,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_AUTHOR_NAME: 'Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'Fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
      GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
      LC_ALL: 'C',
    },
  });
}

test('a survey claim that cannot verify comes back with its real status, never dropped and never upgraded', async () => {
  const state = openState(home());
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'sparring-repo-'));
  git(repo, ['init', '-q']);
  git(repo, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
  fs.writeFileSync(path.join(repo, 'lock.mjs'), 'export function acquire() {\n  return true;\n}\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '-m', 'first']);
  const commit = git(repo, ['rev-parse', 'HEAD']).trim();

  const submitted = await callTool(state, 'sparring_survey_submit', {
    repo,
    commit,
    claims: [
      {
        id: 'part-invented',
        type: 'part',
        status: 'verified',
        sentence: 'The renewal daemon lives here.',
        path: 'daemon/renew.mjs',
        fromLine: 1,
        toLine: 4,
        commit,
        spanHash: null,
        extractor: 'test',
        unresolved: [],
        coverage: [],
      },
      {
        id: 'topic-shapeless',
        type: 'topic',
        status: 'verified',
        sentence: 'Leases are the core idea.',
        extractor: '',
      },
    ],
  });

  assert.equal(submitted.isError, false);
  assert.equal(submitted.value.claims.length, 2, 'no claim is dropped from the answer');

  const invented = submitted.value.claims.find((claim) => claim.id === 'part-invented');
  assert.equal(invented.declaredStatus, 'verified');
  assert.equal(invented.status, 'contradicted');
  assert.ok(invented.reasons.some((reason) => reason.detail.includes('does not exist')));

  const shapeless = submitted.value.claims.find((claim) => claim.sentence === 'Leases are the core idea.');
  assert.equal(shapeless.declaredStatus, 'verified');
  assert.equal(shapeless.status, 'unchecked');

  assert.equal(submitted.value.summary.shownAsFact, 0);
  assert.equal(submitted.value.summary.downgradedFromVerified, 2);
  assert.equal(fs.readdirSync(path.join(state.home, 'surveys')).length, 1);

  fs.rmSync(repo, { recursive: true, force: true });
});

test('the MCP transport answers JSON or request-scoped events and refuses the rest', async () => {
  const state = openState(home());

  const events = await post(state, { jsonrpc: '2.0', id: 7, method: 'ping', params: {} }, {
    headers: { accept: 'text/event-stream' },
  });
  assert.equal(events.status, 200);
  assert.match(events.headers['content-type'], /text\/event-stream/);
  assert.match(events.text, /^event: message\ndata: /);
  assert.deepEqual(JSON.parse(events.text.slice(events.text.indexOf('data: ') + 6).trim()), { jsonrpc: '2.0', id: 7, result: {} });

  const notification = await post(state, { jsonrpc: '2.0', method: 'notifications/initialized' });
  assert.equal(notification.status, 202);
  assert.equal(notification.text, '');

  const get = await post(state, undefined, { method: 'GET' });
  assert.equal(get.status, 405);
  assert.equal(get.headers.allow, 'POST');

  const deleted = await post(state, undefined, { method: 'DELETE' });
  assert.equal(deleted.status, 405);

  const wrongType = await post(state, { jsonrpc: '2.0', id: 1, method: 'ping' }, { headers: { 'content-type': 'text/plain' } });
  assert.equal(wrongType.status, 415);

  const batch = await post(state, [{ jsonrpc: '2.0', id: 1, method: 'ping' }]);
  assert.equal(batch.status, 400);
  assert.match(JSON.parse(batch.text).error.message, /batching is not supported/);

  const unknown = await rpc(state, 'resources/list', {});
  assert.equal(unknown.body.error.code, -32601);

  const noTool = await rpc(state, 'tools/call', { name: 'sparring_nope', arguments: {} });
  assert.equal(noTool.body.error.code, -32602);

  const notJsonRpc = await post(state, { id: 1, method: 'ping' });
  assert.equal(JSON.parse(notJsonRpc.text).error.code, -32600);
});

test('every tool description names what the tool is for', () => {
  for (const tool of toolDefinitions()) {
    assert.equal(typeof tool.title, 'string');
    assert.ok(tool.description.trim().length > 0);
    assert.equal(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(`${tool.title}${tool.description}`), false, `${tool.name} contains an emoji`);
  }
});

test('importing the server module binds no port', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const state = home();
  const output = execFileSync(process.execPath, [
    '-e',
    "import('./server/index.mjs').then((m) => process.stdout.write(typeof m.start));",
  ], { cwd: root, encoding: 'utf8', env: { ...process.env, SPARRING_HOME: state } });
  assert.equal(output, 'function');
  assert.equal(fs.existsSync(path.join(state, 'port')), false);
});
