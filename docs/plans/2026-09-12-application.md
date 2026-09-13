# The application: architecture and rounds

> Master plan. Each round is one pull request. Per-round specs are written to the implementation lanes; this file records the architecture, the boundaries and the interfaces between rounds so the lanes agree without sharing context.

**Spec:** `docs/2026-09-12-sparring-as-software-design.md`

## The shape

The core cannot run in a webview: it is plain Node and `node:sqlite` has no browser equivalent. So the application is three processes' worth of code in one product.

```
core/      the state. Node ESM, no dependencies, 78 tests. Built.
server/    one Node process, two surfaces over one loopback port.
           a JSON API the desktop app calls, and an MCP server the
           user's coding agent connects to. Both read and write the core.
app/       Tauri. Rust owns the window, the tray, notifications, autostart
           and the sidecar's lifetime. The webview owns the interface.
skill/     the portable rules handed to whichever agent connects.
```

Rejected: porting the core to Rust, which discards a verified FSRS implementation and raises the contributor bar; and splitting reads into Rust while writes stay in Node, which duplicates the read path in two languages and guarantees they drift.

Accepted cost: the user needs Node 22.13 or newer, the first release where `node:sqlite` works without an experimental flag. This audience runs Claude Code or Codex, both of which are npm packages, so they already have it. The first run checks for it and says so plainly rather than failing obscurely.

## Interfaces between rounds

Fixed now so the lanes agree.

- **The server binds `127.0.0.1` only**, on a port written to `<state>/port` at startup, defaulting to 4517 and scanning upward if taken. Origin is validated on every request. A bearer token is generated on first run, stored at `<state>/token` with mode 0600, and required on every request including MCP.
- **The JSON API** lives under `/api`. Every route is a thin wrapper over a `core/index.mjs` export and returns its value unchanged. No business logic in the server.
- **The MCP server** lives at `/mcp`, streamable HTTP, protocol revision 2026-07-28. The legacy server-sent-events transport is not implemented.
- **The app never talks to the core directly.** It has no filesystem access to the state and no SQLite. Everything is an API call.
- **The state directory** is `$SPARRING_HOME` or `~/.sparring`, unchanged from the skill, so an existing user's bank migrates in place.

## Rounds

1. **Server.** The JSON API and the MCP server over the existing core. Headless, tested with the suite and by driving a real agent at it.
2. **Shell.** The Tauri application: window, sidecar spawn and supervision, tray, native notifications, autostart, and the first-run check for Node. Opens and shows a real due count from the server.
3. **Interface foundation.** The design system as real CSS, the glass shell, navigation between screens, and the hub graph reading live data.
4. **The loop.** Drill and standing, wired end to end. This is the point the application becomes worth opening.
5. **Survey and map.** The agent-side procedure, the mechanical verification gate, claim storage, and the map.
6. **Lessons.** The document schema, its validator, the component catalogue, and the player.
7. **Packaging.** Signed where free, a terminal installer for macOS, and continuous integration on all three platforms.

Rounds one through five and seven make an application worth installing. Six makes it worth keeping.

## Testing, in two passes

Every round carries tests written from its spec, which state what the code was meant to do. Those are necessary and not sufficient: a test written from the same sentence as the code shares its blind spots.

So after a round lands, a second pass writes characterisation tests against the finished behaviour, run by an agent that did not write the code and works from the running system rather than from the spec. What that pass finds is either a bug or a spec that was wrong, and both are worth knowing.

Continuous integration runs both suites on all three platforms and is added in round seven, not before, because there is nothing platform-specific to test until there is a build.
