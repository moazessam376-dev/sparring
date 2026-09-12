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

function runGit(repo, args, { allowFail = false, timeout = 5000, input = undefined } = {}) {
  try {
    const stdout = execFileSync('git', [...HARDENED, ...args], {
      cwd: repo,
      env: GIT_ENV,
      encoding: 'buffer',
      maxBuffer: MAX_BUFFER,
      timeout, killSignal: 'SIGKILL',
      input,
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
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

// A missing target does not have one meaning. A relative or absolute path is
// an internal edge that failed to resolve; a platform module or package is an
// edge which deliberately leaves the repository. Keeping that distinction in
// the extractor means callers cannot accidentally turn the latter into a
// verification failure.
export function importResolution(spec, fromPath, target) {
  if (target !== null) return 'resolved';
  const lang = languageOf(fromPath);
  if (lang === 'js') return spec.startsWith('.') || spec.startsWith('/') ? 'unresolved' : 'external';
  if (lang === 'py') return spec.startsWith('.') || spec.startsWith('/') ? 'unresolved' : 'external';
  return 'unresolved';
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

// Reading one blob per `git show` is both needlessly slow and expensive on a
// real repository. Batch by object id instead of by path: the ids came from
// git's own tree, and no repository-controlled string becomes an argument or
// a command. The same hardened git invocation is used for the whole read.
function blobTextsAt(repo, commit, entries) {
  if (!entries.length) return new Map();
  const input = Buffer.from(entries.map((entry) => `${entry.sha}\n`).join(''), 'utf8');
  const result = runGit(repo, ['cat-file', '--batch'], { input });
  const texts = new Map();
  let offset = 0;
  for (const entry of entries) {
    const headerEnd = result.stdout.indexOf(0x0a, offset);
    if (headerEnd === -1) throw new Error(`could not read ${entry.path}`);
    const header = result.stdout.slice(offset, headerEnd).toString('utf8');
    const match = new RegExp(`^${entry.sha} blob (\\d+)$`).exec(header);
    if (!match) throw new Error(`could not read ${entry.path}`);
    const size = Number(match[1]);
    const start = headerEnd + 1;
    const end = start + size;
    if (end > result.stdout.length) throw new Error(`could not read ${entry.path}`);
    texts.set(entry.path, result.stdout.slice(start, end).toString('utf8'));
    offset = end;
    if (result.stdout[offset] === 0x0a) offset += 1;
  }
  return texts;
}

// Full commit-wide search. Supplemental agent globs cannot shrink this scope.
export function searchCode(repo, commit, pattern,
  { deadline = Date.now() + 5000, cache = new Map(), sources: sourceCache = null } = {}) {
  validatePattern(pattern);
  const cached = cache.get(pattern);
  if (cached) return cached;
  let sources = sourceCache?.get(commit);
  if (!sources) {
    const entries = treeAt(repo, commit).filter((entry) => entry.type === 'blob');
    if (entries.length > 2000 || entries.reduce((n, entry) => n + entry.size, 0) > MAX_QUERY_BYTES) {
      throw new Error('repository query budget exceeded');
    }
    const texts = blobTextsAt(repo, commit, entries);
    sources = entries.map(({ path }) => {
      if (Date.now() > deadline) throw new Error('query time budget exceeded');
      const text = texts.get(path) ?? null;
      if (text === null) throw new Error(`could not read ${path}`);
      return { path, text, code: codeOnly(text, path), classification: sourceClass(path, text) };
    });
    sourceCache?.set(commit, sources);
  }
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

function lineOffsets(text) {
  const offsets = [];
  let start = 0;
  for (const line of linesOf(text)) {
    offsets.push({ start, end: start + line.length, text: line });
    start += line.length + 1;
  }
  return offsets;
}

function bracePairs(text) {
  const open = [];
  const pairs = new Map();
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '{') open.push(index);
    else if (text[index] === '}' && open.length) pairs.set(open.pop(), index);
  }
  return pairs;
}

const CONTROL_WORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'with', 'function']);

// This is intentionally a small lexical function finder rather than a
// JavaScript parser. It only accepts brace-delimited functions whose body can
// be inspected without guessing through a string or comment; unsupported
// languages remain unresolved at the boundary instead of becoming evidence.
function functionBlocks(code, lang) {
  if (lang !== 'js') return [];
  const pairs = bracePairs(code);
  const blocks = [];
  for (const [open, close] of pairs) {
    const lineStart = code.lastIndexOf('\n', open - 1) + 1;
    const prefix = code.slice(lineStart, open);
    let name = null;
    let match = /(?:^|\s)(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*$/.exec(prefix);
    if (match) name = match[1];
    if (!name) {
      match = /(?:^\s*|[\n,{]\s*)(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*$/.exec(prefix);
      if (match) name = match[1];
    }
    if (!name) {
      match = /(?:^\s*|[\n,{]\s*)([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*$/.exec(prefix);
      if (match) name = match[1];
    }
    if (!name) {
      match = /(?:^\s*|[\n,{]\s*)([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*$/.exec(prefix);
      if (match && !CONTROL_WORDS.has(match[1])) name = match[1];
    }
    if (name) blocks.push({ name, open, close });
  }
  return blocks.sort((a, b) => a.open - b.open);
}

function declarationMatch(code, index) {
  const lineStart = code.lastIndexOf('\n', index - 1) + 1;
  const prefix = code.slice(lineStart, index);
  return /(?:\bfunction|\bdef)\s*$/.test(prefix);
}

function callsIn(code, pattern) {
  return matchTexts(pattern, [code])[0]
    .filter((match) => !declarationMatch(code, match.index))
    .map((match) => ({ index: match.index, name: match.values[0], line: lineAt(code, match.index) }));
}

function namedCalls(code) {
  return matchTexts(String.raw`\b([A-Za-z_$][\w$]*)\s*\(`, [code])[0]
    .filter((match) => !declarationMatch(code, match.index))
    .filter((match) => !CONTROL_WORDS.has(match.values[1]))
    .map((match) => ({ index: match.index, name: match.values[1], line: lineAt(code, match.index) }));
}

function controlFlow(text) {
  const lines = linesOf(text);
  const offsets = lineOffsets(text);
  const edges = Array.from({ length: lines.length }, () => new Set());
  const pairs = bracePairs(text);
  const lineFor = (index) => {
    let low = 0, high = offsets.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (offsets[middle].start <= index) low = middle + 1;
      else high = middle - 1;
    }
    return Math.max(0, high);
  };
  const closeLine = (line) => {
    const open = text.indexOf('{', offsets[line]?.start ?? 0);
    if (open === -1 || lineFor(open) !== line) return null;
    const close = pairs.get(open);
    return close === undefined ? null : lineFor(close);
  };
  const next = (line) => (line + 1 < lines.length ? line + 1 : null);

  for (let line = 0; line < lines.length; line += 1) {
    const source = lines[line];
    const trimmed = source.trim();
    const successor = next(line);
    if (successor !== null && !/^(?:return|throw|break|continue)\b/.test(trimmed)) edges[line].add(successor);

    const branch = /\bif\s*\(/.test(source);
    const loop = /\b(?:for|while)\s*\(/.test(source);
    if (branch || loop) {
      const end = closeLine(line);
      if (end !== null) {
        edges[line].clear();
        if (line + 1 <= end) edges[line].add(line + 1);
        if (end + 1 < lines.length) edges[line].add(end + 1);
        if (loop) {
          edges[end].add(line);
          if (end + 1 < lines.length) edges[end].add(end + 1);
        }
        // `} else {` is represented by the ordinary successor of the if
        // block. The then branch must skip over that block, while the false
        // branch enters it.
        const after = lines[end + 1] ?? '';
        if (branch && /^\s*else\b/.test(after)) {
          const elseEnd = closeLine(end + 1);
          if (elseEnd !== null) {
            edges[line].delete(end + 1);
            edges[line].add(end + 2);
            edges[end].clear();
            edges[end].add(elseEnd + 1 < lines.length ? elseEnd + 1 : lines.length);
          }
        }
      } else if (branch && /\breturn\b/.test(source)) {
        // A one-line conditional return has a fall-through false branch and
        // no true-branch successor.
        edges[line].clear();
        if (successor !== null) edges[line].add(successor);
      }
    }
    if (/\b(?:switch|try|catch|finally)\b/.test(source)) {
      // The verifier cannot prove universal ordering through these constructs
      // with this lexical model. The caller records the result as unchecked.
      edges[line].add(lines.length);
    }
  }
  return { lines, offsets, edges };
}

function analyseFunction(code, block, enforcementPattern, writerPattern) {
  const body = code.slice(block.open + 1, block.close);
  const flow = controlFlow(body);
  const validators = callsIn(body, enforcementPattern);
  const writers = callsIn(body, writerPattern);
  const calls = namedCalls(body);
  const events = new Map();
  const addEvent = (line, event) => {
    if (!events.has(line)) events.set(line, []);
    events.get(line).push(event);
  };
  for (const item of validators) addEvent(item.line - 1, { ...item, kind: 'validator' });
  for (const item of writers) addEvent(item.line - 1, { ...item, kind: 'writer' });
  for (const item of calls) addEvent(item.line - 1, { ...item, kind: 'call' });
  return {
    ...block,
    body,
    flow,
    validators,
    writers,
    calls,
    events,
    mayWrite: writers.length > 0,
    safeFromEntry: false,
  };
}

function simulateFunction(info, functions) {
  const { lines, offsets, edges } = info.flow;
  if (!lines.length) return { safe: true, writes: 0, unsafe: 0, validatedWrites: 0 };
  const incoming = Array(lines.length).fill(null);
  incoming[0] = false;
  const queue = [0];
  const writes = [];
  while (queue.length) {
    const line = queue.shift();
    let state = incoming[line];
    const source = lines[line];
    // A call in a conditional header is not a must-have fact for either
    // branch. Calls in a block receive their own CFG node and are safe to
    // count normally.
    const conditional = /\b(?:if|for|while|switch)\s*\(/.test(source);
    for (const event of (info.events.get(line) ?? []).sort((a, b) => a.index - b.index)) {
      if (event.kind === 'validator' && !conditional) state = true;
      if (event.kind === 'writer') writes.push({ line, safe: state, kind: 'write', name: event.name });
      if (event.kind === 'call') {
        const callee = functions.get(event.name);
        if (callee?.mayWrite && !callee.safeFromEntry) writes.push({ line, safe: state, kind: 'call', name: event.name });
      }
    }
    for (const successor of edges[line]) {
      if (successor < 0 || successor >= lines.length) continue;
      const nextState = incoming[successor] === null ? state : incoming[successor] && state;
      if (incoming[successor] !== nextState) {
        incoming[successor] = nextState;
        queue.push(successor);
      }
    }
  }
  return {
    safe: writes.every((write) => write.safe),
    writes: writes.length,
    unsafe: writes.filter((write) => !write.safe).length,
    validatedWrites: writes.filter((write) => write.safe).length,
    writesDetail: writes,
    offsets,
  };
}

// Prove the only ordering-sensitive constraint currently in the query
// vocabulary. A function is a graph node, direct storage calls are leaves, and
// a helper that writes may be called only after validation has been established
// on every path reaching that call. This lets a validated handler call a
// low-level store helper without pretending that the helper validates input on
// its own, while still rejecting a validator that merely appears elsewhere in
// the file.
export function pathSensitiveConstraint(repo, commit, enforcementPattern, writerPattern,
  { deadline = Date.now() + 5000, paths = null, focus = null } = {}) {
  const allEntries = treeAt(repo, commit).filter((entry) => entry.type === 'blob');
  const wanted = paths === null ? null : new Set(paths);
  const entries = wanted === null ? allEntries : allEntries.filter((entry) => wanted.has(entry.path));
  const analyses = [];
  let unsupported = false;
  for (const entry of entries) {
    if (Date.now() > deadline) throw new Error('query time budget exceeded');
    const text = fileAt(repo, entry.path, commit);
    if (text === null || sourceClass(entry.path, text) !== 'production') continue;
    const code = codeOnly(text, entry.path);
    if (code === null) continue;
    const blocks = functionBlocks(code, languageOf(entry.path));
    if (!blocks.length) {
      analyses.push({ path: entry.path, name: '<module>', ...analyseFunction(code, { name: '<module>', open: -1, close: code.length }, enforcementPattern, writerPattern) });
    } else {
      for (const block of blocks) {
        analyses.push({ path: entry.path, startLine: lineAt(code, block.open), endLine: lineAt(code, block.close),
          ...analyseFunction(code, block, enforcementPattern, writerPattern) });
      }
    }
  }
  const functions = new Map(analyses.filter((item) => item.name !== '<module>').map((item) => [item.name, item]));
  for (const info of analyses) {
    for (const call of info.calls) {
      if (functions.has(call.name)) functions.get(call.name).called = true;
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const info of analyses) {
      const before = info.mayWrite;
      if (!info.mayWrite && info.calls.some((call) => functions.get(call.name)?.mayWrite)) info.mayWrite = true;
      if (before !== info.mayWrite) changed = true;
    }
  }
  for (const info of analyses) {
    if (!info.mayWrite) continue;
    let previous = null;
    do {
      previous = info.safeFromEntry;
      const result = simulateFunction(info, functions);
      info.safeFromEntry = result.safe;
      info.simulation = result;
    } while (previous !== info.safeFromEntry);
  }
  const candidateRoots = focus
    ? analyses.filter((info) => info.path === focus.path
      && info.startLine !== undefined
      && info.endLine >= focus.fromLine && info.startLine <= focus.toLine)
    : analyses;
  const roots = candidateRoots.filter((info) => info.mayWrite && (info.name === '<module>' || !info.called || focus));
  unsupported = roots.some((root) => /\b(?:switch|try|catch|finally)\b/.test(root.body));
  const verified = !unsupported && roots.length > 0 && roots.every((root) => root.safeFromEntry)
    && roots.some((root) => root.simulation?.validatedWrites > 0);
  return {
    verified,
    unsupported,
    files: roots.map((root) => ({ path: root.path, name: root.name, ...root.simulation })),
    validatorCalls: analyses.reduce((total, info) => total + info.validators.length, 0),
    writerCalls: analyses.reduce((total, info) => total + info.writers.length, 0),
  };
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
