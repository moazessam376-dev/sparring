# Concept cards, Anki-style scheduling, and foundations lessons

Date: 2026-09-05. Owner: the owner. Supersedes the question-and-session model in the first version of the drill.

## Why

The first drill session showed that the floor on the fundamentals behind the app was measured and found low. Fixed questions can also be pattern-matched once seen. So the unit of learning becomes a concept card with a hidden rubric, asked in fresh wording and a fresh context every time, scheduled by days with an ease factor the way Anki does. Lessons feed cards; drills consume cards; lessons come before drills on any topic where the floor is missing.

## Part 1: the script (`scripts/drill.mjs`)

### Bank format v2

```json
{
  "version": 2,
  "project": "raptor",
  "repo": "/path/to/repo",
  "cards": [
    {
      "id": "c001",
      "level": 2,
      "topic": "rls",
      "concept": "Tenant fence inside a SECURITY DEFINER function",
      "ask": "Ask where the tenant fence lives for the coach analytics RPC and why a policy would not do it.",
      "rubric": [
        "Function is SECURITY DEFINER, so caller's policies do not apply inside",
        "Fence is WHERE p.coach_id = auth.uid() in the function body (0031:113)",
        "Role check at 0031:77 only answers 'is this a coach', not 'which coach'"
      ],
      "grounding": ["supabase/migrations/0031_coach_analytics.sql:113"],
      "contexts": ["raptor", "library", "hospital", "isp-support", "generic"],
      "source": { "type": "lesson", "ref": "0001-security-definer-tenant-fence" },
      "added": "2026-09-05",
      "needsRewrite": false,
      "sched": { "interval": 0, "ease": 2.5, "due": "2026-09-05", "reps": 0, "lapses": 0, "lastGrade": null }
    }
  ]
}
```

- `concept` is the name of the idea. `ask` is an answer-free hint that tells the interviewer what to ask about. `rubric` is the list of things a correct answer must contain; it is the hidden reference. `contexts` are worlds the question may be set in; `raptor` means the owner's own code, the others are transfer contexts.
- `needsRewrite` marks cards converted from v1 whose `concept`, `ask`, and `rubric` are still the old question and reference verbatim. The `refine` mode rewrites them.

### scores.json v2

Each attempt gains `question` (the wording actually asked), `context`, and `cardId`. Existing v1 attempts are kept with `cardId` set from the old question id.

### Scheduling

Days, not sessions. `today` is the local date.

- New card: `interval 0`, `due today`, `reps 0`.
- On `wrong`: `interval = 1`, `ease = max(1.3, ease - 0.2)`, `lapses += 1`, `reps = 0`.
- On `partial`: `interval = max(1, round(interval * 1.2))`, `ease = max(1.3, ease - 0.05)`, `reps += 1`.
- On `correct`: `interval = reps == 0 ? 1 : reps == 1 ? 3 : round(interval * ease)`, `ease = min(3.0, ease + 0.05)`, `reps += 1`.
- After any grade: `due = today + interval`, `lastGrade = grade`.
- A card is `new` when `reps == 0 && lapses == 0 && lastGrade == null`, `learning` when `interval < 21`, `mature` when `interval >= 21`.

### Commands

Unchanged names and flags keep working; these change or are added.

- `init` unchanged, writes v2.
- `migrate <project>`: converts a v1 bank in place, backing up to `bank.v1.json`. Each question becomes a card with `concept = question`, `ask = question`, `rubric = [reference, ...followups mapped as "Follow-up: <q>"]`, `contexts = [project, "generic"]`, `needsRewrite = true`, `source = {type:"drill", ref:"v1"}`. Scheduling is derived from attempts: no attempts → new; otherwise replay the attempts in order through the scheduling rules. Idempotent: a v2 bank is left alone.
- `add <project> <file.json>`: accepts an array of cards without `id`, `added`, `sched`. Validates `level` 1-4, non-empty `concept`, `ask`, `rubric` array of 1-6 strings, `grounding` strings matching `^[^:]+:\d+(-\d+)?$` (may be empty for transfer-only cards), `contexts` containing the bank's project name plus one or more transfer worlds from the current transfer-world list, plus `source`. Exact-duplicate `concept` text is skipped. Reports `{added, skipped, total}`.
- `next <project> [--n 12] [--new 6] [--level L] [--topic T]`: returns due cards (`due <= today`) ordered by days overdue descending, then lapses descending, then level ascending; fills the remainder with new cards up to `--new`, topic-balanced. Each entry carries `id, level, topic, concept, ask, contexts, suggestedContext, recentQuestions, state, dueDays, attempts, lastGrade`. Never `rubric`, never `grounding`. `recentQuestions` contains up to three recent wordings, newest first. `suggestedContext` is a context from the card's list not used in that card's last two attempts, preferring a transfer world once the card has been answered correctly in the project context at least once.
- `answer <project> <id>`: returns `rubric`, `grounding`, and the last three attempts' `question` text so the interviewer can avoid repeating wording.
- `record <project> <id> --grade g --answer "..." --gap "..." --question "<wording asked>" --context <ctx> [--mode drill|mock|transfer]`: applies scheduling, appends the attempt, appends a line to `sessions/<date>.md`.
- `refine <project> [--n 10]`: returns up to n cards with `needsRewrite = true`, including their rubric, for the agent to rewrite. `update <project> <id> --file <json>` replaces `concept`, `ask`, `rubric`, `contexts`, `level`, `topic` from the file and clears `needsRewrite`. Scheduling is preserved.
- `gaps <project> [--days 7]`: wrong and partial attempts in the last N days grouped by card: `id, concept, topic, level, grades, gaps[]`. Used by the lesson mode to pick what to teach.
- `mock <project> [--n 15]`: level-distributed random set from all cards, ignoring schedule, without rubric or attempt info.
- `status <project>`: totals by state (new, learning, mature), due today, overdue, per-topic accuracy over the last 30 days, weakest three topics, lapses leaders, and the defensible verdict: at least 90 percent of level 1-3 cards have `lastGrade == correct` and `interval >= 3`, at least one level-4 card has `lastGrade == correct` within the last 7 days, and new cards are under 20 percent of the bank. Also prints "next 7 days" due counts per day, Anki style.
- `note` unchanged.

### Tests

`node --test scripts/drill.test.mjs` covers: migrate converts and replays scheduling and is idempotent; scheduling table for the sequences wrong, partial, correct, correct, correct, and correct after a lapse; `next` never returns `rubric` or `grounding`, orders overdue first, caps new cards, and rotates `suggestedContext`; `add` rejects unknown contexts and skips duplicate concepts; `gaps` groups by card; `status` state counts and the defensible verdict on a constructed bank.

## Part 2: the skill text

- `SKILL.md`: the state section names bank v2 and the card vocabulary. Mode table gains `lesson` ("teach me", "explain", "I don't understand X", "lesson on what I got wrong") and `refine` ("clean up the cards"). Interviewer rules unchanged. Add one rule 10: "Generate, do not read. Every question is written fresh from the card's `ask` and `suggestedContext`. Never reuse a wording listed in `answer`'s recent attempts."
- `references/drill.md`: the session protocol updated for cards: `next`, generate the question in the suggested context, ask, commit, `answer`, grade against the rubric and the grounding, `record` with `--question` and `--context`. Transfer questions from a lesson are recorded with `--mode transfer`.
- `references/lesson.md` (new): the lesson procedure below.
- `references/lesson-format.md` (new): the HTML lesson structure below.
- `references/refine.md` (new): rewrite converted cards so `concept` names the idea, `ask` is answer-free, and `rubric` is a checklist; ten at a time; run `update`.
- `references/build-bank.md`: produces cards, not questions.

## Part 3: lessons

Workspace: `~/.interview-drill/<project>/teach/` with `MISSION.md`, `RESOURCES.md`, `NOTES.md`, `assets/lesson.css`, `lessons/NNNN-<slug>.html`, `lessons/NNNN-<slug>.cards.json`, `reference/glossary.html`, `learning-records/`, and `index.html` listing lessons in order.

### Lesson format, every lesson

1. **The sentence that wires it.** One plain sentence saying what the thing *is*, in the style of "the fence is the result boundary". First element under the title.
2. **Before you start.** The terms this lesson assumes, each with a one-line definition and a link to the lesson that teaches it. If a term has no lesson yet, say so.
3. **Why this exists.** Two to four sentences: the problem this mechanism solves, before any mechanism.
4. **The mechanism, generic.** One diagram, inline SVG or stacked HTML cards. Every box has a caption: what it is, why it is on the path. No unexplained nouns. Terms on first use get an inline expandable definition (`<details>` or a styled `<abbr>` with a visible expansion).
5. **The same thing in Raptor.** The real file and lines, quoted verbatim, 14px minimum, with the plain-language line per excerpt.
6. **What breaks if.** Before and after, static, with the failure in red.
7. **Say it like an interviewer.** Four to five sentences to say out loud.
8. **Check yourself.** Three retrieval questions with click-to-reveal answers of equal word count.
9. **Transfer.** Two or three questions set in a different world (library, hospital, ISP support desk, school, e-commerce) and a different shape (a short scenario, a bug report, a design choice). No answers shown. Text: "Answer these in chat; your agent grades them and they become cards."
10. **Read the source.** Primary docs, one line each.
11. **Footer.** Ask your agent; link to glossary and index; "these concepts come back in your drill".

Each lesson ships `NNNN-<slug>.cards.json`: three to six cards for the lesson's concepts, levels 1-3, `contexts` including `raptor` and at least two transfer contexts, `source = {type:"lesson", ref:"<slug>"}`. The lesson author runs `drill.mjs add` for it.

Design tokens and typography as in `assets/lesson.css`. Dark, one amber accent, JetBrains Mono for headings and code, Inter for body, 880px max width, no external scripts, works at 390px.

### The Raptor foundations series: a request's journey

Written in this order, each grounded in the owner's app. Numbering continues from 0002 because 0001 is the definer lesson.

- **0002 The path.** App to PostgREST to Postgres and back. Introduces the Supabase client, the anon key and why it is safe to ship, PostgREST as the HTTP layer that turns a URL into SQL, REST table calls versus `rpc`. Code: `src/lib/supabase.ts`, one table query, one `rpc` call.
- **0003 Who is asking.** The JWT: issued by Supabase Auth at sign-in, sent as a header, signed so it cannot be edited, decoded by anyone, verified by the server. Claims. `decode` versus `verify`. Code: `src/lib/jwt.ts`, the access-token hook in `supabase/migrations/0004_access_token_hook.sql`.
- **0004 Roles.** What a database role is. `anon`, `authenticated`, `service_role`, `postgres`. How PostgREST switches role per request from the JWT. How the harness impersonates with `set local role` and request claims. Code: `supabase/tests/rls/helpers.ts`.
- **0005 Reading the caller in SQL.** `auth.uid()` and `current_app_role()`: functions that read the verified claims for the current request. Why the client cannot set them. Code: `0004_access_token_hook.sql`, the definition of `current_app_role()` wherever it lives.
- **0006 Row-level security and policies.** A policy is a `WHERE` that Postgres adds to every query on that table for that role. Enabling RLS with no policy means nobody reads anything: deny by default. One real Raptor policy walked line by line. What breaks if RLS is enabled but a policy is missing, and if a policy is too wide. Code: one table's migration with `enable row level security` and its `create policy` statements.
- **0007 Migrations.** Numbered, applied once, in order, on every environment. Why the policy lives in the same migration as the table. What the harness runner does with them. Code: `supabase/tests/rls/runner.ts`, two adjacent migrations.

After the series, **0001** is revised: a "before you start" box linking 0002 to 0006, captions on every box of Diagram A, inline definitions for PostgREST, role, policy, and a transfer section. Its `cards.json` is added.

`index.html` lists 0002 to 0007 first under "Foundations", then 0001 under "Concepts", with a one-line "read this when" per lesson.

## Sequence

1. Script v2, tests, `migrate` run on the Raptor bank, skill text. Verified by the test suite and by `status raptor` showing 54 cards, all `needsRewrite`.
2. Lessons 0002, 0003, 0004 with their cards loaded.
3. Lessons 0005, 0006, 0007, the 0001 revision, `index.html`, glossary update.
4. The owner reads 0002 onward, answers transfer questions in chat, and drills only cards from lessons he has read until the foundations are green. Then `refine` rewrites the 54 converted cards, ten a session, and the full Raptor drill resumes.
