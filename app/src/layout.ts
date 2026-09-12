/*
 * Node positions for the hub graph.
 *
 * A layout that moves when the data changes destroys the map a person is
 * building in their head, so position is a pure function of the shape of the
 * graph: which ids exist and which is whose parent. Scores, due counts and
 * every other thing that changes on an answer are not inputs here, and a node
 * therefore never moves because you answered a question about it.
 */

import type { Topic, TopicEdge } from "./api";

export const GRAPH_WIDTH = 820;
export const GRAPH_HEIGHT = 760;

const TOP = 140;
const ROW = 176;
const MAX_RANK = 3;

export type NodeKind = "project" | "topic" | "subtopic";

export type GraphNode = {
  key: string;
  id: string;
  label: string;
  kind: NodeKind;
  rank: number;
  x: number;
  y: number;
  r: number;
  fontSize: number;
  /** False when nothing in the repository grounds this node. Drawn dashed. */
  verified: boolean;
  /** True when the node is seeded from a user vouch, not a gate verdict. */
  vouched: boolean;
  /** Why it is unverified, shown beside it. Null when it is verified. */
  mark: string | null;
};

export type GraphLink = { from: string; to: string };

export type Graph = { nodes: GraphNode[]; links: GraphLink[] };

/** FNV-1a. Any stable hash will do; this one is short and has no dependency. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

/** A repeatable offset in [-1, 1) from an id, so a rank is not a straight rule. */
function wobble(id: string, salt: string): number {
  return ((hash(`${salt}:${id}`) % 2000) - 1000) / 1000;
}

function rankOf(topic: Topic, byId: Map<string, Topic>): number {
  let rank = 1;
  let parent = topic.parent;
  const seen = new Set<string>([topic.id]);
  while (parent !== null && byId.has(parent) && !seen.has(parent) && rank < MAX_RANK) {
    seen.add(parent);
    rank += 1;
    parent = byId.get(parent)?.parent ?? null;
  }
  return rank;
}

/**
 * The graph for one project. `projectId` becomes the root node; every topic the
 * server returned hangs beneath it, and an id that only appears on an edge is
 * kept as an unverified node rather than dropped.
 */
export function buildGraph(
  projectId: string,
  projectName: string,
  topics: Topic[],
  edges: TopicEdge[],
): Graph {
  const byId = new Map(topics.map((topic) => [topic.id, topic]));

  const nodes: GraphNode[] = [
    {
      key: `project:${projectId}`,
      id: projectId,
      label: projectName,
      kind: "project",
      rank: 0,
      x: 0,
      y: 0,
      r: 32,
      fontSize: 13,
      verified: true,
      vouched: false,
      mark: null,
    },
  ];

  for (const topic of topics) {
    const rank = rankOf(topic, byId);
    const hasCards = topic.cards > 0;
    const vouched = topic.vouched;
    const gateVerified = !vouched && hasCards && (topic.gateStatus === null || topic.gateStatus === "verified");
    nodes.push({
      key: `topic:${topic.id}`,
      id: topic.id,
      label: topic.name,
      kind: rank === 1 ? "topic" : "subtopic",
      rank,
      x: 0,
      y: 0,
      r: rank === 1 ? 25 : 17,
      fontSize: rank === 1 ? 12 : 11,
      verified: gateVerified,
      vouched,
      mark: vouched
        ? "confirmed by you, not proven by the code"
        : gateVerified
          ? null
          : hasCards
            ? "cards exist, but the gate did not verify this claim"
          : "no card grounds this topic",
    });
  }

  // An edge can name a topic the server did not return, because a prerequisite
  // may sit outside this project. Drawing it dashed keeps the gap visible;
  // dropping it would quietly redraw the graph as though it were complete.
  const missing = new Set<string>();
  for (const edge of edges) {
    for (const id of [edge.topic, edge.requires]) {
      if (!byId.has(id)) missing.add(id);
    }
  }
  for (const id of [...missing].sort()) {
    nodes.push({
      key: `topic:${id}`,
      id,
      label: id,
      kind: "subtopic",
      rank: MAX_RANK,
      x: 0,
      y: 0,
      r: 15,
      fontSize: 11,
      verified: false,
      vouched: false,
      mark: "named by a prerequisite, not in this project",
    });
  }

  const ranks = new Map<number, GraphNode[]>();
  for (const node of nodes) {
    const row = ranks.get(node.rank) ?? [];
    row.push(node);
    ranks.set(node.rank, row);
  }

  for (const [rank, row] of ranks) {
    row.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
    row.forEach((node, index) => {
      const share = ((index + 1) / (row.length + 1)) * GRAPH_WIDTH;
      const spread = row.length > 1 ? GRAPH_WIDTH * 0.035 : 0;
      node.x = Math.min(
        GRAPH_WIDTH - 64,
        Math.max(64, Math.round(share + wobble(node.id, "x") * spread)),
      );
      node.y = TOP + rank * ROW + Math.round(wobble(node.id, "y") * 12);
    });
  }

  const links: GraphLink[] = [];
  const has = new Set(nodes.map((node) => node.key));
  for (const topic of topics) {
    const parent = topic.parent;
    if (parent !== null && has.has(`topic:${parent}`)) {
      links.push({ from: `topic:${parent}`, to: `topic:${topic.id}` });
    } else {
      links.push({ from: `project:${projectId}`, to: `topic:${topic.id}` });
    }
  }
  for (const edge of edges) {
    links.push({ from: `topic:${edge.requires}`, to: `topic:${edge.topic}` });
  }
  return { nodes, links };
}

/** Which topics sit under this one, used by the detail panel. */
export function descendantsOf(id: string, topics: Topic[]): Topic[] {
  const children = new Map<string, Topic[]>();
  for (const topic of topics) {
    if (topic.parent === null) continue;
    const list = children.get(topic.parent) ?? [];
    list.push(topic);
    children.set(topic.parent, list);
  }
  const found: Topic[] = [];
  const queue = [id];
  const seen = new Set<string>([id]);
  while (queue.length > 0) {
    const next = queue.shift();
    if (next === undefined) break;
    for (const child of children.get(next) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      found.push(child);
      queue.push(child.id);
    }
  }
  return found;
}
