# Build a card bank

1. Run `drill.mjs init <project> --repo <path>`; repeat runs must preserve existing cards and scores.
2. Survey the repository structure yourself, or use a cheap read-only sub-agent if the host supports one. Identify six to ten decision-dense areas. For a Supabase app, inspect RLS policies, migrations, auth and role resolution, storage rules, edge functions, the client data layer, payments, and secrets handling.
3. For each area write four to eight concept cards across the levels. Target forty to sixty cards, roughly 25 percent level 1, 35 percent level 2, 25 percent level 3, and 15 percent level 4. Open every grounding file and line before writing its rubric. Make level-3 bug reports plausible and location-based. Make level 4 cards attack the design or adopt a sceptical senior stance.
4. Write cards to a temporary JSON array without `id`, `added`, or `sched`, then run `drill.mjs add <project> <file.json>`. Each card names a `concept`, gives an answer-free `ask`, lists a one-to-six item `rubric`, includes `grounding`, `contexts`, and `source`. Let the script assign ids and validate the input.
5. Run `drill.mjs status <project>` and show the level distribution. Keep every rubric and grounding entry hidden during a drill.
6. When status reports fewer than ten new cards, generate ten to fifteen more in the weakest topics and add them.

## Example stems

Use these synthetic stems to match the register. Spread the levels as marked.

### Multi-tenant Postgres app

- Level 1: What rows does this tenant-scoped query return, and where is the tenant identity obtained?
- Level 2: Why does this RLS policy use a security-definer helper instead of joining the membership table inline?
- Level 3: A support user sees an empty report after switching organizations; which transaction boundary could cause it, and what would break if it moved?
- Level 4: As a hostile tenant, how could I exploit a client-supplied organization id, and what database constraint stops me?

### Parser project

- Level 1: What token does this branch consume, and what cursor position does it leave behind?
- Level 2: Why does the parser reject this ambiguity instead of backtracking to the alternative production?
- Level 3: A quoted escape at end of input produces a valid node; find the missing error path and state what changes if recovery is enabled.
- Level 4: As a sceptical reviewer, why will this precedence rule not let malformed input smuggle an operator into the AST?

### CLI state-machine project

- Level 1: What event causes this state transition and which side effects run with it?
- Level 2: Why does the command persist the checkpoint before rendering the success message?
- Level 3: The process resumes in a state whose input file was deleted; find the invariant violation and explain the user-visible failure.
- Level 4: As an attacker controlling stdin, how can I force an unsafe transition, and where is that event rejected?
