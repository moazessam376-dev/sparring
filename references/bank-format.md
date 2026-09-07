# Bank format v2

`bank.json` is an object with a project name, absolute repository path, generation date, and concept cards. The repository path in documentation examples is illustrative; use the real path for the initialized project.

```json
{
  "version": 2,
  "project": "raptor",
  "repo": "/path/to/repo",
  "generated": "2026-09-05",
  "cards": [
    {
      "id": "c001",
      "level": 2,
      "topic": "rls",
      "altitude": "boundary",
      "concept": "Tenant fence inside a privileged function",
      "ask": "Ask where the tenant fence lives for the coach analytics RPC and why a policy would not do it.",
      "rubric": [
        "The function runs with elevated privileges, so caller policies do not apply inside",
        "The function body compares the requested coach to the authenticated caller",
        "A role check answers what kind of caller this is, not which tenant owns the data"
      ],
      "grounding": ["supabase/migrations/0031_coach_analytics.sql:113"],
      "contexts": ["raptor", "library", "hospital"],
      "source": { "type": "lesson", "ref": "0001-security-definer-tenant-fence" },
      "added": "2026-09-05",
      "needsRewrite": false,
      "retired": false,
      "sched": { "interval": 0, "ease": 2.5, "due": "2026-09-05", "reps": 0, "lapses": 0, "lastGrade": null }
    }
  ]
}
```

Card fields:

- `id` is assigned by `add` and is stable for attempts and scheduling.
- `level` is an integer from 1 through 4: what it does, why this choice, what breaks, and adversarial review.
- `topic` is a non-empty lowercase tag.
- `altitude` is required on cards passed to `add` and is one of `map`, `boundary`, `mechanism`, or `line`:
  - `map`: how pieces fit, what talks to what, and where a kind of change belongs.
  - `boundary`: trust, tenancy, money, consistency, and the constraints every feature must satisfy.
  - `mechanism`: how one piece works internally, without relying on line numbers.
  - `line`: a specific load-bearing statement whose absence would cause a security or correctness bug.
- `concept` names the idea. `ask` is an answer-free hint used to generate a fresh question. `rubric` is the hidden one-to-six item checklist for grading.
- `grounding` contains relative `path:line` or `path:start-end` references matching `^[^:]+:\d+(-\d+)?$`. It may be empty for transfer-only cards.
- `contexts` is a non-empty, duplicate-free subset of the bank's own `project` name plus the transfer worlds `library`, `hospital`, `isp-support`, `ecommerce`, `school`, `bank`, `logistics`, and `generic`. Every card must include the project name and at least one transfer world; for example, a bank whose project is `raptor` might use `raptor`, `library`, and `hospital`.
- `source` contains non-empty `type` and `ref`, such as a lesson reference.
- `added` is a `YYYY-MM-DD` date assigned by `add`.
- `needsRewrite` marks a card converted from v1 whose concept, ask, or rubric still needs refinement.
- `retired` is optional and defaults to false. `remove` sets it to true without deleting attempts; retired cards are omitted from `next`, `mock`, `refine`, and status counts, while direct id operations remain available.
- `sched` is owned by the script and should not be supplied to `add`: `{interval, ease, due, reps, lapses, lastGrade}`. New cards start with interval 0, ease 2.5, due today, zero reps and lapses, and no grade.

The input to `add` is an array of cards without `id`, `added`, or `sched`. Every card must include `altitude`; validation rejects the whole input if any card is invalid. `update --file` requires `level`, `topic`, `concept`, `ask`, `rubric`, and `contexts`; `altitude` is optional, and when omitted the existing altitude is preserved.

## scores.json v2

```json
{
  "attempts": [
    {
      "id": "c001",
      "cardId": "c001",
      "date": "2026-09-05T14:10:00Z",
      "session": "2026-09-05",
      "grade": "partial",
      "answer": "one-line summary of what the candidate said",
      "gap": "what was missing",
      "mode": "drill",
      "question": "A fresh wording for the card",
      "context": "raptor"
    }
  ]
}
```

`grade` is `correct`, `partial`, or `wrong`. `mode` is `drill`, `mock`, or `transfer`. Attempts retain `id` for v1 compatibility and use `cardId` for v2 card lookup. The script owns scheduling and keeps attempts when a card is retired.

`migrate <project>` converts a v1 question bank once and creates `.v1.json` backups. Converted cards use `altitude: "mechanism"`. If a bank is already v2, migrate upgrades cards that are missing `altitude` to `mechanism`; a later run reports `upgraded: 0` and does not rewrite the bank.
