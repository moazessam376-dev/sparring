# interview-drill

Turn a coding agent into a hard technical interviewer for software you built. The zero-dependency Node script owns the question bank, scores, sessions, and spaced-repetition queue.

Install:

```sh
bash install.sh
```

Modes:

- `build-bank`: generate grounded questions from a repository.
- `drill`: run a daily spaced-repetition session.
- `read`: make the owner explain a file block by block.
- `mock`: run a score-blind forty-five-minute interview.
- `grill-design`: challenge a design before implementation.

State lives in `$INTERVIEW_DRILL_HOME` or `~/.interview-drill`.

Quick start:

```sh
node scripts/drill.mjs init demo --repo /absolute/path/to/repo
node scripts/drill.mjs add demo /absolute/path/to/questions.json
node scripts/drill.mjs next demo --n 12
```
