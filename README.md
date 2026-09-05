# interview-drill

Turn a coding agent into a hard technical interviewer for software you built. The zero-dependency Node 22 script owns a v2 concept-card bank, hidden rubrics, scores, day-based Anki-style scheduling, sessions, gaps, and progress.

Install:

```sh
bash install.sh
```

Modes:

- `build-bank`: generate grounded concept cards from a repository.
- `drill`: run a daily due/new card session.
- `lesson`: teach the lowest missing foundation and create transfer cards.
- `refine`: rewrite cards migrated from v1.
- `read`: make the owner explain a file block by block.
- `mock`: run a score-blind interview.
- `grill-design`: challenge a design before implementation.

State lives in `$INTERVIEW_DRILL_HOME` or `~/.interview-drill`.

Quick start:

```sh
node scripts/drill.mjs init demo --repo /absolute/path/to/repo
node scripts/drill.mjs add demo /absolute/path/to/cards.json
node scripts/drill.mjs next demo --n 12 --new 6
node scripts/drill.mjs answer demo c001
node scripts/drill.mjs record demo c001 --grade partial --answer "..." --gap "..." --question "..." --context raptor
node scripts/drill.mjs status demo
```

For an existing v1 bank, run `node scripts/drill.mjs migrate <project>` once. It creates `.v1.json` backups; the migration is not run automatically.

The remaining commands are `init`, `migrate`, `add`, `next`, `answer`, `record`, `refine`, `update`, `gaps`, `mock`, `status`, and `note`.
