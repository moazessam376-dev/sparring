# Bank format

Keep `bank.json` as an object with a project name, absolute repository path, generation date, and question array:

```json
{
  "project": "raptor",
  "repo": "/Users/moazessam/Projects/Gym-App",
  "generated": "2026-09-05",
  "questions": [
    {
      "id": "q001",
      "level": 2,
      "topic": "rls",
      "question": "Why does this policy use the owner join instead of a client-side check?",
      "grounding": ["supabase/migrations/0012_plans.sql:40-58"],
      "reference": "The policy checks the database-side owner relationship, so an untrusted client cannot bypass it. The grounding migration defines the policy and its join.",
      "followups": ["What can a malicious client change?", "Which request path exercises this policy?"],
      "added": "2026-09-05"
    }
  ]
}
```

Each question has an `id`, integer `level` from 1 through 4, lowercase free-form `topic`, non-empty `question`, one or more relative `grounding` entries in `path:line` or `path:start-end` form, a two-to-six-sentence `reference`, zero to three `followups`, and an `added` date. `repo` is the absolute repository path; `generated` and `added` use `YYYY-MM-DD`.

Levels mean:

- Level 1: what does this do?
- Level 2: why this and not the alternative?
- Level 3: what breaks if it changes, or here is a bug report; find it.
- Level 4: take an adversarial attacker or sceptical reviewer stance.

Keep `scores.json` as:

```json
{
  "attempts": [
    {"id": "q001", "date": "2026-09-05T14:10:00Z", "session": "2026-09-05", "grade": "partial", "answer": "one-line summary of what the candidate said", "gap": "what was missing", "mode": "drill"}
  ]
}
```

`grade` is `correct`, `partial`, or `wrong`. `mode` is `drill` or `mock`.

## Complete examples by level

These are synthetic examples.

### Level 1

```json
{"id":"q101","level":1,"topic":"parser","question":"What does the token cursor do after consuming a string literal?","grounding":["src/parser.js:42-57"],"reference":"The cursor advances past the closing quote and returns the decoded literal. The advance and return are implemented in src/parser.js:42-57.","followups":["What happens at end of input?"],"added":"2026-09-05"}
```

### Level 2

```json
{"id":"q102","level":2,"topic":"auth","question":"Why does the command state validate the session before loading the workspace?","grounding":["src/state-machine.js:18-31"],"reference":"Validation runs first so an expired session cannot cause protected workspace data to load. The transition order in src/state-machine.js:18-31 makes that boundary explicit.","followups":["What alternative ordering did you reject?"],"added":"2026-09-05"}
```

### Level 3

```json
{"id":"q103","level":3,"topic":"storage","question":"A user can read another tenant's export when they guess its URL. Find the failure and explain what changes if the object path is made tenant-prefixed.","grounding":["src/storage-policy.sql:60-78"],"reference":"The policy authorizes the bucket but does not bind the object key to the requesting tenant. A tenant-prefixed key gives the policy a value to compare, but the database-side check in src/storage-policy.sql:60-78 must still enforce it.","followups":["Can a client safely supply the tenant id?","Which existing objects need migration?"],"added":"2026-09-05"}
```

### Level 4

```json
{"id":"q104","level":4,"topic":"reliability","question":"Act as an attacker: why should I trust this retry loop not to duplicate a payment when the provider times out after accepting the charge?","grounding":["src/payments.js:90-121"],"reference":"The loop is unsafe unless the provider request carries a stable idempotency key and the response is reconciled before retrying. src/payments.js:90-121 shows the timeout path and must prove both properties.","followups":["What evidence would distinguish an accepted charge from a lost response?","What is the failure mode during process restart?"],"added":"2026-09-05"}
```
