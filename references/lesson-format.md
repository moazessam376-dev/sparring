# Lesson format

Every lesson is a self-contained HTML page in the teach workspace and follows these eleven elements, in order:

1. **The sentence that wires it.** One plain sentence saying what the thing is, such as “the fence is the result boundary”. It is the first element under the title.
2. **Before you start.** List assumed terms, each with a one-line definition and a link to the lesson that teaches it. If no lesson exists, say so.
3. **Why this exists.** Two to four sentences describing the problem before explaining the mechanism.
4. **The mechanism, generic.** One strip (see Strips and phrasing below): two to four numbered panels, each a small sketch plus one caption. Define every term inline on first use with `<details>` or a styled `<abbr>` with a visible expansion.
5. **The same thing in the project.** Quote the real file and lines verbatim, use at least 14px code, and put a plain-language line beside each excerpt.
6. **What breaks if.** Show before and after statically, with the failure in red.
7. **Say it like an interviewer.** Give four to five sentences to say out loud.
8. **Check yourself.** Give three retrieval questions with click-to-reveal answers of equal word count.
9. **Transfer.** Give two or three unanswered questions in a different world and a different shape: a short scenario, bug report, or design choice. Include: “Answer these in chat; your agent grades them and they become cards.”
10. **Read the source.** List primary documentation, one line each.
11. **Footer.** Ask the agent; link to glossary and index; say “these concepts come back in your drill”.

Use these design tokens: dark theme, one amber accent, JetBrains Mono for headings and code, Inter for body text, and an 880px maximum content width. The lesson must work at 390px, use no external scripts, keep code at 14px or larger, and give every diagram box a caption. Terms receive inline definitions on first use. Inline term chips (`details.term`) render `inline-block` when closed and `block` when open; Chromium breaks the line otherwise.

Each lesson ships `NNNN-<slug>.cards.json` with three to six cards. Cards are levels 1–3, have `contexts` including the project's own name and at least one transfer context, and use `source = {"type":"lesson","ref":"<slug>"}`. Run `drill.mjs add` on this file; do not add ids, dates, or schedules by hand.

## Map

The project's first lesson is its map: one page per project and the main road through the codebase. It is a single page with one architecture overview diagram of at most nine nodes (the only place the diagram-design skill is used), then the road told as strips, and about six horizontal wicked-feature bands. The node sentences live in an `ol.node-list` under the diagrams, one `li.node-group` per row with an `h3` and an ordered list of captions, as in `templates/map.html`. Each node gets one sentence saying what it is and why it exists; each band gets one rule sentence and one cost-of-forgetting sentence. Nodes and bands link to their deep lesson when one exists, or to the glossary otherwise. The map should take under five minutes to read and, if more detail is needed, it gets a second level instead of more nodes.

The graph shows how a request moves through the project, with the request path first, then storage, then the cross-cutting bands. The page ends with the three map-altitude questions: “Where would this go”, “Brief a new engineer”, and “Make the call”. It ships a `cards.json` containing map and boundary cards. Deep lessons are one click below the main road and are written only when a node is unclear or a drill gap points at it.

## Diagrams

The map's overview diagram is built with the diagram-design skill (https://github.com/cathrynlavery/diagram-design), never drawn by hand and never as a card grid with an arrow overlay. The rules that matter most here: pick the visual type from its guide (architecture for the map road, sequence for a time-ordered exchange, flowchart for a decision), stay inside its complexity budget (nine nodes, twelve arrows, two accent elements), route connectors as rounded right angles with masked labels, keep every coordinate on the 4px grid, and give each `<svg>` the accessible contract (`role="img"`, `aria-labelledby`, a prefixed `<title>` first and a `<desc>`).

Tokens come from the `sparring` profile, which ships in this repo as `templates/diagram-design-profile.md`; `install.sh` copies it to `~/.diagram-design/profiles/sparring.md`. Each teach workspace carries a marker file `.diagram-design` containing `profile: sparring`, so the skill resolves the profile without touching its installed style guide. The profile is the lesson palette in the skill's dark column: paper `#0a0f0e`, ink `#ece9e1`, muted `#a9b0ac`, soft `#6f7a76`, rule `#1d2a26`, accent `#f2b544`, link `#58d68d`, with Inter for names and Geist Mono for technical labels. Use the dark variant only.

Draw the overview at the `doc-inline` width (viewBox width 960, height as the content needs) so it renders near full size in the 880px column. Write it first as a standalone file under `<teach>/diagrams/<slug>.html`, verify it, then embed only its `<svg>` in the lesson with a `<figure>` and a one-line `<figcaption>`. The figure scrolls horizontally and the embedded `<svg>` keeps `min-width: 720px`, so labels stay legible at 880px and on a phone; never put a `height` attribute on the `<svg>`. Verification, from the diagram-design checkout: `python3 <skill dir>/scripts/self_check.py <file>` and `python3 <repo root>/scripts/verify-geometry.py <file>` must both pass. The lesson page itself loads no external resource; a fonts link belongs only in the standalone file. The figure has no border, padding or background of its own; the diagram sits on the page. If the skill is not installed, say so and install it (`~/.claude/skills/diagram-design` and `~/.codex/skills/diagram-design` as symlinks to `skills/diagram-design` in a checkout) before writing the lesson.

## Strips and phrasing

Everything after the overview is told in strips, modelled on a numbered storyboard: a heading, an optional one-line lede, then two to four panels in a row. `templates/strip.html` holds the markup, the CSS and the sketch vocabulary. Two panel kinds:

- **Mechanism panel**: a number badge, a sketch (`svg.sketch`, viewBox 240 by 120, drawn from the vocabulary below), and one caption.
- **Decision panel**: text only, three per strip, keyed "What we do", "The other way", "Why not here". One or two short sentences each. No sketch.

Sketch vocabulary, nothing else: `sk-box` (a labelled box), `sk-store` (a store, drawn as a taller box), `sk-arrow` (solid; add `dashed` for a return or a retry; add `accent` for the one thing the panel is about), `sk-cross` (something dies), `sk-label` (12px name), `sk-small` (10px technical word). One accent per panel at most. No mascots, icons or illustrations.

Phrasing rules, checked on every caption and every sentence in a lesson:

- At most fifteen words. One verb, one idea.
- Say the concrete thing first, then the technical name once in parentheses: "Redis hands out the next number (INCR)".
- "You" for the learner, "we" for the design. No passive voice.
- No comma chains, no "so that", no "which", no "in order to". Split instead.
- A number appears only when it carries meaning (500 messages, two minutes).
- A term the learner has not met gets a `details.term` chip the first time, never a definition inside the sentence.

A lesson page stays under three hundred lines of HTML. Lesson and copy lanes run at reasoning `high`; code lanes stay at `max`.

