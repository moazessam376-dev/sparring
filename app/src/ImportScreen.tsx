import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  ApiError,
  importBanks,
  importDryRun,
  importProject,
  type Connection,
  type ImportBank,
  type ImportReport,
} from "./api";
import { ACCENT, DANGER, WARNING } from "./Estimate";
import { AlertIcon, CheckIcon, FolderIcon } from "./Icons";

type Props = {
  connection: Connection;
  chrome: ReactNode;
  onDone: (project: string | null) => void;
  onCancel: () => void;
};

export function ImportScreen({ connection, chrome, onDone, onCancel }: Props) {
  const [banks, setBanks] = useState<ImportBank[] | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportReport | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let dropped = false;
    void importBanks(connection)
      .then((found) => {
        if (dropped) return;
        setBanks(found);
        setSelectedProject(found.find((bank) => bank.importable)?.project ?? found[0]?.project ?? null);
      })
      .catch((error: unknown) => {
        if (!dropped) setFailure(error instanceof ApiError ? error.message : String(error));
      });
    return () => {
      dropped = true;
    };
  }, [connection]);

  useEffect(() => {
    if (selectedProject === null) {
      setPreview(null);
      return;
    }
    let dropped = false;
    setPreview(null);
    setFailure(null);
    void importDryRun(connection, selectedProject)
      .then((report) => {
        if (!dropped) setPreview(report);
      })
      .catch((error: unknown) => {
        if (!dropped) setFailure(error instanceof ApiError ? error.message : String(error));
      });
    return () => {
      dropped = true;
    };
  }, [connection, selectedProject]);

  const selected = banks?.find((bank) => bank.project === selectedProject) ?? null;
  const refusals = preview?.refused ?? [];

  const importSelected = () => {
    if (selectedProject === null || preview === null || refusals.length > 0 || preview.alreadyImported) return;
    setBusy(true);
    setFailure(null);
    void importProject(connection, selectedProject)
      .then((result) => {
        if (result.refused.length > 0) {
          setPreview(result);
          return;
        }
        onDone(result.project);
      })
      .catch((error: unknown) => setFailure(error instanceof ApiError ? error.message : String(error)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="glass-content content">
      <div className="glass hair topbar" data-tauri-drag-region="deep">
        <button type="button" className="m chip" onClick={onCancel}>
          Back to hub
        </button>
        <span className="lbl">Bring in existing banks</span>
        <div className="grow" />
        {chrome}
      </div>

      <div className="scroll" style={{ display: "flex", justifyContent: "center", flexGrow: 1 }}>
        <div style={{ width: 820, maxWidth: "100%", padding: "34px 24px 40px", display: "flex", flexDirection: "column", gap: 22 }}>
          <div className="rise">
            <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em" }}>Bring your history with you</div>
            <div style={{ marginTop: 10, color: "var(--muted)", lineHeight: 1.62, maxWidth: 680 }}>
              These banks are read from this machine and copied into Sparring&apos;s event history. The
              source folders stay untouched. First choose a project and inspect exactly what would be
              added; nothing is written until you confirm it.
            </div>
          </div>

          {failure !== null && (
            <div className="notice-strip">
              <AlertIcon size={15} stroke={DANGER} />
              <span>{failure}</span>
            </div>
          )}

          {banks === null ? (
            <div className="centre" style={{ minHeight: 180, padding: 20 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span className="spinner" />
                <span className="m" style={{ fontSize: 11.5, color: "var(--faint)" }}>looking for existing banks</span>
              </div>
            </div>
          ) : banks.length === 0 ? (
            <div className="notice panel">
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <FolderIcon size={16} stroke={"var(--faint)"} />
                <span style={{ fontSize: 15, fontWeight: 600 }}>No importable banks found</span>
              </div>
              <div style={{ color: "var(--muted)", lineHeight: 1.6 }}>
                A bank becomes available here when a project folder contains both bank.json and scores.json.
              </div>
            </div>
          ) : (
            <>
              <div>
                <div className="lbl" style={{ marginBottom: 10 }}>Projects found</div>
                <div className="panel" style={{ overflow: "hidden" }}>
                  {banks.map((bank) => {
                    const on = bank.project === selectedProject;
                    return (
                      <button
                        key={bank.project}
                        type="button"
                        className="survey-row"
                        onClick={() => setSelectedProject(bank.project)}
                        style={{ background: on ? "rgba(158,232,125,0.06)" : "transparent", textAlign: "left" }}
                      >
                        <FolderIcon size={15} stroke={on ? ACCENT : "var(--faint)"} />
                        <span className="ellipsis" style={{ flexGrow: 1, color: on ? "var(--text)" : "var(--muted)" }}>
                          {bank.project}
                        </span>
                        <span className="m" style={{ fontSize: 10.5, color: "var(--faint)" }}>
                          {bank.version === null ? "unknown format" : `v${bank.version}`}
                        </span>
                        <span className="m" style={{ width: 60, textAlign: "right", fontSize: 10.5, color: "var(--faint)" }}>
                          {bank.cards} {bank.cards === 1 ? "card" : "cards"}
                        </span>
                        <span className="m" style={{ width: 76, textAlign: "right", fontSize: 10.5, color: "var(--faint)" }}>
                          {bank.attempts} {bank.attempts === 1 ? "attempt" : "attempts"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selected !== null && (
                <div className="panel rise" style={{ padding: "18px 19px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                    <div style={{ fontSize: 17, fontWeight: 600 }}>{selected.project}</div>
                    <span className="m" style={{ fontSize: 10.5, color: "var(--faint)" }}>
                      {selected.version === null ? "format needs attention" : `bank format v${selected.version}`}
                    </span>
                    <div className="grow" />
                    {preview?.alreadyImported === true && <span className="m" style={{ fontSize: 10.5, color: ACCENT }}>already here</span>}
                  </div>

                  {preview === null ? (
                    <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 20 }}>
                      <span className="spinner" />
                      <span className="m" style={{ fontSize: 11, color: "var(--faint)" }}>checking the bank</span>
                    </div>
                  ) : (
                    <>
                      <div className="m" style={{ marginTop: 8, color: "var(--dim)", fontSize: 10.5, lineHeight: 1.6 }}>
                        dry run; the source bank has not been changed
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 9, marginTop: 17 }}>
                        <Count value={preview.projects} label="projects" />
                        <Count value={preview.cards} label="cards" />
                        <Count value={preview.topics} label="topics" />
                        <Count value={preview.attempts} label="attempts" />
                      </div>

                      {refusals.length > 0 ? (
                        <div className="notice-strip" style={{ marginTop: 17 }}>
                          <AlertIcon size={15} stroke={DANGER} />
                          <div>
                            <div style={{ fontWeight: 500, marginBottom: 6 }}>Nothing will be imported</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                              {refusals.map((refusal) => (
                                <div key={`${refusal.record}:${refusal.reason}`} className="m" style={{ fontSize: 10.5 }}>
                                  {refusal.record}: {refusal.reason}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : preview.alreadyImported ? (
                        <div className="notice-strip" style={{ marginTop: 17, borderColor: "rgba(158,232,125,0.25)", background: "rgba(158,232,125,0.04)", color: ACCENT }}>
                          <CheckIcon size={15} stroke={ACCENT} />
                          <span>This exact bank is already in the event history. Importing it again adds nothing.</span>
                        </div>
                      ) : (
                        <div style={{ marginTop: 19, display: "flex", alignItems: "center", gap: 11 }}>
                          <button type="button" className="pill go" style={{ padding: "8px 17px" }} disabled={busy} onClick={importSelected}>
                            {busy ? "Importing…" : "Import this bank"}
                          </button>
                          <span className="m" style={{ fontSize: 10.5, color: WARNING }}>
                            confirmation adds the counts shown above to the event log
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Count({ value, label }: { value: number; label: string }) {
  return (
    <div className="panel" style={{ padding: "12px 13px" }}>
      <div className="m" style={{ fontSize: 21, color: value > 0 ? ACCENT : "var(--muted)" }}>{value}</div>
      <div className="lbl" style={{ marginTop: 4 }}>{label}</div>
    </div>
  );
}
