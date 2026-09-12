import { start } from './index.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-'));
const s = await start({ home });
const base = `http://127.0.0.1:${s.port}`;
const H = { Authorization: `Bearer ${s.token}` };
const j = async (p, o = {}) => { const r = await fetch(base + p, o); return { status: r.status, body: await r.text() }; };
const post = (p, b, o = {}) => j(p, { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify(b), ...o });
let fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? 'pass  ' : 'FAIL  ') + name + (ok ? '' : '  ' + detail)); if (!ok) fail++; };

check('listening on a port from 4517', s.port >= 4517);
check('port file written', fs.readFileSync(path.join(home, 'port'), 'utf8').trim() === String(s.port));
const mode = (fs.statSync(path.join(home, 'token')).mode & 0o777).toString(8);
check('token file is 0600', mode === '600', 'got ' + mode);

check('health needs no token', (await j('/api/health')).status === 200);
check('due without a token is refused', (await j('/api/due')).status === 401);
check('due with a wrong token is refused', (await j('/api/due', { headers: { Authorization: 'Bearer wrong' } })).status === 401);
check('due with the token is allowed', (await j('/api/due', { headers: H })).status === 200);
const eviloriginres = await j('/api/due', { headers: { ...H, Origin: 'https://evil.example.com' } });
check('a non-loopback Origin is refused even with the token', eviloriginres.status === 403, 'got ' + eviloriginres.status);
check('a loopback Origin is allowed', (await j('/api/due', { headers: { ...H, Origin: `http://127.0.0.1:${s.port}` } })).status === 200);

// The packaged application is a Tauri webview and sends this exact Origin. Each
// of these three was separately enough to make the shipped application fail.
const TAURI = 'tauri://localhost';
const tauriRes = await fetch(base + '/api/due', { headers: { ...H, Origin: TAURI } });
check('the Origin a Tauri webview sends is allowed', tauriRes.status === 200, 'got ' + tauriRes.status);
check('and the response echoes that origin back, or the webview discards it',
  tauriRes.headers.get('access-control-allow-origin') === TAURI,
  'got ' + tauriRes.headers.get('access-control-allow-origin'));
const loopbackRes = await fetch(base + '/api/due', { headers: { ...H, Origin: `http://127.0.0.1:${s.port}` } });
check('the dev origin is echoed back too', loopbackRes.headers.get('access-control-allow-origin') === `http://127.0.0.1:${s.port}`,
  'got ' + loopbackRes.headers.get('access-control-allow-origin'));
check('the echo is never a wildcard', loopbackRes.headers.get('access-control-allow-origin') !== '*');
const logBefore = fs.existsSync(path.join(home, 'log.jsonl')) ? fs.readFileSync(path.join(home, 'log.jsonl'), 'utf8') : '';
const pre = await fetch(base + '/api/due', { method: 'OPTIONS', headers: { Origin: TAURI, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization, content-type' } });
const preBody = await pre.text();
check('the preflight an Authorization header forces succeeds without a token', pre.status === 204 || pre.status === 200, 'got ' + pre.status);
check('the preflight answers the headers and methods it was asked about',
  /authorization/i.test(pre.headers.get('access-control-allow-headers') ?? '') && /GET/.test(pre.headers.get('access-control-allow-methods') ?? ''),
  (pre.headers.get('access-control-allow-headers') ?? 'none') + ' / ' + (pre.headers.get('access-control-allow-methods') ?? 'none'));
check('the preflight carries no body', preBody === '', JSON.stringify(preBody).slice(0, 80));
const logAfter = fs.existsSync(path.join(home, 'log.jsonl')) ? fs.readFileSync(path.join(home, 'log.jsonl'), 'utf8') : '';
check('the preflight touched no state', logAfter === logBefore);
const evilPre = await fetch(base + '/api/due', { method: 'OPTIONS', headers: { Origin: 'https://evil.example.com', 'access-control-request-method': 'GET' } });
check('a hostile origin is still refused on the preflight', evilPre.status === 403, 'got ' + evilPre.status);
check('and a hostile origin is never echoed back', evilPre.headers.get('access-control-allow-origin') === null);
const evilTokenless = await fetch(base + '/api/due', { headers: { Origin: 'https://evil.example.com' } });
check('a hostile origin without a token is refused too', evilTokenless.status === 403, 'got ' + evilTokenless.status);

await post('/api/projects', { project: 'probe', name: 'Probe' });
await post('/api/topics', [{ topic: 'locks', name: 'locks', parent: null, kind: 'technology', project: 'probe' }]);
const added = await post('/api/cards', [{ card: 'p1', project: 'probe', concept: 'c', ask: 'a',
  rubric: ['THE SECRET RUBRIC LINE'], altitude: 'mechanism', topics: ['locks'],
  grounding: [{ path: 'src/WHERE-THE-ANSWER-LIVES.mjs', line: 1, commit: 'abc1234' }], contexts: ['probe'], source: { type: 'probe', ref: 'THE-SOURCE-REF' } }]);
check('cards accepted', added.status === 200, added.body.slice(0, 160));
const dueRes = await j('/api/due?n=5', { headers: H });
check('the queue never carries a rubric', !dueRes.body.includes('SECRET') && !dueRes.body.includes('rubric'), dueRes.body.slice(0, 200));
// Interviewer rule three: the grounding is the file and line the answer lives
// on, so it stays closed until the candidate has answered in their own words.
check('the queue never carries a grounding reference',
  !dueRes.body.includes('WHERE-THE-ANSWER-LIVES') && !dueRes.body.includes('grounding'), dueRes.body.slice(0, 200));
check('nor the source a card was cut from', !dueRes.body.includes('THE-SOURCE-REF'), dueRes.body.slice(0, 200));
check('but it still carries the question to ask', JSON.parse(dueRes.body)[0]?.ask === 'a', dueRes.body.slice(0, 200));
const cardRes = await j('/api/card/p1', { headers: H });
check('the card route does carry the rubric, on purpose', cardRes.body.includes('SECRET'));
check('and the grounding too, on purpose', cardRes.body.includes('WHERE-THE-ANSWER-LIVES'), cardRes.body.slice(0, 200));
const att = await post('/api/attempt', { card: 'p1', grade: 'correct', mode: 'drill' });
check('an attempt is recorded', att.status === 200, att.body.slice(0, 160));
const st = await j('/api/standing?project=probe', { headers: H });
check('standing reflects it', st.status === 200 && st.body.includes('score'), st.body.slice(0, 160));
check('an unknown route is a 404 in json', (await j('/api/nope', { headers: H })).status === 404);

// The MCP endpoint, driven over real HTTP the way an agent drives it.
const MH = { ...H, 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
let rpcId = 0;
const rpc = async (method, params, o = {}) => {
  rpcId += 1;
  const r = await fetch(base + '/mcp', { method: 'POST', headers: { ...MH, ...(o.headers ?? {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: rpcId, method, params }) });
  const body = await r.text();
  return { status: r.status, body, json: body ? JSON.parse(body) : null };
};
const tool = async (name, args) => {
  const r = await rpc('tools/call', { name, arguments: args });
  const payload = r.json?.result;
  const text = payload ? payload.content[0].text : '';
  let value = text; try { value = JSON.parse(text); } catch { /* a refusal is a sentence */ }
  return { ...r, isError: payload?.isError, text, value };
};

check('mcp without a token is refused', (await fetch(base + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status === 401);
const mcpEvil = await fetch(base + '/mcp', { method: 'POST', headers: { ...MH, Origin: 'https://evil.example.com' }, body: '{}' });
check('mcp with a non-loopback Origin is refused', mcpEvil.status === 403, 'got ' + mcpEvil.status);
const revisions = ['2025-03-26', '2025-06-18', '2025-11-25', '2026-07-28'];
for (const revision of revisions) {
  const init = await rpc('initialize', { protocolVersion: revision, capabilities: {}, clientInfo: { name: 'probe', version: '1' } });
  check(`mcp initializes at revision ${revision}`, init.json?.result?.protocolVersion === revision, init.body.slice(0, 200));
}
const newerInit = await rpc('initialize', { protocolVersion: '2099-01-01', capabilities: {}, clientInfo: { name: 'future-probe', version: '1' } });
check('an unknown newer revision negotiates to the server latest', newerInit.json?.result?.protocolVersion === '2026-07-28' && !newerInit.json?.error, newerInit.body.slice(0, 200));
const oldInit = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {} });
check('a pre-Streamable-HTTP revision is refused with a clear error',
  oldInit.json?.error?.code === -32602
  && /predates Streamable HTTP/.test(oldInit.body)
  && /HTTP\+SSE transport is not supported/.test(oldInit.body),
  oldInit.body.slice(0, 240));
const oldList = await rpc('tools/list', {}, { headers: { 'mcp-protocol-version': '2025-03-26' } });
check('an older negotiated revision remains usable on subsequent requests', oldList.status === 200 && !oldList.body.includes('"title"'), oldList.body.slice(0, 200));
const mcpGet = await fetch(base + '/mcp', { headers: H });
check('the legacy sse stream is not served on GET', mcpGet.status === 405, 'got ' + mcpGet.status);
const listed = await rpc('tools/list', {});
const toolNames = (listed.json?.result?.tools ?? []).map((t) => t.name).sort().join(',');
check('mcp lists the ten promised tools', toolNames === 'sparring_add_cards,sparring_add_topics,sparring_author_lesson,sparring_contest,sparring_due,sparring_projects,sparring_record,sparring_rubric,sparring_survey_submit,sparring_topics', toolNames);
check('the tool list never carries a rubric', !listed.body.includes('SECRET'));

const mcpDue = await tool('sparring_due', { n: 5 });
check('the mcp queue never carries a rubric', !mcpDue.text.includes('SECRET') && !mcpDue.text.includes('rubric'), mcpDue.text.slice(0, 200));
check('the mcp queue never carries a grounding reference either',
  !mcpDue.text.includes('WHERE-THE-ANSWER-LIVES') && !mcpDue.text.includes('grounding'), mcpDue.text.slice(0, 200));
const mcpRubric = await tool('sparring_rubric', { card: 'p1' });
check('sparring_rubric does carry the rubric, on purpose', mcpRubric.text.includes('SECRET'), mcpRubric.text.slice(0, 200));
check('and the grounding, on purpose', mcpRubric.text.includes('WHERE-THE-ANSWER-LIVES'), mcpRubric.text.slice(0, 200));

const badLesson = await tool('sparring_author_lesson', { lesson: {
  version: 1, id: 'probe-lesson', project: 'probe', title: 'Broken', topics: ['locks'],
  created: '2026-09-12T00:00:00Z', blocks: [{ type: 'prose', heading: 'Hi' }, { type: 'nonsense' }] } });
check('an invalid lesson is refused with the full error list',
  badLesson.value?.ok === false && badLesson.value?.stored === false && badLesson.value.errors.length >= 3
  && badLesson.value.errors.every((e) => 'block' in e && 'field' in e && 'message' in e),
  JSON.stringify(badLesson.value).slice(0, 300));
check('nothing was stored for the invalid lesson', !fs.existsSync(path.join(home, 'lessons')));

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-repo-'));
const git = (args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', env: { PATH: process.env.PATH, GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 'Probe', GIT_AUTHOR_EMAIL: 'probe@example.invalid', GIT_COMMITTER_NAME: 'Probe', GIT_COMMITTER_EMAIL: 'probe@example.invalid', LC_ALL: 'C' } });
git(['init', '-q']); git(['symbolic-ref', 'HEAD', 'refs/heads/main']);
fs.writeFileSync(path.join(repo, 'lock.mjs'), 'export function acquire() {\n  return true;\n}\n');
git(['add', '-A']); git(['commit', '-q', '-m', 'first']);
const head = git(['rev-parse', 'HEAD']).trim();
const survey = await tool('sparring_survey_submit', { repo, commit: head, claims: [{
  id: 'part-invented', type: 'part', status: 'verified', sentence: 'The renewal daemon lives here.',
  path: 'daemon/renew.mjs', fromLine: 1, toLine: 4, commit: head, spanHash: null,
  extractor: 'probe', unresolved: [], coverage: [] }] });
const resolved = survey.value?.claims?.[0];
check('a claim that cannot verify is kept, not dropped', survey.value?.claims?.length === 1, JSON.stringify(survey.value).slice(0, 300));
check('it comes back with a real non-verified status', resolved?.status === 'contradicted' && resolved?.declaredStatus === 'verified', JSON.stringify(resolved).slice(0, 300));
check('it is never counted as fact', survey.value?.summary?.shownAsFact === 0 && survey.value?.summary?.downgradedFromVerified === 1, JSON.stringify(survey.value?.summary).slice(0, 300));
fs.rmSync(repo, { recursive: true, force: true });

s.close();
console.log(fail === 0 ? '\nALL PROBES PASSED' : `\n${fail} PROBE(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
