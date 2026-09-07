# Lesson format

Every lesson is a self-contained HTML page in the teach workspace and follows these eleven elements, in order:

1. **The sentence that wires it.** One plain sentence saying what the thing is, such as “the fence is the result boundary”. It is the first element under the title.
2. **Before you start.** List assumed terms, each with a one-line definition and a link to the lesson that teaches it. If no lesson exists, say so.
3. **Why this exists.** Two to four sentences describing the problem before explaining the mechanism.
4. **The mechanism, generic.** One diagram, using inline SVG or stacked HTML cards. Every diagram box has a caption saying what it is and why it is on the path. Define every term inline on first use with `<details>` or a styled `<abbr>` with a visible expansion.
5. **The same thing in Raptor.** Quote the real file and lines verbatim, use at least 14px code, and put a plain-language line beside each excerpt.
6. **What breaks if.** Show before and after statically, with the failure in red.
7. **Say it like an interviewer.** Give four to five sentences to say out loud.
8. **Check yourself.** Give three retrieval questions with click-to-reveal answers of equal word count.
9. **Transfer.** Give two or three unanswered questions in a different world and a different shape: a short scenario, bug report, or design choice. Include: “Answer these in chat; your agent grades them and they become cards.”
10. **Read the source.** List primary documentation, one line each.
11. **Footer.** Ask the agent; link to glossary and index; say “these concepts come back in your drill”.

Use these design tokens: dark theme, one amber accent, JetBrains Mono for headings and code, Inter for body text, and an 880px maximum content width. The lesson must work at 390px, use no external scripts, keep code at 14px or larger, and give every diagram box a caption. Terms receive inline definitions on first use.

Each lesson ships `NNNN-<slug>.cards.json` with three to six cards. Cards are levels 1–3, have `contexts` including the project's own name and at least one transfer context, and use `source = {"type":"lesson","ref":"<slug>"}`. Run `drill.mjs add` on this file; do not add ids, dates, or schedules by hand.

## Map

The project's first lesson is its map: one page per project and the main road through the codebase. It is a single scroll-driven page with an architecture graph of at most about twelve nodes and about six horizontal wicked-feature bands. Each node gets one sentence saying what it is and why it exists; each band gets one rule sentence and one cost-of-forgetting sentence. Nodes and bands link to their deep lesson when one exists, or to the glossary otherwise. The map should take under five minutes to read and, if more detail is needed, it gets a second level instead of more nodes.

The graph shows how a request moves through the project, with the request path first, then storage, then the cross-cutting bands. The page ends with the three map-altitude questions: “Where would this go”, “Brief a new engineer”, and “Make the call”. It ships a `cards.json` containing map and boundary cards. Deep lessons are one click below the main road and are written only when a node is unclear or a drill gap points at it.
