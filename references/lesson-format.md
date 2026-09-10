# Lesson format

Every lesson is a self-contained HTML page in the teach workspace and follows these eleven elements, in order:

1. **The sentence that wires it.** One plain sentence saying what the thing is, such as “the fence is the result boundary”. It comes after the title and the pretest, never before, because it must not leak the pretest's answer.
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
A strip with four panels takes the class `panels four` and lays out two by two, so sketches stay wide enough for their labels. Sketch labels must fit their box: a 72px box holds about ten characters at 12px; widen the box to 96px for longer names.
- **Decision panel**: text only, three per strip, keyed "What we do", "The other way", "Why not here". One or two short sentences each. No sketch.

Sketch vocabulary, nothing else: `sk-box` (a labelled box), `sk-store` (a store, drawn as a taller box), `sk-arrow` (solid; add `dashed` for a return or a retry; add `accent` for the one thing the panel is about), `sk-cross` (something dies), `sk-label` (12px name), `sk-small` (10px technical word). One accent per panel at most. No mascots, icons or illustrations.

Phrasing rules, checked on every caption and every sentence in a lesson:

- At most fifteen words. One verb, one idea.
- Say the concrete thing first, then the technical name once in parentheses: "Redis hands out the next number (INCR)".
- "You" for the learner, "we" for the design. No passive voice.
- No comma chains, no "so that", no "which", no "in order to". Split instead.
- A number appears only when it carries meaning (500 messages, two minutes).
- A term the learner has not met gets a `details.term` chip the first time, never a definition inside the sentence.

A lesson page's line budget depends on its kind: see Budgets in the learning framework below. Lesson and copy lanes run at reasoning `high`; code lanes stay at `max`.

## Learning framework

The rules in this section come from `docs/research/2026-09-10-learning-science.md` (finding numbers below refer to it). Reading a page is the weakest way to keep it; retrieval with feedback, spaced over days, is what keeps it.

Every lesson page has this order:

1. **Floor check, in chat, before the page is written.** The agent names the three to five terms the lesson depends on and asks the learner to define each in one sentence, one at a time. Each is recorded in `teach/NOTES.md` as `known`, `roughly` or `no` with the date. Terms marked `known` collapse into one block placed after the open definitions: `<details class="known"><summary>You know this: term, term</summary><dl>...</dl></details>`. Terms marked `roughly` keep their definition open and get one added exercise that targets the term. Terms marked `no` get a full mechanism panel before the term is first used. Never assume a term is known because it came up in a previous chat (finding 8, and lesson.md step 2).
2. **Pretest right after the title.** One question about the mechanism, answered in a box before anything is read, then the answer is shown and the learner marks "had it" or "missed it". The wiring sentence follows the pretest and never precedes it. A miss highlights the strip that teaches it (finding 8).
3. **Strips as worked traces.** The first time a mechanism appears it is told step by step; once the same pattern has appeared in two projects, later lessons pose it as a problem first (findings 5 and 6). The agent tracks this in `~/.sparring/patterns.md`, a list it appends to whenever a lesson teaches a pattern, recording the pattern name, the project, and the date.
4. **One production exercise after every strip.** Typed answer or cued free recall, checked on submit, correct answer and one line of why shown at once, before the next strip. Multiple choice only for a "predict" exercise whose wrong options are real misconceptions, each with a one-line reason it is wrong (findings 1 and 9).
5. **One self-explanation prompt after the mechanism strips.** "Why must step N come before step N plus one?" The learner writes a sentence, then compares with the model sentence and self-marks (finding 4).
6. **Recall cards at the end**, at most five, for the exact strings worth keeping (commands, flags, limits). Each is cued by a situation, never by its name, and carries a one-line mnemonic (finding 11).
7. **Budgets.** A map lesson holds one pretest, one exercise per strip (at most eight strips), one explain prompt and at most five recall items, under 700 lines. A deep lesson holds one pretest, three to five exercises, one explain prompt and at most five recall items, under 350 lines (findings 6 and 9).
8. **Results go back to the agent.** The page stores marks in `localStorage` and offers a "Copy results" line the learner pastes into chat. The agent uses it to pick what to drill first and records nothing from it: only answers graded in chat move a card's schedule.

### Exercise markup

`templates/exercises.html` holds the exercise CSS (the `<style data-exercises>` block) and the one inline script that drives every exercise; copy exactly those two into a lesson, never the demo page's own `body`, `main` or heading rules. Exercises are plain HTML with data attributes, so a lesson never contains its own JavaScript:

- Page wrapper: `<div class="check" data-lesson="<project>-<slug>">` around the whole body, holding one `<div class="progress" data-progress></div>` near the top.
- Pretest and explain: `<div class="ex ex-pretest" data-ex="pre-1" data-strip="<strip id>">` or `class="ex ex-explain"`, containing `<p class="q">`, `<textarea data-answer>`, `<button data-submit>`, `<div class="reveal" data-reveal hidden>` with the model answer, and `<div class="mark" data-marks hidden>` with `<button data-mark="ok">` and `<button data-mark="miss">`; result states are `ok` and `miss` only.
- Typed production: `<div class="ex ex-type" data-ex="t-1" data-accept="INCR|incr">` with `<p class="q">`, `<input data-answer type="text" autocomplete="off">`, `<button data-submit>`, `<div class="feedback" data-feedback></div>`, `<p class="why" data-why hidden>`. Matching trims, lowercases and collapses spaces; `data-accept` lists alternatives separated by `|`.
- Order: `<div class="ex ex-order" data-ex="o-1">` with `<ol class="steps" data-steps>` of `<li data-pos="N">` items; the script shuffles them and the learner clicks them in order.
- Predict: `<div class="ex ex-predict" data-ex="p-1">` with `<ul class="choices">` of `<button data-choice>` items; the right one has `data-correct="true"`, each wrong one has `data-lure="<why this is wrong>"`. The block may carry `data-why="..."`, shown alongside "Correct" when the learner picks right.
- Recall: `<ul class="recall">` of `<li class="card" data-ex="r-1">` with `<button class="cue" data-flip>`, then `<div class="ans" hidden>` holding `<code>`, `<p class="mnemonic">` and the same marks block. A recall string under thirty characters uses `<li class="ex ex-type" data-ex="..." data-accept="...">` instead of flip-card markup and is graded on submit like any other typed exercise; the flip card stays for longer strings.
- Results: `<button data-copy-results>` writes `sparring-results v1 lesson=<id> pre-1:miss t-1:ok o-1:ok ...` to the clipboard and into a `<pre data-results>` for manual copying. Both `[data-reset]` and `[data-copy-results]` are optional; a lesson without either still boots correctly.

A strip with a mechanism gets a `data-strip` id on its `<section class="strip">` so a pretest miss can highlight it (`class="strip focus"`).
