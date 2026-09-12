/*
 * The drill, ported from design/DrillRunner.dc.html: a question, a committed
 * answer, the grade with its rubric marks, the grounding file, the contest.
 *
 * Nothing is revealed before the learner commits. The queue route carries no
 * rubric by design, and the card route, which does carry one, is called from a
 * single place in this file: commit(), after an answer has been submitted.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ApiError,
  card as fetchCard,
  contestGrade,
  due as fetchDue,
  gaps as fetchGaps,
  recordAttempt,
  type CardDetail,
  type Connection,
  type Grade,
  type QueueCard,
  type Schedule,
} from "./api";
import { ACCENT, DANGER, WARNING } from "./Estimate";
import { AlertIcon, BackIcon, FileIcon } from "./Icons";

const QUEUE_SIZE = 12;

type Recorded = { grade: Grade; schedule: Schedule | null; attemptId: string | null };

type Props = {
  connection: Connection;
  chrome: ReactNode;
  onEnd: () => void;
  onRecorded: () => void;
};

const GRADE_FACE: Record<Grade, { label: string; colour: string; glow: string }> = {
  correct: { label: "Correct", colour: ACCENT, glow: "rgba(158,232,125,0.5)" },
  partial: { label: "Partial", colour: WARNING, glow: "rgba(232,201,125,0.45)" },
  wrong: { label: "Wrong", colour: DANGER, glow: "rgba(232,141,125,0.45)" },
};

function gradeFrom(marks: boolean[]): Grade {
  if (marks.length === 0 || marks.every((mark) => !mark)) return "wrong";
  return marks.every((mark) => mark) ? "correct" : "partial";
}

function dayGap(from: string | null): string | null {
  if (from === null) return null;
  const due = Date.parse(`${from}T00:00:00Z`);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (Number.isNaN(due)) return null;
  const days = Math.round((due - today) / 86400000);
  if (days <= 0) return "again today";
  if (days === 1) return "again tomorrow";
  return `again in ${days} days`;
}

export function Drill({ connection, chrome, onEnd, onRecorded }: Props) {
  const [queue, setQueue] = useState<QueueCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [detail, setDetail] = useState<CardDetail | null>(null);
  const [marks, setMarks] = useState<boolean[]>([]);
  const [locked, setLocked] = useState(false);
  const [answer, setAnswer] = useState("");
  const [recorded, setRecorded] = useState<Recorded | null>(null);
  const [contesting, setContesting] = useState(false);
  const [history, setHistory] = useState<Array<{ name: string; grade: Grade }>>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const started = useRef(Date.now());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 20000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let dropped = false;
    void (async () => {
      try {
        const cards = await fetchDue(connection, QUEUE_SIZE);
        if (!dropped) setQueue(cards);
      } catch (error) {
        if (!dropped) setFailure(error instanceof ApiError ? error.message : String(error));
      }
    })();
    return () => {
      dropped = true;
    };
  }, [connection]);

  const current = queue === null ? null : (queue[index] ?? null);

  const commit = useCallback(
    async (given: string, dunno: boolean) => {
      if (current === null || busy) return;
      setBusy(true);
      setFailure(null);
      try {
        // The one call to the card route, and it happens only here, after the
        // answer above has been committed.
        const full = await fetchCard(connection, current.id);
        setDetail(full);
        setMarks(full.rubric.map(() => false));
        setLocked(dunno);
        setAnswer(given);
      } catch (error) {
        setFailure(error instanceof ApiError ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    },
    [busy, connection, current],
  );

  const record = useCallback(async () => {
    if (current === null || detail === null || busy) return;
    const grade = gradeFrom(marks);
    setBusy(true);
    setFailure(null);
    try {
      const schedule = await recordAttempt(connection, {
        card: current.id,
        grade,
        question: current.ask,
        context: current.contexts[0] ?? null,
        answer,
      });
      let attemptId: string | null = null;
      if (grade !== "correct") {
        // The only route that returns an attempt identifier, which the contest
        // needs. A correct grade does not appear there, so it cannot be
        // contested from this screen, and the screen says so rather than
        // pretending the button works.
        try {
          const recent = await fetchGaps(connection, 1);
          const mine = recent
            .filter((item) => item.card === current.id)
            .sort((left, right) => (left.at < right.at ? 1 : left.at > right.at ? -1 : 0));
          attemptId = mine[0]?.id ?? null;
        } catch {
          attemptId = null;
        }
      }
      setRecorded({ grade, schedule, attemptId });
      setHistory((items) => [...items, { name: current.concept, grade }]);
      onRecorded();
    } catch (error) {
      setFailure(error instanceof ApiError ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [answer, busy, connection, current, detail, marks, onRecorded]);

  const next = useCallback(() => {
    setIndex((value) => value + 1);
    setTyped("");
    setDetail(null);
    setMarks([]);
    setLocked(false);
    setAnswer("");
    setRecorded(null);
    setContesting(false);
    setCopied(null);
  }, []);

  const contest = useCallback(
    async (grade: Grade) => {
      if (recorded?.attemptId == null || busy) return;
      setBusy(true);
      try {
        await contestGrade(connection, recorded.attemptId, grade);
        setRecorded({ ...recorded, grade });
        setHistory((items) =>
          items.map((item, position) => (position === items.length - 1 ? { ...item, grade } : item)),
        );
        setContesting(false);
        onRecorded();
      } catch (error) {
        setFailure(error instanceof ApiError ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    },
    [busy, connection, onRecorded, recorded],
  );

  const elapsed = useMemo(() => {
    const minutes = Math.floor((Date.now() - started.current) / 60000);
    return minutes < 1 ? "under a minute" : `${minutes} min`;
  }, [index, recorded, tick]);

  const total = queue?.length ?? 0;
  const grade = recorded?.grade ?? gradeFrom(marks);
  const face = GRADE_FACE[grade];

  return (
    <>
      <div className="glass rail rail-shell">
        <div className="rail-head" data-tauri-drag-region>
          <span className="mark" />
          <span className="wordmark">sparring</span>
          <div className="grow" />
          <button type="button" className="lbl" style={{ letterSpacing: "0.1em" }} onClick={onEnd}>
            End
          </button>
        </div>

        <div className="lbl" style={{ padding: "0 16px 9px" }}>
          This session
        </div>
        <div style={{ display: "flex", gap: 3, padding: "0 16px 4px" }}>
          {Array.from({ length: Math.max(total, 1) }, (_, pip) => (
            <span
              key={pip}
              style={{
                flexGrow: 1,
                height: 3,
                borderRadius: 2,
                background: pip < index ? ACCENT : "rgba(255,255,255,0.08)",
              }}
            />
          ))}
        </div>
        <div className="m" style={{ padding: "8px 16px 0", fontSize: 10.5, color: "var(--faint)" }}>
          {total === 0 ? "nothing due" : `${Math.min(index + 1, total)} of ${total}`} &middot; {elapsed}
        </div>

        <div className="lbl" style={{ padding: "24px 16px 8px" }}>
          Answered
        </div>
        <div className="scroll" style={{ maxHeight: 220 }}>
          {history.length === 0 ? (
            <div className="m" style={{ padding: "0 16px", fontSize: 10.5, color: "var(--dim)" }}>
              nothing yet
            </div>
          ) : (
            history.map((item, position) => (
              <div key={`${item.name}-${position}`} className="rail-queue-row">
                <span
                  style={{
                    flexShrink: 0,
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: GRADE_FACE[item.grade].colour,
                  }}
                />
                <span className="ellipsis" style={{ flexGrow: 1, fontSize: 12.5, color: "var(--muted)" }}>
                  {item.name}
                </span>
                <span className="m" style={{ fontSize: 9.5, color: "var(--dimmer)" }}>
                  {item.grade}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="grow" />
        <div className="panel" style={{ margin: "0 12px", padding: "12px 13px" }}>
          <div className="lbl" style={{ marginBottom: 7 }}>
            Interleaved
          </div>
          <div className="m" style={{ fontSize: 10.5, color: "var(--muted)", lineHeight: 1.6 }}>
            No two questions in a row come from one project. You have to work out which idea applies
            before you can answer.
          </div>
        </div>
      </div>

      <div className="glass-content content">
        <div className="glass hair topbar" data-tauri-drag-region>
          <button type="button" onClick={onEnd} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <BackIcon size={12} />
            <span className="lbl">{current?.project ?? "drill"}</span>
          </button>
          <span className="lbl" style={{ color: "#343a39" }}>
            /
          </span>
          <span className="lbl">{current?.concept ?? ""}</span>
          <div className="grow" />
          {current !== null && (
            <span
              className="m"
              style={{
                fontSize: 10,
                padding: "3px 9px",
                borderRadius: 5,
                border: "1px solid rgba(255,255,255,0.08)",
                color: "var(--faint)",
              }}
            >
              {current.altitude}
            </span>
          )}
          {chrome}
        </div>

        <div className="scroll" style={{ display: "flex", flexGrow: 1, justifyContent: "center" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 26,
              width: 700,
              maxWidth: "100%",
              padding: "52px 20px 40px",
            }}
          >
            {failure !== null && (
              <div className="notice-strip">
                <AlertIcon size={14} stroke="#e88d7d" />
                <span>{failure}</span>
              </div>
            )}

            {queue === null && failure === null && (
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span className="spinner" />
                <span className="m" style={{ fontSize: 11.5, color: "var(--faint)" }}>
                  drawing the queue
                </span>
              </div>
            )}

            {queue !== null && current === null && (
              <div className="panel" style={{ padding: "22px 24px" }}>
                <div style={{ fontSize: 18, fontWeight: 600 }}>
                  {total === 0 ? "Nothing is due" : "That is the queue"}
                </div>
                <div style={{ marginTop: 10, color: "var(--muted)", lineHeight: 1.6 }}>
                  {total === 0
                    ? "No card is due today. The queue fills as cards come back round."
                    : `You answered ${history.length} of ${total}. The schedule has moved each of them.`}
                </div>
                <button
                  type="button"
                  className="pill go"
                  style={{ marginTop: 18, padding: "8px 18px", display: "inline-block" }}
                  onClick={onEnd}
                >
                  Back to the hub
                </button>
              </div>
            )}

            {current !== null && (
              <>
                <div style={{ fontSize: 25, lineHeight: 1.36, fontWeight: 600, letterSpacing: "-0.018em" }}>
                  {current.ask}
                </div>
                {current.contexts.length > 0 && detail === null && (
                  <div className="m" style={{ fontSize: 11.5, color: "var(--faint)" }}>
                    context: {current.contexts[0]}
                  </div>
                )}

                {detail === null && (
                  <div className="rise" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <textarea
                      rows={6}
                      value={typed}
                      onChange={(event) => setTyped(event.target.value)}
                      placeholder="Answer in your own words. There are no hints, and asking for one is graded as not knowing."
                    />
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <button
                        type="button"
                        className="pill go"
                        style={{ padding: "8px 18px" }}
                        disabled={typed.trim() === "" || busy}
                        onClick={() => void commit(typed.trim(), false)}
                      >
                        Commit answer
                      </button>
                      <button
                        type="button"
                        className="pill ghost"
                        style={{ padding: "8px 14px" }}
                        disabled={busy}
                        onClick={() => void commit("I do not know.", true)}
                      >
                        I do not know
                      </button>
                      <div className="grow" />
                      <span className="m" style={{ fontSize: 10.5, color: "var(--dim)" }}>
                        nothing is revealed until you commit
                      </span>
                    </div>
                  </div>
                )}

                {detail !== null && (
                  <div className="rise" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    <div className="panel" style={{ padding: "14px 16px" }}>
                      <div className="lbl" style={{ marginBottom: 7 }}>
                        Your answer
                      </div>
                      <div style={{ color: "var(--muted)", lineHeight: 1.62, whiteSpace: "pre-wrap" }}>
                        {answer}
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: face.colour,
                          boxShadow: `0 0 12px ${face.glow}`,
                        }}
                      />
                      <span style={{ fontSize: 16, fontWeight: 600, color: face.colour }}>{face.label}</span>
                      <span style={{ color: "var(--faint)" }}>
                        {recorded === null
                          ? locked
                            ? "A non-answer is graded as not knowing."
                            : "Mark every point your answer actually contained."
                          : `${marks.filter(Boolean).length} of ${marks.length} points held.`}
                      </span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <div className="lbl" style={{ marginBottom: 10 }}>
                        What the answer had to contain
                      </div>
                      {detail.rubric.map((line, position) => {
                        const hit = marks[position] === true;
                        const settled = recorded !== null || locked;
                        return (
                          <button
                            key={line}
                            type="button"
                            disabled={settled}
                            onClick={() =>
                              setMarks((values) =>
                                values.map((value, at) => (at === position ? !value : value)),
                              )
                            }
                            style={{
                              display: "flex",
                              gap: 13,
                              padding: "11px 0",
                              borderTop: "1px solid rgba(255,255,255,0.055)",
                              width: "100%",
                            }}
                          >
                            <span
                              style={{
                                flexShrink: 0,
                                marginTop: 6,
                                width: 7,
                                height: 7,
                                borderRadius: "50%",
                                border: `1px solid ${hit ? ACCENT : "rgba(255,255,255,0.14)"}`,
                                background: hit ? ACCENT : "transparent",
                              }}
                            />
                            <span
                              style={{
                                flexGrow: 1,
                                color: hit ? "var(--faint)" : "var(--text)",
                                lineHeight: 1.6,
                              }}
                            >
                              {line}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {detail.grounding.length === 0 ? (
                      <div className="panel m" style={{ padding: "12px 15px", fontSize: 11.5, color: "var(--faint)" }}>
                        this card names no file in the repository
                      </div>
                    ) : (
                      detail.grounding.map((ground) => (
                        <div
                          key={`${ground.path}:${ground.line}`}
                          className="panel"
                          style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 15px" }}
                        >
                          <FileIcon size={14} />
                          <span className="m" style={{ fontSize: 11.5, color: "var(--muted)" }}>
                            {ground.path}
                            {ground.line > 0 ? `:${ground.line}` : ""}
                          </span>
                          {ground.commit !== null && (
                            <span className="m" style={{ fontSize: 10.5, color: "var(--dimmer)" }}>
                              {ground.commit.slice(0, 7)}
                            </span>
                          )}
                          <div className="grow" />
                          <button
                            type="button"
                            className="m"
                            style={{ fontSize: 11, color: ACCENT }}
                            onClick={() => {
                              void navigator.clipboard
                                ?.writeText(`${ground.path}:${ground.line}`)
                                .then(() => setCopied(`${ground.path}:${ground.line}`))
                                .catch(() => setFailure("The clipboard refused the path."));
                            }}
                          >
                            {copied === `${ground.path}:${ground.line}` ? "Copied" : "Copy path"}
                          </button>
                        </div>
                      ))
                    )}

                    {recorded === null ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <button
                          type="button"
                          className="pill go"
                          style={{ padding: "8px 18px" }}
                          disabled={busy}
                          onClick={() => void record()}
                        >
                          Record {face.label.toLowerCase()}
                        </button>
                        <div className="grow" />
                        <span className="m" style={{ fontSize: 10.5, color: "var(--dim)" }}>
                          you mark your own answer until a grader is wired in
                        </span>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <button type="button" className="pill go" style={{ padding: "8px 18px" }} onClick={next}>
                          Next question
                        </button>
                        <button
                          type="button"
                          className="pill ghost"
                          style={{ padding: "8px 14px" }}
                          onClick={() => setContesting(true)}
                        >
                          This grade is wrong
                        </button>
                        <div className="grow" />
                        <span className="m" style={{ fontSize: 10.5, color: "var(--dim)" }}>
                          {dayGap(recorded.schedule?.due ?? null) ?? "the schedule did not come back"}
                        </span>
                      </div>
                    )}

                    {contesting && recorded !== null && (
                      <div
                        className="rise panel"
                        style={{
                          padding: 20,
                          borderColor: "rgba(158,232,125,0.3)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 15,
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
                            What should this have been graded?
                          </div>
                          <div className="m" style={{ color: "var(--faint)", lineHeight: 1.55, fontSize: 11.5 }}>
                            Your correction is kept beside the original grade, never instead of it.
                          </div>
                        </div>
                        {recorded.attemptId === null && (
                          <div className="m" style={{ color: WARNING, lineHeight: 1.55, fontSize: 11.5 }}>
                            The server returns an identifier only for wrong and partial attempts, so this
                            grade cannot be contested from here.
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 8 }}>
                          {recorded.attemptId !== null &&
                            (["correct", "partial", "wrong"] as Grade[]).map((option) => {
                              const on = recorded.grade === option;
                              return (
                                <button
                                  key={option}
                                  type="button"
                                  className="pill"
                                  disabled={busy}
                                  onClick={() => void contest(option)}
                                  style={{
                                    padding: "7px 16px",
                                    border: `1px solid ${on ? GRADE_FACE[option].colour : "rgba(255,255,255,0.09)"}`,
                                    background: on ? "rgba(255,255,255,0.05)" : "transparent",
                                    color: on ? GRADE_FACE[option].colour : "var(--muted)",
                                  }}
                                >
                                  {GRADE_FACE[option].label}
                                </button>
                              );
                            })}
                          <div className="grow" />
                          <button
                            type="button"
                            className="lbl"
                            style={{ letterSpacing: "0.1em" }}
                            onClick={() => setContesting(false)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
