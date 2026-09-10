# Daily card drill

1. Run `drill.mjs next <project> --n 12 --all` so every project's due cards are interleaved in one queue. Once a week, or whenever `status` shows kept cards, add `--include-mature` so retired cards get their spaced relearning; it returns only cards that are actually due. Treat the returned cards as the complete queue and fetch no more.
2. For each card, write a fresh question from its `ask` in the returned `suggestedContext`, avoiding every wording listed in its `recentQuestions`. Ask it in that context, one at a time, and wait for the candidate to commit; do not call `answer` just to choose wording.
3. After commitment, run `drill.mjs answer <project> <id>`, where `<project>` is the card's own `project` field from the `--all` queue (ids repeat across projects, so a wrong project records against another project's card). Grade the answer against the card's `rubric` and `grounding`, applying the interviewer rules. Never reveal the rubric before commitment.
4. Record every question, including one abandoned after follow-ups, with `drill.mjs record <project> <id> --grade <g> --answer "<one line>" --gap "<one line>" --question "<wording asked>" --context <ctx>`. Transfer questions from a lesson use `--mode transfer`.
5. After the queue or when the candidate says stop, run `drill.mjs status <project>`. Report today's accuracy, the defensible verdict, the worst gap, and one small change to make by hand. Append a short summary with `drill.mjs note <project> "<text>"`.
6. If time remains, start the code-reading block from the worst card's grounding file; follow [read.md](read.md).

Grade `correct` only when both mechanism and reason are right and the candidate could reproduce the decision. Grade `partial` when one is right but incomplete. Grade `wrong` for neither, delegation, or a confident wrong claim.

Accuracy counts `correct` as 1, `partial` as 0.5, and `wrong` as 0. Scheduling is day-based: wrong resets to 1 day and drops ease; partial keeps the interval from the last full correct recall with a 2-day floor; correct steps through 4, 12, and 21 days, then grows by ease capped at 90 days. A card leaves the daily queue after its fourth consecutive correct recall, the one made at the 21-day gap, and returns only through `--include-mature`. Aim for about twenty cards or fifteen minutes per session, with due cards plus a few new.

## Map and boundary cards

For `map` and `boundary` cards, rotate these strategic question shapes across sessions while still following the level-based protocol above:

1. **Where would this go.** “You are adding `<feature>` to `<project>`. Which modules and tables change, which constraints does it touch, and what must be true before you ship?” Grade the answer on the right areas and constraints, not on naming exact files.
2. **Brief a new engineer.** “A capable engineer joins tomorrow and gets five minutes from you on `<project>` or `<area>`. Go.” Grade whether the map and its constraints come out in a useful order without dropping into detail.
3. **Make the call.** Give incomplete information and a decision to make now. “I don’t know” is not accepted; “my best guess is X, and I would verify it by Y” is graded on both the committed guess and the verification plan.

Write each question fresh from the card’s `ask` and suggested context. The rubric remains hidden until commitment. For map and boundary cards, a committed best guess plus a concrete verification plan earns a grade against the guess; silence is not a better answer. Grade map answers for navigation and boundaries, and boundary answers for the constraints, enforcement points, and failure cost they identify.
