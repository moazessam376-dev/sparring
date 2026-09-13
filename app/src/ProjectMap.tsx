/* The project map, ported from design/ProjectMap.dc.html. */

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ApiError,
  projectMap as fetchProjectMap,
  standing as fetchStanding,
  type ClaimStatus,
  type Connection,
  type MapClaim,
  type Project,
  type ProjectMapView,
  type StandingReport,
  type StandingTopic,
} from "./api";
import { ACCENT, DANGER, Estimate, WARNING, attemptsFrom } from "./Estimate";
import { buildProjectMapLayout, MAP_HEIGHT, MAP_WIDTH, type MapPartPosition } from "./layout";
import { AlertIcon, FileIcon } from "./Icons";

type Props = {
  connection: Connection;
  project: Project | null;
  chrome: ReactNode;
  onSurvey: () => void;
  onStartDrill: () => void;
  onOpenLessons: (topic: string | null) => void;
};

type Loaded = { map: ProjectMapView; standing: StandingReport };

type StatusStyle = { fill: string; stroke: string; text: string; dash?: string; label: string };

const STATUS_STYLE: Record<ClaimStatus, StatusStyle> = {
  verified: {
    fill: "rgba(158,232,125,0.08)",
    stroke: ACCENT,
    text: "#e2e5e4",
    label: "verified",
  },
  vouched: {
    fill: "rgba(232,201,125,0.08)",
    stroke: WARNING,
    text: "#e8c97d",
    dash: "2,3",
    label: "confirmed by you",
  },
  inferred: {
    fill: "rgba(232,201,125,0.045)",
    stroke: "rgba(232,201,125,0.72)",
    text: "#e8c97d",
    dash: "5,5",
    label: "inferred · unverified",
  },
  stale: {
    fill: "rgba(232,201,125,0.045)",
    stroke: "rgba(232,201,125,0.72)",
    text: "#e8c97d",
    dash: "5,5",
    label: "stale · unverified",
  },
  unchecked: {
    fill: "rgba(232,201,125,0.045)",
    stroke: "rgba(232,201,125,0.72)",
    text: "#e8c97d",
    dash: "5,5",
    label: "unchecked · unverified",
  },
  contradicted: {
    fill: "rgba(232,141,125,0.075)",
    stroke: DANGER,
    text: "#e88d7d",
    label: "contradicted",
  },
};

function evidenceLabel(claim: MapClaim): string {
  const { path, fromLine, toLine, commit } = claim.evidence;
  if (path === null) return "no cited file or line";
  const line = fromLine === null
    ? ""
    : `:${fromLine}${toLine !== null && toLine !== fromLine ? `–${toLine}` : ""}`;
  const sha = commit === null ? "" : ` · ${commit.slice(0, 8)}`;
  return `${path}${line}${sha}`;
}

function statusLabel(status: ClaimStatus): string {
  return STATUS_STYLE[status].label;
}

function selectedStanding(claim: MapClaim, report: StandingReport): StandingTopic | undefined {
  return report.topics.find((topic) => topic.topic === claim.id);
}

function pct(count: number, total: number): string {
  return total === 0 ? "0%" : `${Math.round((count / total) * 100)}%`;
}

function coverageTone(id: string): string {
  if (id === "inspected") return "rgba(158,232,125,0.5)";
  if (id === "generated") return "rgba(255,255,255,0.12)";
  if (id === "not-inspected") return "rgba(232,201,125,0.45)";
  return "rgba(255,255,255,0.07)";
}

export function ProjectMap({ connection, project, chrome, onSurvey, onStartDrill, onOpenLessons }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (project === null) {
      setLoaded(null);
      return;
    }
    let dropped = false;
    setLoaded(null);
    setFailure(null);
    void Promise.all([fetchProjectMap(connection, project.id), fetchStanding(connection, project.id)])
      .then(([map, standing]) => {
        if (!dropped) setLoaded({ map, standing });
      })
      .catch((error: unknown) => {
        if (!dropped) setFailure(error instanceof ApiError ? error.message : String(error));
      });
    return () => {
      dropped = true;
    };
  }, [connection, project]);

  const map = loaded?.map ?? null;
  const layout = useMemo(() => {
    if (map === null) return null;
    return buildProjectMapLayout(
      map.parts.map((part) => part.id),
      map.constraints.map((constraint) => constraint.id),
      map.edges.map((edge) => ({ id: edge.id, from: edge.from, to: edge.to })),
    );
  }, [map]);
  const partById = useMemo(() => new Map(map?.parts.map((part) => [part.id, part]) ?? []), [map]);
  const constraintById = useMemo(() => new Map(map?.constraints.map((constraint) => [constraint.id, constraint]) ?? []), [map]);
  const edgeById = useMemo(() => new Map(map?.edges.map((edge) => [edge.id, edge]) ?? []), [map]);
  const selectedClaim = selected === null
    ? null
    : partById.get(selected) ?? constraintById.get(selected) ?? edgeById.get(selected) ?? null;
  const firstClaim = map === null ? null : map.parts[0] ?? map.constraints[0] ?? map.edges[0] ?? null;
  const activeClaim = selectedClaim ?? firstClaim;
  const activeEstimate = activeClaim === null || loaded === null ? undefined : selectedStanding(activeClaim, loaded.standing);

  if (project === null) {
    return (
      <div className="glass-content content">
        <div className="glass hair topbar">{chrome}<span className="lbl">Project map</span></div>
        <div className="centre"><div className="notice panel"><div style={{ fontSize: 15, fontWeight: 600 }}>No project selected</div><div style={{ color: "var(--muted)" }}>Survey a repository to make a project map.</div><button type="button" className="pill go" onClick={onSurvey}>Survey a repository</button></div></div>
      </div>
    );
  }

  return (
    <div className="glass-content content">
      <div className="glass hair topbar" data-tauri-drag-region="deep">
        <span className="lbl">Project map</span>
        <span className="lbl" style={{ color: "#343a39" }}>/</span>
        <span className="lbl">{project.name}</span>
        <div className="grow" />
        <span className="m" style={{ fontSize: 10.5, color: "var(--dim)" }}>
          {map?.survey === null ? "survey not found" : `${map?.parts.length ?? 0} parts · ${map?.constraints.length ?? 0} constraints`}
        </span>
        {chrome}
      </div>

      {failure !== null ? (
        <div className="centre"><div className="notice panel" style={{ borderColor: "rgba(232,141,125,0.25)" }}><div style={{ display: "flex", gap: 10, alignItems: "center" }}><AlertIcon size={15} stroke={DANGER} /><span style={{ fontSize: 15, fontWeight: 600 }}>The map could not be read</span></div><div style={{ color: "var(--muted)", lineHeight: 1.65 }}>{failure}</div></div></div>
      ) : loaded === null ? (
        <div className="centre"><div style={{ display: "flex", gap: 10, alignItems: "center" }}><span className="spinner" /><span className="m" style={{ color: "var(--faint)" }}>reading the project map</span></div></div>
      ) : map?.survey === null ? (
        <div className="centre">
          <div className="notice panel">
            <div style={{ fontSize: 15, fontWeight: 600 }}>No stored survey for {project.name}</div>
            <div style={{ color: "var(--muted)", lineHeight: 1.65 }}>The map is made from the repository survey, and this project has none on disk. Sparring will not draw an empty canvas and call it a map.</div>
            <button type="button" className="pill go" style={{ padding: "8px 16px" }} onClick={onSurvey}>Survey a repository</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexGrow: 1, minHeight: 0 }}>
          <MapRail map={map!} selected={activeClaim?.id ?? null} onSelect={setSelected} onSurvey={onSurvey} />
          {map!.parts.length === 0 && map!.constraints.length === 0 ? (
            <div className="centre"><div className="notice panel"><div style={{ fontSize: 15, fontWeight: 600 }}>The survey stored no map claims</div><div style={{ color: "var(--muted)", lineHeight: 1.6 }}>Its coverage and claim ledger are still available, but there are no parts or constraints to draw.</div></div></div>
          ) : (
            <>
              <div style={{ position: "relative", flexGrow: 1, minWidth: 0 }}>
                <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} style={{ width: "100%", height: "100%" }}>
                  {layout?.bands.map((band) => {
                    const claim = constraintById.get(band.id);
                    if (claim === undefined) return null;
                    const style = STATUS_STYLE[claim.status];
                    const active = activeClaim?.id === claim.id;
                    return (
                      <g key={band.id} role="button" aria-label={claim.name} onClick={() => setSelected(claim.id)} style={{ cursor: "pointer" }}>
                        <rect x={0} y={band.y} width={MAP_WIDTH} height={band.h} fill={active ? "rgba(158,232,125,0.05)" : style.fill} stroke={active ? ACCENT : style.stroke} strokeWidth={active ? 1.5 : 1} strokeDasharray={style.dash} />
                        <text x={14} y={band.y + 17} fill={active ? ACCENT : style.text} fontSize={8.5} fontFamily="DM Mono, monospace" letterSpacing="0.14em">{claim.name.toUpperCase()} · {statusLabel(claim.status).toUpperCase()}</text>
                      </g>
                    );
                  })}
                  {layout?.edges.map((position) => {
                    const edge = edgeById.get(position.id);
                    if (edge === undefined) return null;
                    const style = STATUS_STYLE[edge.status];
                    const active = activeClaim?.id === edge.id;
                    return (
                      <g key={edge.id} role="button" aria-label={edge.name} onClick={() => setSelected(edge.id)} style={{ cursor: "pointer" }}>
                        <line x1={position.x1} y1={position.y1} x2={position.x2} y2={position.y2} stroke="transparent" strokeWidth={9} />
                        <line x1={position.x1} y1={position.y1} x2={position.x2} y2={position.y2} stroke={active ? ACCENT : style.stroke} strokeWidth={active ? 1.6 : 1} strokeDasharray={style.dash} />
                      </g>
                    );
                  })}
                  {layout?.parts.map((position) => {
                    const claim = partById.get(position.id);
                    if (claim === undefined) return null;
                    const style = STATUS_STYLE[claim.status];
                    const active = activeClaim?.id === claim.id;
                    return <MapNode key={claim.id} position={position} claim={claim} active={active} style={style} onSelect={() => setSelected(claim.id)} />;
                  })}
                </svg>
                <div className="m" style={{ position: "absolute", left: 18, bottom: 16, fontSize: 10.5, color: "var(--dim)", lineHeight: 1.6 }}>
                  solid is verified · dotted is confirmed by you · dashed is unverified
                  <br />
                  contradicted is marked in red; the pale band behind an estimate is its doubt
                </div>
              </div>
              <MapDetail claim={activeClaim} standing={activeEstimate} onStartDrill={onStartDrill} onOpenLessons={onOpenLessons} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MapNode({ position, claim, active, style, onSelect }: { position: MapPartPosition; claim: MapClaim; active: boolean; style: StatusStyle; onSelect: () => void }) {
  return (
    <g role="button" aria-label={claim.name} onClick={onSelect} style={{ cursor: "pointer" }}>
      {active && <rect x={position.x - 7} y={position.y - 7} width={position.w + 14} height={position.h + 14} rx={13} fill="rgba(158,232,125,0.09)" />}
      <rect x={position.x} y={position.y} width={position.w} height={position.h} rx={9} fill={active ? "rgba(158,232,125,0.09)" : style.fill} stroke={active ? ACCENT : style.stroke} strokeWidth={active ? 1.5 : 1} strokeDasharray={style.dash} />
      <text x={position.x + position.w / 2} y={position.y + 20} textAnchor="middle" fill={active ? "#e2e5e4" : style.text} fontSize={12} fontWeight={500} fontFamily="Archivo, sans-serif">{claim.name}</text>
      <text x={position.x + position.w / 2} y={position.y + 36} textAnchor="middle" fill={style.text} fontSize={8.5} fontFamily="DM Mono, monospace">{statusLabel(claim.status).toUpperCase()}</text>
    </g>
  );
}

function MapRail({ map, selected, onSelect, onSurvey }: { map: ProjectMapView; selected: string | null; onSelect: (id: string) => void; onSurvey: () => void }) {
  const coverage = map.survey?.coverage ?? null;
  const total = coverage?.total ?? 0;
  return (
    <div style={{ width: 202, flexShrink: 0, padding: "18px 0", borderRight: "1px solid rgba(255,255,255,0.06)", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "0 14px 16px" }}><div className="lbl">Map</div><div className="grow" /><button type="button" className="lbl" style={{ letterSpacing: "0.1em" }} onClick={onSurvey}>Re-survey</button></div>
      <div style={{ padding: "0 14px 14px" }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{map.project}</div>
        <div className="m" style={{ marginTop: 7, fontSize: 10, color: "var(--faint)", lineHeight: 1.6 }}>{map.survey?.at?.slice(0, 10) ?? "survey date unknown"}<br />{map.verifiedParts} of {map.parts.length} parts verified{map.vouchedClaims > 0 ? ` · ${map.vouchedClaims} confirmed by you` : ""}</div>
      </div>
      <div className="lbl" style={{ padding: "8px 14px" }}>Constraints</div>
      {map.constraints.length === 0 ? <div className="m" style={{ padding: "0 14px", fontSize: 10, color: "var(--dim)" }}>none stored</div> : map.constraints.map((constraint) => {
        const style = STATUS_STYLE[constraint.status];
        return <button key={constraint.id} type="button" onClick={() => onSelect(constraint.id)} style={{ display: "flex", alignItems: "center", gap: 9, margin: "0 7px", padding: "7px 7px", borderRadius: 7, width: "calc(100% - 14px)", background: selected === constraint.id ? "rgba(255,255,255,0.055)" : "transparent" }}><span style={{ width: 3, height: 14, borderRadius: 2, background: style.stroke, flexShrink: 0 }} /><span className="ellipsis" style={{ flexGrow: 1, fontSize: 12, color: selected === constraint.id ? "var(--text)" : "var(--muted)" }}>{constraint.name}</span></button>;
      })}
      <div className="lbl" style={{ padding: "18px 14px 8px" }}>Coverage</div>
      <div style={{ padding: "0 14px" }}>
        {coverage === null || total === 0 ? <div className="m" style={{ fontSize: 10, color: "var(--dim)", lineHeight: 1.6 }}>not recorded; no empty region inferred</div> : <><div style={{ display: "flex", gap: 2, height: 22 }}>{coverage.segments.map((segment) => <span key={segment.id} title={`${segment.label}: ${segment.count} files counted`} style={{ flexGrow: Math.max(0, segment.count), minWidth: segment.count > 0 ? 2 : 0, borderRadius: 2, background: coverageTone(segment.id) }} />)}</div><div className="m" style={{ marginTop: 9, fontSize: 9.5, color: "var(--dim)", lineHeight: 1.75 }}>{coverage.segments.map((segment) => <span key={segment.id} style={{ display: "block" }}>{segment.label} {segment.count} files counted · {pct(segment.count, total)}</span>)}</div></>}
      </div>
    </div>
  );
}

function MapDetail({ claim, standing, onStartDrill, onOpenLessons }: { claim: MapClaim | null; standing: StandingTopic | undefined; onStartDrill: () => void; onOpenLessons: (topic: string | null) => void }) {
  if (claim === null) return <div style={{ width: 336, flexShrink: 0, borderLeft: "1px solid rgba(255,255,255,0.06)" }} />;
  const style = STATUS_STYLE[claim.status];
  const attempts = standing?.attempts ?? attemptsFrom(standing?.confidence ?? 0);
  return (
    <div className="scroll" style={{ width: 336, flexShrink: 0, borderLeft: "1px solid rgba(255,255,255,0.06)", padding: "24px 22px 0", display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="rise">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}><span className="lbl">{claim === null ? "" : "map claim"}</span><span className="m" style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", padding: "2px 7px", borderRadius: 4, border: `1px solid ${style.stroke}`, color: style.text }}>{statusLabel(claim.status)}</span></div>
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.014em" }}>{claim.name}</div>
        <div style={{ marginTop: 9, color: "var(--muted)", lineHeight: 1.62 }}>{claim.sentence}</div>
      </div>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.055)", paddingTop: 15 }}>
        <div className="lbl" style={{ marginBottom: 9 }}>Status and reason</div>
        <div style={{ color: style.text, fontSize: 12.5, lineHeight: 1.62 }}>{statusLabel(claim.status)}</div>
        <div style={{ color: "var(--muted)", fontSize: 12.5, lineHeight: 1.62 }}>{claim.reason}</div>
      </div>
      <div className="panel" style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 9 }}><FileIcon size={13} stroke="#626a69" /><span className="m" style={{ fontSize: 10.5, color: "var(--muted)", flexGrow: 1, overflowWrap: "anywhere" }}>{evidenceLabel(claim)}</span></div>
      <div>
        <div className="lbl" style={{ marginBottom: 9 }}>Your standing on this topic</div>
        {standing === undefined ? <div className="m" style={{ fontSize: 10.5, color: "var(--dim)", lineHeight: 1.6 }}>no seeded topic for this claim, so there is no standing estimate</div> : <Estimate score={standing.score} attempts={attempts} confidence={standing.confidence} />}
      </div>
      <div className="grow" />
      <div style={{ display: "flex", flexDirection: "column", gap: 7, paddingBottom: 22 }}><button type="button" className="pill go" style={{ textAlign: "center", padding: 9 }} onClick={() => onOpenLessons(claim.id)}>Open the lesson</button><button type="button" className="pill ghost" style={{ textAlign: "center", padding: 9 }} onClick={onStartDrill}>Drill just this</button></div>
    </div>
  );
}
