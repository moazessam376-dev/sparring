# Lesson format

Every lesson is one Markdown file in the teach workspace, written from `templates/lesson.md`, and read by the learner in an editor or on GitHub (both render Mermaid). Every question is asked by the agent in chat and graded there; nothing interactive lives in the file. HTML lessons are legacy (`templates/html-legacy/`) and are not written any more.

A lesson has these parts, in order:

1. **What we are building.** Two short paragraphs: what the thing is in plain words, then a real-world comparison that says what it is like and what it is not like. Name the people in the story (Moaz and Taha are the users; instance A and instance B are two copies of the server).
2. **Parts.** One section per idea, three to seven per lesson. Each part is: an explanation paragraph of 60 to 120 words (concrete first, the technical name once in parentheses), a story step following the named people, a Mermaid diagram when a picture helps (sequence or flowchart, at most eight nodes), and one `> **Check.**` blockquote: the question the agent asks in chat after that part.
3. **Say it like an interviewer.** Four or five sentences to say out loud.
4. **Recall.** At most five exact strings worth keeping, each cued by a situation, with a one-line mnemonic. The agent asks these in chat as typed answers.
5. **Read the source.** Primary documentation, one line each.

Phrasing rules, checked on every sentence: at most fifteen words, but vary the length and never run a paragraph of six-word sentences (write "letters, digits, underscores and hyphens are allowed" as one sentence, not four); one verb, one idea; concrete first, then the technical name once in parentheses; "you" for the learner, "we" for the design; no comma chains, no "so that", no "which", no "in order to"; a number only where it carries meaning; a term the learner has not met is explained in the paragraph that introduces it, not in a chip.

Check questions: each must be unanswerable from labels alone. Use the story ("Taha's phone loses signal for ten seconds; what does his browser do first?"), a changed condition, or a wrong claim to correct. Never an ordering that the names give away ("put A before B"). Prefer questions that need a typed word or a one-sentence mechanism over yes or no.

Diagrams: Mermaid in fenced blocks. The map may also link one architecture overview built with the diagram-design skill and exported to SVG beside the lesson; nothing else uses that skill.

## Map

The project's first lesson is its map, `teach/map.md`: the main road through the codebase told as parts, with the request path first, then storage, then the cross-cutting rules (each rule as one sentence plus one cost-of-forgetting sentence). It ships `map.cards.json` with map and boundary cards. Deep lessons are written only when a part is unclear or a drill gap points at it.

## Diagrams

Mermaid inside the lesson for everything except the map's one overview, which may be built with the diagram-design skill (profile `sparring`, marker `.diagram-design` in the teach workspace, `doc-inline` width, verified with `self_check.py` and `verify-geometry.py`), exported to `teach/diagrams/<slug>.svg`, and linked from the map with an image link.

## Learning framework

The rules in this section come from `docs/research/2026-09-10-learning-science.md` (finding numbers refer to it). Reading is the weakest way to keep a thing; retrieval with feedback, spaced over days, keeps it.

1. **Knowledge ladder, in chat, before the lesson is written.** The agent asks yes-or-no questions from vocabulary upward: "Do you know what a WebSocket is?", "Do you know what an instance of a server is?", "Do you know how a message reaches a client on another server?" One question at a time, no explanation yet. A "yes" gets one follow-up that asks for a one-sentence definition to confirm it. The ladder stops after two consecutive "no" answers or at the top. Each answer is recorded in `teach/NOTES.md` as `known`, `roughly` or `no` with the date. The lesson starts at the first "no" and its "What we are building" section names what the learner already knows in one line (finding 8).
2. **Pretest.** Before the learner reads part 1, the agent asks one question about the mechanism in chat; the learner answers, then reads. The miss or hit is recorded as a `transfer` attempt on the map card (finding 8).
3. **Parts as worked traces.** The first time a mechanism appears it is told step by step with the story; once the same pattern has been taught in two projects (see `~/.sparring/patterns.md`) a later lesson poses it as a problem first (findings 5 and 6).
4. **One check per part, in chat.** After the learner says a part is read, the agent asks that part's Check, waits for a committed answer, then gives the correct answer and one line of why. Typed word or one-sentence mechanism, not recognition (findings 1 and 9). The answer is recorded with `drill.mjs record ... --mode transfer` against the closest card, so it moves the schedule.
5. **One self-explanation prompt after the last part.** "Why must step N come before step N plus one?" (finding 4).
6. **Recall in chat.** The agent asks each Recall string as a typed answer, situation first, and gives the mnemonic after the attempt (finding 11).
7. **Budgets.** A map: three to seven parts, at most one check each, one self-explanation, at most five recall strings. A deep lesson: three to five parts, same limits. A session on one lesson is about twenty minutes.
8. **Records.** Only chat-graded answers move a card's schedule; the drill in `references/drill.md` carries them forward over days and weeks.
