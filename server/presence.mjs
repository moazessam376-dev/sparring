// Whether a coding agent is talking to this server right now.
//
// The survey is performed by the user's agent through MCP, so the one thing the
// survey screen must never do is spin forever beside a window nothing is
// connected to. This records the last time the MCP endpoint answered anybody
// and nothing else: no identity, no transcript, no request body. It is
// deliberately in-process and not persisted, because a presence that outlived
// the process it describes would be a claim rather than an observation.

export const PRESENCE_WINDOW_MS = 120_000;

let lastSeen = null;

/** Called by the MCP surface on every dispatched message. */
export function noteAgent(at = Date.now()) {
  if (!Number.isFinite(at)) return;
  if (lastSeen === null || at > lastSeen) lastSeen = at;
}

export function presence(now = Date.now()) {
  return {
    connected: lastSeen !== null && now - lastSeen <= PRESENCE_WINDOW_MS,
    lastSeen: lastSeen === null ? null : new Date(lastSeen).toISOString(),
    windowSeconds: PRESENCE_WINDOW_MS / 1000,
  };
}

/** Tests only: forget what has been seen. */
export function forgetAgent() {
  lastSeen = null;
}
