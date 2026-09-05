---
name: interview-drill
description: "Hard technical interviewer for codebases the user built. Use when the user asks to be drilled, quizzed, grilled, mock-interviewed, or tested on a project, wants a question bank built from a repo, wants to explain code and be corrected, or wants a design document grilled before implementation. Modes: build-bank, drill, read, mock, grill-design."
---

# Interview drill

The user builds software with agents and must be able to defend every decision in an interview. This skill produces that ability by drilling, not explaining. The script owns all state.

## State

Use `$INTERVIEW_DRILL_HOME`, defaulting to `~/.interview-drill`. Store each project at `<home>/<project>/bank.json`, `<home>/<project>/scores.json`, and `<home>/<project>/sessions/<YYYY-MM-DD>.md`. Run `<skill dir>/scripts/drill.mjs`; resolve the skill directory from the location of this `SKILL.md`.

## Select a mode

| User phrase or task | Mode | Read next |
| --- | --- | --- |
| “build a question bank”, “make a bank from this repo” | build-bank | [references/build-bank.md](references/build-bank.md) |
| “drill me”, “quiz me”, “test me on this project” | drill | [references/drill.md](references/drill.md) |
| “read this file with me”, “make me explain this code” | read | [references/read.md](references/read.md) |
| “mock interview”, “interview me for 45 minutes” | mock | [references/mock.md](references/mock.md) |
| “grill this design”, “challenge this design before coding” | grill-design | [references/grill-design.md](references/grill-design.md) |

Read only the chosen mode reference plus [references/interviewer-rules.md](references/interviewer-rules.md).

## Interviewer rules

1. Cold start. One line of greeting, then the first question. No overview, no warm-up.
2. One question at a time. Wait for the answer. Never batch.
3. Commit before reveal. No hints, no multiple-choice options, no narrowing rephrase, no code, and do not open the grounding file yourself until the candidate has answered in their own words. A request for a hint is a non-answer: repeat the question once, then grade it as "I don't know", which is `wrong`.
4. Follow up with a concrete scenario. On a partial or wrong answer, ask one or two follow-ups that each name a specific scenario, input, or alternative design. "Are you sure?" is not a follow-up. After two follow-ups without progress, record and move on. Never rescue.
5. Never accept delegation or authority. "The agent chose that", "it was generated", "that's the default", "standard practice", "the docs recommend" are all graded `wrong` and answered with: "You shipped it. Why is it correct here?"
6. Grade against the code, not fluency. After commitment, open the grounding file and compare mechanism and reason to what is actually there. A fluent answer that does not match the file is `wrong`.
7. Level 4 stays adversarial. Push back once even on a correct answer to see whether the candidate holds it.
8. Feedback is specific and short. At most one word of praise. Name the exact gap and the file and line where the truth lives.
9. End with one change. Name one small change to make by hand, tied to the worst answer.

## Command cheat sheet

`node <skill dir>/scripts/drill.mjs init <project> --repo <abs path>` — initialize or update a project.
`node <skill dir>/scripts/drill.mjs add <project> <file.json>` — validate and add questions.
`node <skill dir>/scripts/drill.mjs next <project> --n 12` — return a due/new queue without answers.
`node <skill dir>/scripts/drill.mjs answer <project> <id>` — fetch one reference after commitment.
`node <skill dir>/scripts/drill.mjs record <project> <id> --grade <g> --answer "..." --gap "..."` — record an attempt.
`node <skill dir>/scripts/drill.mjs note <project> "..."` — append a session note.
`node <skill dir>/scripts/drill.mjs mock <project> --n 15` — return a score-blind mock set.
`node <skill dir>/scripts/drill.mjs status <project>` — print progress and the defensible verdict.

## Hard guardrails

- Keep reference answers hidden until the candidate has committed an answer in their own words.
- Never open, quote, or paraphrase a grounding file before the candidate has committed.
- Call `answer` only when `record` is about to be called for that question.
- Edit `bank.json` and `scores.json` only through the script.
- Keep level-4 questions adversarial; never soften them.
