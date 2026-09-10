# Foundations lesson mode

Use lesson mode when the user asks to be taught, names a concept, or has a gap that needs a foundation before drilling.

For any new project, write the map lesson first, before any deep lesson. Write a deep lesson only when a map node is unclear to the learner or a drill gap points at that node.

1. Run `drill.mjs gaps <project>` and use its grouped wrong and partial cards. If the user named a concept, use that concept instead.
2. Run the floor check: list the three to five terms the lesson depends on and ask the learner to define each in one sentence, one at a time, in chat. Record each as `known`, `roughly` or `no` with the date in `NOTES.md` inside the project's `teach/` workspace, and read `learning-records/` there. Do not assume a concept is known because it appeared in a previous chat; a term marked `known` goes into the page's collapsed "You know this" block.
3. Pick the lowest-level missing concept first. Prefer the prerequisite that makes the current gap intelligible.
4. Write one lesson following [lesson-format.md](lesson-format.md) in `~/.sparring/<project>/teach/`. Put its lesson HTML in `lessons/` and its companion cards JSON beside it as `lessons/NNNN-<slug>.cards.json`.
5. Run `drill.mjs add <project> <path-to-the-cards.json>`. The script assigns card ids and starts each card as new.
6. On macOS, open the lesson with `open <path-to-the-lesson.html>`.
7. Tell the user to work the page's pretest, exercises and recall cards first, then paste the page's results line into chat; use it to choose which transfer question comes first and note it in `NOTES.md`, but record nothing from it. Then ask the transfer questions in chat. Ask one at a time and grade transfer answers with the interviewer rules; record each with `drill.mjs record <project> <id> --mode transfer --question "<wording>" --context <transfer-context> ...`.
8. Write a learning record only when a later drill grades the concept `correct`. A lesson read or a transfer attempt alone does not establish mastery.

Keep the lesson grounded in the project's primary source and keep its rubric hidden until the user commits to a transfer answer.
