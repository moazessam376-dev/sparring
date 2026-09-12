import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import "./styles.css";

type SidecarStatus = {
  running: boolean;
  port: number | null;
  error: string | null;
};

type JsonRecord = Record<string, unknown>;

const initialStatus: SidecarStatus = {
  running: false,
  port: null,
  error: null,
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dueCountFrom(payload: unknown): number {
  if (Array.isArray(payload)) {
    return payload.length;
  }

  if (!isRecord(payload)) {
    return 0;
  }

  for (const key of ["count", "dueCount", "total"]) {
    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  for (const key of ["items", "due", "cards"]) {
    if (Array.isArray(payload[key])) {
      return payload[key].length;
    }
  }

  return 0;
}

async function fetchDueCount(port: number): Promise<number> {
  const token = await invoke<string>("sidecar_token");
  const response = await fetch(`http://127.0.0.1:${port}/api/due?n=1`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`The due endpoint returned HTTP ${response.status}.`);
  }

  return dueCountFrom((await response.json()) as unknown);
}

function App() {
  const [status, setStatus] = useState<SidecarStatus>(initialStatus);
  const [stateDirectory, setStateDirectory] = useState("Loading state directory");
  const [dueCount, setDueCount] = useState<number | null>(null);
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    const refresh = async () => {
      try {
        const [nextStatus, nextStateDirectory] = await Promise.all([
          invoke<SidecarStatus>("sidecar_status"),
          invoke<string>("state_dir"),
        ]);
        if (disposed) {
          return;
        }

        setStatus(nextStatus);
        setStateDirectory(nextStateDirectory);

        if (nextStatus.running && nextStatus.port !== null) {
          try {
            setDueCount(await fetchDueCount(nextStatus.port));
          } catch {
            setDueCount(null);
          }
        } else {
          setDueCount(null);
        }
      } catch (error) {
        if (!disposed) {
          setMessage(error instanceof Error ? error.message : String(error));
        }
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 750);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    void isEnabled()
      .then(setAutostartEnabled)
      .catch(() => setAutostartEnabled(false));
  }, []);

  const setAutostart = async () => {
    try {
      if (autostartEnabled) {
        await disable();
      } else {
        await enable();
      }
      setAutostartEnabled(!autostartEnabled);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const sendTestNotification = async () => {
    try {
      await invoke("notify", {
        title: "Sparring",
        body: "Native notifications are connected.",
      });
      setMessage("Notification sent.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const openStateDirectory = async () => {
    try {
      await invoke("open_path", { path: stateDirectory });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const appWindow = getCurrentWindow();

  return (
    <main className="shell">
      <header className="titlebar" data-tauri-drag-region="true">
        <div className="wordmark" data-tauri-drag-region="true">
          <span className="wordmark-mark" aria-hidden="true" />
          <span>Sparring</span>
        </div>
        <div className="window-controls" aria-label="Window controls">
          <button type="button" onClick={() => void appWindow.minimize()} aria-label="Minimize">
            <span aria-hidden="true">-</span>
          </button>
          <button type="button" onClick={() => void appWindow.toggleMaximize()} aria-label="Maximize">
            <span aria-hidden="true">+</span>
          </button>
          <button type="button" onClick={() => void appWindow.close()} aria-label="Close">
            <span aria-hidden="true">x</span>
          </button>
        </div>
      </header>

      <section className="content">
        <div className="eyebrow">DESKTOP SHELL</div>
        <h1>Local learning, ready when you are.</h1>
        <p className="intro">
          This small status surface verifies the connection between the native shell and the local server.
        </p>

        <div className="status-card">
          <div className="status-heading">
            <span className={`status-dot ${status.running ? "is-running" : "is-stopped"}`} />
            <span>{status.running ? "Server is running" : "Server is not running"}</span>
          </div>
          <p className="status-detail">
            {status.error ?? (status.running ? "Health check passed on loopback." : "Waiting for the server health check.")}
          </p>
          <div className="facts">
            <div>
              <span className="fact-label">Port</span>
              <span className="fact-value">{status.port ?? "Not available"}</span>
            </div>
            <div>
              <span className="fact-label">Due now</span>
              <span className="fact-value">{dueCount ?? "Not available"}</span>
            </div>
          </div>
        </div>

        <div className="details-card">
          <div>
            <span className="fact-label">State directory</span>
            <button type="button" className="path-button" onClick={() => void openStateDirectory()}>
              {stateDirectory}
            </button>
          </div>
          <div className="actions">
            <button type="button" className="secondary-button" onClick={() => void setAutostart()}>
              {autostartEnabled ? "Disable autostart" : "Enable autostart"}
            </button>
            <button type="button" className="secondary-button" onClick={() => void sendTestNotification()}>
              Send test notification
            </button>
          </div>
        </div>

        {message !== null && <p className="message">{message}</p>}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
