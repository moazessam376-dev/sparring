import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function ensureToken(home) {
  fs.mkdirSync(home, { recursive: true });
  const file = path.join(home, 'token');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const token = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, `${token}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  return token;
}

// Incoming Node headers are lowercased, but the guard is also called with
// hand-built objects in tests and by the health path, so read both spellings.
function headerOf(req, name) {
  const headers = req?.headers ?? {};
  const lower = headers[name];
  if (lower !== undefined) return lower;
  const capitalised = name.replace(/(^|-)([a-z])/g, (_, lead, letter) => lead + letter.toUpperCase());
  return headers[capitalised];
}

// What the webview is allowed to send and what it is allowed to call. The
// browser asks about these on the preflight and discards the real response if
// they do not cover what it wanted.
const DEFAULT_ALLOW_HEADERS = 'authorization, content-type, accept';
const DEFAULT_ALLOW_METHODS = 'GET, POST, OPTIONS';
// A preflight result may be cached this long, so an authorized fetch does not
// cost two round trips every time.
const PREFLIGHT_MAX_AGE = '600';

function loopbackOrigin(parsed) {
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  return parsed.hostname === 'localhost'
    || parsed.hostname === '127.0.0.1'
    || parsed.hostname === '[::1]';
}

// The packaged application is a Tauri webview, and a Tauri webview sends
// `Origin: tauri://localhost`. Refusing that scheme is what made the shipped
// application unable to reach its own sidecar, while the dev server on
// http://127.0.0.1:1420 worked.
//
// Widening to `tauri:` does not reopen the DNS-rebinding hole the loopback
// check was written to close. A browser sets the Origin header itself and will
// not let a page forge one, so a hostile web page cannot present
// `tauri://localhost` however it resolves its DNS; the scheme is not one a page
// on the web can be served from at all. And the origin check was never the only
// lock: every route still requires the bearer token from the 0600 token file,
// which a rebound page cannot read.
export function allowedOrigin(origin) {
  if (typeof origin !== 'string' || !origin) return false;
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.protocol === 'tauri:') return true;
  return loopbackOrigin(parsed);
}

// The headers that let the browser keep a response it was allowed to make.
// Without an echoed allow-origin the request succeeds on the wire and is then
// thrown away by the webview, which is indistinguishable from a refusal.
// A wildcard is not used: the specific allowed origin is echoed back.
export function corsHeaders(req) {
  const origin = headerOf(req, 'origin');
  // No Origin at all is a non-browser caller (curl, the CLI, a test). There is
  // nothing to echo and nothing to relax.
  if (origin === undefined) return {};
  if (!allowedOrigin(origin)) return { vary: 'Origin' };
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    vary: 'Origin',
  };
}

// A preflight is not a request for data: it carries no token, because a browser
// never puts Authorization on one, and it must be answered before the guard or
// the Authorization header the interface sends would make every call fail on a
// 403 the application never gets to see. It reads and writes nothing.
export function preflight(req) {
  if (req?.method !== 'OPTIONS') return null;
  const origin = headerOf(req, 'origin');
  if (origin !== undefined && !allowedOrigin(origin)) {
    return { status: 403, headers: { vary: 'Origin' }, message: 'origin not allowed' };
  }
  const requestedHeaders = headerOf(req, 'access-control-request-headers');
  const requestedMethod = headerOf(req, 'access-control-request-method');
  // Answer about the method the preflight actually asked for, so a route this
  // server grows later is not refused by a stale list.
  const methods = DEFAULT_ALLOW_METHODS.split(', ');
  if (typeof requestedMethod === 'string' && requestedMethod !== '' && !methods.includes(requestedMethod.toUpperCase())) {
    methods.push(requestedMethod.toUpperCase());
  }
  const headers = {
    ...corsHeaders(req),
    'access-control-allow-methods': methods.join(', '),
    'access-control-allow-headers': typeof requestedHeaders === 'string' && requestedHeaders
      ? requestedHeaders
      : DEFAULT_ALLOW_HEADERS,
    'access-control-max-age': PREFLIGHT_MAX_AGE,
  };
  // Chromium asks permission before letting any origin reach a private address.
  // WKWebView does not send this, but WebView2 on Windows does.
  if (headerOf(req, 'access-control-request-private-network') === 'true') {
    headers['access-control-allow-private-network'] = 'true';
  }
  return { status: 204, headers };
}

export function guard(req, token) {
  const origin = headerOf(req, 'origin');
  if (origin !== undefined && !allowedOrigin(origin)) {
    return { status: 403, message: 'origin not allowed' };
  }

  const authorization = headerOf(req, 'authorization');
  const match = typeof authorization === 'string' ? /^Bearer\s+(.+)$/i.exec(authorization) : null;
  if (!match || match[1].trim() !== token) {
    return { status: 401, message: 'authorization required' };
  }
  return null;
}
