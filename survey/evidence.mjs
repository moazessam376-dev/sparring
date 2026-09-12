import { execFileSync } from 'node:child_process';
import nodePath from 'node:path';
import { hashText } from './claim.mjs';
import { matchTexts, validatePattern, MAX_QUERY_BYTES } from './patterns.mjs';

// Mechanical extractors. Every function here returns facts about a repository
// and never an opinion about one.
//
// SECURITY BOUNDARY. A surveyed repository is untrusted input. Nothing in it is
// ever executed: no build, no test, no hook, no script. Every read goes through
// git, git is invoked through execFile rather than a shell so a path can never
// become an argument list, and git itself is started with the escape hatches a
// hostile repository could otherwise write into its own config switched off.
// This is not a preference. A survey runs against code the user did not write.
const HARDENED = [
  '-c', 'core.hooksPath=/dev/null',
  '-c', 'core.fsmonitor=false',
  '-c', 'core.askPass=',
  '-c', 'diff.external=',
  '-c', 'uploadpack.packObjectsHook=',
  '-c', 'protocol.ext.allow=never',
];

// The surveyed repository's own .git/config is still read by git, so the flags
// above are re-asserted on every call. System and global config are removed
// outright: they belong to the machine, not to the survey.
const GIT_ENV = {
  PATH: process.env.PATH ?? '/usr/bin:/bin',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_TERMINAL_PROMPT: '0',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_ALLOW_PROTOCOL: 'none',
  LC_ALL: 'C',
};

const MAX_BUFFER = 256 * 1024 * 1024;

function runGit(repo, args, { allowFail = false, timeout = 5000 } = {}) {
  try {
    const stdout = execFileSync('git', [...HARDENED, ...args], {
      cwd: repo,
      env: GIT_ENV,
      encoding: 'buffer',
      maxBuffer: MAX_BUFFER,
      timeout, killSignal: 'SIGKILL',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout };
  } catch (error) {
    const status = typeof error.status === 'number' ? error.status : -1;
    const stderr = error.stderr ? error.stderr.toString('utf8') : String(error.message ?? '');
    if (allowFail) return { status, stdout: error.stdout ?? Buffer.alloc(0), stderr };
    throw new Error(`git ${args.slice(0, 2).join(' ')} failed (${status}): ${stderr.trim()}`);
  }
}

export function resolveCommit(repo, commit) {
  if (typeof commit !== 'string' || commit.length === 0) return null;
  if (commit.startsWith('-')) return null;
  const result = runGit(repo, ['rev-parse', '--verify', '--quiet', `${commit}^{commit}`], { allowFail: true });
  if (result.status !== 0) return null;
  const sha = result.stdout.toString('utf8').trim();
  return /^[0-9a-f]{40,64}$/.test(sha) ? sha : null;
}

// A file's content at a commit, or null when the path is not in that tree.
export function fileAt(repo, path, commit) {
  if (typeof path !== 'string' || path.length === 0) return null;
  if (typeof commit !== 'string' || commit.length === 0) return null;
  const result = runGit(repo, ['show', `${commit}:${path}`], { allowFail: true });
  if (result.status !== 0) return null;
  return result.stdout.toString('utf8');
}

// Lines as git stores them. A trailing newline does not create a final empty
// line, so a three-line file reports three lines.
export function linesOf(text) {
  const lines = text.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

// The exact text at a span at a commit, and its hash. Null when the path is not
// in that tree or when the range falls outside the file there.
export function spanAt(repo, path, fromLine, toLine, commit) {
  const text = fileAt(repo, path, commit);
  if (text === null) return null;
  if (!Number.isInteger(fromLine) || !Number.isInteger(toLine)) return null;
  const lines = linesOf(text);
  if (fromLine < 1 || toLine < fromLine || toLine > lines.length) return null;
  const span = lines.slice(fromLine - 1, toLine).join('\n');
  return { path, commit, fromLine, toLine, text: span, hash: hashText(span), fileLines: lines.length };
}

const JS_EXT = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts']);
const PY_EXT = new Set(['.py', '.pyi']);

export function languageOf(path) {
  const ext = nodePath.extname(path).toLowerCase();
  if (JS_EXT.has(ext)) return 'js';
  if (PY_EXT.has(ext)) return 'py';
  return null;
}

// Whether importsOf can say anything at all about this file. A caller must ask,
// because an empty import list from a language we cannot read is an unresolved
// region, not a file with no dependencies.
export function supportsImports(path) {
  return languageOf(path) !== null && !/\.(?:jsx|tsx)$/i.test(path);
}

// Blank out comments while leaving string literals and every newline in place,
// so a match index still maps to the right line number. Tracking string state is
// what stops a URL inside a string from being read as a line comment, and the
// recorded string spans are what stop the text of an import statement quoted
// inside a string from being read as an import.
function blankComments(src, lang) {
  const chars = src.split('');
  const strings = [];
  const n = src.length;
  const blank = (from, to) => {
    for (let k = from; k < to; k += 1) if (chars[k] !== '\n') chars[k] = ' ';
  };
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (lang === 'js' && c === '/' && src[i + 1] === '/') {
      let j = i;
      while (j < n && src[j] !== '\n') j += 1;
      blank(i, j);
      i = j;
      continue;
    }
    if (lang === 'js' && c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const j = end === -1 ? n : end + 2;
      blank(i, j);
      i = j;
      continue;
    }
    // JavaScript regex literals are non-code too. Without a parser a slash
    // can also be division; conservatively blank through its terminator or
    // newline. Losing ambiguous evidence is safer than promoting literal text.
    if (lang === 'js' && c === '/') {
      let j = i + 1, inClass = false;
      while (j < n && src[j] !== '\n') {
        if (src[j] === '\\') { j = Math.min(n, j + 2); continue; }
        if (src[j] === '[') inClass = true;
        if (src[j] === ']') inClass = false;
        if (src[j] === '/' && !inClass) { j += 1; break; }
        j += 1;
      }
      blank(i, j);
      i = j;
      continue;
    }
    if (lang === 'py' && c === '#') {
      let j = i;
      while (j < n && src[j] !== '\n') j += 1;
      blank(i, j);
      i = j;
      continue;
    }
    if (c === '"' || c === "'" || (lang === 'js' && c === '`')) {
      if (lang === 'py' && src.slice(i, i + 3) === c.repeat(3)) {
        let j = i + 3;
        while (j < n) {
          if (src[j] === '\\') { j = Math.min(n, j + 2); continue; }
          if (src.slice(j, j + 3) === c.repeat(3)) { j += 3; break; }
          j += 1;
        }
        blank(i, j);
        i = j;
        continue;
      }
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (src[j] === c) {
          j += 1;
          break;
        }
        if (src[j] === '\n' && c !== '`') break;
        j += 1;
      }
      strings.push([i, j]);
      i = j;
      continue;
    }
    i += 1;
  }
  return { src: chars.join(''), strings };
}

// Use the same lexical pass for imports, symbols, and enforcement. Preserve
// offsets and newlines; template contents are conservatively all non-code.
export function codeOnly(text, path) {
  const lang = languageOf(path);
  if (!supportsImports(path)) return null;
  const { src, strings } = blankComments(text, lang);
  const chars = src.split('');
  for (const [from, to] of strings) {
    for (let i = from; i < to; i += 1) if (chars[i] !== '\n') chars[i] = ' ';
  }
  return chars.join('');
}

export function sourceClass(path, text = '') {
  if (/(^|\/)(node_modules|dist|build|out|target|vendor|generated|__generated__|__pycache__|\.next)\//i.test(path)
      || /(?:\.generated\.|\.min\.(?:js|css)$|\.pb\.go$|_pb2(?:_grpc)?\.py$|\.snap$)/i.test(path)
      || /(?:@generated|auto-generated|automatically generated|do not edit)/i.test(text.slice(0, 1024))) return 'generated';
  if (/(^|\/)(?:tests?|__tests__|__mocks__|fixtures?|testdata|specs?)\//i.test(path)
      || /(?:^|\/)(?:test|spec|test_[^/]+|[^/]+(?:[._-](?:test|spec)|_test))\.[^/]+$/i.test(path)) return 'test';
  return supportsImports(path) ? 'production' : 'unsupported';
}

// Full commit-wide search. Supplemental agent globs cannot shrink this scope.
export function searchCode(repo, commit, pattern, { deadline = Date.now() + 5000, cache = new Map() } = {}) {
  validatePattern(pattern);
  const cached = cache.get(pattern);
  if (cached) return cached;
  const entries = treeAt(repo, commit).filter((entry) => entry.type === 'blob');
  if (entries.length > 2000 || entries.reduce((n, entry) => n + entry.size, 0) > MAX_QUERY_BYTES) {
    throw new Error('repository query budget exceeded');
  }
  const sources = entries.map(({ path }) => {
    if (Date.now() > deadline) throw new Error('query time budget exceeded');
    const text = fileAt(repo, path, commit);
    if (text === null) throw new Error(`could not read ${path}`);
    return { path, text, code: codeOnly(text, path), classification: sourceClass(path, text) };
  });
  const raw = matchTexts(pattern, sources.map((source) => source.text));
  const code = matchTexts(pattern, sources.map((source) => source.code ?? ''));
  const hits = [], weak = [];
  for (let i = 0; i < sources.length; i += 1) {
    const source = sources[i];
    const strongIndices = new Set(code[i].map((match) => match.index));
    for (const match of raw[i]) {
      const strong = source.classification === 'production' && strongIndices.has(match.index);
      const hit = { path: source.path, line: lineAt(source.text, match.index),
        text: match.values[0], classification: strong ? 'production' : source.classification === 'production' ? 'non-code' : source.classification };
      (strong ? hits : weak).push(hit);
    }
  }
  const result = { hits, weak };
  cache.set(pattern, result);
  return result;
}

function insideString(index, strings) {
  for (const [from, to] of strings) if (index > from && index < to) return true;
  return false;
}

function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) if (text[i] === '\n') line += 1;
  return line;
}

// Careful regular expressions over comment-blanked source, not a parser. The
// subsystem takes no dependencies, and shelling out to a parser that may not be
// installed would make the gate's answer depend on the machine it runs on. The
// cost is stated rather than hidden: these patterns see static import, require,
// dynamic import and re-export forms, and they do not see a module name built at
// runtime, an alias resolved by a bundler or tsconfig paths, or a Python import
// performed with importlib. Anything they cannot see is reported by the caller
// as an unresolved edge, never as an absent one.
const JS_PATTERNS = [
  { kind: 'import', re: /\bimport\s+(?:[^;()'"`]*?\bfrom\s*)?["']([^"'\n]+)["']/g },
  { kind: 'export-from', re: /\bexport\s+[^;()'"`]*?\bfrom\s*["']([^"'\n]+)["']/g },
  { kind: 'require', re: /\brequire\s*\(\s*["']([^"'\n]+)["']\s*\)/g },
  { kind: 'dynamic', re: /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g },
];

const PY_FROM = /^[ \t]*from\s+([.\w]+)\s+import\b/gm;
const PY_IMPORT = /^[ \t]*import\s+([A-Za-z_][\w.]*(?:\s*,\s*[A-Za-z_][\w.]*)*)/gm;

// The modules a file imports, as { spec, line, kind }. Returns null when the
// path is not in the tree, and an empty array when the file genuinely imports
// nothing. Ask supportsImports before reading an empty array as evidence.
export function importsOf(repo, path, commit = 'HEAD') {
  const text = fileAt(repo, path, commit);
  if (text === null) return null;
  const lang = languageOf(path);
  if (!supportsImports(path)) return [];
  const { src, strings } = blankComments(text, lang);
  const found = [];
  const seen = new Set();
  const add = (spec, index, kind) => {
    const trimmed = spec.trim();
    if (!trimmed) return;
    // The statement itself must start in code. Its specifier is of course
    // inside a string; the statement keyword must not be.
    if (insideString(index, strings)) return;
    const line = lineAt(src, index);
    const key = `${trimmed}@${line}@${kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ spec: trimmed, line, kind });
  };
  if (lang === 'js') {
    for (const { kind, re } of JS_PATTERNS) {
      for (const match of matchTexts(re.source, [src], re.flags)[0]) add(match.values[1], match.index, kind);
    }
  } else {
    for (const match of matchTexts(PY_FROM.source, [src], PY_FROM.flags)[0]) add(match.values[1], match.index, 'from-import');
    for (const match of matchTexts(PY_IMPORT.source, [src], PY_IMPORT.flags)[0]) {
      for (const part of match.values[1].split(',')) add(part, match.index, 'import');
    }
  }
  found.sort((a, b) => a.line - b.line || a.spec.localeCompare(b.spec));
  return found;
}

// Computed module loading is an explicit unknown, not an absent edge. Match
// call counts per line so a static import beside a computed one cannot hide it.
export function unresolvedImportsOf(repo, path, commit, imports) {
  const raw = fileAt(repo, path, commit);
  const code = raw === null ? null : codeOnly(raw, path);
  if (code === null) return [];
  const known = new Map();
  for (const item of imports) {
    if (item.kind === 'dynamic' || item.kind === 'require') known.set(item.line, (known.get(item.line) ?? 0) + 1);
  }
  const unresolved = [];
  for (const match of matchTexts(String.raw`\b(?:import|require|import_module|__import__)\s*\(`, [code])[0]) {
    const line = lineAt(code, match.index);
    if (known.get(line)) known.set(line, known.get(line) - 1);
    else unresolved.push({ kind: 'import', path, line, reason: 'computed or unsupported module loading' });
  }
  return unresolved;
}

// Matching path and line pairs. git grep is used rather than a filesystem walk
// so the repository's own ignore rules and its index decide what is searchable,
// and so untracked scratch files can never become evidence. The regex dialect is
// pinned with -E so that a repository cannot change the meaning of a pattern
// through grep.patternType, and the pattern is passed after -e so that a pattern
// starting with a dash cannot become an option.
export function grepFor(repo, pattern, globs = [], commit = null) {
  if (typeof pattern !== 'string' || pattern.length === 0) return [];
  validatePattern(pattern);
  const args = ['grep', '--no-color', '-n', '-I', '-E', '-e', pattern];
  if (commit) args.push(commit);
  else args.push('--cached');
  const paths = (globs ?? []).filter((glob) => typeof glob === 'string' && glob.length > 0 && !glob.startsWith('-'));
  if (paths.length > 0) args.push('--', ...paths);
  const result = runGit(repo, args, { allowFail: true });
  if (result.status === 1) return [];
  if (result.status !== 0) {
    throw new Error(`git grep failed (${result.status}): ${String(result.stderr ?? '').trim()}`);
  }
  const hits = [];
  for (const raw of result.stdout.toString('utf8').split('\n')) {
    if (!raw) continue;
    let rest = raw;
    if (commit) {
      const cut = rest.indexOf(':');
      if (cut === -1) continue;
      rest = rest.slice(cut + 1);
    }
    // A path containing a colon is parsed pessimistically here; git grep does
    // not offer a NUL-separated form that also carries line numbers.
    const match = /^(.*?):(\d+):([\s\S]*)$/.exec(rest);
    if (!match) continue;
    hits.push({ path: match[1], line: Number(match[2]), text: match[3] });
  }
  return hits;
}

// The root of the repository a directory belongs to, or null when it belongs to
// none. A directory inside a repository answers with the repository itself,
// which is what lets the interface say "that sits inside <root>" rather than
// refusing a path the user plainly meant.
export function repositoryRoot(repo) {
  const result = runGit(repo, ['rev-parse', '--show-toplevel'], { allowFail: true });
  if (result.status !== 0) return null;
  const root = result.stdout.toString('utf8').trim();
  return root === '' ? null : root;
}

// Tracked files, from the index.
export function filesUnder(repo, dir = '.') {
  const args = ['ls-files', '-z'];
  if (dir && dir !== '.' && !dir.startsWith('-')) args.push('--', dir);
  const result = runGit(repo, args);
  return result.stdout.toString('utf8').split('\0').filter(Boolean).sort();
}

// The tree at a commit, with the size and object type of every entry. Coverage
// is computed from this rather than from the index, because the index describes
// the working copy and a claim is made against a commit.
export function treeAt(repo, commit, dir = '.') {
  const args = ['ls-tree', '-r', '-l', '-z', commit];
  if (dir && dir !== '.' && !dir.startsWith('-')) args.push('--', dir);
  const result = runGit(repo, args, { allowFail: true });
  if (result.status !== 0) return [];
  const entries = [];
  for (const record of result.stdout.toString('utf8').split('\0')) {
    if (!record) continue;
    const match = /^(\d+) (\w+) ([0-9a-f]+)[ \t]+(-|\d+)\t([\s\S]*)$/.exec(record);
    if (!match) continue;
    entries.push({
      mode: match[1],
      type: match[2],
      sha: match[3],
      size: match[4] === '-' ? null : Number(match[4]),
      path: match[5],
    });
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return entries;
}

export function filesAt(repo, commit, dir = '.') {
  return treeAt(repo, commit, dir).filter((entry) => entry.type === 'blob').map((entry) => entry.path);
}

// The files git itself considers text at a commit. Used so that binary
// classification is git's judgement rather than a guess from the extension.
export function textFilesAt(repo, commit) {
  const result = runGit(repo, ['grep', '--no-color', '-I', '-l', '-E', '-e', '.', '-e', '^$', commit], { allowFail: true });
  if (result.status !== 0 && result.status !== 1) return null;
  const paths = new Set();
  for (const raw of result.stdout.toString('utf8').split('\n')) {
    if (!raw) continue;
    const cut = raw.indexOf(':');
    if (cut === -1) continue;
    paths.add(raw.slice(cut + 1));
  }
  return paths;
}
