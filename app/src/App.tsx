/*
 * The shell: the window, the lit drifting ground, the two glass panes and the
 * rail. It also holds the three states the application can honestly be in
 * before there is anything to show: the sidecar starting, the sidecar failed,
 * and Node missing entirely.
 *
 * The window itself follows the platform. On macOS it keeps its decorations
 * and uses an overlay title bar, so the traffic lights are the real ones, on
 * the left, over glass that still runs to the edge. Elsewhere it stays
 * frameless and draws its own controls on the right.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  connect,
  developmentStatus,
  due as fetchDue,
  projects as fetchProjects,
  readStateDirectory,
  readStatus,
  readWindowChrome,
  type Connection,
  type Project,
  type QueueCard,
  type SidecarStatus,
  type WindowChrome,
} from "./api";
import { ACCENT, DANGER, WARNING } from "./Estimate";
import { AlertIcon, FolderIcon, PlugIcon, PlusIcon } from "./Icons";
import { ChromeContext, NO_CHROME, TrafficLightGap, WindowButtons } from "./Chrome";
import { Hub } from "./Hub";
import { Drill } from "./Drill";
import { Connect } from "./Connect";
import { Survey } from "./Survey";
import { ImportScreen } from "./ImportScreen";

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

type Screen = "hub" | "drill" | "connect" | "survey" | "import";

type Shell =
  | { name: "starting" }
  | { name: "node-missing"; message: string }
  | { name: "failed"; message: string }
  | { name: "detached"; message: string }
  | { name: "ready"; connection: Connection };

function shellFrom(status: SidecarStatus, connection: Connection | null): Shell {
  if (status.error !== null && status.error.includes("Node.js")) {
    return { name: "node-missing", message: status.error };
  }
  if (status.error !== null) return { name: "failed", message: status.error };
  if (!status.running || status.port === null) return { name: "starting" };
  if (connection === null) return { name: "starting" };
  return { name: "ready", connection };
}

export function App() {
  const [status, setStatus] = useState<SidecarStatus>({ running: false, port: null, error: null });
  const [connection, setConnection] = useState<Connection | null>(null);
  const [detached, setDetached] = useState<string | null>(null);
  const [stateDirectory, setStateDirectory] = useState<string | null>(null);
  const [chrome, setChrome] = useState<WindowChrome>(NO_CHROME);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [queue, setQueue] = useState<QueueCard[] | null>(null);
  const [dataFailure, setDataFailure] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>("hub");
  const [generation, setGeneration] = useState(0);

  // The sidecar is polled until it answers, then watched more slowly. A failure
  // has to reach the screen, so the error it reports is kept, not swallowed.
  useEffect(() => {
    let dropped = false;
    let timer = 0;

    const poll = async () => {
      try {
        const next = await readStatus();
        if (dropped) return;
        setStatus(next);
        setDetached(null);
        if (next.running && next.port !== null) {
          setConnection((existing) =>
            existing !== null && existing.port === next.port ? existing : null,
          );
          if (connection === null || connection.port !== next.port) {
            try {
              setConnection(await connect(next.port));
            } catch (error) {
              if (!dropped) setDetached(error instanceof Error ? error.message : String(error));
            }
          }
        }
      } catch (error) {
        if (dropped) return;
        // No Tauri IPC. In development the interface can still be pointed at a
        // running server; in a packaged build this means the shell is gone.
        const fallback = developmentStatus();
        if (fallback !== null) {
          setStatus(fallback);
          if (connection === null) {
            try {
              setConnection(await connect(fallback.port ?? 0));
            } catch (inner) {
              setDetached(inner instanceof Error ? inner.message : String(inner));
            }
          }
          return;
        }
        setDetached(
          `The interface cannot reach the desktop shell: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    };

    void poll();
    timer = window.setInterval(() => void poll(), status.running ? 4000 : 750);
    return () => {
      dropped = true;
      window.clearInterval(timer);
    };
  }, [connection, status.running]);

  useEffect(() => {
    if (!inTauri) return;
    void readStateDirectory()
      .then(setStateDirectory)
      .catch(() => setStateDirectory(null));
    // Which window conventions to follow. Asked once, from Rust, rather than
    // guessed from the user agent.
    void readWindowChrome()
      .then(setChrome)
      .catch(() => setChrome(NO_CHROME));
  }, []);

  useEffect(() => {
    if (connection === null) return;
    let dropped = false;
    void (async () => {
      try {
        const [list, cards] = await Promise.all([
          fetchProjects(connection),
          fetchDue(connection, 12),
        ]);
        if (dropped) return;
        setProjects(list);
        setQueue(cards);
        setDataFailure(null);
        setSelectedProject((current) =>
          current !== null && list.some((item) => item.id === current)
            ? current
            : (list[0]?.id ?? null),
        );
      } catch (error) {
        if (!dropped) setDataFailure(error instanceof ApiError ? error.message : String(error));
      }
    })();
    return () => {
      dropped = true;
    };
  }, [connection, generation]);

  const refresh = useCallback(() => setGeneration((value) => value + 1), []);

  const shell: Shell = detached !== null ? { name: "detached", message: detached } : shellFrom(status, connection);

  const project = useMemo(
    () => projects?.find((item) => item.id === selectedProject) ?? null,
    [projects, selectedProject],
  );
  const dueTotal = (projects ?? []).reduce((sum, item) => sum + item.due, 0);
  const nothingDue = (queue ?? []).length === 0;

  return (
    <ChromeContext.Provider value={chrome}>
      <div className="window" data-chrome={chrome.overlayTitleBar ? "overlay" : "own"}>
        <div className="window-sheen">
          <div className="window-ground" />
          <div className="window-grain" />
        </div>
        <div className="window-body">
          {shell.name === "ready" && screen === "drill" ? (
            <Drill
              connection={shell.connection}
              chrome={<WindowButtons />}
              onEnd={() => {
                refresh();
                setScreen("hub");
              }}
              onRecorded={refresh}
            />
          ) : shell.name === "ready" && screen === "survey" ? (
            <Survey
              connection={shell.connection}
              onConnect={() => setScreen("connect")}
              onDone={(surveyed) => {
                refresh();
                if (surveyed !== null) setSelectedProject(surveyed);
                setScreen("hub");
              }}
            />
          ) : shell.name === "ready" && screen === "import" ? (
            <ImportScreen
              connection={shell.connection}
              chrome={<WindowButtons />}
              onCancel={() => setScreen("hub")}
              onDone={(projectId) => {
                refresh();
                if (projectId !== null) setSelectedProject(projectId);
                setScreen("hub");
              }}
            />
          ) : (
            <>
              <div className="glass rail rail-shell">
                <TrafficLightGap />
                <div className="rail-head" data-tauri-drag-region="deep">
                  <span className="mark" />
                  <span className="wordmark">sparring</span>
                  <div className="grow" />
                  {shell.name === "ready" && (
                    <span className="m" style={{ fontSize: 10, color: ACCENT }}>
                      {dueTotal}
                    </span>
                  )}
                </div>

                {shell.name === "ready" ? (
                  <>
                    <div className="lbl" style={{ padding: "0 16px 7px" }}>
                      Projects
                    </div>
                    <div className="scroll" style={{ maxHeight: 210 }}>
                      {(projects ?? []).length === 0 ? (
                        <div className="m" style={{ padding: "0 16px", fontSize: 10.5, color: "var(--dim)" }}>
                          none yet
                        </div>
                      ) : (
                        (projects ?? []).map((item) => {
                          const on = item.id === selectedProject && screen === "hub";
                          return (
                            <button
                              key={item.id}
                              type="button"
                              className="rail-row"
                              onClick={() => {
                                setSelectedProject(item.id);
                                setScreen("hub");
                              }}
                              style={{ background: on ? "rgba(255,255,255,0.055)" : "transparent" }}
                            >
                              <span
                                style={{
                                  flexShrink: 0,
                                  width: 5,
                                  height: 5,
                                  borderRadius: "50%",
                                  background: on ? ACCENT : "rgba(255,255,255,0.14)",
                                }}
                              />
                              <span
                                className="ellipsis"
                                style={{ flexGrow: 1, color: on ? "var(--text)" : "var(--muted)", fontSize: 13 }}
                              >
                                {item.name}
                              </span>
                              <span className="m" style={{ fontSize: 10, color: "var(--faint)" }}>
                                {item.due}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                    <button
                      type="button"
                      className="rail-row"
                      onClick={() => setScreen("import")}
                      style={{ color: screen === "import" ? "var(--text)" : "var(--muted)", fontSize: 12.5, gap: 8 }}
                    >
                      <FolderIcon size={12} stroke="currentColor" />
                      Bring in existing banks
                    </button>
                    <button
                      type="button"
                      className="rail-row"
                      onClick={() => setScreen("survey")}
                      style={{ marginTop: 8, color: "var(--muted)", fontSize: 12.5, gap: 8 }}
                    >
                      <PlusIcon size={12} stroke="currentColor" />
                      Survey a repository
                    </button>
                    <button
                      type="button"
                      className="rail-row"
                      onClick={() => setScreen("connect")}
                      style={{
                        color: screen === "connect" ? "var(--text)" : "var(--muted)",
                        background: screen === "connect" ? "rgba(255,255,255,0.055)" : "transparent",
                        fontSize: 12.5,
                        gap: 8,
                      }}
                    >
                      <PlugIcon size={12} stroke="currentColor" />
                      Connect an agent
                    </button>

                    <div className="lbl" style={{ padding: "22px 16px 8px" }}>
                      Due now
                    </div>
                    <div className="scroll" style={{ flexShrink: 1 }}>
                      {nothingDue ? (
                        <div className="m" style={{ padding: "0 16px", fontSize: 10.5, color: "var(--dim)" }}>
                          nothing due
                        </div>
                      ) : (
                        (queue ?? []).map((item) => (
                          <div key={item.id} className="rail-queue-row">
                            <span
                              style={{
                                flexShrink: 0,
                                width: 3,
                                height: 13,
                                borderRadius: 2,
                                background:
                                  item.lastGrade === "wrong"
                                    ? DANGER
                                    : item.lastGrade === "partial"
                                      ? WARNING
                                      : "rgba(255,255,255,0.14)",
                              }}
                            />
                            <span
                              className="ellipsis"
                              style={{ flexGrow: 1, fontSize: 12.5, color: "var(--muted)" }}
                            >
                              {item.concept}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="grow" />
                    <button
                      type="button"
                      className="pill go"
                      style={{ margin: "0 12px", textAlign: "center" }}
                      onClick={() => setScreen("drill")}
                      disabled={nothingDue}
                    >
                      Start drill
                    </button>
                    {nothingDue && (
                      <div
                        className="m"
                        style={{ padding: "7px 14px 0", fontSize: 10, color: "var(--dim)", lineHeight: 1.5 }}
                      >
                        {(projects ?? []).length === 0
                          ? "no cards yet; survey a repository first"
                          : "nothing is due, so there is nothing to ask"}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="lbl" style={{ padding: "0 16px 7px" }}>
                      Status
                    </div>
                    <div className="m" style={{ padding: "0 16px", fontSize: 10.5, color: "var(--faint)", lineHeight: 1.7 }}>
                      {shell.name === "starting" ? "starting the local server" : "the local server is not running"}
                    </div>
                    <div className="grow" />
                  </>
                )}
              </div>

              {shell.name === "ready" && screen === "connect" ? (
                <Connect
                  connection={shell.connection}
                  stateDirectory={stateDirectory}
                  chrome={<WindowButtons />}
                />
              ) : shell.name === "ready" ? (
                <Hub
                  connection={shell.connection}
                  project={project}
                  projects={projects}
                  shellFailure={dataFailure}
                  chrome={<WindowButtons />}
                  nothingDue={nothingDue}
                  onStartDrill={() => setScreen("drill")}
                  onSurvey={() => setScreen("survey")}
                  onImport={() => setScreen("import")}
                />
              ) : (
                <div className="glass-content content">
                  <div className="glass hair topbar" data-tauri-drag-region="deep">
                    <span className="lbl">sparring</span>
                    <div className="grow" />
                    <WindowButtons />
                  </div>
                  <div className="centre">
                    <ShellNotice shell={shell} stateDirectory={stateDirectory} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ChromeContext.Provider>
  );
}

type Waiting = Exclude<Shell, { name: "ready" }>;

function ShellNotice({ shell, stateDirectory }: { shell: Waiting; stateDirectory: string | null }) {
  if (shell.name === "starting") {
    return (
      <div className="notice">
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className="spinner" />
          <span style={{ fontSize: 15, fontWeight: 600 }}>Starting the local server</span>
        </div>
        <div style={{ color: "var(--muted)", lineHeight: 1.6 }}>
          Everything is on this machine. The server holds the card bank and the schedule, and the
          window has nothing to show until it answers.
        </div>
        {stateDirectory !== null && (
          <div className="m" style={{ fontSize: 10.5, color: "var(--dim)" }}>
            {stateDirectory}
          </div>
        )}
      </div>
    );
  }

  const heading =
    shell.name === "node-missing"
      ? "Node.js is missing"
      : shell.name === "detached"
        ? "The desktop shell is not answering"
        : "The local server stopped";

  return (
    <div className="notice panel" style={{ borderColor: "rgba(232,141,125,0.25)" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <AlertIcon size={15} stroke="#e88d7d" />
        <span style={{ fontSize: 15, fontWeight: 600 }}>{heading}</span>
      </div>
      <div style={{ color: "var(--muted)", lineHeight: 1.65 }}>{shell.message}</div>
      {shell.name === "node-missing" && (
        <div style={{ color: "var(--muted)", lineHeight: 1.65 }}>
          Sparring runs its server on Node.js on this machine. Install Node.js 22.5 or newer, then
          reopen this window.
        </div>
      )}
      {shell.name === "failed" && (
        <div className="m" style={{ fontSize: 10.5, color: "var(--dim)", lineHeight: 1.6 }}>
          the server log is in {stateDirectory ?? "the state directory"}/sidecar.log
        </div>
      )}
    </div>
  );
}
