# Daily card drill

1. Run `drill.mjs next <project> --n 12`. Treat the returned cards as the complete queue and fetch no more.
2. For each card, write a fresh question from its `ask` in the returned `suggestedContext`. Ask it in that context, one at a time, and wait for the candidate to commit.
3. After commitment, run `drill.mjs answer <project> <id>`. Grade the answer against the card's `rubric` and `grounding`, applying the interviewer rules. Never reveal the rubric before commitment.
4. Record every question, including one abandoned after follow-ups, with `drill.mjs record <project> <id> --grade <g> --answer "<one line>" --gap "<one line>" --question "<wording asked>" --context <ctx>`. Transfer questions from a lesson use `--mode transfer`.
5. After the queue or when the candidate says stop, run `drill.mjs status <project>`. Report today's accuracy, the defensible verdict, the worst gap, and one small change to make by hand. Append a short summary with `drill.mjs note <project> "<text>"`.
6. If time remains, start the code-reading block from the worst card's grounding file; follow [read.md](read.md).

Grade `correct` only when both mechanism and reason are right and the candidate could reproduce the decision. Grade `partial` when one is right but incomplete. Grade `wrong` for neither, delegation, or a confident wrong claim.

Accuracy counts `correct` as 1, `partial` as 0.5, and `wrong` as 0. Scheduling is day-based: wrong lapses the card, partial grows it conservatively, and correct grows it by ease.
