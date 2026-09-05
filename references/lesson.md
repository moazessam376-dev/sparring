# Foundations lesson mode

Use lesson mode when the user asks to be taught, names a concept, or has a gap that needs a foundation before drilling.

1. Run `drill.mjs gaps <project>` and use its grouped wrong and partial cards. If the user named a concept, use that concept instead.
2. Check the learner's floor in `NOTES.md` and `learning-records/` inside the project's `teach/` workspace. Do not assume a concept is known because it appeared in a previous chat.
3. Pick the lowest-level missing concept first. Prefer the prerequisite that makes the current gap intelligible.
4. Write one lesson following [lesson-format.md](lesson-format.md) in `~/.interview-drill/<project>/teach/`. Put its lesson HTML in `lessons/` and its companion cards JSON beside it as `lessons/NNNN-<slug>.cards.json`.
5. Run `drill.mjs add <project> <path-to-the-cards.json>`. The script assigns card ids and starts each card as new.
6. On macOS, open the lesson with `open <path-to-the-lesson.html>`.
7. End by telling the user to answer the transfer questions in chat. Ask one at a time and grade transfer answers with the interviewer rules; record each with `drill.mjs record <project> <id> --mode transfer --question "<wording>" --context <transfer-context> ...`.
8. Write a learning record only when a later drill grades the concept `correct`. A lesson read or a transfer attempt alone does not establish mastery.

Keep the lesson grounded in the project's primary source and keep its rubric hidden until the user commits to a transfer answer.
