# Design

Working files for the sparring desktop application's screens. Each `.dc.html` is
one artboard on a shared canvas; `canvas.json` lays them out. `sparring-screens.html`
is the seeded, published page and is generated, not edited by hand: change an
artboard and re-seed.

Published at https://claude.ai/code/artifact/1e85a088-a8f7-4712-a150-bbd37fabcdc8

| File | Screen |
| --- | --- |
| `Main.dc.html` | The hub: projects and topics as one graph |
| `ProjectMap.dc.html` | One project's parts, with the cross-cutting constraints drawn as bands |
| `Survey.dc.html` | Pointing sparring at a repository and confirming what it found |
| `DrillRunner.dc.html` | The question loop: commit, grade, contest |
| `LessonPlayer.dc.html` | A lesson, one part at a time, each ending in a check |
| `Standing.dc.html` | Gaps, decay, and whether the schedule is calibrated |

Three rules the screens exist to hold:

- Nothing is revealed before the candidate commits, including the grounding file.
- Every estimate is drawn with how little it is worth. The pale band behind a bar is its uncertainty, and on a thinly evidenced topic it is wider than the bar.
- A part the survey could not verify is drawn dashed and marked, never dropped. A gap you can see beats a tidy map that is wrong.

Tokens come from `templates/html-legacy/lesson.css`. Geist for interface text, Geist Mono for technical content only, Inter for editorial asides.
