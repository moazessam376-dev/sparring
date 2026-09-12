# survey — the mechanical verification gate

An agent surveys a repository and returns claims about it. This subsystem checks
each claim against the actual code before a learner ever sees it. A claim that
fails is downgraded or dropped, never shown as fact.

This is the piece that decides whether the product's central promise holds. A
confidently wrong map is worse than no map, because the person reading it has no
way to tell which sentence was the invented one.

Specified by section 6 of `docs/2026-09-12-sparring-as-software-design.md` and by
step 8 of the recommended approach in
`docs/research/2026-09-12-large-repository-survey.md`.

## Files

- `claim.mjs` — the claim shape, its constructor, the status vocabulary and the
  severity order the gate resolves with.
- `evidence.mjs` — mechanical extractors. Every function returns facts about a
  repository and never an opinion about one.
- `verify.mjs` — the gate itself, plus exhaustive coverage classification.
- `verify.test.mjs` — `node --test "survey/*.test.mjs"`. Every check has its own
  test, and every test runs against a real git repository built in a temporary
  directory with real commits.

No runtime or development dependencies. Plain Node ESM, `node:child_process` for
git, matching the style of `core/`.

## The claim

```js
makeClaim({
  type: 'constraint',              // part | interaction | constraint | topic
  sentence: 'Every order read is scoped to a tenant by withTenant.',
  path: 'db/tenant.mjs',           // source path
  fromLine: 1, toLine: 4,          // line range
  commit: '<sha>',                 // the surveyed commit
  spanHash: 'sha256:...',          // hash of the exact span cited
  extractor: 'band-query',         // what produced it
  unresolved: [],                  // edges the claim depends on and could not resolve
  coverage: ['db/tenant.mjs'],     // the paths this claim's inspection covers
  enforcement: { pattern, globs }, // for a constraint
  boundary:    { dir, neighbours },// for a part
  ends:        { from, to },       // for an interaction
  falsifier:   { pattern, globs }, // optional, for any type
});
```

`status` defaults to `unchecked`. A constructor that defaulted to `verified`
would make forgetting to run the gate look like success.

## Statuses, worst first

`contradicted` → `stale` → `unchecked` → `inferred` → `verified`

Three rules decide every outcome.

1. **The worst check wins.** A claim whose boundary check passed and whose span
   hash failed is `stale`, not `verified`.
2. **Uncheckable is `unchecked`, never `verified`.** The interface draws
   `unchecked` as unverified. Silence must never read as success.
3. **The gate never trusts the status the claim arrived with.** The declared
   status is kept as `declaredStatus` for auditing and then thrown away, because
   an agent-written status is precisely the thing under test.

## The checks

| check | what it does | failure |
| --- | --- | --- |
| `commit` | the surveyed commit resolves; the claim's own commit matches it | `unchecked` / `stale` |
| `path` | the cited path exists at that commit | `contradicted` |
| `range` | the line range is within the file's length there | `contradicted` |
| `span-hash` | the span still hashes to what the claim recorded | `stale` |
| `boundary` | a `part` claim's boundary has a real import edge to a named neighbour | `inferred`, or `contradicted` if nothing lives under it |
| `interaction` | the named symbol is mentioned at the calling end and defined at the called end | `inferred`, with the unresolved edges kept |
| `enforcement` | a `constraint` claim's pattern actually matches tracked code | `contradicted` |
| `contradiction` | a supplied falsifying pattern returns nothing | `contradicted` |

Two of those calls deserve their reasoning stated rather than assumed.

**A span hash mismatch is `stale`, not `contradicted`.** The sentence may still
be true of code that moved. What expired is the citation, not necessarily the
claim.

**A constraint nothing enforces is `contradicted`, not merely downgraded.** A
band such as "every write goes through the repository layer" with no mechanism
behind it is the most dangerous thing a map can carry, because a competent
engineer will believe it and write code against it. A constraint claim that
supplies no enforcement pattern at all is treated the same way: it has named no
mechanism, so it has no enforcement point.

**Provenance differs by claim type.** A `topic` or `part` sentence is a sentence
about a place, so with no cited span it has no provenance and is `unchecked`. An
`interaction` takes its provenance from the two ends it names and a `constraint`
from its enforcement points, so for those a missing span is recorded as a `note`
and imposes no floor.

## Coverage is exhaustive by construction

Every tracked path at the surveyed commit is given exactly one label, and the
labels sum to the file count. `classifyCoverage` throws rather than return a
total it cannot account for, and a test asserts the sum. Nothing may be omitted
unlabelled; that is the rule the whole design rests on, because an uninspected
directory would otherwise render as a part of the system that is empty.

Labels are assigned in this order:

1. `unresolved` — a submodule, a repository we did not enter.
2. `excluded` — matched a rule the survey was given.
3. `generated` — lock files, build output, vendored trees, protobuf output.
4. `binary` — by extension, or because git itself does not consider it text.
5. `inspected` — cited by a claim that survived, or listed in its `coverage`.
6. `unresolved` — named in a surviving claim's unresolved edges, or sitting
   inside a claimed boundary in a language the import reader cannot parse.
7. `pending` — everything else. Nobody looked.

A `contradicted` or `unchecked` claim confers no inspection. Counting it would
let a false sentence buy coverage for the file it misread.

## The security boundary

A surveyed repository is untrusted input. Nothing in it is ever executed: no
build, no test, no hook, no script. This is a security boundary, not a
preference, because a survey runs against code the user did not write.

- Every read goes through git, and git is invoked through `execFile` rather than
  a shell, so a path can never become an argument list.
- git is started with `core.hooksPath`, `core.fsmonitor`, `diff.external` and
  `uploadpack.packObjectsHook` neutralised, because a hostile repository can
  write its own `.git/config` and those are the config keys that turn a read
  into an execution.
- System and global git config are removed outright with `GIT_CONFIG_SYSTEM` and
  `GIT_CONFIG_GLOBAL`. They belong to the machine, not to the survey.
- `--textconv` is never passed, so a `diff` driver cannot run on a blob read.
- `git grep` is pinned to `-E` so the repository cannot change a pattern's
  meaning through `grep.patternType`, and the pattern is passed after `-e` so a
  pattern beginning with a dash cannot become an option.

A test asserts this: it configures a hostile textconv driver, an fsmonitor hook
and a `post-index-change` hook that each touch a marker file, then runs every
extractor and asserts the marker does not exist.

Step 7 of the research document's list, the execution check that runs the
repository's own build or tests, is therefore deliberately not implemented. It
is the one check on that list this design will not take.

## Known limits

Stated rather than hidden, because a verifier that oversells itself is the same
failure mode as a map that does.

- **Imports are read with regular expressions, not a parser.** The subsystem
  takes no dependencies, and shelling out to a parser that may not be installed
  would make the gate's answer depend on the machine it runs on. The patterns
  see static `import`, `require`, dynamic `import` and re-export forms in
  JavaScript and TypeScript, and `import` / `from ... import` in Python. They do
  not see a specifier built at runtime, a bundler or `tsconfig` path alias, a
  Go, Java, Ruby or Rust import, or `importlib`. `supportsImports(path)` exists
  so a caller can tell "this file imports nothing" from "we cannot read this
  file", and files of the second kind inside a claimed boundary are labelled
  `unresolved` rather than inspected.
- **Symbol resolution is textual.** The called end of an interaction must carry
  a definition-shaped match, and the calling end must name the symbol, but
  neither is a real call graph. Two unrelated functions with the same name in
  different files will satisfy it.
- **`grepFor` parses a path containing a colon pessimistically.** `git grep`
  offers no NUL-separated output that also carries line numbers.
- **Coverage is a file-level count**, not a byte or symbol count, and a claim's
  `coverage` list is taken on trust as the set of files it inspected.
