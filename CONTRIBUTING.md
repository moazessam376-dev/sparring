# Contributing

Run the test suite with:

```sh
node --test scripts/drill.test.mjs
```

## Core

`core/` is the headless state layer. The event log is the only durable record;
the SQLite database is a rebuildable cache derived from it. Run the core tests
with:

```sh
node --test "core/*.test.mjs"
```

Keep the project dependency-free: do not add runtime or development dependencies. Do not use emoji in skill text. To add a mode, add its trigger phrase and mode to the table in `SKILL.md`, then add the mode's instructions in a new file under `references/`. Use conventional, plain commit messages such as `feat: add lesson mode` or `docs: clarify installation`.
