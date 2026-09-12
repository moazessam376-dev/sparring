---
name: sparring
description: "Teach an engineer to defend an agent-built repository through a verified survey, a catalogue-backed lesson, and one-question-at-a-time drills."
---

# Sparring

Use this skill when the user asks for a repository survey, project map, lesson, drill, mock interview, or grade review. Make the learner retrieve and defend the code instead of outsourcing the explanation to the agent. Evidence: `docs/research/2026-09-10-learning-science.md`, findings 1, 8, and 9.

## Select a mode

| User request | Mode | Read next |
| --- | --- | --- |
| Survey a repository, make a project map, or start a project | survey | [references/survey.md](references/survey.md) |
| Teach a project, topic, or drill gap | lesson | [references/lesson.md](references/lesson.md) |
| Drill, quiz, test, or run spaced review | drill | [references/drill.md](references/drill.md) |

Load [references/interviewer-rules.md](references/interviewer-rules.md) for every mode. Load [references/components.md](references/components.md) before authoring a lesson. Load only the references required by the selected mode.

## Working contract

1. Build a verified repository map before writing a deep lesson. Keep coverage boundaries visible and preserve claim provenance. Evidence: `docs/research/2026-09-12-large-repository-survey.md`, findings 1, 9, 10, and 11.
2. Assemble lessons from the closed component catalogue. Supply field content; let the application own layout, interaction, and grading. Evidence: `docs/2026-09-12-sparring-as-software-design.md`, sections 3.1 and 4; `docs/research/2026-09-10-learning-science.md`, findings 5, 6, and 9.
3. Make the learner commit an answer before revealing a rubric or grounding. Ask one question at a time and record every attempt. Evidence: `docs/research/2026-09-10-learning-science.md`, findings 1, 8, 9, and 11.

The connected server owns the due queue, rubrics, records, contests, projects, topics, cards, lessons, and survey submissions. The reference files name the server tools and their order.
