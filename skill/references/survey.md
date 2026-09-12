# Repository survey

Use this mode when the user asks for a project map, asks what a repository contains, or starts sparring on a repository.

## Non-negotiable evidence rule

Report every claim the mechanical gate cannot verify as `unverified`, with its evidence, failed check, and coverage boundary. Keep the claim visible as uncertainty; never drop it, soften it into a fact, or adjust the claim to make it pass. Evidence: `docs/research/2026-09-12-large-repository-survey.md`, findings 10 and 11, and Recommended approach 8, 10, and 11.

## Server sequence

1. Call `sparring_projects` to find or create the repository project record. Call `sparring_topics` to load existing topic nodes and avoid duplicate proposals. Evidence: `docs/2026-09-12-sparring-as-software-design.md`, sections 3.3, 3.1, and 6.
2. Run the eleven survey steps below against one frozen snapshot. Submit the structured survey with `sparring_survey_submit` only after the mechanical gate has produced statuses and coverage. Evidence: `docs/research/2026-09-12-large-repository-survey.md`, Recommended approach 1 and 8.
3. Present proposed topics, map nodes, bands, and initial cards to the learner. Call `sparring_add_topics` and `sparring_add_cards` only for learner-confirmed proposals, and carry each item’s claim ID and provenance. Evidence: `docs/2026-09-12-sparring-as-software-design.md`, section 6; `docs/research/2026-09-12-large-repository-survey.md`, findings 1, 10, and 11.

## The survey procedure

Transcribe and follow these steps in order. Do not replace them with a file-summary workflow. Evidence: `docs/research/2026-09-12-large-repository-survey.md`, Recommended approach 1–11.

1. **Freeze a survey snapshot.** Record the repository commit, submodules, worktree changes, tool versions, language parsers, configuration profiles, and complete inventory. Classify every path as `inspected`, `excluded by rule`, `generated`, `binary`, `unresolved`, or `pending`. Give every omission a label. Evidence: `docs/research/2026-09-12-large-repository-survey.md`, Recommended approach 1; finding 11.
2. **Discover operational roots before deep reading.** Parse package and build manifests, workspace and module declarations, executables, CLI registrations, server factories, plugin entry points, CI jobs, deployment services, test runners, and public exports. Resolve every enumerable profile. Mark environment-dependent roots as `possible` until corroborating evidence exists. Evidence: `docs/research/2026-09-12-large-repository-survey.md`, Recommended approach 2; finding 6.
3. **Build deterministic evidence graphs.** Use AST, LSP/SCIP, tree-sitter, compiler metadata, CodeQL, or language-specific analyzers for containment, imports, exports, inheritance, calls, data flow, tests, configuration, and build/deploy edges. Store unresolved dynamic dispatch, reflection, generated code, and plugin loading as explicit unknown edges. Evidence: `docs/research/2026-09-12-large-repository-survey.md`, Recommended approach 3; finding 3.
4. **Propose module candidates from several views.** Combine dependency clustering, directory and manifest structure, names and documentation, entry-point reachability, and graph cuts. Calculate internal and crossing edge density for every candidate and retain supporting paths. Create a second level when no defensible cut exists; never force a split to meet a twelve-node display budget. Evidence: `docs/research/2026-09-12-large-repository-survey.md`, Recommended approach 4; finding 4.
5. **Allocate reading budget with a transparent priority vector.** Prioritize root-reachable nodes, bridge nodes, public and configuration surfaces, high-impact constraints, representatives of every cluster, and recent stable change-coupling signals. Use PageRank and betweenness for triage, never as architecture labels. Apply lexical, semantic, history, and graph-neighborhood retrieval in stages, with high-recall passes first. Stop or abstain when added context produces no new evidence. Evidence: `docs/research/2026-09-12-large-repository-survey.md`, Recommended approach 5; findings 1, 2, 5, and 7.
6. **Inspect candidates and cross-cutting neighborhoods.** Read enough surrounding code to establish responsibilities, callers, callees, data ownership, error paths, tests, configuration, and bypasses. Query authentication, persistence, transactions, errors, feature flags, tenancy, serialization, and deployment. Discover each band across the graph; never assign it to the first file that mentions its term. Evidence: `docs/research/2026-09-12-large-repository-survey.md`, Recommended approach 6; findings 1, 3, 7, and 10.
7. **Write atomic claims with provenance.** Give every node sentence, interaction, constraint, topic, and concept-card seed a stable claim ID, type, status, source path and line range, surveyed commit, blob or span hash, extractor or query, unresolved-edge list, and coverage contribution. Keep raw evidence and child claims beside every hierarchical summary. Seed cards only from `verified` or explicitly `inferred` claims, and show the evidence behind every learner-facing claim. Evidence: `docs/research/2026-09-12-large-repository-survey.md`, Recommended approach 7; findings 9 and 10.
8. **Run the mechanical verification gate before rendering.** Check every path and line range at the named commit. Check module claims against import and build evidence. Check definite call paths against the static graph. List unknown edges for possible paths. Check each constraint for a searchable AST, code, configuration, test, or build enforcement point. Search contradictions and recheck parent summaries against children and raw evidence. Render a definitive claim only when every displayed check passes; mark failed claims `unverified` with the failed check. Evidence: `docs/research/2026-09-12-large-repository-survey.md`, Recommended approach 8; finding 10.
9. **Render the working-memory map.** Keep approximately twelve nodes and six bands at each level. Show the selection reason and status on every node or band. Link each item to evidence and a second-level map for deeper clusters. Show calibrated status and coverage metadata, never an unsupported percentage from model prose. Evidence: `docs/research/2026-09-12-large-repository-survey.md`, Recommended approach 9; findings 1, 4, 5, and 11.
10. **Render uncovered areas as visible uncertainty.** Keep `excluded`, `pending`, `unresolved`, `stale`, and `unexplored` regions in the graph or adjacent coverage layer. Use a dashed outline or hatching with a text label such as `not inspected`, plus counts and scope. Keep skipped directories visible as uncertainty. Distinguish `no match found in the inspected scope` from `no such mechanism exists`. Evidence: `docs/research/2026-09-12-large-repository-survey.md`, Recommended approach 10; finding 11.
11. **Invite correction and preserve the audit trail.** Let the learner confirm, reject, or flag a node or band. Store each counterexample. Rerun targeted retrieval and verification after rejection instead of editing the sentence silently. Re-survey after a commit change and invalidate evidence whose blob or span hash no longer matches. Submit the map together with evidence and coverage boundary. Evidence: `docs/research/2026-09-12-large-repository-survey.md`, Recommended approach 11; findings 9, 10, and 11.

## Survey output

Return a structured survey containing:

Evidence: `docs/research/2026-09-12-large-repository-survey.md`, findings 1, 9, 10, and 11.

- the frozen snapshot and tool inventory;
- the complete path classification;
- operational roots and unresolved variables;
- evidence graphs and unknown edges;
- candidate cuts with internal and crossing edge evidence;
- selected regions and their selection reasons;
- atomic claims with provenance and status;
- mechanical gate results, including every `unverified` claim;
- coverage counts by module, root, edge class, and inspected state;
- map nodes, cross-cutting bands, topics, and card seeds;
- learner corrections and rerun records.

Never present the map image without its evidence and coverage boundary. Evidence: `docs/research/2026-09-12-large-repository-survey.md`, findings 9, 10, and 11.
