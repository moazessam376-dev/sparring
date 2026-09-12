import { start } from './index.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
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

await post('/api/projects', { project: 'probe', name: 'Probe' });
await post('/api/topics', [{ topic: 'locks', name: 'locks', parent: null, kind: 'technology', project: 'probe' }]);
const added = await post('/api/cards', [{ card: 'p1', project: 'probe', concept: 'c', ask: 'a',
  rubric: ['THE SECRET RUBRIC LINE'], altitude: 'mechanism', topics: ['locks'],
  grounding: [{ path: 'x.js', line: 1, commit: 'abc1234' }], contexts: ['probe'], source: { type: 'probe', ref: '1' } }]);
check('cards accepted', added.status === 200, added.body.slice(0, 160));
const dueRes = await j('/api/due?n=5', { headers: H });
check('the queue never carries a rubric', !dueRes.body.includes('SECRET') && !dueRes.body.includes('rubric'), dueRes.body.slice(0, 200));
const cardRes = await j('/api/card/p1', { headers: H });
check('the card route does carry the rubric, on purpose', cardRes.body.includes('SECRET'));
const att = await post('/api/attempt', { card: 'p1', grade: 'correct', mode: 'drill' });
check('an attempt is recorded', att.status === 200, att.body.slice(0, 160));
const st = await j('/api/standing?project=probe', { headers: H });
check('standing reflects it', st.status === 200 && st.body.includes('score'), st.body.slice(0, 160));
check('an unknown route is a 404 in json', (await j('/api/nope', { headers: H })).status === 404);

s.close();
console.log(fail === 0 ? '\nALL PROBES PASSED' : `\n${fail} PROBE(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
