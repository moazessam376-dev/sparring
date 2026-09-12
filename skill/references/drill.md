# Drill

Use this mode for daily review, a quiz, a mock interview, or a transfer check after a lesson.

## Server sequence

1. Call `sparring_due` for the requested project or the interleaved set. Treat the returned queue as complete. Fetch no extra cards. Evidence: `docs/research/2026-09-10-learning-science.md`, findings 2 and 3.
2. For each returned card, write a fresh question from its answer-free ask and suggested context. Avoid every wording in its recent-question history. Ask one question and wait for a committed answer. Do not call `sparring_rubric` during wording selection. Evidence: `docs/research/2026-09-10-learning-science.md`, findings 1 and 11.
3. After commitment, call `sparring_rubric` for that card. Compare the answer with the hidden rubric and the grounded source. Keep the rubric hidden before commitment. Evidence: `docs/research/2026-09-10-learning-science.md`, findings 1, 8, and 9; `docs/research/2026-09-12-large-repository-survey.md`, finding 10.
4. Call `sparring_record` for every question, including a question abandoned after follow-ups. Store the fresh wording, context, answer summary, grade, and exact gap. Evidence: `docs/research/2026-09-10-learning-science.md`, findings 1, 2, and 9.
5. Call `sparring_contest` when the learner disputes a grade. Preserve the original grade, the learner’s counterclaim, the evidence considered, and the resolution. Evidence: `docs/2026-09-12-sparring-as-software-design.md`, section 3.2; `docs/research/2026-09-10-learning-science.md`, findings 1 and 9.
6. After the queue or when the learner stops, report accuracy, verdict, worst gap, and one small hand-made change. Record a session note through the server’s record path. Evidence: `docs/research/2026-09-10-learning-science.md`, findings 1, 2, 3, and 4.

## Grade contract

Grade `correct` only when the mechanism, reason, and reproduction are right. Grade `partial` when one is right and another is incomplete. Grade `wrong` for neither, delegation, or a confident false claim. Evidence: `docs/research/2026-09-10-learning-science.md`, findings 1, 4, 7, and 9; `docs/research/2026-09-12-large-repository-survey.md`, finding 10.

Score accuracy as `correct = 1`, `partial = 0.5`, and `wrong = 0`. Let the server own scheduling and mastery state. Do not invent a mastery claim from one fluent response. Evidence: `docs/research/2026-09-10-learning-science.md`, finding 2; `docs/2026-09-12-sparring-as-software-design.md`, sections 3.3 and 5.

Keep projects and mechanism families interleaved. Use due cards plus a few new cards in a short session. Evidence: `docs/research/2026-09-10-learning-science.md`, findings 3 and 10.

Use typed production for commands and exact strings. Cue Recall with the situation, never the command name. Show the answer after the attempt. Evidence: `docs/research/2026-09-10-learning-science.md`, findings 9 and 11.

## Map and boundary cards

Rotate these question shapes across sessions:

1. **Where does a feature go?** Ask which modules and tables change, which constraints it touches, and what must hold before shipment. Grade areas and constraints instead of exact file names. Evidence: `docs/research/2026-09-10-learning-science.md`, findings 3 and 7; `docs/research/2026-09-12-large-repository-survey.md`, findings 1 and 10.
2. **Brief a new engineer.** Ask for a five-minute map of the project or area. Grade useful order, boundaries, and omissions. Evidence: `docs/research/2026-09-10-learning-science.md`, findings 4, 5, and 6.
3. **Make the call.** Give incomplete information and require a committed best guess plus a concrete verification plan. Grade both the guess and the plan. Evidence: `docs/research/2026-09-10-learning-science.md`, finding 7; `docs/research/2026-09-12-large-repository-survey.md`, findings 3 and 10.

## Follow-up and close

On a partial or wrong answer, ask one or two follow-ups. Name a concrete scenario, input, or alternative design in each. After two follow-ups without progress, record the attempt and move on. End with one hand-made change tied to the worst gap. Evidence: `docs/research/2026-09-10-learning-science.md`, findings 1, 4, and 7.

