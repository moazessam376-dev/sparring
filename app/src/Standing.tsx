/* The standing view, ported from design/Standing.dc.html. */

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ApiError,
  standing as fetchStanding,
  type Calibration,
  type CheckTypeCounts,
  type Connection,
  type StandingReport,
  type StandingTopic,
} from "./api";
import { ACCENT, DANGER, WARNING, band, tone } from "./Estimate";

type Props = {
  connection: Connection;
  chrome: ReactNode;
  nothingDue: boolean;
  onStartDrill: () => void;
};

type Tab = "gaps" | "decaying" | "all";

function projectLabel(topic: StandingTopic): string {
  if (topic.projects.length === 0) return "unlinked";
  if (topic.projects.length === 1) return topic.projects[0]?.name ?? "unlinked";
  return `${topic.projects.length} projects`;
}

function topicStatus(topic: StandingTopic): { label: string; color: string } | null {
  if (topic.vouched) return { label: "confirmed by you", color: WARNING };
  if (topic.gateStatus !== null && topic.gateStatus !== "verified") return { label: "unverified", color: WARNING };
  if (topic.gateStatus === "verified") return { label: "verified", color: ACCENT };
  return null;
}

function titleFor(tab: Tab): [string, string] {
  if (tab === "gaps") return ["Where you are weakest", "sorted by how little you hold, not by how long ago"];
  if (tab === "decaying") return ["Going stale", "you held these once and the schedule says they are slipping"];
  return ["Every topic", "across every project in this copy of sparring"];
}

function filterTopics(topics: StandingTopic[], tab: Tab): StandingTopic[] {
  const list = tab === "gaps"
    ? topics.filter((topic) => topic.score < 0.6)
    : tab === "decaying"
      ? topics.filter((topic) => topic.daysSinceCorrect !== null && topic.daysSinceCorrect > 10)
      : [...topics];
  return list.sort((left, right) => left.score - right.score || left.name.localeCompare(right.name));
}

function CalibrationChart({ calibration }: { calibration: Calibration }) {
  if (!calibration.ready) {
    return <div className="panel" style={{ padding: "12px 13px" }}><div className="lbl" style={{ marginBottom: 8 }}>Not enough evidence</div><div className="m" style={{ fontSize: 10.5, color: "var(--muted)", lineHeight: 1.65 }}>{calibration.reason}</div></div>;
  }
  return (
    <>
      <svg viewBox="0 0 226 150" style={{ width: "100%" }} aria-label="Predicted recall against actual outcome">
        <line x1="26" y1="126" x2="218" y2="12" stroke="rgba(255,255,255,0.14)" strokeWidth="1" strokeDasharray="4,4" />
        <line x1="26" y1="126" x2="218" y2="126" stroke="rgba(255,255,255,0.09)" strokeWidth="1" />
        <line x1="26" y1="12" x2="26" y2="126" stroke="rgba(255,255,255,0.09)" strokeWidth="1" />
        {calibration.points.map((point) => {
          const x = 26 + point.predicted * 192;
          const y = 126 - point.actual * 114;
          const lowY = 126 - point.actualLow * 114;
          const highY = 126 - point.actualHigh * 114;
          const color = Math.abs(point.predicted - point.actual) > 0.06 ? DANGER : ACCENT;
          return <g key={`${point.predicted}-${point.actual}`}><line x1={x} y1={lowY} x2={x} y2={highY} stroke={color} strokeOpacity="0.55" strokeWidth="3" /><circle cx={x} cy={y} r={4} fill={`${color}40`} stroke={color} strokeWidth="1" /><text x={x + 6} y={y - 5} fill="#626a69" fontSize="7.5" fontFamily="DM Mono, monospace">n={point.count}</text></g>;
        })}
        <text x="26" y="144" fill="#565d5c" fontSize="8" fontFamily="DM Mono, monospace">predicted</text>
        <text x="218" y="144" textAnchor="end" fill="#565d5c" fontSize="8" fontFamily="DM Mono, monospace">100%</text>
      </svg>
      <div className="m" style={{ marginTop: 6, fontSize: 10, color: "var(--dim)", lineHeight: 1.65 }}>{calibration.attempts} scheduled reviews counted · n beside each point is counted evidence</div>
    </>
  );
}

function ModeDistribution({ rows }: { rows: CheckTypeCounts[] }) {
  if (rows.length === 0) return <div className="m" style={{ fontSize: 10.5, color: "var(--dim)" }}>no answers counted yet</div>;
  return <div>{rows.map((row) => <div key={row.mode} style={{ display: "flex", alignItems: "center", gap: 11, padding: "5px 0" }}><span style={{ width: 116, flexShrink: 0, fontSize: 12.5, color: "var(--muted)" }}>{row.mode}</span><span style={{ flexGrow: 1, height: 8, borderRadius: 2, background: "rgba(255,255,255,0.06)", display: "flex", overflow: "hidden" }} title={`${row.total} answers counted`}><span style={{ width: `${(row.correct / row.total) * 100}%`, background: ACCENT }} /><span style={{ width: `${(row.partial / row.total) * 100}%`, background: WARNING }} /><span style={{ width: `${(row.wrong / row.total) * 100}%`, background: DANGER }} /></span><span className="m" style={{ width: 88, textAlign: "right", fontSize: 9.5, color: "var(--faint)" }}>n={row.total} counted</span></div>)}</div>;
}

export function Standing({ connection, chrome, nothingDue, onStartDrill }: Props) {
  const [report, setReport] = useState<StandingReport | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("gaps");

  useEffect(() => {
    let dropped = false;
    setReport(null);
    setFailure(null);
    void fetchStanding(connection)
      .then((next) => { if (!dropped) setReport(next); })
      .catch((error: unknown) => { if (!dropped) setFailure(error instanceof ApiError ? error.message : String(error)); });
    return () => { dropped = true; };
  }, [connection]);

  const rows = useMemo(() => filterTopics(report?.topics ?? [], tab), [report, tab]);
  const counts = useMemo(() => {
    const topics = report?.topics ?? [];
    return {
      gaps: topics.filter((topic) => topic.score < 0.6).length,
      decaying: topics.filter((topic) => topic.daysSinceCorrect !== null && topic.daysSinceCorrect > 10).length,
      all: topics.length,
    };
  }, [report]);
  const [title, note] = titleFor(tab);
  const weak = counts.gaps;
  const neverAsked = (report?.topics ?? []).filter((topic) => topic.attempts === 0).length;

  return (
    <div className="glass-content content">
      <div className="glass hair topbar" data-tauri-drag-region="deep"><span className="lbl">Standing</span><div className="grow" /><span className="m" style={{ fontSize: 10.5, color: "var(--dim)" }}>all projects · estimates carry doubt</span>{chrome}</div>
      {failure !== null ? <div className="centre"><div className="notice panel" style={{ borderColor: "rgba(232,141,125,0.25)" }}><div style={{ fontSize: 15, fontWeight: 600 }}>Standing could not be read</div><div style={{ color: "var(--muted)" }}>{failure}</div></div></div> : report === null ? <div className="centre"><div style={{ display: "flex", gap: 10, alignItems: "center" }}><span className="spinner" /><span className="m" style={{ color: "var(--faint)" }}>reading your standing</span></div></div> : <div style={{ display: "flex", flexGrow: 1, minHeight: 0 }}>
        <aside style={{ width: 236, flexShrink: 0, padding: "20px 12px 18px", borderRight: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column" }}>
          <div className="lbl" style={{ padding: "0 4px 8px" }}>View</div>
          {([ ["gaps", "Gaps"], ["decaying", "Decaying"], ["all", "Everything"] ] as Array<[Tab, string]>).map(([id, label]) => <button key={id} type="button" onClick={() => setTab(id)} style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 -4px", padding: "7px 9px", borderRadius: 7, background: tab === id ? "rgba(255,255,255,0.055)" : "transparent" }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: tab === id ? ACCENT : "rgba(255,255,255,0.14)" }} /><span style={{ flexGrow: 1, color: tab === id ? "var(--text)" : "var(--muted)", fontSize: 13 }}>{label}</span><span className="m" style={{ fontSize: 10, color: "var(--faint)" }}>{counts[id]}</span></button>)}
          <div className="lbl" style={{ padding: "22px 4px 10px" }}>Is the schedule honest</div>
          <CalibrationChart calibration={report.calibration} />
          <div className="grow" />
          <button type="button" className="pill go" style={{ textAlign: "center", margin: "0 0 2px" }} onClick={onStartDrill} disabled={nothingDue}>Drill the {weak} weakest</button>
          {nothingDue && <div className="m" style={{ marginTop: 8, fontSize: 10, color: "var(--dim)", lineHeight: 1.5 }}>nothing is due, so there is nothing to ask</div>}
        </aside>
        <main className="scroll" style={{ flexGrow: 1, minWidth: 0, padding: "26px 28px 22px" }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 22 }}>{[
            ["Topics in standing", String(report.totalTopics), "counted across all projects", "var(--text)"],
            ["Weak right now", String(weak), "under 60, estimated", DANGER],
            ["Never asked", String(neverAsked), "no answers counted", WARNING],
            ["Verified claims", String(report.verifiedTopics), "gate-verified, counted", ACCENT],
          ].map(([label, value, sub, color]) => <div key={label} className="panel" style={{ flexGrow: 1, padding: "14px 16px" }}><div className="lbl" style={{ marginBottom: 10 }}>{label}</div><div className="m" style={{ fontSize: 24, color }}>{value}</div><div className="m" style={{ marginTop: 5, fontSize: 10.5, color: "var(--dim)" }}>{sub}</div></div>)}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 11, marginBottom: 12 }}><div style={{ fontSize: 19, fontWeight: 600 }}>{title}</div><span className="m" style={{ fontSize: 10.5, color: "var(--dim)" }}>{note}</span><div className="grow" /><span className="m" style={{ fontSize: 10, color: "var(--faint)" }}>{rows.length} rows counted</span></div>
          <div className="panel" style={{ padding: 0, overflow: "hidden" }}>{rows.length === 0 ? <div style={{ padding: "28px 18px", color: "var(--muted)" }}>Nothing matches this view yet. A topic with no answers remains visible in Everything.</div> : rows.map((row, index) => <StandingRow key={row.topic} row={row} last={index === rows.length - 1} />)}</div>
          <div style={{ display: "flex", gap: 26, alignItems: "flex-start", marginTop: 22 }}><div className="m" style={{ flexGrow: 1, fontSize: 10.5, color: "var(--dim)", lineHeight: 1.72, maxWidth: 440 }}>The pale band behind each bar is how wrong the estimate could be. Confidence is based on counted attempts; a topic with three answers has a wider band than its estimate.</div><div style={{ width: 340, flexShrink: 0 }}><div className="lbl" style={{ marginBottom: 10 }}>Which question types work on you</div><ModeDistribution rows={report.checkTypes} /></div></div>
        </main>
      </div>}
    </div>
  );
}

function StandingRow({ row, last }: { row: StandingTopic; last: boolean }) {
  const status = topicStatus(row);
  const estimate = band(row.score, row.attempts);
  const lastSeen = row.daysSinceCorrect === null ? "never correct" : `${row.daysSinceCorrect}d ago`;
  return <div style={{ display: "flex", alignItems: "center", gap: 15, padding: "12px 17px", borderBottom: last ? undefined : "1px solid rgba(255,255,255,0.04)" }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: tone(row.score), flexShrink: 0 }} /><span style={{ width: 186, flexShrink: 0, display: "flex", alignItems: "baseline", gap: 7, minWidth: 0 }}><span className="ellipsis">{row.name}</span>{status !== null && <span className="m" style={{ fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: status.color, whiteSpace: "nowrap" }}>{status.label}</span>}</span><span className="m ellipsis" style={{ width: 112, flexShrink: 0, fontSize: 10.5, color: "var(--faint)" }}>{projectLabel(row)}</span><span style={{ flexGrow: 1, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)", position: "relative" }}><span style={{ position: "absolute", left: `${estimate.low}%`, width: `${estimate.span}%`, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} /><span style={{ position: "absolute", left: 0, width: `${estimate.percent}%`, height: 3, borderRadius: 2, background: tone(row.score) }} /></span><span className="m" style={{ width: 42, textAlign: "right", flexShrink: 0, color: tone(row.score), fontSize: 12 }}>{estimate.percent}%</span><span className="m" style={{ width: 92, textAlign: "right", flexShrink: 0, fontSize: 10.5, color: row.attempts < 4 ? DANGER : "var(--faint)" }}>n={row.attempts} counted</span><span className="m" style={{ width: 76, textAlign: "right", flexShrink: 0, fontSize: 10.5, color: "var(--dimmer)" }}>{lastSeen}</span></div>;
}
