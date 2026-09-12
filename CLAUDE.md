# CLAUDE.md — sparring

Sparring is an agent skill: a hard technical interviewer and visual tutor for codebases the user built. `SKILL.md` and `references/` are authoritative; `docs/` holds dated design records; `scripts/drill.mjs` owns all state.

## Rule

- **Opus models only:** if the model powering this session is any Claude Opus version (the system prompt names it), invoke the `opus-as-fable` skill (`.claude/skills/opus-as-fable/SKILL.md`) as your first action of the session and follow it for the whole session. Fable and Mythos sessions must not load it; they already behave that way.

## Commands

- `node scripts/drill.mjs <command>` — the state CLI. See the cheat sheet in `SKILL.md`.
- `node --test scripts/drill.test.mjs` — the test suite. Must be green before any commit that touches the script.

## Rules of the repo

- Every behavior rule in the skill traces to evidence in `docs/research/`. A new rule needs a source or it does not ship.
- State lives at `$SPARRING_HOME` or `~/.sparring/<project>/`. Never write it by hand; go through the script.
- The skill is read by Claude Code, Codex, and Cursor. Keep `SKILL.md` portable: no harness-specific tool names in it.
- No emoji.
