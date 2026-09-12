# Lesson authoring

Use this mode after a repository survey, when the learner asks to be taught, or when a drill gap names a prerequisite.

## Non-negotiable authoring rules

Supply content fields only. Never emit HTML, CSS, player markup, Mermaid markup, or hand-built interaction markup. The application owns layout, states, keyboard behavior, grading, and rendering. `prose.body` accepts Markdown because the schema declares that field as `markdown`; use it for lesson words, not for player structure. Evidence: `docs/2026-09-12-sparring-as-software-design.md`, section 4; `lesson/schema.mjs`; `docs/research/2026-09-10-learning-science.md`, findings 5, 6, and 9.

Report a topic the catalogue cannot express as a catalogue gap. Do not work around the gap with extra prose, an unlisted block type, or markup. Evidence: `docs/2026-09-12-sparring-as-software-design.md`, section 4; `design/Components.dc.html`, `cat()`.

Keep rubrics hidden until the learner commits an answer. Grade against grounded repository evidence, not fluency. Evidence: `docs/research/2026-09-10-learning-science.md`, findings 1, 8, and 9; `docs/research/2026-09-12-large-repository-survey.md`, finding 10.

## Server sequence

1. Call `sparring_projects` and `sparring_topics` to identify the project, existing topic nodes, and the survey claims that ground the lesson. Evidence: `docs/2026-09-12-sparring-as-software-design.md`, sections 3.3 and 6.
2. Choose `map` for a new project. Choose a deep lesson only for an unclear map node or a drill gap. Evidence: `docs/2026-09-12-sparring-as-software-design.md`, section 6; `docs/research/2026-09-10-learning-science.md`, finding 5.
3. Run the knowledge ladder in chat before authoring or showing the lesson. Ask one yes-or-no question per planned part in part order. A `yes` gets a one-sentence definition follow-up. Record `known` for a right definition, `roughly` for a wrong or vague definition, and count `roughly` as `no`. Stop after two consecutive `no` answers or at the top. Record every rung with `sparring_record`. Evidence: `docs/research/2026-09-10-learning-science.md`, finding 8; the Lesson page format and Learning framework in that file.
4. Run one pretest question in chat before the learner opens the lesson. Record the answer as a transfer attempt on the block’s card with `sparring_record`. Evidence: `docs/research/2026-09-10-learning-science.md`, finding 8.
5. Assemble the lesson as a structured document and submit it through `sparring_author_lesson`. Use `sparring_add_cards` for its cards only after the authoring response validates. Use the schema and catalogue in [components.md](components.md) as the field authority. Evidence: `lesson/schema.mjs`, `lesson/validate.mjs`; `docs/2026-09-12-sparring-as-software-design.md`, section 4.
6. Open one part at a time. Ask its check after the learner says that part is read. Wait for commitment, reveal the answer, explain the gap in one line, and record the attempt with `sparring_record`. Evidence: `docs/research/2026-09-10-learning-science.md`, findings 1, 4, and 9.
7. Ask one self-explanation prompt after the last part. Ask every Recall item as typed production, situation first. Reveal the mnemonic after each attempt and record every response with `sparring_record`. Evidence: `docs/research/2026-09-10-learning-science.md`, findings 4, 9, and 11.

## Lesson shape

### Map lesson

Write three to nine parts in this order: request path, storage, and cross-cutting rules. Keep the map within the learner’s working-memory budget. Put alternatives and trade-offs in a linked decisions record for a later session. Evidence: `docs/2026-09-12-sparring-as-software-design.md`, section 6; `docs/research/2026-09-10-learning-science.md`, findings 6 and 7.

### Deep lesson

Write three to five parts around the prerequisite or drill gap. Use a worked trace the first time a mechanism occurs. Use problem-first retrieval after the same pattern has been taught in two projects. Evidence: `docs/research/2026-09-10-learning-science.md`, finding 5.

### Part content

Give each part one mechanism, concrete names before abstract terms, a grounded explanation, and the smallest helpful visual. Add one production check per part. Keep check answers absent from labels, prose, and diagrams. Change a condition or plant a wrong claim in at least two checks per lesson. Evidence: `docs/research/2026-09-10-learning-science.md`, findings 1, 5, 6, 8, and 9.

Use these component roles:

- `prose`, `diagram`, `trace`, and `terminal` explain or show a mechanism.
- `short`, `code`, `recall`, `lure`, `order`, `blank`, and `place` ask for production or exact action.
- `explainself` stores a self-explanation without grading it.
- `schema`, `timeline`, and `reqres` show structure, time, or boundary shape.

Evidence: `docs/research/2026-09-10-learning-science.md`, findings 4, 5, 6, 9, and 11.

The complete field contract and validator limits live in [components.md](components.md). Evidence: `design/Components.dc.html`, `cat()`; `lesson/schema.mjs`; `lesson/validate.mjs`.

## Completion gate

Before presenting the lesson, confirm all of these conditions:

Evidence for the instructional conditions: `docs/research/2026-09-10-learning-science.md`, findings 1, 4, 5, 6, 8, 9, and 11. Schema conditions cite `lesson/schema.mjs` and `lesson/validate.mjs` below.

- the document has version, id, project, title, topics, blocks, and created fields;
- every block uses one catalogue type and only its declared fields;
- every object shape passes its required fields and type rules;
- `lure` has exactly one correct option and a `why` for every wrong option;
- `order` is a permutation of its step indices;
- every `blank.at` points inside its snippet;
- the lesson has three to twelve gradable blocks and no more than forty total blocks;
- every `short.grounding` names path, line, and commit; every `trace` names commit; every `code` and `blank` reference names path and line;
- every part has one check, the lesson has one final self-explanation, and Recall items follow the parts;
- no catalogue gap is hidden in prose or markup.

Submit again through `sparring_author_lesson` after fixing invalid content. Do not hand-edit a rendered lesson. Evidence: `lesson/schema.mjs`; `lesson/validate.mjs`; `docs/2026-09-12-sparring-as-software-design.md`, section 4.
