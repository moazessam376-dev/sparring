# Sparring as software

Date: 2026-09-12. This records the design for turning sparring from an agent skill into an open-source desktop application. It builds on `2026-09-05-cards-and-lessons-design.md` and `2026-09-08-altitude-and-the-map-design.md`, and is grounded in `research/2026-09-10-learning-science.md` and `research/2026-09-12-product-landscape.md`.

Status: design agreed in conversation on 2026-09-12. The stack questions were resolved the same day by `research/2026-09-12-desktop-stack.md`. Two cost decisions remain open and are listed in section 10.

## 1. The problem and the evidence

Engineers now ship code they did not write and do not fully hold. Nobody expects anyone to hold a large codebase line by line, but a working engineer is expected to hold the map, the constraints that touch every feature, and the habit of finding detail on demand. Agent-assisted work erodes exactly that, and it does so invisibly, because the code passes review and the tests go green.

The measurement exists. Fifty-two engineers built the same two features with and without AI assistance and then sat a comprehension quiz. The assisted group scored 50 percent against 67 percent, effect size 0.738, with no significant time saving, and they hit one library-specific error each where the unassisted group hit three. Errors are where learning happens and the assistant removed them.

The more important result is that this is fixable by prompting. About a thousand students used either a plain model or a tutor-prompted one. During practice the plain model helped more. On a later unassisted exam the plain-model group was 17 percent worse than control while the tutor-prompted group was level. Unguarded use caused the harm and a guardrail erased it.

That sets the claim this project makes. Not that AI harms learning. That unguarded AI use harms learning, that the guardrail is a set of rules an agent follows, and that the rules only compound if something remembers what you have already learned and when you last recalled it.

The binding constraint is not model quality. A randomised trial of an AI tutor across eighteen schools measured an effect of 0.05 standard deviations, which the authors described as resembling the same platform with no AI at all, and found the median student sent zero messages to the tutor even in sessions where they made mistakes. The product's hardest job is getting a person to do retrieval they would rather skip.

## 2. What it is

A free, open-source, local-first desktop application for Windows, macOS and Linux.

It holds a graph of your projects and the topics inside them. It points an agent at a repository and turns what comes back into a map you can read and then dig into. It renders lessons the agent authors, with diagrams, checks partway through, and a quiz at the end. It schedules recall over days and interleaves across projects. It tells you where you stand and where the gaps are, and it asks you questions when you were not planning to answer any.

It does not contain a model. The user's own coding agent does the teaching and the grading, through a connection the app provides.

## 3. Decisions

### 3.1 The agent teaches, the hub renders and remembers

Teaching happens in the user's existing agent, which already has the repository, the tools and a subscription the user pays for. The hub owns the learner state, the schedule, the rules, the interface and the notifications. Lessons are authored by the agent and rendered by the hub, so the learner walks through them in the application rather than in a terminal.

This is the difference between a skill and a product. A skill teaches one project and forgets. The hub is the only thing that can see two projects at once, notice that a topic recurred, and ask about it three weeks later.

### 3.2 Grading

Free-text answers are graded by the connected agent against the hidden rubric. Agreement between models and human raters on short-answer grading sits around 0.59 to 0.64 on quadratic weighted kappa, with a known bias toward fluency over content, so a grade is a judgement and not a fact. Two consequences: the learner can contest a grade and the contest is recorded, and the check mix leans on formats that grade deterministically wherever they carry the same evidence.

The mix is set by the evidence rather than by preference. Short answer with immediate feedback retains best. Multiple choice is only useful when the wrong options are real misconceptions and feedback follows at once, and it beats short answer only when feedback is absent. So: short answer where the agent is connected, multiple choice with genuine lures where it is not, and typed exact recall for commands and strings, which is production and grades exactly.

### 3.3 The knowledge model is a topic graph

Topics are the nodes, with subtopics beneath them, so socket.io holds acknowledgements and reconnection. Topics carry a kind, so debugging and critical thinking live in the same graph as Redis. Projects link to the topics that appear in them. Cards are the evidence that a topic is held. Prerequisite edges drive what to learn next.

One honest caveat belongs in the record. An expert topic model adds almost nothing to predictive accuracy: 0.01 AUC or less on seven of nine benchmark datasets, and randomly assigned components score within 0.01 to 0.03 of expert ones. The graph earns its place as navigation, explanation and the user's own sense of where they stand. It is not an accuracy mechanism and will not be sold as one.

### 3.4 A desktop application

Tauri, on all three platforms, with a real window, native notifications, tray presence and the ability to sit running in the background. Editor extensions and agent plugins come later as additional surfaces, not as the product.

The reason is the notification. Retrieval that arrives when you were not asking for it is the single unoccupied behaviour in this whole category, and a browser tab cannot do it. Tauri covers notifications, tray, autostart, bundled SQLite, updater and deep links with official plugins, and keeps the contributor bar at JavaScript for everything above the shell.

Two costs come with it. The webview differs on each platform, and the Linux one is the weak link, so the project needs a stated Linux support matrix rather than a claim that it works everywhere. And the notification plugin fires immediately rather than on a schedule, so recurring reminders need either the resident process to own the timer or the operating system's own scheduler.

### 3.7 T3 Code is a reference, not a dependency

T3 Code normalises six agents into one event model, and the question was whether to depend on it. The answer, from reading its source, is no. Its canonical event union is not published: the contracts package is marked private, provider registration is compiled in rather than loadable, and no subscription on its public interface carries the normalised provider event. It does write an event log to disk, but that log is best-effort and drops the transient events, so reading it would be a private and lossy integration. Consuming the real stream would mean running its whole server and pinning internals it does not promise to keep, in a project at version 0.x with several thousand commits and nightly builds landing during the week this was written. It also has no driver for Devin.

What is worth taking is the shape rather than the code: provider-specific acquisition behind adapters, raw provenance retained alongside the normalised event, a canonical union, and projections built from it. Its handling of the Codex app server, the Claude Agent SDK, the agent client protocol used by Cursor and Grok, and the OpenCode server is a strong reference for writing ours.

An optional connector for people who already run T3 Code is reasonable later, behind a flag. It cannot be the foundation, because sparring has to work when T3 Code is not installed. Its licence permits copying source with the notices preserved, which does not extend to the third-party libraries those adapters depend on.

### 3.8 Distribution

The application is not signed with an Apple Developer ID, because that costs 99 US dollars a year and this project must cost nothing to keep alive. Windows signing is free through the SignPath Foundation for qualifying open-source projects, and Linux has no equivalent gate, so macOS is the only platform where this decision has consequences.

Those consequences got worse during 2026. The Control-click bypass was removed in macOS Sequoia, so a quarantined application now needs a trip through System Settings and an admin password. Homebrew dropped the flag that skipped the check and began removing casks that fail it on 1 September 2026.

So the primary macOS route is a terminal install command that places the application directly. Files placed that way never receive the quarantine flag, because that flag is set by the browser rather than by the download, so the application opens normally with no warning and no settings trip. The build is still ad-hoc signed, which is free and is all Apple silicon requires in order to execute.

A disk image is published as well, for people who would rather drag an icon, with the System Settings steps documented beside it. On Windows the installer is signed, and a new application still trips the reputation warning until it has been installed cleanly a few hundred times. On Linux the lead format is AppImage, because the updater is built around it, with a Debian package alongside.

This is a deliberate tradeoff rather than the industry norm. Comparable desktop applications from funded companies pay for notarisation and ship a disk image that opens on the first double click.

### 3.9 The rest of the stack

Settled by the desktop research, with the versions that were current on 2026-09-12.

- **The agent connection** is a Model Context Protocol server over streamable HTTP, bound to loopback only, with a random bearer token held in the operating system credential store and the request origin validated. The older server-sent-events transport is deprecated and will not be implemented. A stdio adapter stays available for agents whose configuration can only spawn a process. The application generates the configuration snippet for each agent rather than assuming they share a format.
- **The lesson document** is a versioned typed schema of our own, holding Markdown prose and a closed set of interactive block types, borrowing response semantics from the assessment standards and event vocabulary from the learning-record standards without adopting either wholesale. The application has to validate, migrate and render these offline, which is exactly what owning the schema buys.
- **Diagrams** are Mermaid by default, D2 where an architecture layout needs it, and Graphviz compiled to WebAssembly as the deterministic fallback for dense graphs. Every diagram is parsed and repaired before it reaches the learner, because the agent will get some of them wrong. No controlled benchmark exists comparing how often a model emits a correct diagram in each syntax, so this is an engineering judgement rather than a measured result, and it is worth revisiting with our own data once lessons exist.
- **The local database** is SQLite, using recursive common table expressions for the graph queries with explicit cycle bounds. It stays a derived cache.

### 3.5 State is an append-only log, the transport is swappable, git is first

Every attempt, card change, lesson completion and topic edit is an append-only record in a log file belonging to one device. Two machines never write the same bytes, so merging is not a problem that needs solving. SQLite is a cache rebuilt from the log and is safe to delete.

Transport sits behind an interface. The first implementation is the user's own git remote, private by default, using the credential helper already on the machine so the app never handles a token. That costs the maintainer nothing, gives free versioning and a readable history, and makes a second machine a clone away. The log is plain JSON Lines and lessons are Markdown, so a user can read their own history in an editor or leave for another tool without an export feature.

Known costs, accepted: push races need a pull, rebase and retry loop; an append-only log needs periodic snapshots with the old log compacted away; sync is on launch, on close and on a timer, so two machines open at once drift for minutes.

### 3.6 No accounts, no server, no user database

There is no server-side store of user data, and no login. The data this application holds is a record of what a named engineer does not understand about their employer's codebase, and topic names alone leak project and employer identity. A breach is career damage rather than an inconvenience.

Improving the application does not require personal data. It requires answers to four questions, and each can be answered by counters with no content: whether a check type discriminates, whether the scheduler is calibrated, where in a lesson people stop, and whether lessons authored by weaker agents grade worse.

## 4. Subsystems

1. **Core.** The event log, the derived database, the topic graph, the scheduler and the mastery computation. Headless and tested, with no interface dependency.
2. **Agent bridge.** The server the user's agent connects to, exposing the core as tools: fetch the due queue, fetch a rubric after commitment, record an attempt, propose cards, author a lesson, grade an answer, survey a repository. Plus the portable rules files, so every agent drives it the same way.
3. **Lesson system.** A typed lesson document the agent emits and the application validates, with blocks for prose, diagrams, worked traces, checks, self-explanation prompts and the closing quiz. Invalid lessons are rejected before a learner sees them. The player renders, runs the checks, routes free text to the agent and writes results back.
4. **Repo survey and map.** Section 6.
5. **Desktop application.** The window, the graph view, the project view, the lesson player, the drill runner, the gaps view, the tray and the scheduled reminders.
6. **Teaching rules.** The versioned behaviour layer that makes even a small model teach well: interviewer rules, lesson format, altitude, the check mix. Shipped with the application and handed to whatever agent connects.
7. **Sync.** The transport interface and its git implementation.

## 5. Data model

**Event.** The only durable record. Written append-only to `log/<device>/<period>.jsonl`. Every other table is derived and rebuildable.

**Project.** A repository: identifier, name, remote URL, when it was added. The local filesystem path is per-device configuration and is never written to the shared log, because it differs on every machine.

**Topic.** A named concept with an optional parent, forming the subtopic hierarchy. Carries a kind, so technologies, architectural concepts and general skills share one graph. Linked to the projects it appears in, and to other topics by prerequisite edges.

**Card.** The unit of assessment, carrying the concept, the answer-free ask, the hidden rubric, the altitude, its topics and its grounding.

**Lesson.** An authored document belonging to a project and to topics.

Two changes to the existing format:

- **Grounding gains a commit hash** beside the path and line. A reference like `file:42` rots the moment the repository moves, and the current bank format has no defence against it. With a hash, the application can tell the difference between a wrong answer and a stale card, and can ask the agent to re-ground it.
- **The free-text topic tag becomes a link** into the topic graph. This needs a one-time migration of the existing bank, which the agent performs by proposing topics and the user confirms.

**Mastery is computed, never stored as a claim.** Per-card retention comes from the scheduler. Item difficulty comes from an online rating updated after every answer, which works from about five responses and needs no expert input. The per-topic number is a fixed-coefficient formula over recency, log prior successes, and recency-weighted proportion correct, because nothing more elaborate can be fitted from one person's data. Every displayed estimate carries its uncertainty and can be contested by the user, and the contest is an event like any other.

Why nothing more elaborate: fitting a classical knowledge-tracing model needs on the order of a thousand learners for a single significant digit, deep models need roughly a million interactions before they beat logistic regression, and asking a language model to predict whether someone will answer correctly lands at or below chance. A single-user local application has none of the data any of those require.

## 6. The repo survey and the map

Point sparring at a repository and it produces the map before it produces anything else.

The agent surveys the whole repository and returns a structured survey rather than prose: the parts, what each one is in a sentence, what talks to what, and the constraints that cross everything. The constraints matter most. These are the rules every feature has to satisfy, such as where the tenant boundary is enforced or what must never happen outside a transaction, and forgetting one is how a codebase gets broken by someone competent.

The hub renders that as the project map: a graph with one sentence per node and the crossing constraints drawn as bands. It stays small enough to hold in working memory, roughly twelve nodes and six bands. A larger project gets a second level rather than more nodes. Every node and band is a door: click it to open the deep lesson if one exists, to generate one if it does not, or to be drilled on it.

The survey also proposes the project's topics and an initial card set, which is how the graph and the bank come to exist without anyone authoring them by hand. The user confirms rather than accepts silently, because a survey is a claim.

### How it handles a repository too large to read

Answered by `research/2026-09-12-large-repository-survey.md`. The short version is that coverage is not the target, evidence is, and the gate is mechanical.

- **Nothing is omitted unlabelled.** Every path in the repository is classified as inspected, excluded by rule, generated, binary, unresolved or pending. A directory that was skipped is a labelled region, never an absence.
- **Structure comes before reading.** Entry points are found from the build and configuration files, then import and call graphs are built with real parsers rather than inferred from prose. Dynamic dispatch, reflection and plugin loading stay as explicit unknown edges rather than being guessed into certainty.
- **Reading budget is spent on evidence, not on popularity.** Centrality measures triage what to read; they do not label anything as architecture. Cluster representatives, bridges, public surfaces and entry-point-reachable code come first.
- **A constraint has to be found across the graph**, not assigned to whichever file first mentioned the word. Targeted queries go looking for the usual bands: authentication, tenancy, transactions, error handling, feature flags, serialization.
- **Every sentence on the map is an atomic claim with provenance**: a stable identifier, a status, the path and line range, the surveyed commit, a hash of the span, which tool produced it, and which edges were left unresolved. Cards are seeded only from claims that passed.
- **A mechanical gate runs before a learner sees anything.** Does the path and line range exist at that commit. Does a claimed module boundary match actual import edges. Does a claimed call path exist in the graph. Does a claimed constraint have a searchable enforcement point. A claim that fails is downgraded or its sentence is dropped, never shown as fact.
- **The twelve-node budget never forces a bad cut.** When no defensible split exists, the map gains a second level instead of being squeezed.
- **Uncovered regions are drawn.** Dashed or hatched, labelled "not inspected", with counts and scope. A skipped directory must never render as an empty module, and finding no match in the inspected scope must never render as "no such mechanism exists".
- **Rejection is evidence, not an edit.** When the user says a part is wrong, the counterexample is stored and the survey re-runs targeted retrieval for it. It does not quietly rewrite the sentence to agree.

The durable product of a survey is the map together with its evidence and its coverage boundary. The picture alone is the part that can lie.

This is the entry point for the entire product. A new user installs the application, points it at a repository they built with an agent, and within one pass has a map of it, a set of topics, and a first question. The map is also the honest test of whether the survey was any good, because a wrong map is obvious to the person who built the thing.

## 7. Privacy and telemetry

Nothing leaves the machine. The application ships no collector and no analytics endpoint.

This was decided against the alternative of a self-hosted collector, on the grounds that every mature option is a server with a recurring bill and a patching burden, and this project must cost nothing to keep alive. It also removes the largest privacy surface in the design, since the data in question is a record of what a named engineer does not understand about their employer's codebase.

Instead the application keeps a diagnostic log on the machine and processes it properly. This is a design requirement rather than a byproduct: the log has to be structured well enough that the analyses which would have justified telemetry can be run against it. Calibration of the scheduler against actual recall, where in a lesson people stop, grade distribution by check type, which topics are decaying, and how often a lesson failed validation and which agent authored it.

Those analyses are shown to the user first, because they are the person who benefits from knowing and the only person entitled to the data.

Sending a log to the project is an action the user takes, never something the application does. It opens the exact file, says what is in it, and lets the user redact before anything is attached to an issue. Because the log was designed for analysis rather than dumped from an application's internals, one volunteered log is genuinely useful rather than noise, which is what makes feedback-driven improvement work without a collector.

The accepted cost is that the project cannot measure itself across users. Improvement comes from volunteered logs and reported experience rather than from a population. That is slower, and it biases toward people who already like the application enough to help.

Because nothing is transmitted automatically and no identifier is created for analytics, the consent and terminal-equipment rules that would otherwise apply do not arise. A log a user chooses to attach to a public issue is their disclosure, not the project's collection.

## 8. Open source shape

The repository needs more than a licence and a test workflow. A pull request template, issue templates covering both defects and lesson quality, a code of conduct, a security policy, a governance note naming who merges, and a repository description and topics.

The contributor guide has to cover two audiences. Code contributors need the build and the test rules. Teaching-rule contributors need the evidence standard, because the rules are where someone without much programming background can do the most good and also the most quiet harm. The existing standard holds and gets stated explicitly: a behaviour rule ships with a source or it does not ship.

## 9. What we are deliberately not building

- A model of our own, or a chat window that calls one. The user's agent is the model.
- Deep knowledge tracing. There is no corpus and it would not help if there were.
- A mastery percentage presented as fact.
- Accounts, a hosted backend or a user database.

## 10. Open questions

- **Whether to pay for macOS signing.** Notarised distribution needs the Apple Developer Program at 99 US dollars a year, and there is no free route to it. Unsigned is free and gives every macOS user a security warning and a right-click ritual on first launch. Windows is solved: code signing is free for qualifying open-source projects through the SignPath Foundation, although a brand-new application still triggers the reputation warning until it has been installed cleanly a few hundred times. Linux has no equivalent gate. This is a decision about the project's budget, not about engineering.

Deliberately left unanswered: **the event log's size, snapshot interval and merge policy.** No safe numbers exist for this design and none can be read out of the literature. They come from running the thing against real repositories and real work, including offline use and divergent history, so no limit is set until there is something to measure.

## 11. Sequence

1. Core: event log, derived database, topic graph, scheduler, mastery computation, and migration of the existing bank.
2. Agent bridge and the portable rules, so the existing skill keeps working against the new core.
3. Repo survey and the map, which is the entry point and the first thing worth showing anyone.
4. Lesson document format, validation and the player.
5. Desktop application around all of it, designed rather than assembled.
6. Sync.
7. Telemetry, consent, and the open-source repository furniture.
8. Passive observation of agent sessions, so the hub notices what you worked on without being asked. The extension points are good and are documented in the landscape research, but this carries real privacy weight and depends on everything above it, so it comes last rather than not at all.

The teaching rules are revised throughout rather than at a point in the sequence.

This record covers the whole system. Each subsystem gets its own specification and implementation plan before any code is written for it, because one plan at this size would be one badly followed plan.
