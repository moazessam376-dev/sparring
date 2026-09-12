# Product landscape for a learning hub that models the engineer

Date: 2026-09-12. Question: is there room for a local desktop application that models what an engineer understands about their own codebases, teaches with agent-authored visual lessons, and drills with spaced repetition; what already exists; what the coding agents expose to an outside observer; and what can honestly estimate knowledge from one person's data. Sources are numbered at the end. Claims reached only through a secondary summary say so.

## Findings

### 1. The problem is measured, and the strongest study is recent

Shen and Tamkin 2026 ran the study this product exists for: 52 mostly-junior engineers, none with prior experience of the target library, randomly assigned to build two features with or without AI assistance, then given a 14-question comprehension quiz. The AI group scored 50 percent against 67 percent, d 0.738, p 0.01, and the time saving was not significant. The control group hit a median of three library-specific errors each; the AI group hit one. The authors note the assessment was immediate and does not settle long-term skill development [S1].

Bastani et al. 2025 is the result that decides the product's shape. About 1,000 high-school students, four sessions, three arms. During assisted practice the plain GPT arm improved 48 percent and a tutor-prompted arm 127 percent. On a later unassisted exam the plain GPT arm was 17 percent worse than control while the tutor-prompted arm was level [S2]. The harm came from unguarded use, and a prompt removed it. That makes the defensible claim narrower and better evidenced than "AI harms learning".

Supporting evidence. Prather et al. 2024 found struggling programmers finished with an illusion of competence [S3]. Liu et al. 2026, N 1,222, found AI assistance improves immediate performance while people perform worse without it and give up sooner, with effects emerging after about ten minutes [S4]. Perry et al. 2023 found participants with an AI assistant wrote less secure code and were more likely to believe it was secure [S5]. Counter-evidence exists and should be carried: Kazemitabaar et al. 2023 found Codex raised task completion among novices without degrading a one-week retention post-test [S6], though it predates agentic tools.

Naming and framing. Ahmad 2026 defines comprehension debt as the gap between what a team knows about its codebase and what it must understand to change it safely, from thematic analysis of 621 student diaries, and locates it in team cognition rather than in code [S7]. Wheeler 2026 argues authorship metrics such as truck factor no longer license conclusions about comprehension once an agent writes the code, and explicitly leaves building a comprehension-evidence instrument as an open problem [S8].

Survey figures worth quoting, with their caveats. Stack Overflow 2025, 49,000 responses: 66 percent name "almost right, but not quite" as their top frustration, 45.2 percent say debugging AI code takes longer, 16.3 percent say it is hard to understand how the code works, and 20 percent report reduced confidence in their own problem solving [S9]. Note that Stack Overflow's own press release aggregates the trust question differently from the survey site, so pick one basis and footnote the other [S10]. DORA 2025, about 5,000 professionals: 90 percent adoption, median two hours a day, roughly 30 percent reporting little or no trust, throughput correlation now positive while instability remains worse [S11]. The 2024 DORA throughput finding reversed and must not be quoted as current. Clutch 2025 is the only direct measurement of the headline claim, 59 percent saying they have used AI-generated code without fully understanding it, and it is a secondary summary because the original page is gone [S12].

METR 2025 is widely cited and must be cited carefully. The original found 16 experienced maintainers were 19 percent slower with AI while forecasting 24 percent faster and reporting 20 percent faster [S13]. METR published a correction in February 2026: 30 to 50 percent of developers avoided submitting tasks they did not want to do without AI, both re-estimates now cross zero, and the authors say their data gives only very weak evidence [S14]. The durable finding is the perception gap, not the slowdown.

### 2. Nobody models the engineer, and the closest competitors are months old

The codebase-explanation lane is crowded and stateless. DeepWiki generates a wiki with diagrams for public repositories and exposes an unauthenticated MCP server with three read tools [S15]. PocketFlow-Tutorial-Codebase-Knowledge, 12,700 stars, MIT, turns a repository into a beginner tutorial with no quizzing, spacing, or learner model [S16]. OpenWiki from the LangChain organisation writes an agent-readable wiki explicitly for agents to read as memory rather than for humans to learn [S17]. Several 2024-era entrants left: Sourcegraph retired Cody for individuals in July 2025, CodeSee was acquired and sunset, Swimm pivoted to mainframe modernisation, Bloop shut down [S18, secondary].

The agent-memory lane proves the plumbing and solves a different problem. claude-mem hooks the Claude Code session lifecycle, compresses tool use into structured observations, stores them in SQLite, and exposes search over MCP, at roughly 80,000 stars [S19, secondary]. GitHub Copilot Memory keeps repository facts that are explicitly not transferable between repositories, and user preferences that are, with unused entries deleted after 28 days [S20]. Cursor Memories are scoped to the git repository by design [S21, secondary]. All of them store what the agent did, for the agent.

The lane that targets this exact problem did not exist in 2024 and is now populated. The nearest competitor is AhaDiff: MIT, 232 stars, Python with a TypeScript web UI, turning each AI diff into a code-verified lesson, quiz and review, using FSRS, shipping an MCP server for Claude and Codex, supporting local models, and exporting to Anki. It has no cross-project knowledge model, no portfolio or gap view, no notifications, no diagrams, no session-level observation, and it measures self-assessment rather than graded recall [S22]. DrCatHicks/learning-opportunities has 2,400 stars and real learning-science authorship, offering six exercise types after significant work through a Claude Code and Codex plugin, and is stateless by design [S23]. A GitHub topic named codebase-learning holds nine repositories, all from 2026, none above single-digit stars [S24]. DeepTutor, 39,400 stars and Apache-2.0, is a general agent-native learning workspace with mastery paths and a three-layer memory architecture that already consults Claude Code, Codex, OpenCode and Antigravity, and does not target codebases [S25].

The platform vendor has taken the shallowest slice. Anthropic ships Explanatory and Learning output styles and an official learning-output-style plugin that injects teaching instructions through a session-start hook, with no memory, no assessment and no scheduling [S26].

What this leaves unoccupied: a durable cross-project model of what a person understands, conversion of the agent-observation stream into evidence about the human rather than about the agent, interleaving across projects, a desktop hub showing topics and gaps, unsolicited periodic retrieval, and diagrams that are themselves the thing a later question tests.

### 3. All five agents are observable, and one project already normalises them

Every one of Claude Code, Codex CLI, Cursor, OpenCode and Devin CLI is an MCP client, so one server reaches all of them; stdio and streamable HTTP both work everywhere, and OpenCode is the only one whose configuration key differs [S27].

Observation channels, best supported first. OpenCode runs a local server on port 4096 with an OpenAPI document and a server-sent-events stream at `/event` carrying the whole plugin bus, plus a typed SDK [S28]. Codex exposes an app server speaking JSON-RPC over stdio, a WebSocket, or a Unix socket, which is what its own editor extension uses, and its hooks are shipped and on by default [S29]. Claude Code has 33 hook events and, uniquely, a native `http` handler that posts to a URL with headers, so a local application can receive events with no subprocess and no file tailing [S30]. Cursor has hooks whose payloads carry a transcript path and workspace roots [S31]. Devin CLI has eight hook events and also reads Claude and Cursor configuration files [S32].

Anthropic explicitly warns against parsing session transcript files, because the format is internal and changes between releases, and points at the transcript path handed to hooks instead [S33]. Cursor's SQLite conversation store is entirely reverse-engineered and should not be relied on [S31].

Rules distribution is close to free. One `SKILL.md` tree is read by Claude Code, Cursor, Codex and Devin, with Cursor reading the Claude and Codex directories for compatibility. `AGENTS.md`, now stewarded under the Linux Foundation, covers Codex, Cursor, OpenCode and Devin, and Claude Code reaches it through a `CLAUDE.md` that imports it [S34]. The `npx skills` tool already distributes to more than 75 agents [S35].

One project has already built the integration layer this product needs. T3 Code, MIT and TypeScript at 22,500 stars, is a local control surface that starts Codex, Claude Code, Cursor, Grok Build, OpenCode and Antigravity and translates their differing event streams into one interface, with an optional free tunnel for remote control [S36]. Reading it before writing five integrations is the obvious move, and depending on it is worth considering.

One distribution constraint applies to anything built on Anthropic's SDK: third-party developers may not offer claude.ai login or rate limits in their products without prior approval, and may not use "Claude Code" in a product name [S37].

### 4. What can honestly estimate knowledge from one person's data

The short answer is a scheduler, some counts, and an item-difficulty rating. Nothing else in the literature survives contact with a single-user local application.

Language models cannot produce the estimate. Zero-shot prediction of whether a learner will answer correctly lands at AUC 0.49 to 0.50 for GPT-3.5 across three datasets, 0.69 for Llama-3-8B against 0.83 for a small recurrent model, and below a constant-majority baseline in a 2026 study that also measured a 615 to 12,400 times cost multiplier against specialised models [S38, S39, S40]. Any number a model volunteers about how well someone knows something is confident and uninformative.

Bayesian knowledge tracing cannot be fitted here. Parameter error falls as one over the square root of the number of students, and a study that started the fit at the true parameters concluded that a single valid significant digit in the learning rate needs 1,000 students or more [S41]. Its parameters are per-skill and pooled across people, so a single user has a sample of one. Deep knowledge tracing is worse suited: logistic regression with good features leads below roughly one million interactions, and a benchmark of ten implementations found improvements over the original 2015 model to be minimal, with an evaluation setting that leaks labels and inflates results by up to 0.24 AUC [S42, S43].

An expert topic model barely moves prediction. Adding one adds 0.01 AUC or less on seven of nine datasets, and randomly assigned knowledge components score within 0.01 to 0.03 of expert ones for sequence models [S42, S44]. The topic graph in this product is therefore justified as navigation, explanation and the user's sense of where they stand, not as an accuracy mechanism. That should be said plainly rather than implied otherwise.

What does work, in order of load-bearing weight:

1. FSRS for scheduling and retention. The benchmark runs on 10,000 collections and about 727 million reviews. Ship the default parameters: per-user optimisation buys about 0.014 AUC and 0.022 log loss, and overfits on held-out data in roughly 16 percent of real collections [S45]. Anki removed its minimum-review requirement in version 24.06.3, and the research behind that found optimisation starts beating defaults after about 16 reviews; re-optimise on a doubling schedule [S46, S47]. Note that FSRS is well calibrated and only moderately discriminative, AUC near 0.70, so retrievability must not be presented as mastery.
2. Elo for item difficulty and for choosing what to ask next. One parameter per item and per topic, with an uncertainty function of a over one plus b times n, a equal to 1 and b to 0.05 as a starting point. Item difficulty correlates 0.702 with truth at five respondents, and a new item simply starts at zero and is learned from answers [S48, S49].
3. A small logistic feature set for the per-topic number. The features that survive automated search are recency, the log of prior successes, and recency-weighted proportion correct. A 28-parameter model reached 0.8208 AUC on one dataset and 123 parameters reached 0.8638 on a 478-student set [S50]. For a single user the item and topic intercepts cannot be fitted, so this degrades to an exponentially weighted per-topic success rate with fixed coefficients, which is within 0.01 AUC of the full model on seven of nine datasets [S42].
4. The language model for the jobs it does well, all of them offline and none of them numeric: generating items, tagging topics, proposing difficulty priors, and grading open responses. Model-generated knowledge components match or beat human-authored ones, with human raters preferring the originals in 5 percent of cases [S51]. Open-response grading agreement with human raters is moderate, quadratic weighted kappa 0.585 to 0.640, with a known bias toward fluency over content completeness [S52]. One published method traces knowledge from free-form tutoring dialogue and beats conventional models there, because conventional models have no features in a conversation [S53].
5. Show the estimate and let the user contest it. Since the estimates are weak, an open learner model converts the weakness into a feature, and the field's own 2026 position is that generative models produce good explanations of learner state while lacking the inspectable representations that give open learner models their integrity [S54].

Two anchors on how much any of this matters. Retrieval practice is g 0.61 across 217 studies [S55]. A semester of personalised review in a real classroom, 179 students, produced 16.5 percent better retention than massed study and 10 percent better than uniform spacing [S56]. No knowledge-tracing model in the literature separates from another by anywhere near that margin. The scheduling is the product; the model is a means to it.

Knowledge tracing on code specifically is immature. Deep models reach only about 0.61 to 0.63 AUC on a programming dataset [S43]. The best code-specific result parses student code, including code that does not compile, and reaches 0.8467 with no language model involved [S57].

The single most important product finding is not about models at all. The Khanmigo randomised trial across 18 schools and 6,902 student-terms measured 0.05 control standard deviations, which the authors describe as resembling Khan Academy practice without AI, and reported that the median student sent zero messages to the tutor even in sessions where they made mistakes [S58]. Engagement, not model quality, is the binding constraint.

### 5. Sync without a running cost

The constraint is that the maintainer pays nothing. That rules out a hosted sync service and an account system, and it points at the user's own git remote.

The design that follows: the durable record is an append-only event log with one file per device, so two machines writing at once append to different files and git merges them without conflict. Cards and lessons are one file each, so an edit conflict is rare and readable when it happens. SQLite is a derived cache rebuilt from the log rather than the source of truth. Sync is a pull and a push against a repository the user owns, private by default. There is no account because the git host is the account, and anyone without one can point at any remote or a folder inside a file-sync service.

Tunneling solves a different problem. T3 Connect and Tailscale give remote control of a live agent on another machine, not replication of local state [S36]. Worth knowing about; not the answer here.

## Claims I could not verify

- That Claude Code reads `AGENTS.md` natively. The primary documentation says it reads `CLAUDE.md`, and Claude Code is absent from the supporter list on the `AGENTS.md` site, while secondary sources claim support was added in spring 2026. Resolve before relying on it.
- FSRS version status was contradictory across two research passes. Checked directly on 2026-09-12: the latest `fsrs-rs` release is v6.6.2 and no release notes mention FSRS-7. FSRS-7 exists in the benchmark and in at least one third-party implementation. Treat FSRS-6 as what ships.
- JetBrains per-concern percentages, a Veracode figure of 2.74 times more vulnerabilities than human code, and a 54-student July 2026 preprint on coding agents and comprehension. None traced to a primary source.
- Whether Orbit is still maintained.
- The on-disk path and format of Devin CLI session transcripts.
- Exact star counts and the OpenCode canonical repository owner, both of which move.
- The BetterUp workslop study reports both 1,150 and 1,004 participants on different pages of the same site, and press coverage gives different figures again for the share receiving it and the time lost.

## Sources

- S1. Shen, Tamkin 2026, How AI assistance impacts the formation of coding skills. https://arxiv.org/abs/2601.20245
- S2. Bastani et al. 2025, Generative AI without guardrails can harm learning, PNAS. https://pmc.ncbi.nlm.nih.gov/articles/PMC12232635/
- S3. Prather et al. 2024, The widening gap, ICER. https://arxiv.org/abs/2405.17739
- S4. Liu, Christian, Dumbalska, Bakker, Dubey 2026. https://arxiv.org/abs/2604.04721
- S5. Perry, Srivastava, Kumar, Boneh 2023, ACM CCS. https://arxiv.org/abs/2211.03622
- S6. Kazemitabaar et al. 2023, CHI. https://arxiv.org/abs/2302.07427
- S7. Ahmad 2026, Comprehension debt in GenAI-assisted software engineering projects, EASE. https://arxiv.org/abs/2604.13277
- S8. Wheeler 2026, The substrate collapse. https://arxiv.org/abs/2606.20882
- S9. Stack Overflow Developer Survey 2025, AI section. https://survey.stackoverflow.co/2025/ai
- S10. Stack Overflow press release, 2025 survey. https://stackoverflow.co/company/press/archive/stack-overflow-2025-developer-survey/
- S11. DORA 2025, State of AI-assisted software development. https://dora.dev/insights/balancing-ai-tensions/
- S12. Clutch, June 2025, via secondary summary at itpro.com. Original page unreachable.
- S13. METR 2025, Early 2025 AI experienced OS dev study. https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/
- S14. METR 2026, Uplift update. https://metr.org/blog/2026-02-24-uplift-update/
- S15. DeepWiki MCP documentation. https://docs.devin.ai/work-with-devin/deepwiki-mcp
- S16. PocketFlow-Tutorial-Codebase-Knowledge. https://github.com/The-Pocket/PocketFlow-Tutorial-Codebase-Knowledge
- S17. OpenWiki. https://github.com/langchain-ai/openwiki
- S18. Secondary summaries of Sourcegraph, CodeSee, Swimm and Bloop status changes.
- S19. claude-mem, secondary summary of stars and architecture. https://github.com/thedotmack/claude-mem
- S20. GitHub Copilot Memory. https://docs.github.com/en/copilot/concepts/agents/copilot-memory
- S21. Cursor hooks and rules documentation, plus secondary reverse-engineering of its SQLite store.
- S22. AhaDiff. https://github.com/AGI-is-going-to-arrive/ahadiff
- S23. DrCatHicks/learning-opportunities. https://github.com/DrCatHicks/learning-opportunities
- S24. GitHub topic, codebase-learning. https://github.com/topics/codebase-learning
- S25. DeepTutor. https://github.com/HKUDS/DeepTutor
- S26. Anthropic learning-output-style plugin. https://github.com/anthropics/claude-code/tree/main/plugins/learning-output-style
- S27. MCP client configuration for the five agents, from each project's own documentation.
- S28. OpenCode server and event stream documentation.
- S29. Codex app server and hooks documentation. https://learn.chatgpt.com/docs/
- S30. Claude Code hooks reference. https://code.claude.com/docs/en/
- S31. Cursor hooks reference. https://cursor.com/docs/
- S32. Devin CLI hooks documentation. https://docs.devin.ai/
- S33. Claude Code documentation on session transcript files being internal and unstable.
- S34. AGENTS.md. https://agents.md
- S35. vercel-labs/skills. https://github.com/vercel-labs/skills
- S36. T3 Code. https://github.com/pingdotgg/t3code
- S37. Claude Agent SDK distribution and branding terms.
- S38. Neshaei et al. 2024, EDM. https://educationaldatamining.org/edm2024/proceedings/2024.EDM-posters.84/2024.EDM-posters.84.pdf
- S39. Hooshyar et al. https://arxiv.org/pdf/2512.23036
- S40. Bhattacharyya et al. 2026, EDM. https://arxiv.org/html/2603.02830v2
- S41. Coetzee 2014, Choosing sample size for knowledge tracing models. https://ceur-ws.org/Vol-1183/bkt20y_paper01.pdf
- S42. Gervet, Koedinger, Schneider, Mitchell 2020, JEDM. https://theophilegervet.github.io/assets/pdf/gervet2020deep.pdf
- S43. Liu et al. 2022, pyKT, NeurIPS Datasets and Benchmarks. https://arxiv.org/abs/2206.11460
- S44. Moon, Davis, Neshaei, Dillenbourg 2025, EDM. https://arxiv.org/pdf/2409.20167
- S45. srs-benchmark. https://github.com/open-spaced-repetition/srs-benchmark
- S46. Anki FSRS FAQ. https://faqs.ankiweb.net/frequently-asked-questions-about-fsrs.html
- S47. ankitects/anki issue 3094. https://github.com/ankitects/anki/issues/3094
- S48. Pelanek 2016, Computers and Education. https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf
- S49. Elo cold-start correlation at small n. https://link.springer.com/article/10.1007/s42113-021-00101-6
- S50. Pavlik, Eglington 2023, JEDM. https://jedm.educationaldatamining.org/index.php/JEDM/article/view/722
- S51. Ozyurt, Feuerriegel, Sachan, KCQRL. https://arxiv.org/html/2410.01727v2
- S52. Short-answer grading agreement study 2026. https://onlinelibrary.wiley.com/doi/10.1002/jcal.70160
- S53. Scarlatos, Baker, Lan 2025, LAK. https://arxiv.org/abs/2409.16490
- S54. Chounta et al. 2026, Open learner models in the age of generative AI, AIED. https://link.springer.com/chapter/10.1007/978-3-032-29794-5_11
- S55. Adesope, Trevisan, Sundararajan 2017, Review of Educational Research. https://journals.sagepub.com/doi/abs/10.3102/0034654316689306
- S56. Lindsey, Shroyer, Pashler, Mozer 2014, Psychological Science. https://home.cs.colorado.edu/~mozer/Research/Selected%20Publications/reprints/LindseyShroyerPashlerMozer2014Published.pdf
- S57. Pankiewicz, Shi, Baker 2025, EDM. https://educationaldatamining.org/EDM2025/proceedings/2025.EDM.short-papers.83/2025.EDM.short-papers.83.pdf
- S58. Oreopoulos, Low 2026, EdWorkingPaper 26-1551 and NBER w35620. https://edworkingpapers.com/sites/default/files/ai26-1551.pdf
