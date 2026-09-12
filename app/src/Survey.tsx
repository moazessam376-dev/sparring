/*
 * The survey: choose a repository, wait while an agent reads it, confirm what
 * it found. Ported from design/Survey.dc.html.
 *
 * The middle stage is the honest one. Sparring does not read the repository
 * itself; the user's own coding agent does, through MCP, and the gate here
 * re-checks every claim it submits. So this screen waits, says plainly what it
 * is waiting for, hands over the exact instruction to start it, and says so
 * when nothing is connected rather than spinning at a window nobody is
 * attached to.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  agentPresence,
  createCards,
  createProject,
  createTopics,
  repository as inspect,
  surveyOf,
  surveys as listSurveys,
  type AgentPresence,
  type ClaimStatus,
  type Connection,
  type Repository,
  type SurveyClaim,
  type SurveyView,
} from "./api";
import { ACCENT, DANGER, WARNING } from "./Estimate";
import { TrafficLightGap, WindowButtons } from "./Chrome";
import { AlertIcon, CheckIcon, FolderIcon } from "./Icons";

type Stage = "pick" | "read" | "confirm";

type Props = {
  connection: Connection;
  onDone: (project: string | null) => void;
  onConnect: () => void;
};

const RECENTS_KEY = "sparring.recent-repositories";
const POLL_MS = 2500;

function readRecents(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string").slice(0, 8);
  } catch {
    return [];
  }
}

function rememberRecent(path: string): string[] {
  const next = [path, ...readRecents().filter((item) => item !== path)].slice(0, 8);
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // A window with no storage still works; it simply forgets between runs.
  }
  return next;
}

export function instructionFor(path: string): string {
  return [
    `Survey the repository at ${path} with sparring.`,
    "Follow the sparring skill's survey procedure, then call the MCP tool",
    `sparring_survey_submit with repo "${path}" and every claim you can ground in the code.`,
    "Leave anything you cannot ground marked as unverified rather than dropping it:",
    "sparring re-checks each claim against the repository here before any of it reaches the map.",
  ].join(" ");
}

const STATUS_TONE: Record<ClaimStatus, string> = {
  verified: ACCENT,
  inferred: WARNING,
  stale: WARNING,
  unchecked: WARNING,
  contradicted: DANGER,
};

const STATUS_WORD: Record<ClaimStatus, string> = {
  verified: "verified",
  inferred: "inferred",
  stale: "stale",
  unchecked: "unverified",
  contradicted: "contradicted",
};

function gateReasons(claim: SurveyClaim): string[] {
  const failed = claim.reasons
    .filter((reason) => reason.status !== "verified" && reason.status !== "note")
    .map((reason) => reason.detail.trim())
    .filter((detail) => detail !== "");
  if (failed.length > 0) return failed;
  const checked = claim.reasons
    .filter((reason) => reason.status !== "note")
    .map((reason) => reason.detail.trim())
    .filter((detail) => detail !== "");
  return checked.length > 0 ? checked : ["the gate recorded no additional evidence for this claim"];
}

export function resubmissionInstructionFor(path: string, claims: SurveyClaim[]): string {
  const rows = claims.map((claim, index) => {
    const reasons = gateReasons(claim);
    const missing = reasons.length === 0 ? "the gate recorded no additional evidence" : reasons.join(" ");
    return [
      `${index + 1}. ${claim.name} (${claim.id}): ${claim.sentence}`,
      `   Missing evidence reported by the gate: ${missing}`,
    ].join("\n");
  });
  return [
    `Re-survey the repository at ${path} with sparring.`,
    "Follow the sparring skill's survey procedure and call sparring_survey_submit again after adding the missing evidence below.",
    "Do not lower the verification bar or mark a claim verified without the evidence the gate checks.",
    rows.length > 0 ? rows.join("\n") : "No claims arrived; submit the claims you can ground in the repository.",
  ].join("\n\n");
}

export function Survey({ connection, onDone, onConnect }: Props) {
  const [stage, setStage] = useState<Stage>("pick");
  const [typed, setTyped] = useState("");
  const [chosen, setChosen] = useState<Repository | null>(null);
  const [recents, setRecents] = useState<string[]>(() => readRecents());
  const [surveyed, setSurveyed] = useState<Map<string, string | null>>(new Map());
  const [view, setView] = useState<SurveyView | null>(null);
  const [presence, setPresence] = useState<AgentPresence | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pickerFailure, setPickerFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [copiedResubmission, setCopiedResubmission] = useState(false);
  const [written, setWritten] = useState<{ topics: number; cards: number } | null>(null);

  // Repositories that have been surveyed before, so the list can say which of
  // the recent paths already has a map and which has never been read.
  useEffect(() => {
    let gone = false;
    void (async () => {
      try {
        const rows = await listSurveys(connection);
        if (gone) return;
        setSurveyed(new Map(rows.map((row) => [row.repo, row.at])));
        setRecents((current) => {
          const merged = [...current];
          for (const row of rows) if (!merged.includes(row.repo)) merged.push(row.repo);
          return merged.slice(0, 8);
        });
      } catch {
        // The recents list is a convenience. Failing to read it must not stop
        // the user choosing a repository by hand.
      }
    })();
    return () => {
      gone = true;
    };
  }, [connection]);

  useEffect(() => {
    if (stage !== "read") return;
    let gone = false;
    const read = async () => {
      try {
        const next = await agentPresence(connection);
        if (!gone) setPresence(next);
      } catch {
        if (!gone) setPresence(null);
      }
    };
    void read();
    const timer = window.setInterval(() => void read(), 4000);
    return () => {
      gone = true;
      window.clearInterval(timer);
    };
  }, [connection, stage]);

  // While waiting, the survey is read again every few seconds. A survey that
  // arrives is the only thing that moves this screen forward.
  useEffect(() => {
    if (stage !== "read" || chosen === null) return;
    const repo = chosen.root ?? chosen.path;
    let gone = false;
    const poll = async () => {
      try {
        const next = await surveyOf(connection, repo);
        if (gone) return;
        setView(next);
        if (next.survey !== null) setStage("confirm");
      } catch (error) {
        if (!gone) setProblem(error instanceof ApiError ? error.message : String(error));
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    return () => {
      gone = true;
      window.clearInterval(timer);
    };
  }, [connection, stage, chosen]);

  const choose = useCallback(
    async (path: string) => {
      setProblem(null);
      setPickerFailure(null);
      setBusy(true);
      try {
        const found = await inspect(connection, path);
        setChosen(found);
        setTyped(found.path);
        if (!found.exists) {
          setProblem(`There is no directory at ${found.path}.`);
          return;
        }
        if (!found.git) {
          setProblem(
            `${found.path} is not a git repository. Sparring cites a file, a line and a commit for every claim it keeps, so a directory without git history is one it cannot ground anything in.`,
          );
          return;
        }
        setRecents(rememberRecent(found.root ?? found.path));
        // A repository that has been surveyed already skips the wait: the
        // claims are on disk and there is nothing to wait for.
        const state = await surveyOf(connection, found.root ?? found.path);
        setView(state);
        setStage(state.survey === null ? "read" : "confirm");
      } catch (error) {
        setProblem(error instanceof ApiError ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    },
    [connection],
  );

  const pickFolder = useCallback(() => {
    setPickerFailure(null);
    void (async () => {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const picked = await open({ directory: true, multiple: false, title: "Choose a repository" });
        if (typeof picked !== "string") return;
        await choose(picked);
      } catch (error) {
        setPickerFailure(
          `The folder picker is not available here: ${error instanceof Error ? error.message : String(error)}. Type the path instead.`,
        );
      }
    })();
  }, [choose]);

  const copyInstruction = useCallback(() => {
    if (chosen === null) return;
    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (clipboard === undefined) {
      setPickerFailure("This window has no clipboard. Select the instruction and copy it by hand.");
      return;
    }
    void clipboard
      .writeText(instructionFor(chosen.root ?? chosen.path))
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => setPickerFailure("The clipboard refused. Select the instruction and copy it by hand."));
  }, [chosen]);

  const copyResubmissionInstruction = useCallback(() => {
    if (chosen === null || view?.survey === null || view?.survey === undefined) return;
    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (clipboard === undefined) {
      setProblem("This window has no clipboard. Select the instruction and copy it by hand.");
      return;
    }
    const claims = view.survey.claims.filter((claim) => claim.status !== "verified");
    void clipboard
      .writeText(resubmissionInstructionFor(chosen.root ?? chosen.path, claims))
      .then(() => {
        setCopiedResubmission(true);
        window.setTimeout(() => setCopiedResubmission(false), 1600);
      })
      .catch(() => setProblem("The clipboard refused. Select the instruction and copy it by hand."));
  }, [chosen, view]);

  const seed = view?.seed ?? null;
  const surveyClaims = view?.survey?.claims ?? [];
  const verifiedClaims = surveyClaims.filter((claim) => claim.status === "verified");
  const resubmissionClaims = surveyClaims.filter((claim) => claim.status !== "verified");
  const keptTopics = useMemo(
    () => (seed?.topics ?? []).filter((topic) => !dropped.has(topic.claim)),
    [seed, dropped],
  );
  const keptCards = useMemo(
    () => (seed?.cards ?? []).filter((card) => !dropped.has(card.claim)),
    [seed, dropped],
  );
  const needsEvidence = (seed?.topics.length ?? 0) === 0 && verifiedClaims.length === 0;

  const confirm = useCallback(() => {
    if (view?.survey === null || seed === null || busy) return;
    setBusy(true);
    setProblem(null);
    void (async () => {
      try {
        await createProject(connection, {
          project: seed.project,
          name: view?.repository.name ?? seed.project,
          remote: null,
        });
        if (keptTopics.length > 0) await createTopics(connection, keptTopics);
        if (keptCards.length > 0) await createCards(connection, keptCards);
        setWritten({ topics: keptTopics.length, cards: keptCards.length });
        onDone(seed.project);
      } catch (error) {
        setProblem(error instanceof ApiError ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    })();
  }, [busy, connection, keptCards, keptTopics, onDone, seed, view]);

  const stages: Array<[Stage, string]> = [
    ["pick", "Choose a repository"],
    ["read", "Read it"],
    ["confirm", "Confirm what it found"],
  ];
  const at = stages.findIndex(([id]) => id === stage);

  return (
    <>
      <div className="glass rail rail-shell">
        <TrafficLightGap />
        <div className="rail-head" data-tauri-drag-region="deep">
          <span className="mark" />
          <span className="wordmark">sparring</span>
          <div className="grow" />
          <button type="button" className="lbl" style={{ letterSpacing: "0.1em" }} onClick={() => onDone(null)}>
            Close
          </button>
        </div>

        <div className="lbl" style={{ padding: "0 16px 10px" }}>
          Survey
        </div>
        {stages.map(([id, label], index) => {
          const reachable = index <= at || (id === "confirm" && view?.survey != null);
          const on = index === at;
          return (
            <button
              key={id}
              type="button"
              className="rail-row"
              disabled={!reachable}
              onClick={() => setStage(id)}
              style={{ background: on ? "rgba(255,255,255,0.055)" : "transparent", gap: 11 }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  border: `1px solid ${index <= at ? ACCENT : "rgba(255,255,255,0.12)"}`,
                  background: index < at ? "rgba(158,232,125,0.18)" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: index <= at ? ACCENT : "transparent",
                  }}
                />
              </span>
              <span
                style={{
                  flexGrow: 1,
                  fontSize: 13,
                  color: on ? "var(--text)" : index < at ? "var(--muted)" : "var(--faint)",
                }}
              >
                {label}
              </span>
            </button>
          );
        })}

        <div className="grow" />
        <div className="panel" style={{ margin: "0 12px", padding: "12px 13px" }}>
          <div className="lbl" style={{ marginBottom: 7 }}>
            Local only
          </div>
          <div className="m" style={{ fontSize: 10.5, color: "var(--muted)", lineHeight: 1.62 }}>
            Nothing leaves your machine. Sparring reads only what your coding agent can already see.
          </div>
        </div>
      </div>

      <div className="glass-content content">
        <div className="glass hair topbar" data-tauri-drag-region="deep">
          <span className="lbl">Survey</span>
          <span className="lbl" style={{ color: "#343a39" }}>
            /
          </span>
          <span className="lbl">{stages[at]?.[1] ?? ""}</span>
          <div className="grow" />
          <WindowButtons />
        </div>

        <div className="scroll" style={{ display: "flex", justifyContent: "center", flexGrow: 1 }}>
          <div style={{ width: 820, maxWidth: "100%", padding: "40px 24px 34px", display: "flex", flexDirection: "column", gap: 22 }}>
            {problem !== null && (
              <div className="notice-strip">
                <AlertIcon size={14} stroke={DANGER} />
                <span>{problem}</span>
              </div>
            )}

            {stage === "pick" && (
              <div className="rise" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
                <div>
                  <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em" }}>Which repository?</div>
                  <div style={{ marginTop: 10, color: "var(--muted)", lineHeight: 1.62, maxWidth: 600 }}>
                    Sparring reads the code to build a map of it. This is the only thing you have to do
                    before the rest of the application has anything to say.
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    value={typed}
                    placeholder="~/Projects/raptor"
                    onChange={(event) => setTyped(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && typed.trim() !== "") void choose(typed.trim());
                    }}
                  />
                  <button
                    type="button"
                    className="pill ghost"
                    style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 7, padding: "0 14px" }}
                    onClick={pickFolder}
                  >
                    <FolderIcon size={13} />
                    Choose a folder
                  </button>
                </div>
                {pickerFailure !== null && (
                  <div className="m" style={{ fontSize: 10.5, color: WARNING, lineHeight: 1.6 }}>
                    {pickerFailure}
                  </div>
                )}

                <div>
                  <div className="lbl" style={{ marginBottom: 10 }}>
                    Or one it already knows
                  </div>
                  <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
                    {recents.length === 0 ? (
                      <div className="m" style={{ padding: "14px 15px", fontSize: 11, color: "var(--dim)" }}>
                        none yet; the first repository you choose is remembered here
                      </div>
                    ) : (
                      recents.map((path) => {
                        const when = surveyed.get(path);
                        return (
                          <button
                            key={path}
                            type="button"
                            className="survey-row"
                            onClick={() => void choose(path)}
                          >
                            <span className="m ellipsis" style={{ flexGrow: 1, fontSize: 12.5 }}>
                              {path}
                            </span>
                            <span
                              className="m"
                              style={{ fontSize: 10.5, flexShrink: 0, color: when === undefined ? "var(--faint)" : ACCENT }}
                            >
                              {when === undefined || when === null
                                ? "never surveyed"
                                : `surveyed ${new Date(when).toLocaleDateString()}`}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button
                    type="button"
                    className="pill go"
                    style={{ padding: "9px 20px" }}
                    disabled={typed.trim() === "" || busy}
                    onClick={() => void choose(typed.trim())}
                  >
                    Survey it
                  </button>
                  <span className="m" style={{ fontSize: 10.5, color: "var(--dim)" }}>
                    {typed.trim() === ""
                      ? "choose a folder or type a path first"
                      : "the reading is done by your agent, and you can leave it running"}
                  </span>
                </div>
              </div>
            )}

            {stage === "read" && chosen !== null && (
              <div className="rise" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
                <div>
                  <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em" }}>
                    Waiting for your agent to read {chosen.name}
                  </div>
                  <div style={{ marginTop: 10, color: "var(--muted)", lineHeight: 1.62, maxWidth: 640 }}>
                    Sparring does not read the repository itself. Your coding agent does, and it sends
                    what it found here, where every claim is checked against the code before it reaches
                    the map. Nothing on this screen moves until an agent calls{" "}
                    <span className="m">sparring_survey_submit</span> for this repository.
                  </div>
                </div>

                {presence?.connected !== true && (
                  <div className="panel" style={{ padding: "15px 17px", borderColor: "rgba(232,201,125,0.3)", background: "rgba(232,201,125,0.045)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <AlertIcon size={14} stroke={WARNING} />
                      <span style={{ fontWeight: 500 }}>No agent has called this server</span>
                    </div>
                    <div style={{ marginTop: 8, color: "var(--muted)", lineHeight: 1.6 }}>
                      Until one does, this page will wait for ever. Attach your agent first; it takes
                      one block of configuration.
                    </div>
                    <button type="button" className="pill go" style={{ marginTop: 12, padding: "7px 14px" }} onClick={onConnect}>
                      Open the connect panel
                    </button>
                  </div>
                )}

                <div>
                  <div className="lbl" style={{ marginBottom: 9 }}>
                    Paste this to your agent
                  </div>
                  <pre className="code">{instructionFor(chosen.root ?? chosen.path)}</pre>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 11 }}>
                    <button type="button" className="pill ghost" style={{ padding: "7px 14px", display: "flex", alignItems: "center", gap: 6 }} onClick={copyInstruction}>
                      {copied ? <CheckIcon size={12} stroke={ACCENT} /> : null}
                      {copied ? "Copied" : "Copy the instruction"}
                    </button>
                    <span className="m" style={{ fontSize: 10.5, color: "var(--dim)" }}>
                      {presence?.connected === true
                        ? "an agent is connected and this page is watching for its submission"
                        : "nothing is connected yet"}
                    </span>
                  </div>
                </div>

                <div className="panel" style={{ display: "flex", alignItems: "center", gap: 13, padding: "14px 16px" }}>
                  <span className="spinner" />
                  <span style={{ flexGrow: 1, color: "var(--muted)" }}>
                    {view?.survey == null
                      ? "no claims have arrived for this repository yet"
                      : `${view.survey.summary.claims} claims arrived`}
                  </span>
                  <span className="m" style={{ fontSize: 10.5, color: "var(--faint)" }}>
                    {chosen.files} tracked files
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button type="button" className="pill ghost" style={{ padding: "8px 16px" }} onClick={() => setStage("pick")}>
                    Choose a different repository
                  </button>
                  <span className="m" style={{ fontSize: 10.5, color: "var(--dim)" }}>
                    checked every {POLL_MS / 1000} seconds; you can leave this window
                  </span>
                </div>
              </div>
            )}

            {stage === "confirm" && view?.survey != null && seed !== null && (
              <div className="rise" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div>
                  <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em" }}>
                    Does this look like your codebase?
                  </div>
                  <div style={{ marginTop: 10, color: "var(--muted)", lineHeight: 1.62, maxWidth: 640 }}>
                    You built it, so you are the only one who can tell. Dropping a part here is worth
                    more than any drill, and a claim the gate could not stand behind is kept and drawn
                    as unverified rather than quietly rewritten.
                  </div>
                </div>

                <div style={{ display: "flex", gap: 12 }}>
                  <Tile
                    label="Claims kept"
                    value={`${view.survey.summary.claims - view.survey.summary.dropped}`}
                    note={`${view.survey.summary.shownAsFact} of them verified against the code`}
                  />
                  <Tile
                    label="Dropped"
                    value={`${view.survey.summary.dropped}`}
                    tone={view.survey.summary.dropped > 0 ? DANGER : undefined}
                    note="contradicted by the repository itself"
                  />
                  <Tile
                    label="Not inspected"
                    value={
                      view.survey.coverage === null || view.survey.summary.trackedFiles === 0
                        ? "unknown"
                        : `${Math.round((view.survey.coverage.pending / view.survey.summary.trackedFiles) * 100)}%`
                    }
                    tone={WARNING}
                    note={
                      view.survey.coverage === null
                        ? "the survey reported no coverage"
                        : `${view.survey.coverage.generated} generated, ${view.survey.coverage.binary} binary, ${view.survey.coverage.excluded} excluded`
                    }
                  />
                </div>

                <div>
                  <div className="lbl" style={{ marginBottom: 10 }}>
                    Keep each part, or drop it
                  </div>
                  <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
                    {view.survey.claims.map((claim) => {
                      const seeds = seed.topics.some((topic) => topic.claim === claim.id);
                      const out = dropped.has(claim.id);
                      return (
                        <div
                          key={claim.id}
                          className="claim-row"
                          style={{
                            background: claim.status === "contradicted" ? "rgba(232,141,125,0.035)" : "transparent",
                            opacity: out ? 0.45 : 1,
                          }}
                        >
                          <span
                            className="m"
                            style={{
                              width: 82,
                              flexShrink: 0,
                              fontSize: 9,
                              letterSpacing: "0.1em",
                              textTransform: "uppercase",
                              color: STATUS_TONE[claim.status],
                              paddingTop: 3,
                            }}
                          >
                            {STATUS_WORD[claim.status]}
                          </span>
                          <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                            <span style={{ fontWeight: 500 }}>{claim.name}</span>
                            <span style={{ color: "var(--muted)", fontSize: 12.5, lineHeight: 1.55 }}>
                              {claim.sentence}
                            </span>
                            <span className="m" style={{ fontSize: 10.5, color: "var(--dimmer)" }}>
                              {claim.path === null
                                ? "no file cited"
                                : `${claim.path}${claim.fromLine === null ? "" : `:${claim.fromLine}`}`}
                            </span>
                            {claim.status !== "verified" && (
                              <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 3, color: STATUS_TONE[claim.status], fontSize: 11.5, lineHeight: 1.5 }}>
                                {gateReasons(claim).map((reason, index) => (
                                  <span key={`${claim.id}-reason-${index}`}>Gate: {reason}.</span>
                                ))}
                              </div>
                            )}
                          </div>
                          {seeds ? (
                            <button
                              type="button"
                              className="m"
                              style={{ flexShrink: 0, fontSize: 10.5, color: out ? ACCENT : "var(--faint)", paddingTop: 3 }}
                              onClick={() =>
                                setDropped((current) => {
                                  const next = new Set(current);
                                  if (next.has(claim.id)) next.delete(claim.id);
                                  else next.add(claim.id);
                                  return next;
                                })
                              }
                            >
                              {out ? "Keep" : "Drop"}
                            </button>
                          ) : (
                            <span
                              className="m"
                              style={{ flexShrink: 0, fontSize: 10.5, color: "var(--dimmer)", paddingTop: 3 }}
                              title="only a verified or inferred claim seeds a topic"
                            >
                              seeds nothing
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {needsEvidence ? (
                  <div className="panel" style={{ padding: "15px 17px", borderColor: "rgba(232,201,125,0.3)", background: "rgba(232,201,125,0.045)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <AlertIcon size={14} stroke={WARNING} />
                      <span style={{ fontWeight: 500 }}>Nothing is ready to save</span>
                    </div>
                    <div style={{ marginTop: 8, color: "var(--muted)", lineHeight: 1.6 }}>
                      The gate did not verify any claim, so it will not seed a topic and there is nothing
                      safe to save. No unverified claim can be accepted here. Give this instruction to
                      your agent, add the evidence it names, and have it submit the claims again.
                    </div>
                    <pre className="code" style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>
                      {resubmissionInstructionFor(chosen === null ? view.repo : chosen.root ?? chosen.path, resubmissionClaims)}
                    </pre>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 11 }}>
                      <button type="button" className="pill ghost" style={{ padding: "7px 14px", display: "flex", alignItems: "center", gap: 6 }} onClick={copyResubmissionInstruction}>
                        {copiedResubmission ? <CheckIcon size={12} stroke={ACCENT} /> : null}
                        {copiedResubmission ? "Copied" : "Copy the instruction"}
                      </button>
                      <button type="button" className="pill ghost" style={{ padding: "7px 14px" }} onClick={() => setStage("read")}>
                        Survey again
                      </button>
                      <span className="m" style={{ fontSize: 10.5, color: "var(--dim)" }}>
                        better evidence is the way forward; the check stays the same
                      </span>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="pill go"
                      style={{ padding: "9px 20px" }}
                      disabled={busy || keptTopics.length === 0}
                      onClick={confirm}
                    >
                      Save the map and start
                    </button>
                    <button type="button" className="pill ghost" style={{ padding: "9px 15px" }} onClick={() => setStage("read")}>
                      Survey again
                    </button>
                    <div className="grow" />
                    <span className="m" style={{ fontSize: 10.5, color: "var(--dim)", textAlign: "right" }}>
                      {keptTopics.length === 0
                        ? "nothing here is verified enough to seed a topic, so there is nothing to save"
                        : `writes ${keptTopics.length} topics and ${keptCards.length} opening questions into ${seed.project}`}
                    </span>
                  </div>
                )}

                {written !== null && (
                  <div className="m" style={{ fontSize: 10.5, color: ACCENT }}>
                    saved {written.topics} topics and {written.cards} questions
                  </div>
                )}

                <div className="m" style={{ fontSize: 10.5, color: "var(--dim)", lineHeight: 1.6 }}>
                  each kept part becomes one topic and one opening question grounded at the line above.
                  your agent writes sharper questions with sparring_add_cards once it knows where you
                  are weak.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Tile({ label, value, note, tone }: { label: string; value: string; note: string; tone?: string | undefined }) {
  return (
    <div className="panel" style={{ flexGrow: 1, padding: "14px 16px", minWidth: 0 }}>
      <div className="lbl" style={{ marginBottom: 9 }}>
        {label}
      </div>
      <div className="m" style={{ fontSize: 22, color: tone ?? "var(--text)" }}>
        {value}
      </div>
      <div className="m" style={{ marginTop: 5, fontSize: 10.5, color: "var(--dim)", lineHeight: 1.5 }}>
        {note}
      </div>
    </div>
  );
}
