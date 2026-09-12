import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const MAX_PATTERN_LENGTH = 512;
export const PATTERN_TIMEOUT_MS = 500;
export const MAX_QUERY_BYTES = 8 * 1024 * 1024;
const worker = fileURLToPath(new URL('./pattern-worker.mjs', import.meta.url));

export function validatePattern(pattern) {
  if (typeof pattern !== 'string' || !pattern.length || pattern.length > MAX_PATTERN_LENGTH) {
    throw new Error(`pattern must contain 1-${MAX_PATTERN_LENGTH} characters`);
  }
}

// A timer on the same event loop cannot interrupt RegExp.exec. Isolate every
// search in trusted Node code and kill that process on timeout, including regex
// compilation. No shell, repository cwd, inherited NODE_OPTIONS, or repo code.
export function matchTexts(pattern, texts, flags = 'm') {
  validatePattern(pattern);
  if (texts.reduce((n, text) => n + Buffer.byteLength(text), 0) > MAX_QUERY_BYTES) {
    throw new Error('query input budget exceeded');
  }
  try {
    return JSON.parse(execFileSync(process.execPath, [worker], {
      input: JSON.stringify({ pattern, flags, texts }),
      encoding: 'utf8', timeout: PATTERN_TIMEOUT_MS, killSignal: 'SIGKILL',
      maxBuffer: 16 * 1024 * 1024, env: {}, cwd: fileURLToPath(new URL('.', import.meta.url)),
      stdio: ['pipe', 'pipe', 'pipe'],
    }));
  } catch (error) {
    throw new Error(`pattern search failed or timed out: ${error.code ?? error.status}`);
  }
}
