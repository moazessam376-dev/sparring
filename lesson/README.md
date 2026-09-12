# Lesson documents

`schema.mjs` defines schema version `1` and the fifteen component types from
the published catalogue. A lesson has this shape:

```json
{
  "version": 1,
  "id": "lesson-id",
  "project": "project-id",
  "title": "Lesson title",
  "topics": ["topic-id"],
  "blocks": [{"type": "recall", "situation": "...", "answer": "...", "accept": ["..."]}],
  "created": "2026-09-12T00:00:00Z"
}
```

The catalogue is data. Each component declares `required` and `optional`
fields, field type descriptions, whether it is gradable, and its grading mode.
The exported `COMPONENTS` object is deeply frozen. The validator has no
component-name switch: it reads those declarations and applies generic rules.

All fields published by the catalogue are required at the block level. A lure
option always needs `text` and `correct`; `why` is optional for the correct
option but required and non-empty for every wrong option. `grounding` requires
`path`, an integer `line`, and a non-empty `commit`.

`validate(doc)` returns `{ok: true}` for a valid lesson. Otherwise it returns
`{ok: false, errors}`. Every error has `block`, `field`, and `message`; document
errors use `block: null`, while block indexes are zero-based. Validation walks
the complete document and reports all errors in one pass.

The component catalogue is frozen, so a caller that needs an experimental
component can create an extended catalogue and pass it as the optional second
argument: `validate(doc, {...COMPONENTS, custom: definition})`. The runtime
extension test demonstrates that no validator change is needed.

The Redis locking example uses every catalogue component and contains seven
gradable blocks, which keeps it inside the three-to-twelve lesson range.

Run the tests and example check from the repository root:

```sh
node --test "lesson/*.test.mjs"
node -e "import('./lesson/validate.mjs').then(async m => { const d = JSON.parse(require('fs').readFileSync('lesson/examples/redis-locking.json','utf8')); console.log(m.validate(d)); })"
```
