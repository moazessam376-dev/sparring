# Refine migrated cards

Use `drill.mjs refine <project> --n 10` to take at most ten cards with `needsRewrite: true` at a time. For each card:

- Rewrite `concept` so it names the idea, not the old question.
- Rewrite `ask` as an answer-free hint for the interviewer.
- Rewrite `rubric` as a one-to-six item checklist of mechanisms, reasons, and failure boundaries that a correct answer must contain.
- Keep grounding true to the source and choose contexts that include Raptor plus useful transfer worlds.
- Keep `line`-altitude cards only when the line is load-bearing: its absence would cause a security or correctness bug. Otherwise rewrite the card to `mechanism` or `boundary` altitude with `update`, or delete it with `remove <project> <id>`; removal keeps attempts and marks the card `retired`.
- `refine` returns each card's `altitude`, so the rewriting agent can assign or correct it in the replacement object.

Write one replacement JSON object per card, then run `drill.mjs update <project> <id> --file <json>`. `update` replaces `concept`, `ask`, `rubric`, `contexts`, `level`, and `topic`, clears `needsRewrite`, and preserves scheduling. Do not reset a card's learning history while refining it.
