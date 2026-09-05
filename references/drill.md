# Daily drill

1. Run `drill.mjs next <project> --n 12`. Treat the returned queue as the complete queue and fetch no more.
2. Ask the questions in returned order. Apply the interviewer rules. After the candidate commits, compare the answer with the grounding file, then use `drill.mjs answer <project> <id>` to fetch the reference.
3. Immediately run `drill.mjs record <project> <id> --grade <g> --answer "<one line>" --gap "<one line>"`. Record every question asked, including one abandoned after follow-ups as `wrong`.
4. After the queue or when the candidate says stop, run `drill.mjs status <project>`. Report today's accuracy per level, the defensible verdict, the worst answer, and one small change to make by hand in the repository. Append a short summary with `drill.mjs note <project> "<text>"`.
5. If time remains, start the code-reading block from the worst answer's grounding file; follow [read.md](read.md).

Grade `correct` only when both mechanism and reason are right and the candidate could reproduce the decision. Grade `partial` when the mechanism is right but the reason is missing, or the reason is right but the mechanism is vague. Grade `wrong` for neither, delegation, or a confident wrong claim.

Accuracy counts `correct` as 1, `partial` as 0.5, and `wrong` as 0.
