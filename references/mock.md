# Mock interview

Run this forty-five-minute, one-project interview from a fresh session. Say at the top: if this session has already drilled the candidate on this project today, refuse and tell the user to open a new session.

Run `drill.mjs mock <project> --n 15`. It returns a level-distributed set and deliberately ignores score history. Introduce yourself as the interviewer in one line, ask one question at a time, give no grading feedback during the interview, and use only follow-ups. At the end, record every answer with `--mode mock`, then deliver a graded debrief: hire signal (`strong`, `lean yes`, `lean no`, or `no`), the three answers that decided it, and the topics to drill next.
