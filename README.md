# sparring
[![tests](https://github.com/moazessam376-dev/sparring/actions/workflows/test.yml/badge.svg)](https://github.com/moazessam376-dev/sparring/actions/workflows/test.yml)

Sparring for engineers who build with agents: a hard technical interviewer and visual tutor for codebases you built, for any coding agent that reads `SKILL.md` files.

## Why

Engineers who build with agents must still defend every decision. Nobody holds a codebase line by line; what matters is the map, the constraints that touch everything, and the habit of finding detail on demand. This skill drills that, with Anki-style spacing and freshly worded questions, and teaches with visual lessons grounded in the reader's own code.

## Install

### Claude Code

```sh
git clone https://github.com/moazessam376-dev/sparring.git ~/.claude/skills/sparring
```

You can also clone anywhere and run `./install.sh`. Invoke the skill by asking to be drilled, or with `/sparring`.

### Codex CLI

```sh
git clone https://github.com/moazessam376-dev/sparring.git ~/.codex/skills/sparring
```

You can also clone anywhere and run `./install.sh`. The installer appends a pointer paragraph to `~/.codex/AGENTS.md` if that file exists, and creates it otherwise.

### Cursor

```sh
git clone https://github.com/moazessam376-dev/sparring.git ~/.cursor/skills/sparring
```

For one project only, clone into `.cursor/skills/sparring` inside that project. You can also clone anywhere and run `./install.sh`. Cursor reads the same `SKILL.md` format.

`install.sh` symlinks one clone into all three locations, so updates are a `git pull`.

## Modes

| Mode | Trigger phrase |
| --- | --- |
| `build-bank` | "build a question bank", "make a bank from this repo" |
| `drill` | "drill me", "quiz me", "test me on this project" |
| `lesson` | "teach me", "explain", "I don't understand X", "lesson on what I got wrong" |
| `refine` | "clean up the cards" |
| `read` | "read this file with me", "make me explain this code" |
| `mock` | "mock interview", "interview me for 45 minutes" |
| `grill-design` | "grill this design", "challenge this design before coding" |

## How a session goes

> Interviewer: Hi. First question.
>
> Interviewer: In this multi-tenant app, where is the tenant boundary enforced for a request that reads invoices?
>
> Candidate: The API checks the tenant in the request handler before it loads invoices.
>
> Interviewer: Commit that answer.
>
> Candidate: I commit to the handler being the enforcement point.
>
> Interviewer: Grade: partial. `db/policies/invoices.sql:42` adds the database predicate; the handler only passes the tenant context.
>
> Interviewer: What breaks if a background job bypasses the handler but uses the same database role?
>
> Candidate: It could read another tenant's invoices unless the database policy still applies.
>
> Interviewer: Good. Next question: which module would change if invoice exports became asynchronous?

## State

Drill state lives in `~/.sparring/<project>/`, or under the directory named by `SPARRING_HOME`. Each project keeps `bank.json`, `scores.json`, and `sessions/<YYYY-MM-DD>.md`. Lesson workspaces can also keep their HTML lessons and card JSON under `teach/`. Claude Code, Codex, and Cursor share this state because it is plain JSON and HTML.

## Lessons

Lessons are map-first visual explanations: they establish the project map, then put detailed mechanisms one click below it. Each lesson follows an eleven-element format, including grounded excerpts, failure states, retrieval questions, and transfer questions that move the idea into another domain. `templates/` holds the stylesheet, the map skeleton, and the index skeleton.

## Commands

`node scripts/drill.mjs init <project> --repo <abs path>` — initialize or update a v2 project.

`node scripts/drill.mjs migrate <project>` — back up and convert a v1 bank once.

`node scripts/drill.mjs add <project> <file.json>` — validate and add concept cards.

`node scripts/drill.mjs next <project> --n 12 --new 6` — return a due/new card queue without answers.

`node scripts/drill.mjs answer <project> <id>` — fetch one card's rubric after commitment.

`node scripts/drill.mjs record <project> <id> --grade <g> --answer "..." --gap "..." --question "..." --context <ctx>` — record an attempt.

`node scripts/drill.mjs refine <project> --n 10` — return converted cards that need rewriting.

`node scripts/drill.mjs update <project> <id> --file <json>` — replace a card's rewritten fields.

`node scripts/drill.mjs remove <project> <id>` — retire a card while keeping its attempts.

`node scripts/drill.mjs gaps <project> --days 7` — group recent wrong and partial cards.

`node scripts/drill.mjs note <project> "..."` — append a session note.

`node scripts/drill.mjs mock <project> --n 15` — return a score-blind mock set.

`node scripts/drill.mjs status <project>` — print progress and the defensible verdict.

## Design records

Read the dated [design records](docs/) for the decisions behind the card model, lessons, altitude, and map-first teaching.

## License

MIT.
