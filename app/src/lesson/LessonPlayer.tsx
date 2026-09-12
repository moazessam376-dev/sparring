import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  abandonLesson,
  answerLesson,
  completeLesson,
  gradeLesson,
  lesson as fetchLesson,
  readLessonRun,
  revealLessonBlock,
  startLesson,
  type Connection,
} from "../api";
import { ApiError as AppApiError } from "../api";
import { TrafficLightGap } from "../Chrome";
import { BackIcon, AlertIcon } from "../Icons";
import { isDeterministic, gradeDeterministic } from "./grading";
import { renderLessonBlock, type LessonCommit, type SharedBlockProps } from "./registry";
import type { LessonAnswer, LessonBlock, LessonDocument, LessonRun } from "./types";

type Props = { connection: Connection; lessonId: string; chrome: ReactNode; onEnd: () => void };

function blockLabel(block: LessonBlock): string {
  if (block.type === "prose") return block.heading;
  if (block.type === "short" || block.type === "code" || block.type === "lure" || block.type === "order") return block.ask;
  if (block.type === "recall") return block.situation;
  if (block.type === "explainself") return block.prompt;
  if (block.type === "blank") return "Fill the load-bearing token";
  if (block.type === "place") return "Place the labels on the map";
  if (block.type === "diagram") return block.caption;
  if (block.type === "trace") return "Worked trace";
  if (block.type === "terminal") return "Terminal transcript";
  if (block.type === "schema") return "Schema or table";
  if (block.type === "timeline") return "Timeline";
  return "Request and response";
}

function kindLabel(block: LessonBlock): string {
  if (block.type === "prose" || block.type === "diagram" || block.type === "trace" || block.type === "terminal") return "explain";
  if (block.type === "schema" || block.type === "timeline" || block.type === "reqres") return "show";
  if (block.type === "explainself") return "stored, never graded";
  if (block.type === "short" || block.type === "code") return "agent review";
  return "graded exactly";
}

function answersMap(answers: LessonAnswer[]): Map<number, LessonAnswer> {
  return new Map(answers.map((answer) => [answer.block, answer]));
}

export function LessonPlayer({ connection, lessonId, chrome, onEnd }: Props) {
  const [document, setDocument] = useState<LessonDocument | null>(null);
  const [run, setRun] = useState<LessonRun | null>(null);
  const [answers, setAnswers] = useState<Map<number, LessonAnswer>>(new Map());
  const [revealed, setRevealed] = useState<Map<number, LessonBlock>>(new Map());
  const [index, setIndex] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [elapsedTick, setElapsedTick] = useState(0);
  const startedAt = useRef(Date.now());
  const ending = useRef(false);

  useEffect(() => {
    let dropped = false;
    void (async () => {
      try {
        const loaded = await fetchLesson(connection, lessonId);
        const started = await startLesson(connection, lessonId);
        if (dropped) return;
        setDocument(loaded);
        setRun(started);
        setAnswers(answersMap(started.answers));
        startedAt.current = Date.now();
      } catch (error) {
        if (!dropped) setFailure(error instanceof AppApiError ? error.message : String(error));
      }
    })();
    return () => { dropped = true; };
  }, [connection, lessonId]);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsedTick((value) => value + 1), 20000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (run === null || document === null || finished) return;
    const pending = [...answers.values()].some((answer) => answer.status === "awaiting");
    if (!pending) return;
    let dropped = false;
    const poll = async () => {
      try {
        const fresh = await readLessonRun(connection, lessonId, run.id);
        if (!dropped) {
          setRun(fresh);
          setAnswers(answersMap(fresh.answers));
        }
      } catch {
        // A transient poll failure must not replace the answer or invent a grade.
      }
    };
    const timer = window.setInterval(() => void poll(), 5000);
    return () => { dropped = true; window.clearInterval(timer); };
  }, [answers, connection, document, finished, lessonId, run]);

  const current = document?.blocks[index] ?? null;
  const currentBlock = current === null ? null : (revealed.get(index) ?? current);
  const response = answers.get(index) ?? null;

  const commit = useCallback(async (payload: LessonCommit) => {
    if (document === null || run === null || current === null || busy || response !== null) return;
    setBusy(true);
    setFailure(null);
    try {
      const committed = await answerLesson(connection, lessonId, {
        run: run.id,
        block: index,
        answer: payload.answer,
        ...(payload.stored === true ? { stored: true } : {}),
        ...(payload.card === undefined ? {} : { card: payload.card }),
        ...(payload.gap === undefined ? {} : { gap: payload.gap }),
      });
      const full = await revealLessonBlock(connection, lessonId, run.id, index);
      setRevealed((items) => new Map(items).set(index, full));
      const answer = isDeterministic(full)
        ? await gradeLesson(connection, committed.id, gradeDeterministic(full, payload.answer), payload.feedback ?? null, payload.gap ?? null)
        : committed;
      setAnswers((items) => new Map(items).set(index, answer));
    } catch (error) {
      setFailure(error instanceof AppApiError ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [busy, connection, current, document, index, lessonId, response, run]);

  const finish = useCallback(async () => {
    if (document === null || run === null || busy || finished) return;
    setBusy(true);
    setFailure(null);
    try {
      const completed = await completeLesson(connection, lessonId, run.id);
      setRun(completed);
      setFinished(true);
    } catch (error) {
      setFailure(error instanceof AppApiError ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [busy, connection, document, finished, lessonId, run]);

  const end = useCallback(async () => {
    if (ending.current) return;
    ending.current = true;
    if (run !== null && !run.completed && document !== null) {
      try { await abandonLesson(connection, lessonId, run.id, index); } catch { /* the user can still leave the player */ }
    }
    onEnd();
  }, [connection, document, index, lessonId, onEnd, run]);

  const elapsed = useMemo(() => {
    void elapsedTick;
    const minutes = Math.floor((Date.now() - startedAt.current) / 60000);
    return minutes < 1 ? "under a minute" : `${minutes} min`;
  }, [elapsedTick, index, response]);

  const advance = useCallback(() => {
    if (document === null || current === null || busy) return;
    if (index === document.blocks.length - 1) { void finish(); return; }
    setIndex((value) => value + 1);
  }, [busy, current, document, finish, index]);

  if (document === null) {
    return <div className="glass-content content"><div className="glass hair topbar"><span className="lbl">Lesson</span><div className="grow" />{chrome}</div><div className="centre">{failure === null ? <div style={{ display: "flex", gap: 10, alignItems: "center" }}><span className="spinner" /><span className="m" style={{ color: "var(--faint)" }}>opening the lesson</span></div> : <div className="notice-strip"><AlertIcon size={14} stroke="#e88d7d" /><span>{failure}</span></div>}</div></div>;
  }

  const isAdvanceEnabled = current !== null && (response !== null || !isDeterministic(current) && current.type !== "short" && current.type !== "code" || current.type === "short" && response !== null || current.type === "code" && response !== null);
  const answeredCount = answers.size;
  const percentage = Math.round((answeredCount / Math.max(1, document.blocks.length)) * 100);
  const props: SharedBlockProps = { response, busy, lessonBlocks: document.blocks, onCommit: commit };

  return (
    <div className="lesson-shell">
      <div className="glass rail rail-shell">
        <TrafficLightGap />
        <div className="rail-head" data-tauri-drag-region="deep"><span className="mark" /><span className="wordmark">sparring</span><div className="grow" /><button type="button" className="lbl" style={{ letterSpacing: "0.1em" }} onClick={() => void end()}>End</button></div>
        <div style={{ padding: "0 16px 16px" }}><div className="lbl" style={{ marginBottom: 6 }}>Lesson · {document.project}</div><div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.32 }}>{document.title}</div></div>
        <div className="scroll" style={{ maxHeight: 440 }}>{document.blocks.map((block, blockIndex) => { const on = blockIndex === index; const done = answers.has(blockIndex); return <button type="button" key={blockIndex} onClick={() => setIndex(blockIndex)} style={{ display: "flex", gap: 11, alignItems: "flex-start", margin: "0 8px", padding: "8px 9px", borderRadius: 7, width: "calc(100% - 16px)", background: on ? "rgba(255,255,255,0.055)" : "transparent" }}><span style={{ flexShrink: 0, marginTop: 2, width: 15, height: 15, borderRadius: "50%", border: `1px solid ${on || done ? "rgba(158,232,125,0.5)" : "rgba(255,255,255,0.12)"}`, background: done ? "rgba(158,232,125,0.18)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: done || on ? "var(--accent)" : "transparent" }} /></span><span className="ellipsis" style={{ flexGrow: 1, color: on ? "var(--text)" : done ? "var(--muted)" : "var(--faint)", fontSize: 12.5, lineHeight: 1.42 }}>{blockLabel(block)}</span></button>; })}</div>
        <div className="grow" />
        <div style={{ padding: "0 16px" }}><div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.07)" }}><span style={{ display: "block", height: 3, borderRadius: 2, width: `${percentage}%`, background: "var(--accent)" }} /></div><div className="m" style={{ marginTop: 9, fontSize: 10.5, color: "var(--faint)" }}>{percentage}% through · {elapsed} elapsed</div><div className="m" style={{ marginTop: 4, fontSize: 10, color: "var(--dim)" }}>~ {Math.max(1, Math.ceil((document.blocks.length - answeredCount) * 1.5))} min left · estimate</div></div>
      </div>

      <div className="glass-content content">
        <div className="glass hair topbar" data-tauri-drag-region="deep"><button type="button" onClick={() => void end()} style={{ display: "flex", alignItems: "center", gap: 7 }}><BackIcon size={12} /><span className="lbl">Lessons</span></button><span className="lbl" style={{ color: "#343a39" }}>/</span><span className="lbl">part {Math.min(index + 1, document.blocks.length)} of {document.blocks.length}</span><div className="grow" /><span className="m" style={{ fontSize: 10.5, color: "var(--faint)" }}>{current === null ? "lesson" : kindLabel(current)}</span>{chrome}</div>
        <div className="scroll" style={{ display: "flex", flexGrow: 1, justifyContent: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 22, width: 760, maxWidth: "100%", padding: "34px 20px 40px" }}>
            {failure !== null && <div className="notice-strip"><AlertIcon size={14} stroke="#e88d7d" /><span>{failure}</span></div>}
            {finished ? <div className="notice panel"><div style={{ fontSize: 19, fontWeight: 600 }}>Lesson complete</div><div style={{ color: "var(--muted)", lineHeight: 1.6 }}>Your run is recorded. Deterministic checks moved their cards through the lesson schedule. Agent-reviewed answers remain honest about their grading state.</div><button type="button" className="pill go" style={{ alignSelf: "flex-start", padding: "8px 16px" }} onClick={onEnd}>Back to lessons</button></div> : currentBlock !== null && <><div className="lesson-player-heading"><div className="lbl" style={{ marginBottom: 9 }}>{kindLabel(currentBlock)}</div><div style={{ fontSize: 25, fontWeight: 600, letterSpacing: "-0.018em", lineHeight: 1.28 }}>{blockLabel(currentBlock)}</div></div><div key={`block-${index}`}>{renderLessonBlock(currentBlock, props)}</div><div style={{ display: "flex", alignItems: "center", gap: 10 }}><button type="button" className="pill ghost" style={{ padding: "8px 15px" }} disabled={index === 0 || busy} onClick={() => setIndex((value) => Math.max(0, value - 1))}>Back</button><button type="button" className="pill go" style={{ padding: "8px 18px" }} disabled={busy || !isAdvanceEnabled} onClick={advance}>{index === document.blocks.length - 1 ? "Finish lesson" : "Next part"}</button><div className="grow" /><span className="m" style={{ fontSize: 10.5, color: "var(--dim)" }}>{response === null && current !== null && isDeterministic(current) ? "commit before reveal" : response?.status === "awaiting" ? "kept; awaiting the connected agent" : "the block stays still while you answer"}</span></div></>}
          </div>
        </div>
      </div>
    </div>
  );
}
