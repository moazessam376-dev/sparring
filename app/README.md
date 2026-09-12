# Sparring desktop shell

This directory contains the Tauri 2 desktop shell for Sparring. Rust owns the native window, tray, notifications, autostart integration, and the lifetime of the Node server. The React frontend talks to the server only over its loopback HTTP API and calls Rust commands for native capabilities.

## Requirements

- Node.js 22.5 or newer
- Rust 1.77.2 or newer
- The repository's `server/index.mjs` implementation

The shell honors `SPARRING_HOME`. When it is unset, state is stored in `~/.sparring` on Unix-like systems and in the user's profile directory under `.sparring` on Windows.

## Development

From the repository root:

```sh
cd app
npm install
npm run tauri dev
```

The Tauri development command starts Vite on `127.0.0.1:1420`. The Rust shell searches the packaged resource directory first and then the repository's `server/index.mjs`, so the same command works with the server checked out in the repository.

The Node process writes combined stdout and stderr to `<state>/sidecar.log`. Its selected port is read from `<state>/port`. The shell waits up to ten seconds for `GET /api/health`, then supervises the process and retries an unexpected exit at most five times.

## Build

```sh
cd app
npm run build
cd src-tauri
source ~/.cargo/env
cargo check
```

For a distributable bundle, run `npm run tauri build` from `app`. The Tauri bundle includes the repository's `server/` directory as an application resource.

The native integrations are the official Tauri plugins: notification 2.3.3, autostart 2.5.1, shell 2.3.6, and opener 2.5.5. The shell uses the opener plugin for `open_path`, while process supervision uses Rust's process API so it can reap the Node process and its descendants on application exit.
