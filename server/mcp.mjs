import fs from 'node:fs';
import path from 'node:path';
import {
  addCards,
  addTopics,
  card,
  contest,
  due,
  projects,
  record,
  topics,
} from '../core/index.mjs';
import { validate } from '../lesson/validate.mjs';
import { storeSurvey } from '../survey/store.mjs';
import { verify } from '../survey/verify.mjs';
import { noteAgent } from './presence.mjs';

// The Model Context Protocol endpoint. Streamable HTTP, JSON-RPC 2.0 over one
// POST endpoint, protocol revision 2026-07-28. The legacy HTTP+SSE transport of
// the 2024-11-05 revision is deliberately absent: the transport specification
// says new implementations should not adopt it. Evidence:
// docs/research/2026-09-12-desktop-stack.md, finding 6.
//
// The bearer token and the Origin check that server/auth.mjs enforces are
// applied by server/index.mjs before a request reaches this file, and the
// listener binds 127.0.0.1 only. That Origin check is what stops DNS rebinding,
// which the transport specification calls out by name.
//
// Nothing here decides anything. Every tool is a wrapper over a core, lesson or
// survey export, so a rule that holds in the core holds here too.

export const PROTOCOL_VERSION = '2026-07-28';
export const SUPPORTED_PROTOCOL_VERSIONS = Object.freeze([PROTOCOL_VERSION]);
export const SERVER_INFO = Object.freeze({ name: 'sparring', title: 'Sparring', version: '1' });

const MAX_BODY = 2 * 1024 * 1024;

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

const INSTRUCTIONS = [
  'Sparring is a spaced-repetition interviewer for code the candidate wrote.',
  'Call sparring_projects, then sparring_due to draw a queue.',
  'The queue never carries a rubric, and that is the point: ask the question,',
  'make the candidate commit to an answer, and only then call sparring_rubric',
  'to grade it. Record every answer with sparring_record, including the wrong',
  'ones, because the schedule is built from them.',
].join(' ');

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function requireObject(args) {
  if (!isRecord(args)) throw new Error('arguments must be an object');
  return args;
}

function requireString(args, name) {
  const value = args[name];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be a non-empty string`);
  return value;
}

function requireArray(args, name) {
  const value = args[name];
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
  return value;
}

// A lesson id becomes a file name, so it is checked against the file system
// before it is trusted, not after. A document whose id could walk out of the
// lessons directory is refused with the same error shape the validator uses.
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function storeLesson(home, doc) {
  const dir = path.join(home, 'lessons');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${doc.id}.json`);
  fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
  return file;
}

const TOOLS = [
  {
    name: 'sparring_projects',
    title: 'List projects',
    description: 'List every project in the graph, with the number of concept cards it holds and the number due for review today. Call this first: every other tool is scoped by one of the project ids it returns.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    call: (state) => projects(state),
  },
  {
    name: 'sparring_topics',
    title: 'Read the topic graph',
    description: 'Read the topic graph: every topic with its parent, its kind, how many cards cover it, and the current mastery score and confidence, plus the prerequisite edges between topics. Pass a project id to restrict the graph to one project, or omit it for the whole graph. Use this to decide what to drill next and what a lesson should cover.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: ['string', 'null'], description: 'Project id from sparring_projects. Omit for every topic.' },
      },
      additionalProperties: false,
    },
    call: (state, args) => topics(state, typeof args.project === 'string' && args.project ? args.project : null),
  },
  {
    name: 'sparring_due',
    title: 'Draw the review queue',
    description: 'Draw the cards due for review today, interleaved so that consecutive cards come from different projects and topics. Each card carries its id, concept, the question to ask, its altitude and its schedule. It deliberately does NOT carry the rubric, and it does NOT carry the grounding either: the grounding is the file and line the answer lives on, and handing it over before the question is asked gives the answer away as surely as the rubric does. Both arrive together from sparring_rubric, after the answer. Ask the question as written, make the candidate commit to an answer, and only then call sparring_rubric. Showing a rubric before the answer destroys the measurement the whole system is built on.',
    inputSchema: {
      type: 'object',
      properties: {
        n: { type: 'integer', minimum: 0, maximum: 100, description: 'How many cards to draw. Defaults to 12.' },
        includeMature: { type: 'boolean', description: 'Include cards whose schedule is already long. Defaults to false.' },
      },
      additionalProperties: false,
    },
    call: (state, args) => due(state, {
      n: args.n ?? undefined,
      includeMature: args.includeMature === true,
    }),
  },
  {
    name: 'sparring_rubric',
    title: 'Fetch one card in full, rubric included',
    description: 'Fetch one card in full, including the grading rubric, the grounding lines in the repository and the topics it belongs to. This is the one tool in this server that returns a rubric, and it exists only so that an answer can be graded. Call it AFTER the candidate has committed an answer, never before, and never read the rubric text aloud as part of the question. Grade the answer against the rubric lines, then record the grade with sparring_record.',
    inputSchema: {
      type: 'object',
      properties: {
        card: { type: 'string', description: 'Card id, as returned by sparring_due.' },
      },
      required: ['card'],
      additionalProperties: false,
    },
    call: (state, args) => card(state, requireString(args, 'card')),
  },
  {
    name: 'sparring_record',
    title: 'Record an attempt',
    description: 'Record one graded attempt against a card. The grade is wrong, partial or correct, judged against the card rubric. Record every attempt, especially the wrong ones: the review schedule and the difficulty ratings are rebuilt from this history, so an unrecorded answer is an answer the system will ask about again at the wrong time. Include the answer the candidate actually gave and, when they were wrong, a one-line gap describing what they missed. Returns the card new schedule.',
    inputSchema: {
      type: 'object',
      properties: {
        card: { type: 'string', description: 'Card id.' },
        grade: { type: 'string', enum: ['wrong', 'partial', 'correct'], description: 'The grade, judged against the rubric.' },
        question: { type: ['string', 'null'], description: 'The question as it was actually asked.' },
        context: { type: ['string', 'null'], description: 'The project or scenario the question was asked in.' },
        answer: { type: ['string', 'null'], description: 'What the candidate said, in their words.' },
        gap: { type: ['string', 'null'], description: 'One line naming what the candidate missed. Null when they were right.' },
        mode: { type: 'string', enum: ['drill', 'mock', 'transfer', 'lesson'], description: 'Which mode produced the attempt. Defaults to drill.' },
      },
      required: ['card', 'grade'],
      additionalProperties: false,
    },
    call: (state, args) => {
      requireString(args, 'card');
      requireString(args, 'grade');
      return record(state, {
        card: args.card,
        grade: args.grade,
        question: args.question ?? null,
        context: args.context ?? null,
        answer: args.answer ?? null,
        gap: args.gap ?? null,
        mode: args.mode ?? 'drill',
      });
    },
  },
  {
    name: 'sparring_contest',
    title: 'Contest a grade',
    description: 'Correct a grade that was already recorded, when the candidate argues successfully that the answer was better or worse than it was marked. The original attempt is kept and the correction is appended, so the disagreement stays in the record rather than replacing it. Returns the attempt as it now stands.',
    inputSchema: {
      type: 'object',
      properties: {
        attempt: { type: 'string', description: 'Attempt id from the recorded attempt.' },
        userGrade: { type: 'string', enum: ['wrong', 'partial', 'correct'], description: 'The grade the candidate argues for.' },
      },
      required: ['attempt', 'userGrade'],
      additionalProperties: false,
    },
    call: (state, args) => {
      requireString(args, 'attempt');
      requireString(args, 'userGrade');
      return contest(state, { attempt: args.attempt, userGrade: args.userGrade });
    },
  },
  {
    name: 'sparring_add_topics',
    title: 'Add topics to the graph',
    description: 'Add topics to the graph, optionally linking each one to a project. A topic is the unit mastery is measured against, so name it after a thing in the system rather than after a lesson. Give a parent to nest a topic under a broader one. Returns how many topics were appended.',
    inputSchema: {
      type: 'object',
      properties: {
        topics: {
          type: 'array',
          description: 'The topics to add.',
          items: {
            type: 'object',
            properties: {
              topic: { type: 'string', description: 'Stable topic id.' },
              name: { type: 'string', description: 'Human-readable name.' },
              parent: { type: ['string', 'null'], description: 'Parent topic id, or null.' },
              kind: { type: 'string', description: 'What sort of topic this is, for example concept or technology.' },
              project: { type: ['string', 'null'], description: 'Project id to link the topic to.' },
            },
            required: ['topic', 'name'],
          },
        },
      },
      required: ['topics'],
      additionalProperties: false,
    },
    call: (state, args) => ({ added: addTopics(state, requireArray(args, 'topics')) }),
  },
  {
    name: 'sparring_add_cards',
    title: 'Add concept cards',
    description: 'Add concept cards to the bank. Every card needs a project, a concept, the question to ask, an altitude (map, boundary, mechanism or line), one to six rubric lines that decide a correct answer, at least one topic, and grounding: the exact path, line and commit in the repository the card is about. A card without grounding cannot be checked against the code later, so it is refused. Returns the ids that were added.',
    inputSchema: {
      type: 'object',
      properties: {
        cards: {
          type: 'array',
          description: 'The cards to add.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Stable card id.' },
              project: { type: 'string', description: 'Project id.' },
              concept: { type: 'string', description: 'The one idea this card tests.' },
              ask: { type: 'string', description: 'The question, as it should be asked.' },
              rubric: {
                type: 'array',
                minItems: 1,
                maxItems: 6,
                items: { type: 'string' },
                description: 'One to six lines a correct answer must contain.',
              },
              altitude: { type: 'string', enum: ['map', 'boundary', 'mechanism', 'line'], description: 'How far from the code the question sits.' },
              topics: { type: 'array', minItems: 1, items: { type: 'string' }, description: 'Topic ids this card measures.' },
              grounding: {
                type: 'array',
                description: 'Where in the repository this card is grounded.',
                items: {
                  type: 'object',
                  properties: {
                    path: { type: 'string', description: 'Repository-relative path.' },
                    line: { type: 'integer', minimum: 1, description: 'Line number.' },
                    commit: { type: ['string', 'null'], description: 'Commit the line was read at.' },
                  },
                  required: ['path', 'line', 'commit'],
                },
              },
              contexts: { type: 'array', items: { type: 'string' }, description: 'Contexts the question can be asked in.' },
              source: { type: 'object', description: 'What produced the card, for example {type, ref}.' },
            },
            required: ['id', 'project', 'concept', 'ask', 'rubric', 'altitude', 'topics', 'grounding'],
          },
        },
      },
      required: ['cards'],
      additionalProperties: false,
    },
    call: (state, args) => ({ added: addCards(state, requireArray(args, 'cards')) }),
  },
  {
    name: 'sparring_author_lesson',
    title: 'Author a lesson',
    description: 'Submit a lesson document. The document is checked against the component catalogue before anything is stored: every block must be a known component with every field its component declares, and the lesson must hold between three and twelve gradable blocks. An invalid lesson is refused with the complete list of errors, each naming the block index, the field and what is wrong, and nothing is stored. Fix every error and submit again rather than dropping the blocks that failed.',
    inputSchema: {
      type: 'object',
      properties: {
        lesson: {
          type: 'object',
          description: 'The lesson document: version, id, project, title, topics, blocks, created.',
        },
      },
      required: ['lesson'],
      additionalProperties: false,
    },
    call: (state, args) => {
      const doc = args.lesson;
      if (!isRecord(doc)) throw new Error('lesson must be an object');
      const result = validate(doc);
      if (!result.ok) return { ok: false, stored: false, errors: result.errors };
      if (typeof doc.id !== 'string' || !SAFE_ID.test(doc.id)) {
        return {
          ok: false,
          stored: false,
          errors: [{ block: null, field: 'id', message: 'must be letters, digits, dot, dash or underscore, starting with a letter or digit' }],
        };
      }
      storeLesson(state.home, doc);
      return { ok: true, stored: true, lesson: doc.id, blocks: doc.blocks.length };
    },
  },
  {
    name: 'sparring_survey_submit',
    title: 'Submit survey claims for verification',
    description: 'Submit the claims a repository survey produced. Nothing here believes them. Every claim is re-derived from the repository itself: the cited commit must resolve, the cited path must exist at it, the line range must be inside the file, the span must still hash to what the claim recorded, and a constraint pattern must actually match tracked code. The status the claim arrived with is discarded before checking, because an agent-written status is the thing under test. A claim that does not verify is kept with the status the repository supports, one of inferred, stale, unchecked or contradicted. It is never silently dropped and it is never upgraded. Returns the resolved status and the reasons for every claim, plus exhaustive file coverage.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Absolute path to the git repository being surveyed.' },
        commit: { type: ['string', 'null'], description: 'The commit the survey read. Null surveys the working tree.' },
        claims: {
          type: 'array',
          maxItems: 100,
          description: 'The claims to check. Each carries its type, sentence, path, line range, commit, span hash, extractor and the evidence its type requires.',
          items: { type: 'object' },
        },
        exclude: {
          type: 'array',
          items: { type: 'string' },
          description: 'Paths or prefixes to label excluded rather than pending in the coverage report.',
        },
      },
      required: ['repo', 'claims'],
      additionalProperties: false,
    },
    call: (state, args) => {
      const repo = requireString(args, 'repo');
      const claims = requireArray(args, 'claims');
      const commit = typeof args.commit === 'string' && args.commit ? args.commit : null;
      const exclude = Array.isArray(args.exclude) ? args.exclude : [];
      const result = verify(repo, commit, claims, { exclude });
      storeSurvey(state.home, repo, result);
      return {
        summary: result.summary,
        coverage: result.coverage.counts,
        claims: result.claims.map((claim) => ({
          id: claim.id,
          type: claim.type,
          sentence: claim.sentence,
          path: claim.path,
          fromLine: claim.fromLine,
          toLine: claim.toLine,
          status: claim.status,
          declaredStatus: claim.declaredStatus,
          reasons: claim.reasons,
        })),
      };
    },
  },
];

const BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

function typeMatches(value, type) {
  if (Array.isArray(type)) return type.some((one) => typeMatches(value, one));
  if (type === 'null') return value === null;
  if (type === 'string') return typeof value === 'string';
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return isRecord(value);
  return true;
}

// The server enforces the schema it publishes. This is not a second opinion
// about the rules the core owns; it is the difference between a tool that
// refuses a grade of "excellent" and a tool that appends it to the event log and
// only then discovers the database will not have it.
function checkArguments(schema, args) {
  const properties = isRecord(schema.properties) ? schema.properties : {};
  for (const name of schema.required ?? []) {
    if (args[name] === undefined || args[name] === null) throw new Error(`${name} is required`);
  }
  for (const [name, value] of Object.entries(args)) {
    const property = properties[name];
    if (!property) {
      if (schema.additionalProperties === false) throw new Error(`unknown argument: ${name}`);
      continue;
    }
    if (value === undefined) continue;
    if (property.type !== undefined && !typeMatches(value, property.type)) {
      const expected = Array.isArray(property.type) ? property.type.join(' or ') : property.type;
      throw new Error(`${name} must be ${expected}`);
    }
    if (Array.isArray(property.enum) && !property.enum.includes(value)) {
      throw new Error(`${name} must be one of ${property.enum.join(', ')}`);
    }
  }
  return args;
}

export function toolDefinitions() {
  return TOOLS.map(({ name, title, description, inputSchema }) => ({ name, title, description, inputSchema }));
}

function result(id, value) {
  return { jsonrpc: '2.0', id, result: value };
}

function failure(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', id: id ?? null, error };
}

function textContent(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return [{ type: 'text', text }];
}

function callTool(state, params, id) {
  if (!isRecord(params)) return failure(id, INVALID_PARAMS, 'params must be an object');
  const name = params.name;
  if (typeof name !== 'string' || !BY_NAME.has(name)) {
    return failure(id, INVALID_PARAMS, `unknown tool: ${typeof name === 'string' ? name : 'missing name'}`);
  }
  const tool = BY_NAME.get(name);
  const args = params.arguments === undefined ? {} : params.arguments;
  let value;
  try {
    value = tool.call(state, checkArguments(tool.inputSchema, requireObject(args)));
  } catch (error) {
    // A tool that refuses is a tool result, not a protocol error: the agent has
    // to read the reason and try again, and a JSON-RPC error would be reported
    // to the user as a broken connection instead.
    return result(id, { content: textContent(error.message || 'tool failed'), isError: true });
  }
  const payload = { content: textContent(value), isError: false };
  if (isRecord(value)) payload.structuredContent = value;
  return result(id, payload);
}

/**
 * Dispatch one JSON-RPC message. Returns a response object, or null when the
 * message was a notification and carries no reply.
 */
export function dispatch(state, message) {
  // An agent said something. Nothing about what is recorded, and nothing is
  // persisted; the survey screen only has to be able to tell "no agent is
  // connected" from "an agent is working" instead of waiting for ever beside a
  // window nothing is attached to.
  noteAgent();
  if (!isRecord(message)) return failure(null, INVALID_REQUEST, 'a JSON-RPC message must be an object');
  if (message.jsonrpc !== '2.0') return failure(message.id ?? null, INVALID_REQUEST, 'jsonrpc must be "2.0"');
  if (typeof message.method !== 'string') return failure(message.id ?? null, INVALID_REQUEST, 'method must be a string');

  const notification = message.id === undefined || message.id === null;
  const id = notification ? null : message.id;
  const params = message.params;

  if (message.method === 'initialize') {
    const requested = isRecord(params) ? params.protocolVersion : undefined;
    if (typeof requested !== 'string' || !SUPPORTED_PROTOCOL_VERSIONS.includes(requested)) {
      // Guessing here is the failure mode worth avoiding: an agent speaking a
      // revision this server does not implement should be told so, not served a
      // response shaped for a different protocol.
      return failure(
        id,
        INVALID_PARAMS,
        `unsupported protocol version: ${typeof requested === 'string' ? requested : 'missing'}`,
        { supported: [...SUPPORTED_PROTOCOL_VERSIONS] },
      );
    }
    return result(id, {
      protocolVersion: requested,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { ...SERVER_INFO },
      instructions: INSTRUCTIONS,
    });
  }

  if (message.method === 'notifications/initialized') return null;
  if (notification) return null;

  if (message.method === 'ping') return result(id, {});
  if (message.method === 'tools/list') return result(id, { tools: toolDefinitions() });
  if (message.method === 'tools/call') return callTool(state, params, id);

  return failure(id, METHOD_NOT_FOUND, `unknown method: ${message.method}`);
}

function send(res, status, value, headers = {}) {
  if (res.headersSent) return;
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(value === undefined ? null : value));
}

// Request-scoped server-sent events: one response, on the stream the POST
// opened, then the stream closes. There is no long-lived GET stream and no
// protocol-level session in this revision.
function sendEvents(res, message) {
  if (res.headersSent) return;
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-store',
    connection: 'keep-alive',
  });
  res.end(`event: message\ndata: ${JSON.stringify(message)}\n\n`);
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
        reject(Object.assign(new Error('request body must be valid JSON'), { status: 400, parse: true }));
      }
    });
    req.on('error', reject);
  });
}

function accepts(headers, type) {
  const accept = headers.accept ?? headers.Accept;
  if (typeof accept !== 'string' || accept.trim() === '') return true;
  return accept.includes(type) || accept.includes('*/*');
}

export async function handle(state, req, res) {
  const headers = req.headers ?? {};

  // No GET stream and no session to delete in this revision, so both are
  // refused with the method the endpoint does accept.
  if (req.method !== 'POST') {
    send(res, 405, failure(null, INVALID_REQUEST, 'the MCP endpoint accepts POST'), { allow: 'POST' });
    return;
  }

  const contentType = headers['content-type'] ?? headers['Content-Type'];
  if (typeof contentType !== 'string' || !contentType.toLowerCase().includes('application/json')) {
    send(res, 415, failure(null, INVALID_REQUEST, 'content-type must be application/json'));
    return;
  }

  const wantsJson = accepts(headers, 'application/json');
  const wantsEvents = accepts(headers, 'text/event-stream');
  if (!wantsJson && !wantsEvents) {
    send(res, 406, failure(null, INVALID_REQUEST, 'accept must allow application/json or text/event-stream'));
    return;
  }

  const declared = headers['mcp-protocol-version'] ?? headers['MCP-Protocol-Version'];
  if (typeof declared === 'string' && declared.trim() !== '' && !SUPPORTED_PROTOCOL_VERSIONS.includes(declared.trim())) {
    send(res, 400, failure(null, INVALID_PARAMS, `unsupported protocol version: ${declared.trim()}`, { supported: [...SUPPORTED_PROTOCOL_VERSIONS] }));
    return;
  }

  let message;
  try {
    message = await readBody(req);
  } catch (error) {
    if (error.parse) {
      send(res, 400, failure(null, PARSE_ERROR, error.message));
      return;
    }
    send(res, error.status ?? 400, failure(null, INVALID_REQUEST, error.message || 'bad request'));
    return;
  }

  if (Array.isArray(message)) {
    // JSON-RPC batching is not part of this revision.
    send(res, 400, failure(null, INVALID_REQUEST, 'send one JSON-RPC message per request; batching is not supported'));
    return;
  }

  let response;
  try {
    response = dispatch(state, message);
  } catch (error) {
    send(res, 200, failure(isRecord(message) ? message.id ?? null : null, INTERNAL_ERROR, error.message || 'internal error'));
    return;
  }

  if (response === null) {
    if (res.headersSent) return;
    res.writeHead(202, {});
    res.end();
    return;
  }

  // JSON unless the client asked only for a stream.
  if (!wantsJson && wantsEvents) sendEvents(res, response);
  else send(res, 200, response);
}
