/*
 * The connect panel: where a new user learns that there is a server, what its
 * address is, and how to attach their coding agent to it.
 *
 * The configuration blocks are the ones in skill/CONNECT.md, which were each
 * verified against first-party documentation. They are filled in with the live
 * port and the live token rather than with placeholders, because a block a user
 * has to edit before pasting is a block they will get wrong.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  agentPresence,
  mcpEndpoint,
  type AgentPresence,
  type Connection,
} from "./api";
import { ACCENT } from "./Estimate";
import { CheckIcon, EyeIcon, EyeOffIcon } from "./Icons";

type Props = {
  connection: Connection;
  stateDirectory: string | null;
  chrome: ReactNode;
};

type Agent = {
  id: string;
  name: string;
  where: string;
  block: string;
  verify: string;
  note?: string;
};

/** The five agents skill/CONNECT.md carries, in its order. */
export function configurations(port: number, token: string): Agent[] {
  const url = `http://127.0.0.1:${port}/mcp`;
  return [
    {
      id: "claude-code",
      name: "Claude Code",
      where: "project .mcp.json",
      block: `{
  "mcpServers": {
    "sparring": {
      "type": "http",
      "url": "${url}",
      "headers": {
        "Authorization": "Bearer ${token}"
      }
    }
  }
}`,
      verify: "claude mcp get sparring, or /mcp inside a session",
    },
    {
      id: "codex",
      name: "Codex CLI",
      where: "~/.codex/config.toml",
      block: `# in the shell that launches Codex
export SPARRING_TOKEN='${token}'

# in ~/.codex/config.toml
[mcp_servers.sparring]
url = "${url}"
bearer_token_env_var = "SPARRING_TOKEN"`,
      verify: "codex mcp list",
      note: "Codex reads the token from the environment, so the file itself never holds it.",
    },
    {
      id: "cursor",
      name: "Cursor",
      where: "project .cursor/mcp.json",
      block: `{
  "mcpServers": {
    "sparring": {
      "url": "${url}",
      "headers": {
        "Authorization": "Bearer ${token}"
      }
    }
  }
}`,
      verify: "restart Cursor, then read its MCP log",
    },
    {
      id: "opencode",
      name: "OpenCode",
      where: "opencode.json",
      block: `{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "sparring": {
      "type": "remote",
      "url": "${url}",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer ${token}"
      }
    }
  }
}`,
      verify: "restart OpenCode and list its servers",
    },
    {
      id: "devin",
      name: "Devin CLI",
      where: "~/.config/devin/mcp_config.json, or .devin/mcp_config.local.json",
      block: `{
  "mcpServers": {
    "sparring": {
      "url": "${url}",
      "transport": "http",
      "headers": {
        "Authorization": "Bearer ${token}"
      }
    }
  }
}`,
      verify: "devin mcp get sparring",
    },
  ];
}

export function maskToken(token: string): string {
  if (token.length <= 8) return "•".repeat(Math.max(token.length, 8));
  return `${token.slice(0, 4)}${"•".repeat(24)}${token.slice(-4)}`;
}

function hide(block: string, token: string, revealed: boolean): string {
  if (revealed || token === "") return block;
  return block.split(token).join(maskToken(token));
}

export function Connect({ connection, stateDirectory, chrome }: Props) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [clipboardFailure, setClipboardFailure] = useState<string | null>(null);
  const [presence, setPresence] = useState<AgentPresence | null>(null);

  useEffect(() => {
    let dropped = false;
    const read = async () => {
      try {
        const next = await agentPresence(connection);
        if (!dropped) setPresence(next);
      } catch {
        if (!dropped) setPresence(null);
      }
    };
    void read();
    const timer = window.setInterval(() => void read(), 5000);
    return () => {
      dropped = true;
      window.clearInterval(timer);
    };
  }, [connection]);

  const copy = useCallback((id: string, value: string) => {
    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (clipboard === undefined) {
      setClipboardFailure("This window has no clipboard. Select the text and copy it by hand.");
      return;
    }
    void clipboard
      .writeText(value)
      .then(() => {
        setClipboardFailure(null);
        setCopied(id);
        window.setTimeout(() => setCopied((current) => (current === id ? null : current)), 1600);
      })
      .catch(() => setClipboardFailure("The clipboard refused. Select the text and copy it by hand."));
  }, []);

  const agents = useMemo(
    () => configurations(connection.port, connection.token),
    [connection.port, connection.token],
  );
  const endpoint = mcpEndpoint(connection);

  return (
    <div className="glass-content content">
      <div className="glass hair topbar" data-tauri-drag-region="deep">
        <span className="lbl">Connect an agent</span>
        <div className="grow" />
        <span className="lbl">{presence?.connected === true ? "an agent is connected" : "no agent has called yet"}</span>
        {chrome}
      </div>

      <div className="scroll" style={{ display: "flex", justifyContent: "center", flexGrow: 1 }}>
        <div style={{ width: 820, maxWidth: "100%", padding: "34px 24px 40px", display: "flex", flexDirection: "column", gap: 22 }}>
          <div className="rise">
            <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em" }}>Attach your coding agent</div>
            <div style={{ marginTop: 10, color: "var(--muted)", lineHeight: 1.62, maxWidth: 640 }}>
              Sparring runs a small server on this machine and nowhere else. Connecting your agent to
              it is what makes the rest of the application work: the agent surveys a repository you
              point it at, the answers you give it are graded against a rubric and recorded here, and
              the schedule decides what you are asked next. Without an agent connected, this window
              can show you what it already knows, but nothing new can arrive.
            </div>
          </div>

          <div className="panel" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: ACCENT,
                  boxShadow: `0 0 10px ${ACCENT}`,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontWeight: 500 }}>The server is running</span>
              <div className="grow" />
              <span className="m" style={{ fontSize: 10.5, color: "var(--faint)" }}>
                port {connection.port}, loopback only
              </span>
            </div>

            <Field
              label="MCP endpoint"
              value={endpoint}
              copiedId={copied}
              id="endpoint"
              onCopy={copy}
            />

            <Field
              label="Bearer token"
              value={revealed ? connection.token : maskToken(connection.token)}
              copyValue={connection.token}
              copiedId={copied}
              id="token"
              onCopy={copy}
              extra={
                <button
                  type="button"
                  className="pill ghost"
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                  onClick={() => setRevealed((value) => !value)}
                >
                  {revealed ? <EyeOffIcon size={12} /> : <EyeIcon size={12} />}
                  {revealed ? "Hide" : "Show"}
                </button>
              }
            />

            <div className="m" style={{ fontSize: 10.5, color: "var(--dim)", lineHeight: 1.6 }}>
              anything holding this token can read every question, every rubric and every answer you
              have given. it lives in {stateDirectory ?? "the state directory"}/token, readable by you
              alone, and it is never sent anywhere but this machine. copy still copies the real token
              while it is hidden.
            </div>
          </div>

          {clipboardFailure !== null && (
            <div className="notice-strip">
              <span>{clipboardFailure}</span>
            </div>
          )}

          <div>
            <div className="lbl" style={{ marginBottom: 10 }}>
              Paste one of these
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {agents.map((agent) => (
                <div key={agent.id} className="panel" style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                    <span style={{ fontWeight: 500 }}>{agent.name}</span>
                    <span className="m" style={{ fontSize: 10.5, color: "var(--faint)" }}>
                      {agent.where}
                    </span>
                    <div className="grow" />
                    <button
                      type="button"
                      className="pill ghost"
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                      onClick={() => copy(agent.id, agent.block)}
                    >
                      {copied === agent.id ? <CheckIcon size={12} stroke={ACCENT} /> : null}
                      {copied === agent.id ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <pre className="code">{hide(agent.block, connection.token, revealed)}</pre>
                  <div className="m" style={{ marginTop: 9, fontSize: 10.5, color: "var(--dim)", lineHeight: 1.6 }}>
                    {agent.note === undefined ? "" : `${agent.note} `}
                    verify with {agent.verify}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel" style={{ padding: "14px 16px" }}>
            <div className="lbl" style={{ marginBottom: 8 }}>
              What the agent can then do
            </div>
            <div style={{ color: "var(--muted)", lineHeight: 1.62 }}>
              Ask it to survey a repository and it calls <span className="m">sparring_survey_submit</span>,
              whose claims are re-checked against the code here before any of them reach the map. Ask
              it to drill you and it calls <span className="m">sparring_due</span> for questions, which
              never carry their rubric, then <span className="m">sparring_rubric</span> once you have
              committed to an answer, then <span className="m">sparring_record</span> with the grade.
              Everything it records shows up in this window.
            </div>
          </div>

          <div className="m" style={{ fontSize: 10.5, color: "var(--dim)", lineHeight: 1.6 }}>
            {presence === null
              ? "the server did not answer when asked whether an agent had called"
              : presence.connected
                ? `an agent called this server within the last ${Math.round(presence.windowSeconds / 60)} minutes`
                : presence.lastSeen === null
                  ? "no agent has called this server since it started"
                  : `the last agent call was at ${new Date(presence.lastSeen).toLocaleTimeString()}`}
          </div>
        </div>
      </div>
    </div>
  );
}

type FieldProps = {
  label: string;
  value: string;
  copyValue?: string;
  id: string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  extra?: ReactNode;
};

function Field({ label, value, copyValue, id, copiedId, onCopy, extra }: FieldProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span className="lbl" style={{ width: 108, flexShrink: 0 }}>
        {label}
      </span>
      <span
        className="m ellipsis"
        style={{
          flexGrow: 1,
          minWidth: 0,
          fontSize: 12,
          color: "var(--text)",
          userSelect: "text",
        }}
      >
        {value}
      </span>
      {extra}
      <button
        type="button"
        className="pill ghost"
        style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}
        onClick={() => onCopy(id, copyValue ?? value)}
      >
        {copiedId === id ? <CheckIcon size={12} stroke={ACCENT} /> : null}
        {copiedId === id ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
