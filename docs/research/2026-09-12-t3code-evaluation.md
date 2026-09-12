# T3 Code evaluation

Date: 2026-09-12. Question: should sparring depend on `pingdotgg/t3code` for observing and normalising coding-agent activity? Sources are numbered at the end. I inspected the current `main` source, package metadata, internal documentation, commit history, and releases.

## Findings

### 1. T3 Code is a local server with several clients, not a hosted event service

The repository is a TypeScript monorepo. `apps/server` builds the `t3` CLI and server; `apps/desktop` is an Electron application that bundles the server; `apps/web` and `apps/mobile` are clients. The server owns provider processes, terminals, Git, files, and durable state. The desktop renderer talks to its bundled server through the same client/server boundary as the other clients. The hosted web application is also a client that connects to an environment; execution remains on the environment-owning machine [S1][S2][S3][S29].

The server is an HTTP server on port `3773` by default (`apps/server/src/config.ts`). Desktop configuration defaults the host to `127.0.0.1`; CLI configuration also accepts `--port`, `--host`, `T3CODE_PORT`, and `T3CODE_HOST` (`apps/server/src/cli/config.ts`). The server exposes an authenticated WebSocket at `/ws` (`apps/server/src/ws.ts`) and an HTTP API, including `/mcp`. Provider-side Codex and ACP processes use stdio; OpenCode uses a separate loopback HTTP server. I found no Unix-domain socket in these runtime paths [S4][S5][S6][S7].

The CLI is a genuine process boundary: `apps/server/package.json` names the package `t3`, marks it MIT, and exposes `"bin": {"t3": "./dist/bin.mjs"}`. `apps/server/src/bin.ts` registers commands such as `start`, `serve`, `app`, `pair`, `auth`, `project`, and `service` [S4][S8].

### 2. Normalisation is architecturally separable, but only inside the server

Provider-specific code is behind `ProviderAdapterShape` in `apps/server/src/provider/Services/ProviderAdapter.ts`. Its contract contains the quoted field `streamEvents: Stream.Stream<ProviderRuntimeEvent>`. `ProviderService` fans out that stream, and `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts` consumes it to produce T3’s orchestration state, activities, assistant deltas, approvals, plans, and task events. Shared ACP mapping code is also separated under `apps/server/src/provider/acp` [S9][S10][S11].

This is a useful internal seam, not an independent library. The adapters still depend on T3’s Effect services, session and turn correlation, provider registry, persistence, and provider-specific extensions. Also, `apps/server/src/orchestration/Normalizer.ts` is a normaliser for client commands and attachments; it is not the provider-event normaliser [S30]. The source is therefore separable by design, but extracting it would require extracting the adapters and their runtime dependencies as well.

### 3. The normalised event model is broad and retains raw provider provenance

`packages/contracts/src/providerRuntime.ts` defines the canonical `ProviderRuntimeEvent` union. Every event has the common fields `eventId`, `provider`, `threadId`, and `createdAt`, plus optional `providerInstanceId`, `turnId`, `itemId`, `requestId`, `providerRefs` (`providerTurnId`, `providerItemId`, `providerRequestId`), and `raw`. The raw value contains `source`, optional `method` and `messageType`, and an untyped `payload`. Its source tags include `codex.app-server.notification`, `codex.app-server.request`, `codex.eventmsg`, `claude.sdk.message`, `claude.sdk.permission`, `codex.sdk.thread-event`, `opencode.sdk.event`, `acp.jsonrpc`, and ACP extension sources [S12].

The event types and payload fields are as follows.

- Session events are `session.started {message?, resume?}`, `session.configured {config}`, `session.state.changed {state, reason?, detail?}`, and `session.exited {reason?, recoverable?, exitKind?}`.
- Thread events are `thread.started {providerThreadId?}`, `thread.state.changed {state, beforeTokens?, afterTokens?, detail?}`, `thread.metadata.updated {name?, metadata?}`, and `thread.token-usage.updated {usage}`. A usage snapshot contains `usedTokens` and optional total, maximum, input, cached-input, output, reasoning-output, last-used, last-input, last-cached-input, last-output, last-reasoning-output, tool-use, duration, automatic-compaction, and compaction-threshold fields. Realtime thread events are `thread.realtime.started {realtimeSessionId?}`, `thread.realtime.item-added {item}`, `thread.realtime.audio.delta {audio}`, `thread.realtime.error {message}`, and `thread.realtime.closed {reason?}`.
- Turn events are `turn.started {model?, effort?}`, `turn.completed {state, stopReason?, usage?, modelUsage?, totalCostUsd?, errorMessage?, tokenUsage?}`, `turn.aborted {reason, tokenUsage?}`, `turn.plan.updated {explanation?, plan}`, `turn.proposed.delta {delta}`, `turn.proposed.completed {planMarkdown}`, and `turn.diff.updated {unifiedDiff}`.
- Item events are `item.started`, `item.updated`, and `item.completed`, each carrying `itemType`, optional `status`, `title`, `detail`, `toolSurface`, `toolIcon`, `toolSource`, `data`, `agentId`, and `parentToolUseId`. `content.delta` carries `streamKind`, `delta`, and optional `contentIndex` and `summaryIndex`.
- Approval events are `request.opened {requestType, detail?, appName?, options?, args?}` and `request.resolved {requestType, decision?, resolution?}`. User-input events are `user-input.requested {questions, responseMode?}` and `user-input.resolved {answers}`. Questions have `id`, `header`, `question`, `options`, and optional custom-answer and multi-select fields.
- Task events are `task.started {taskId, description?, ...linkage}`, `task.progress {taskId, description, summary?, usage?, typedUsage?, lastToolName?, status?, error?, ...linkage}`, `task.updated {taskId, status?, description?, error?, endedAt?, isBackgrounded?, ...linkage}`, and `task.completed {taskId, status, summary?, usage?, typedUsage?, ...linkage}`. Linkage can include task and agent type, agent identity, title, role, model, effort, tool and parent-agent IDs, workflow and phase data, attempt, run handles, output file, agent path, and a timeline-bypass flag.
- Hook events are `hook.started {hookId, hookName, hookEvent}`, `hook.progress {hookId, output?, stdout?, stderr?}`, and `hook.completed {hookId, outcome, output?, stdout?, stderr?, exitCode?}`. Tool events are `tool.progress {toolUseId?, toolName?, summary?, elapsedSeconds?, taskId?, parentToolUseId?}`, `tool.summary {summary, precedingToolUseIds?}`, and `tool.denied {toolName, toolUseId?, reason?, agentId?}`.
- The remaining events are `auth.status {isAuthenticating?, output?, error?}`, `account.updated {account}`, `account.rate-limits.updated {limits}`, `mcp.status.updated {status}`, `mcp.oauth.completed {success, name?, error?}`, `model.rerouted {fromModel, toModel, reason}`, `config.warning {summary, details?, path?, range?}`, `deprecation.notice {summary, details?}`, `files.persisted {files, failed?}`, `runtime.warning {message, detail?}`, and `runtime.error {message, class?, detail?}`.

The schema also defines canonical item types such as `user_message`, `assistant_message`, `reasoning`, `plan`, tool types, review transitions, compaction, error, and unknown; request types include command, file, patch, MCP elicitation, user-input, dynamic-tool, and auth-token approvals. This is a provider-control and UI-oriented model, not a small “what the engineer worked on” activity model [S12][S13].

### 4. Each provider is acquired through a different runtime mechanism

The current built-in set is Codex, Claude, Cursor, Grok, OpenCode, and Antigravity. There is no Devin driver in `apps/server/src/provider/builtInDrivers.ts` or the provider adapter tree [S14]. The acquisition mechanisms are:

- Codex: `apps/server/src/provider/Layers/CodexSessionRuntime.ts` starts the Codex binary in app-server mode. `packages/effect-codex-app-server/src/client.ts` speaks typed JSON-RPC over the child process’s stdio; `CodexAdapter.ts` maps notifications and requests into canonical events.
- Claude Code: `apps/server/src/provider/Layers/ClaudeAdapter.ts` calls `query()` from the Claude Agent SDK and consumes its async iterable of SDK messages, including stream, user, assistant, result, system, and telemetry messages.
- Cursor: `apps/server/src/provider/acp/CursorAcpSupport.ts` and `CursorAdapter.ts` run `cursor-agent ... acp` and parse ACP JSON-RPC over child-process stdio, including Cursor extension requests such as `cursor/ask_question`.
- Grok Build: `apps/server/src/provider/acp/GrokAcpSupport.ts` and `GrokAdapter.ts` run `grok agent stdio` and parse ACP events plus xAI-specific ACP extensions.
- OpenCode: `apps/server/src/provider/opencodeRuntime.ts` starts or connects to an OpenCode server. Local mode starts `opencode serve` on a dynamically selected loopback port; `OpenCodeAdapter.ts` consumes `client.event.subscribe()` events from the SDK.
- Antigravity: `AntigravityDriver.ts` prepares installation leases, profiles, and skills, then `AntigravityAdapter.ts` runs one official ACP process per thread and normalises its session updates and tool events.

These adapters are direct protocol or SDK integrations. The inspected paths do not tail agent transcript files or consume a generic cross-agent hook feed [S15][S16][S17][S18][S19][S20].

### 5. A separate application cannot consume `ProviderRuntimeEvent` through a documented public stream

There is a real server API, but it is not the canonical provider stream. The WebSocket route is `/ws`, backed by `WsRpcGroup` in `apps/server/src/ws.ts`. `packages/contracts/src/rpc.ts` defines client methods and subscriptions for projects, terminals, previews, VCS, devices, server state, and other T3 features; it contains no public subscription whose payload is `ProviderRuntimeEvent` or an adapter’s `streamEvents`. HTTP contracts in `packages/contracts/src/environmentHttp.ts` expose snapshots and orchestration endpoints, which are downstream projections rather than the adapter stream [S7][S21][S31][S32].

The contract package says `"private": true` in `packages/contracts/package.json`; `@t3tools/client-runtime`, `@t3tools/shared`, `effect-acp`, and `effect-codex-app-server` are likewise private workspace packages. Their source exports are useful to T3’s own clients but are not a versioned npm SDK. Provider registration is statically compiled in `builtInDrivers.ts`; the `ProviderDriver` record is an internal SPI, not a loadable plugin surface [S14][S22][S23][S33].

T3 does write provider event NDJSON under its state directory. `apps/server/src/config.ts` derives a `logs/provider/events.log` path, and `apps/server/src/provider/Layers/EventNdjsonLogger.ts` supports native, canonical, and orchestration logs. It is described as best-effort and filters transient canonical events such as content deltas, item updates, task progress, realtime audio, and tool progress. Reading that file would be a private, lossy integration, not a stable event API [S5][S24].

Therefore a companion integration would have to run the whole T3 server and either reverse-engineer or pin its authenticated RPC client, consume a downstream orchestration projection, or maintain a fork that exposes the canonical stream. The repository’s architecture document says the RPC boundary is for independently versioned T3 clients and servers, not that it is a third-party compatibility contract [S2].

### 6. Coupling risk is high even though the repository is well structured internally

At review time the repository showed 3,876 commits, with many commits on 2026-09-11. The releases page showed several `0.0.41-nightly` builds across 2026-09-09 through 2026-09-12, while `apps/server/package.json` on `main` was still version `0.0.40`. Stable releases were also close together: `v0.0.38` on September 1, `v0.0.39` on September 7, and `v0.0.40` on September 8 [S4][S25][S26].

The project is 0.x and states in `README.md`, “We are very very early in this project. Expect bugs.” The source contains active compatibility migrations: `providerRuntime.ts` makes `providerInstanceId` optional during a routing migration, and `ProviderAdapterRegistry.ts` supports both legacy and instance-keyed paths while the migration proceeds. The architecture documentation says, “Changing a schema affects old environments at startup as well as live RPC traffic.” These are sensible internal safeguards, but they are evidence that the internals are moving. I found no stated public API or event-schema stability contract [S1][S2][S12][S27].

T3’s own code and the `t3` package are MIT-licensed (`LICENSE`, `apps/server/package.json`). Copying T3-authored adapter or schema code is legally possible if the copyright and permission notices are preserved. That permission does not relicense the Anthropic, OpenCode, Effect, ACP, or other third-party dependencies used by those adapters; a vendored implementation would need their notices and terms as well [S4][S28].

### 7. Verdict: read it for reference and write our own

Sparring should not make T3 Code a required library or required companion. The useful part is its design: put provider-specific acquisition behind adapters, retain raw provenance, emit a canonical event union, and project it into application-specific state. Sparring should implement that boundary against its own supported agents and persist an event model designed for learning and work-history inference. T3’s source is a strong reference for Codex, Claude, Cursor, OpenCode, and ACP handling, but it does not cover Devin, and its canonical model is not published as a separable API.

The strongest argument against this verdict is implementation cost. T3 already handles difficult subprocess, ACP, SDK, approval, session, and child-agent cases, so an optional T3 connector could provide useful coverage sooner for users who already run T3. That is a reasonable future adapter behind a feature flag, but it should not be the foundation: sparring must still function when T3 is not installed, and the private RPC and event internals would make that optional connector an integration to pin and test rather than a dependency to build around.

## Claims I could not verify

- `gh repo clone` and direct shell fetches could not reach GitHub because DNS/API access failed in the shell. I therefore read the actual source through GitHub’s web and raw-file views; the report is based on those current `main` files, not a local clone.
- I did not inspect the published `t3` tarball, so I cannot rule out an undocumented importable API inside `dist`; I found only the documented CLI entry point and no public SDK contract.
- The commit and release counts above are observations of the pages on 2026-09-12, not a long-term statistical cadence. I did not establish a complete historical list of breaking changes.
- I did not verify whether provider NDJSON logging is enabled with the same defaults in every release or whether any downstream consumer relies on its current path and filtering.
- Devin is absent from the current built-in driver list; that does not establish that a future branch or release will not add it.

## Sources

- S1. T3 Code README. https://github.com/pingdotgg/t3code/blob/main/README.md
- S2. Internal architecture overview. https://github.com/pingdotgg/t3code/blob/main/docs/internals/overview.md
- S3. Installation and runtime environments. https://github.com/pingdotgg/t3code/blob/main/docs/user/install.md
- S4. Server package metadata and CLI binary. https://github.com/pingdotgg/t3code/blob/main/apps/server/package.json
- S5. Server configuration and derived paths. https://github.com/pingdotgg/t3code/blob/main/apps/server/src/config.ts
- S6. CLI host and port configuration. https://github.com/pingdotgg/t3code/blob/main/apps/server/src/cli/config.ts
- S7. HTTP server and route layers. https://github.com/pingdotgg/t3code/blob/main/apps/server/src/server.ts
- S8. CLI command registration. https://github.com/pingdotgg/t3code/blob/main/apps/server/src/bin.ts
- S9. Provider adapter contract. https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/Services/ProviderAdapter.ts
- S10. Provider runtime ingestion. https://github.com/pingdotgg/t3code/blob/main/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts
- S11. Provider runtime service and ACP mapping. https://github.com/pingdotgg/t3code/tree/main/apps/server/src/provider/acp
- S12. Canonical provider runtime event schema. https://github.com/pingdotgg/t3code/blob/main/packages/contracts/src/providerRuntime.ts
- S13. Orchestration projection schema. https://github.com/pingdotgg/t3code/blob/main/packages/contracts/src/orchestration.ts
- S14. Built-in provider registration. https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/builtInDrivers.ts
- S15. Codex app-server runtime and adapter. https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/Layers/CodexSessionRuntime.ts
- S16. Claude Agent SDK adapter. https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/Layers/ClaudeAdapter.ts
- S17. Cursor ACP support and adapter. https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/acp/CursorAcpSupport.ts
- S18. Grok ACP support and adapter. https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/acp/GrokAcpSupport.ts
- S19. OpenCode runtime and adapter. https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/opencodeRuntime.ts
- S20. Antigravity driver and ACP adapter. https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/Drivers/AntigravityDriver.ts
- S21. WebSocket RPC route and contract. https://github.com/pingdotgg/t3code/blob/main/apps/server/src/ws.ts
- S22. Internal contracts package metadata. https://github.com/pingdotgg/t3code/blob/main/packages/contracts/package.json
- S23. Provider driver SPI and registry. https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/ProviderDriver.ts
- S24. Provider event NDJSON logger. https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/Layers/EventNdjsonLogger.ts
- S25. Commit history. https://github.com/pingdotgg/t3code/commits/main
- S26. Release history and nightlies. https://github.com/pingdotgg/t3code/releases
- S27. Provider adapter registry migration. https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/Services/ProviderAdapterRegistry.ts
- S28. Repository license. https://github.com/pingdotgg/t3code/blob/main/LICENSE
- S29. Remote execution and client connections. https://github.com/pingdotgg/t3code/blob/main/docs/internals/remote.md
- S30. Client-command normaliser. https://github.com/pingdotgg/t3code/blob/main/apps/server/src/orchestration/Normalizer.ts
- S31. Environment HTTP contract. https://github.com/pingdotgg/t3code/blob/main/packages/contracts/src/environmentHttp.ts
- S32. WebSocket RPC method contract. https://github.com/pingdotgg/t3code/blob/main/packages/contracts/src/rpc.ts
- S33. Private client and provider-support package metadata. https://github.com/pingdotgg/t3code/blob/main/packages/client-runtime/package.json; https://github.com/pingdotgg/t3code/blob/main/packages/shared/package.json; https://github.com/pingdotgg/t3code/blob/main/packages/effect-acp/package.json; https://github.com/pingdotgg/t3code/blob/main/packages/effect-codex-app-server/package.json
