# Lesson component catalogue

The application exposes exactly fifteen component types. Pick from this list. Supply only the listed fields. The application owns markup, layout, state, interaction, and grading.

Catalogue authority: `design/Components.dc.html`, method `cat()`; schema authority: `lesson/schema.mjs`; validation authority: `lesson/validate.mjs`.

## Explain components

| Type | Required fields | Grading |
| --- | --- | --- |
| `prose` | `heading: string`; `body: markdown`; `names: string[]` | none |
| `diagram` | `nodes: {id,label,sub,focal}[]`; `edges: {from,to,label}[]`; `caption: string` | none |
| `trace` | `steps: {text,file,line}[]`; `commit: string` | none |
| `terminal` | `lines: {cmd,out}[]`; `cwd: string` | none |

Shape rules:

Evidence: `lesson/schema.mjs`; `design/Components.dc.html`, `cat()`.

- Each `diagram.nodes` item has `id: string`, `label: string`, `sub: string`, and `focal: boolean`.
- Each `diagram.edges` item has `from: string`, `to: string`, and `label: string`.
- Each `trace.steps` item has `text: string`, `file: string`, and `line: integer`.
- Each `terminal.lines` item has `cmd: string` and `out: string`.

Evidence: `lesson/schema.mjs`; `design/Components.dc.html`, `cat()`.

## Ask components

| Type | Required fields | Grading |
| --- | --- | --- |
| `short` | `ask: string`; `rubric: string[]`; `grounding: {path,line,commit}` | agent |
| `code` | `ask: string`; `languages: string[]`; `starter: string`; `reviewAgainst: {path,line}` | agent review |
| `recall` | `situation: string`; `answer: string`; `accept: string[]` | exact |
| `lure` | `ask: string`; `options: {text,correct,why}[]` | exact |
| `order` | `ask: string`; `steps: string[]`; `order: number[]` | exact |
| `blank` | `snippet: string`; `blanks: {at,answer,distractors}[]`; `file: {path,line}` | exact |
| `place` | `diagram: ref`; `place: {label,target}[]` | exact |
| `explainself` | `prompt: string` | stored, not graded |

Shape rules:

Evidence: `lesson/schema.mjs`; `design/Components.dc.html`, `cat()`.

- `short.grounding` has non-empty `path` and `commit`, plus integer `line`.
- Each `code.reviewAgainst` item has `path: string` and `line: integer`.
- Each `lure.options` item has `text: string`, `correct: boolean`, and optional `why: string`. Exactly one option is true. Every false option has a non-empty `why`.
- `order` is a permutation of the indices in `steps`.
- Each `blank.blanks` item has integer `at`, string `answer`, and `distractors: string[]`. Each `at` lies within `snippet`.
- Each `blank.file` item has `path: string` and `line: integer`.
- Each `place` item has `label: string` and `target: string`.

Use production formats for retrieval. Use multiple choice only with genuine misconception lures and immediate feedback. Cue exact recall with the situation that will exist during work. Evidence: `docs/research/2026-09-10-learning-science.md`, findings 1, 9, and 11; `design/Components.dc.html`, `cat()`.

## Show components

| Type | Required fields | Grading |
| --- | --- | --- |
| `schema` | `columns: string[]`; `rows: string[][]`; `highlight: number[]` | none |
| `timeline` | `events: {at,label,lane}[]`; `unit: string` | none |
| `reqres` | `request: object`; `response: object`; `focus: string` | none |

Shape rules:

Evidence: `lesson/schema.mjs`; `design/Components.dc.html`, `cat()`.

- Each `timeline.events` item has `at: number`, `label: string`, and `lane: string`.

Evidence: `lesson/schema.mjs`; `design/Components.dc.html`, `cat()`.

## Document contract

The lesson document has exactly these top-level fields: `version`, `id`, `project`, `title`, `topics`, `blocks`, and `created`. `version` equals `1`. Each block is an object with a `type` field and only fields declared for that component.

The validator enforces these limits:

- total blocks: no more than 40;
- gradable blocks: at least 3 and no more than 12;
- recognized gradable types: `short`, `code`, `recall`, `lure`, `order`, `blank`, and `place`;
- non-gradable types: `prose`, `diagram`, `trace`, `terminal`, `explainself`, `schema`, `timeline`, and `reqres`.

Call `sparring_author_lesson` to validate the assembled document. Repair invalid field content inside the catalogue. Report a missing expressive type as a catalogue gap. Evidence: `lesson/schema.mjs`; `lesson/validate.mjs`; `docs/2026-09-12-sparring-as-software-design.md`, section 4; `docs/research/2026-09-10-learning-science.md`, findings 5, 6, and 9.
