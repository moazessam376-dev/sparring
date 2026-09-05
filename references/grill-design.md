# Grill a design

Use this mode for a design document before implementation. If a skill named `grilling` from `mattpocock-skills` is available in the host, invoke it on the document first and follow it.

Apply these additions in every case:

- Challenge every requirement with “what happens when this is false”.
- Challenge every “we will” with “how will the test know”.
- Challenge every technology choice with “what did you reject and why”.
- Have the candidate edit the document in place as answers change.

At the end, save the full transcript as `<repo>/docs/decisions/<YYYY-MM-DD>-grilling-<slug>.md`. Put a header in that transcript listing the decisions changed. Add the design decisions to the project's bank as level 2 and level 4 questions with `drill.mjs add`, so the owner enters the spacing loop for their own design.
