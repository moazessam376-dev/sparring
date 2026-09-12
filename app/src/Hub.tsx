/*
 * The hub: projects and topics as one graph, ported from design/Main.dc.html.
 *
 * Positions come from layout.ts and depend only on the shape of the graph, so
 * answering a question never moves a node.
 */

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ApiError,
  standing as fetchStanding,
  topics as fetchTopics,
  type Connection,
  type Project,
  type StandingTopic,
  type Topic,
  type TopicGraph,
} from "./api";
import {
  Estimate,
  EstimateBar,
  ACCENT,
  WARNING,
  answersLabel,
  attemptsFrom,
  band,
  tone,
} from "./Estimate";
import { GRAPH_HEIGHT, GRAPH_WIDTH, buildGraph, descendantsOf, type GraphNode } from "./layout";
import { AlertIcon } from "./Icons";

type Filter = "all" | "gaps" | "unverified";

type Props = {
  connection: Connection;
  project: Project | null;
  /** Null until the project list has been read, so an empty graph is never
      reported as an empty installation while the read is still in flight. */
  projects: Project[] | null;
  shellFailure: string | null;
  chrome: ReactNode;
  onStartDrill: () => void;
};

type Loaded = { graph: TopicGraph; standing: StandingTopic[] };

export function Hub({ connection, project, projects, shellFailure, chrome, onStartDrill }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(null);

  const projectId = project?.id ?? null;

  useEffect(() => {
    if (projectId === null) return;
    let dropped = false;
    setLoaded(null);
    setFailure(null);
    void (async () => {
      try {
        const [graph, rows] = await Promise.all([
          fetchTopics(connection, projectId),
          fetchStanding(connection, projectId),
        ]);
        if (!dropped) setLoaded({ graph, standing: rows });
      } catch (error) {
        if (!dropped) setFailure(error instanceof ApiError ? error.message : String(error));
      }
    })();
    return () => {
      dropped = true;
    };
  }, [connection, projectId]);

  // The signature deliberately leaves out every number that moves: only the set
  // of ids and the parent and prerequisite structure can change a position.
  const signature = useMemo(() => {
    if (loaded === null || project === null) return "";
    // Names and whether a topic is grounded belong here so a rename or a new
    // card is drawn, but neither can move a node: position depends on the id
    // ordering and the parent chain alone.
    const topicPart = loaded.graph.topics
      .map((topic) => `${topic.id}>${topic.parent ?? ""}>${topic.name}>${topic.cards > 0 ? "g" : "u"}`)
      .sort()
      .join("|");
    const edgePart = loaded.graph.edges
      .map((edge) => `${edge.requires}->${edge.topic}`)
      .sort()
      .join("|");
    return `${project.id}:${project.name}::${topicPart}::${edgePart}`;
  }, [loaded, project]);

  const graph = useMemo(() => {
    if (loaded === null || project === null) return null;
    return buildGraph(project.id, project.name, loaded.graph.topics, loaded.graph.edges);
    // The signature is the real input; loaded and project are read through it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const standingById = useMemo(() => {
    const map = new Map<string, StandingTopic>();
    for (const row of loaded?.standing ?? []) map.set(row.topic, row);
    return map;
  }, [loaded]);

  const topicsById = useMemo(() => {
    const map = new Map<string, Topic>();
    for (const topic of loaded?.graph.topics ?? []) map.set(topic.id, topic);
    return map;
  }, [loaded]);

  const nodes = graph?.nodes ?? [];
  const selectedKey = selected !== null && nodes.some((node) => node.key === selected)
    ? selected
    : (nodes.find((node) => node.kind === "project")?.key ?? null);
  const selectedNode = nodes.find((node) => node.key === selectedKey) ?? null;

  const scoreOf = (node: GraphNode): { score: number; attempts: number; confidence: number } | null => {
    if (node.kind === "project") return null;
    const topic = topicsById.get(node.id);
    const row = standingById.get(node.id);
    if (topic === undefined && row === undefined) return null;
    const score = row?.score ?? topic?.score ?? 0;
    const confidence = row?.confidence ?? topic?.confidence ?? 0;
    const attempts = row?.attempts ?? attemptsFrom(confidence);
    return { score, attempts, confidence };
  };

  const dimmed = (node: GraphNode): boolean => {
    if (node.kind === "project") return false;
    if (filter === "gaps") {
      const estimate = scoreOf(node);
      return estimate === null || estimate.score >= 0.6;
    }
    if (filter === "unverified") return node.verified;
    return false;
  };

  const problem = shellFailure ?? failure;
  const projectCount = projects?.length ?? 0;
  const topicNodes = nodes.filter((node) => node.kind !== "project");
  const kept = topicNodes.filter((node) => !dimmed(node)).length;
  const shown =
    filter === "all"
      ? `${topicNodes.length} ${topicNodes.length === 1 ? "topic" : "topics"} across ${projectCount} ${projectCount === 1 ? "project" : "projects"}`
      : filter === "gaps"
        ? `${kept} of ${topicNodes.length} topics, the weak ones`
        : `${kept} of ${topicNodes.length} topics, unverified`;

  return (
    <div className="glass-content content">
      <div className="glass hair topbar" data-tauri-drag-region>
        {([
          ["all", "Everything"],
          ["gaps", "Gaps only"],
          ["unverified", "Unverified"],
        ] as Array<[Filter, string]>).map(([id, label]) => {
          const on = filter === id;
          return (
            <button
              key={id}
              type="button"
              className="m chip"
              onClick={() => setFilter(id)}
              style={{
                background: on ? "rgba(158,232,125,0.13)" : "transparent",
                color: on ? ACCENT : "var(--muted)",
                border: `1px solid ${on ? "rgba(158,232,125,0.34)" : "rgba(255,255,255,0.07)"}`,
              }}
            >
              {label}
            </button>
          );
        })}
        <div className="grow" />
        <span className="lbl">{shown}</span>
        {chrome}
      </div>

      {problem !== null && (
        <div className="centre">
          <div className="notice panel" style={{ borderColor: "rgba(232,141,125,0.25)" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <AlertIcon size={15} stroke="#e88d7d" />
              <span style={{ fontSize: 15, fontWeight: 600 }}>The map could not be read</span>
            </div>
            <div style={{ color: "var(--muted)", lineHeight: 1.65 }}>{problem}</div>
            <div className="m" style={{ fontSize: 10.5, color: "var(--dim)", lineHeight: 1.6 }}>
              nothing here is stale data drawn as though it were current; the graph is simply not drawn
            </div>
          </div>
        </div>
      )}

      {problem === null && projects === null && (
        <div className="centre">
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span className="spinner" />
            <span className="m" style={{ fontSize: 11.5, color: "var(--faint)" }}>
              reading the projects
            </span>
          </div>
        </div>
      )}

      {problem === null && projects !== null && project === null && (
        <div className="centre">
          <div className="notice panel">
            <div style={{ fontSize: 15, fontWeight: 600 }}>No project yet</div>
            <div style={{ color: "var(--muted)", lineHeight: 1.6 }}>
              Nothing has been surveyed into this copy of sparring. A project arrives when a repository
              is surveyed; until then there is no graph to draw.
            </div>
          </div>
        </div>
      )}

      {project !== null && graph === null && problem === null && (
        <div className="centre">
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span className="spinner" />
            <span className="m" style={{ fontSize: 11.5, color: "var(--faint)" }}>
              reading the map
            </span>
          </div>
        </div>
      )}

      {graph !== null && project !== null && problem === null && (
        <div style={{ display: "flex", flexGrow: 1, minHeight: 0 }}>
          <div style={{ position: "relative", flexGrow: 1, minWidth: 0 }}>
            <svg viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`} style={{ width: "100%", height: "100%" }}>
              {graph.links.map((link, index) => {
                const from = nodes.find((node) => node.key === link.from);
                const to = nodes.find((node) => node.key === link.to);
                if (from === undefined || to === undefined) return null;
                const on = selectedKey === link.from || selectedKey === link.to;
                const unverified = !from.verified || !to.verified;
                return (
                  <line
                    key={`${link.from}-${link.to}-${index}`}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={on ? "rgba(158,232,125,0.42)" : "rgba(255,255,255,0.07)"}
                    strokeWidth={on ? 1.4 : 1}
                    strokeDasharray={unverified ? "4,4" : undefined}
                  />
                );
              })}
              {nodes.map((node) => {
                const estimate = scoreOf(node);
                const on = node.key === selectedKey;
                const dim = dimmed(node);
                const score = estimate?.score ?? 0;
                const spread = estimate === null ? 0 : band(score, estimate.attempts).width / 100;
                return (
                  <g
                    key={node.key}
                    onClick={() => setSelected(node.key)}
                    style={{ cursor: "pointer" }}
                    role="button"
                    aria-label={node.label}
                  >
                    {on && <circle cx={node.x} cy={node.y} r={node.r + 13} fill="rgba(158,232,125,0.09)" />}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.r}
                      fill={on ? "rgba(158,232,125,0.09)" : "rgba(255,255,255,0.03)"}
                      stroke={on ? ACCENT : dim ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.10)"}
                      strokeWidth={on ? 1.5 : 1}
                      strokeDasharray={node.verified ? undefined : "4,3"}
                    />
                    {estimate !== null && (
                      <>
                        {/* The pale disc is the uncertainty; the solid one is the estimate. */}
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={Math.min(node.r - 2, node.r * Math.min(1, score + spread / 2) * 0.66)}
                          fill="rgba(255,255,255,0.13)"
                        />
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={Math.max(3, node.r * score * 0.66)}
                          fill={tone(score)}
                          opacity={dim ? 0.35 : 1}
                        />
                      </>
                    )}
                    <text
                      className="node-label"
                      x={node.x}
                      y={node.y + node.r + 17}
                      textAnchor="middle"
                      fill={dim ? "#3a413f" : on ? "#e2e5e4" : "#979e9d"}
                      fontSize={node.fontSize}
                      fontFamily="Archivo, system-ui, sans-serif"
                      fontWeight={500}
                    >
                      {node.label}
                    </text>
                    {!node.verified && (
                      <text
                        className="node-label"
                        x={node.x}
                        y={node.y + node.r + 30}
                        textAnchor="middle"
                        fill={dim ? "#3a413f" : WARNING}
                        fontSize={9}
                        letterSpacing="0.14em"
                        fontFamily="DM Mono, ui-monospace, monospace"
                      >
                        UNVERIFIED
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            <div
              className="m"
              style={{
                position: "absolute",
                left: 20,
                bottom: 16,
                fontSize: 10.5,
                color: "var(--dim)",
                lineHeight: 1.6,
              }}
            >
              the disc inside a node is the estimate, the pale ring around it the doubt
              <br />
              dashed means the survey could not ground it
            </div>
          </div>

          <Detail
            node={selectedNode}
            project={project}
            topics={loaded?.graph.topics ?? []}
            topicsById={topicsById}
            standingById={standingById}
            onSelect={setSelected}
            onStartDrill={onStartDrill}
          />
        </div>
      )}
    </div>
  );
}

type DetailProps = {
  node: GraphNode | null;
  project: Project;
  topics: Topic[];
  topicsById: Map<string, Topic>;
  standingById: Map<string, StandingTopic>;
  onSelect: (key: string) => void;
  onStartDrill: () => void;
};

function Detail({
  node,
  project,
  topics,
  topicsById,
  standingById,
  onSelect,
  onStartDrill,
}: DetailProps) {
  if (node === null) return null;
  const topic = node.kind === "project" ? undefined : topicsById.get(node.id);
  const row = node.kind === "project" ? undefined : standingById.get(node.id);
  const confidence = row?.confidence ?? topic?.confidence ?? 0;
  const attempts = row?.attempts ?? attemptsFrom(confidence);
  const score = row?.score ?? topic?.score ?? 0;

  const under = node.kind === "project" ? topics : descendantsOf(node.id, topics);
  const weakest = [...under]
    .map((item) => {
      const itsRow = standingById.get(item.id);
      return {
        id: item.id,
        name: item.name,
        score: itsRow?.score ?? item.score,
        confidence: itsRow?.confidence ?? item.confidence,
        attempts: itsRow?.attempts ?? attemptsFrom(itsRow?.confidence ?? item.confidence),
        verified: item.cards > 0,
      };
    })
    .sort((left, right) => left.score - right.score)
    .slice(0, 4);

  return (
    <div
      className="scroll"
      style={{
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        gap: 20,
        width: 322,
        padding: "24px 22px 0",
        borderLeft: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="rise">
        <div className="lbl" style={{ marginBottom: 9 }}>
          {node.kind === "project" ? "Project" : topic === undefined ? "Topic, unverified" : topic.kind}
        </div>
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.014em" }}>{node.label}</div>
        <div style={{ marginTop: 9, color: "var(--muted)", lineHeight: 1.6 }}>
          {node.kind === "project"
            ? `${project.cards} ${project.cards === 1 ? "card" : "cards"} in this project, ${project.due} due now. Mastery is estimated per topic, never for a project as a whole.`
            : topic === undefined
              ? "A prerequisite names this topic, but the survey returned no topic for it. It is drawn dashed rather than dropped."
              : node.verified
                ? `${topic.cards} ${topic.cards === 1 ? "card" : "cards"} ground this topic in the repository.`
                : "No card grounds this topic in the repository, so nothing here has been checked against code."}
        </div>
      </div>

      {node.kind === "project" ? (
        <div className="panel" style={{ padding: "15px 16px" }}>
          <div style={{ display: "flex", gap: 18 }}>
            <div>
              <div className="m" style={{ fontSize: 22 }}>
                {project.cards}
              </div>
              <div className="lbl" style={{ marginTop: 4 }}>
                cards
              </div>
            </div>
            <div>
              <div className="m" style={{ fontSize: 22, color: project.due > 0 ? ACCENT : "var(--muted)" }}>
                {project.due}
              </div>
              <div className="lbl" style={{ marginTop: 4 }}>
                due now
              </div>
            </div>
          </div>
          <div className="m" style={{ marginTop: 11, fontSize: 10.5, color: "var(--dim)", lineHeight: 1.5 }}>
            both counted, not estimated
          </div>
        </div>
      ) : (
        <Estimate score={score} attempts={attempts} confidence={confidence} />
      )}

      <div>
        <div className="lbl" style={{ marginBottom: 10 }}>
          Weakest here
        </div>
        {weakest.length === 0 ? (
          <div className="m" style={{ fontSize: 11, color: "var(--dim)", lineHeight: 1.6 }}>
            nothing sits under this one
          </div>
        ) : (
          weakest.map((item) => (
            <button
              key={item.id}
              type="button"
              className="list-row"
              style={{ width: "100%" }}
              onClick={() => onSelect(`topic:${item.id}`)}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  background: tone(item.score),
                }}
              />
              <span className="ellipsis" style={{ flexGrow: 1, fontSize: 12.5 }}>
                {item.name}
                {!item.verified && (
                  <span className="m" style={{ marginLeft: 7, fontSize: 9, color: WARNING }}>
                    UNVERIFIED
                  </span>
                )}
              </span>
              <span style={{ width: 62, flexShrink: 0 }}>
                <EstimateBar score={item.score} attempts={item.attempts} height={3} />
              </span>
              <span className="m" style={{ width: 66, flexShrink: 0, fontSize: 9.5, color: "var(--faint)" }}>
                {answersLabel(item.attempts, item.confidence)}
              </span>
            </button>
          ))
        )}
      </div>

      <div className="grow" />
      <div style={{ paddingBottom: 22 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="pill go" style={{ flexGrow: 1, textAlign: "center" }} onClick={onStartDrill}>
            Start drill
          </button>
          <button type="button" className="pill ghost" style={{ flexGrow: 1, textAlign: "center" }} disabled>
            Open map
          </button>
        </div>
        <div className="m" style={{ marginTop: 9, fontSize: 10.5, color: "var(--dim)", lineHeight: 1.5 }}>
          the drill draws from every project at once; the map is a later screen
        </div>
      </div>
    </div>
  );
}
