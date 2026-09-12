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

function loopbackOrigin(origin) {
  if (typeof origin !== 'string' || !origin) return false;
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  return parsed.hostname === 'localhost'
    || parsed.hostname === '127.0.0.1'
    || parsed.hostname === '[::1]';
}

export function guard(req, token) {
  const headers = req?.headers ?? {};
  const origin = headers.origin ?? headers.Origin;
  if (origin !== undefined && !loopbackOrigin(origin)) {
    return { status: 403, message: 'origin not allowed' };
  }

  const authorization = headers.authorization ?? headers.Authorization;
  const match = typeof authorization === 'string' ? /^Bearer\s+(.+)$/i.exec(authorization) : null;
  if (!match || match[1].trim() !== token) {
    return { status: 401, message: 'authorization required' };
  }
  return null;
}
