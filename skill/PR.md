# Portable sparring rules

## What this change contains

- `skill/SKILL.md` is the portable entry point and mode table.
- `skill/references/survey.md` transcribes the eleven-step large-repository survey procedure, including the early `unverified` rule and the mechanical gate.
- `skill/references/lesson.md` defines the server-backed lesson workflow, content-only authoring, catalogue-gap reporting, knowledge ladder, pretest, checks, and completion gate.
- `skill/references/drill.md` defines due-queue retrieval, commitment before rubric reveal, grading, recording, contests, interleaving, and map/boundary question shapes.
- `skill/references/interviewer-rules.md` carries the interviewer rules in unchanged substance with evidence citations.
- `skill/references/components.md` documents all fifteen catalogue components, their exact fields, shapes, grading modes, and validator limits.
- `skill/AGENTS.md` provides the portable agent-name entry point.
- `skill/CONNECT.md` gives loopback streamable HTTP MCP setup for Claude Code, Codex CLI, Cursor, OpenCode, and Devin CLI.

The new rules name all ten server tools: `sparring_due`, `sparring_rubric`, `sparring_record`, `sparring_contest`, `sparring_projects`, `sparring_topics`, `sparring_add_cards`, `sparring_add_topics`, `sparring_author_lesson`, and `sparring_survey_submit`.

## Verification output

Internal links:

    checked=10
    missing=0

Wording scan:

    before_cleanup_should=0
    before_cleanup_hedges=1
    after_cleanup_should=0
    after_cleanup_hedges=0

The one initial false-positive match was a literal verb in a sentence; it became `occurs`.

Learning-fact source audit:

    learning-fact-lines-without-nearby-research-source=0

Catalogue/schema comparison:

    schema_components=15
    documented_components=15
    same_names=true
    missing=none
    extra=none

Tool coverage:

    sparring_due=present
    sparring_rubric=present
    sparring_record=present
    sparring_contest=present
    sparring_projects=present
    sparring_topics=present
    sparring_add_cards=present
    sparring_add_topics=present
    sparring_author_lesson=present
    sparring_survey_submit=present

Whitespace and fenced-prose scans produced no output. The link checker resolves every internal Markdown link in `skill/`.

## MCP verification

All five requested configuration spellings are verified against first-party documentation linked in `skill/CONNECT.md`:

- Claude Code: verified.
- Codex CLI: verified.
- Cursor: verified.
- OpenCode: verified.
- Devin CLI: verified.

Environment-variable interpolation inside a plain Cursor or OpenCode config file was not verified. Their examples use a literal token placeholder and instruct the user to keep the file private.

## Spec review

No remaining specification error was found. The validator exposed one incorrect draft assumption: only `short.grounding` and `trace` require commit fields; `code` and `blank` require path and line. The lesson rule now matches the validator.

## Delivery status

The requested files are complete. Git staging and commit are blocked by the managed worktree: Git cannot create `/Users/moazessam/Projects/sparring/.git/worktrees/skill/index.lock`. The upstream push attempt also failed because this session cannot resolve `github.com` (`git_push_upstream_status=128`).
