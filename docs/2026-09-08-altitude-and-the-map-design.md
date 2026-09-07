# Altitude, the map, and strategic question shapes

Date: 2026-09-08. Builds on `2026-09-05-cards-and-lessons-design.md`.

## Why

Nobody holds a large codebase line by line. What an effective engineer holds is the map, the handful of constraints that touch every feature (the "wicked features"), and the habit of navigating to detail on demand. The first lessons taught one flow end to end, which is the right first step for building a theory of a codebase, but they did it at line altitude. Drills also asked at line altitude. Both need to move up, with detail one click below rather than on the main road.

## Part 1: altitude on cards

Every card gains `altitude`, one of:

- `map`: how the pieces fit; what talks to what; where a kind of change would go.
- `boundary`: trust, tenancy, money, and consistency boundaries; the constraints that every feature must satisfy; what is enforced where.
- `mechanism`: how one piece works internally, explained without line numbers.
- `line`: a specific load-bearing line or statement. Reserved for the few lines whose absence is a security or correctness bug.

Script changes:

- `add` and `update` accept and validate `altitude`; cards without it default to `mechanism` on `migrate`-style upgrade (a small `upgrade` step inside `migrate` handles v2 banks missing the field, idempotently).
- `next` gains `--altitude` filter and default weighting: when filling new cards, draw in the ratio map 3 : boundary 3 : mechanism 3 : line 1. Due cards are never filtered by altitude unless asked.
- `status` reports counts and accuracy per altitude, and the defensible verdict adds: at least 90 percent of `map` and `boundary` cards have `lastGrade == correct` and `interval >= 3`.
- `refine` output includes `altitude` so the rewriting agent assigns it; `references/refine.md` says line-level cards are kept only when the line is load-bearing, otherwise rewritten to `mechanism` or `boundary` or deleted via a new `remove <project> <id>` command (attempts are kept; the card is marked `retired: true` and excluded from `next`, `mock`, `status` counts).

## Part 2: three strategic question shapes

The interviewer uses these shapes for `map` and `boundary` cards, rotating across sessions, generated fresh each time:

1. **Where would this go.** "You are adding <feature> to <project>. Which modules and tables change, which constraints does it touch, what must be true before you ship." Graded on naming the right areas and the right constraints, not files.
2. **Brief a new engineer.** "A capable engineer joins tomorrow and gets five minutes from you on <project> or on <area>. Go." Graded on whether the map and the constraints come out in order, without detail.
3. **Make the call.** A scenario with incomplete information and a decision to make now. "I don't know" is not accepted; "my best guess is X, and I would verify it by Y" is graded on the guess and the verification plan.

`references/drill.md` documents the shapes and the grading. `references/interviewer-rules.md` adds rule 11: "At map and boundary altitude, reward a committed best guess with a verification plan over silence; grade the guess."

## Part 3: the map lesson type

One page per project, the main road. Requirements:

- A single scroll-driven page. The architecture is a graph drawn once in inline SVG or positioned HTML; as the reader scrolls, nodes and edges appear in a sensible order (the request path first, then storage, then the cross-cutting bands). Implementation: CSS scroll-driven animations (`animation-timeline: view()`) with an `IntersectionObserver` fallback in a small inline script; everything visible without animation under `prefers-reduced-motion`.
- One sentence per node. No paragraphs. A node's sentence says what it is and why it exists.
- The wicked features of the project drawn as horizontal bands crossing the graph, each with one sentence stating the rule and the cost of forgetting it. A wicked feature is a constraint that must be considered every time any other feature is built.
- Each node and band links to its deep lesson if one exists, and otherwise to the glossary entry.
- Read time under five minutes. Fits in working memory: at most about twelve nodes and about six bands per map. If a project needs more, the map gets a second level, not more nodes.
- Ends with three map-altitude questions (where would this go, brief a new engineer, make the call) and ships a `cards.json` of map and boundary cards.

`references/lesson-format.md` gains a "Map" section with these rules. `templates/map.html` ships a skeleton with the scroll mechanics and the band component already working, so an author fills nodes and sentences. `references/lesson.md` says: the map is written first for any new project, before any deep lesson; deep lessons are written only when a map node is unclear to the learner or a drill gap points at it.

## Part 4: index and the main road

`index.html` in a project workspace lists the map first, then deep lessons grouped by the map node they belong to. The sentence under the map link: "Start here. Everything else is one click below."

## Sequence

1. Script and references for altitude, shapes, `remove`, tests.
2. `templates/map.html` and the format rules.
3. The first map, for the owner's project, in the private workspace; refine pass on the converted cards with altitude assigned.
