# Foundations lesson mode

Use lesson mode when the user asks to be taught, names a concept, or has a gap that needs a foundation before drilling.

For any new project, write the map lesson first, before any deep lesson. Write a deep lesson only when a map node is unclear to the learner or a drill gap points at that node.

1. Run `drill.mjs gaps <project>` and use its grouped wrong and partial cards. If the user named a concept, use that concept instead.
2. Run the knowledge ladder in chat (lesson-format.md, Learning framework, item 1): one yes-or-no question per planned part, in part order, one at a time; a "yes" gets one follow-up asking for a one-sentence definition (right records `known`, wrong or vague records `roughly` and counts as a "no"); stop after two consecutive "no". Record every rung in `NOTES.md` inside the project's `teach/` workspace with the date, and read `learning-records/` there.
3. Pick the lowest-level missing concept first. Prefer the prerequisite that makes the current gap intelligible.
4. Write one lesson following [lesson-format.md](lesson-format.md) from `templates/lesson.md`, as Markdown in `~/.sparring/<project>/teach/`: the map is `map.md` with `map.cards.json`; a deep lesson is `lessons/NNNN-<slug>.md` with `lessons/NNNN-<slug>.cards.json`. The cards file holds one card per part in part order, then one level-1 card per recall string. Before writing, check `~/.sparring/patterns.md`: a pattern already taught in two other projects is posed problem-first; append a line when this lesson teaches one.
5. Run `drill.mjs add <project> <path-to-the-cards.json>`. The script assigns card ids and starts each card as new.
6. Ask the pretest in chat first, record it, and only then open the lesson (`open <path-to-the-lesson.md>` on macOS). Tell the learner to read one part at a time and say when each part is read.
7. After each part, ask its Check in chat, wait for the committed answer, grade it with the interviewer rules, show the answer and one line of why, and record it with `drill.mjs record <project> <id> --mode transfer --question "<wording>" --context <ctx> ...` against that part's card (the cards file holds one card per part, in part order). After the last part, ask the self-explanation prompt, then the Recall strings as typed answers.
8. Write a learning record only when a later drill grades the concept `correct`. A lesson read or a transfer attempt alone does not establish mastery.

Keep the lesson grounded in the project's primary source and keep its rubric hidden until the user commits to a transfer answer.
