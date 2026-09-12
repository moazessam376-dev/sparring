/*
 * Everything the interface knows about the local server. The port comes from
 * the sidecar and the token comes from the sidecar: neither is ever written
 * down here, and a request is never made without both.
 */

import { invoke } from "@tauri-apps/api/core";

export class ApiError extends Error {}

export type SidecarStatus = {
  running: boolean;
  port: number | null;
  error: string | null;
};

export type Connection = { port: number; token: string };

/* ---------- narrowing, so that no response is trusted on its shape ---------- */

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ApiError(`${what} was not an object`);
  }
  return value as Record<string, unknown>;
}

function asList(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) throw new ApiError(`${what} was not a list`);
  return value;
}

function asText(value: unknown, what: string): string {
  if (typeof value !== "string") throw new ApiError(`${what} was not text`);
  return value;
}

function asOptionalText(value: unknown, what: string): string | null {
  if (value === null || value === undefined) return null;
  return asText(value, what);
}

function asNumber(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ApiError(`${what} was not a number`);
  }
  return value;
}

function asOptionalNumber(value: unknown, what: string): number | null {
  if (value === null || value === undefined) return null;
  return asNumber(value, what);
}

// contexts and source are stored as JSON documents and come back as text on
// the queue rows, which read the cards table directly.
function asTextList(value: unknown, what: string): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "string") {
    try {
      return asTextList(JSON.parse(value) as unknown, what);
    } catch {
      return [];
    }
  }
  return asList(value, what).map((item, index) => asText(item, `${what}[${index}]`));
}

/* ---------- the connection ---------- */

export async function readStatus(): Promise<SidecarStatus> {
  const raw = asRecord(await invoke("sidecar_status"), "sidecar_status");
  return {
    running: raw.running === true,
    port: asOptionalNumber(raw.port, "sidecar port"),
    error: asOptionalText(raw.error, "sidecar error"),
  };
}

export async function readStateDirectory(): Promise<string> {
  return asText(await invoke("state_dir"), "state_dir");
}

let cachedToken: string | null = null;

async function token(): Promise<string> {
  if (cachedToken !== null) return cachedToken;
  const value = asText(await invoke("sidecar_token"), "sidecar_token").trim();
  if (value === "") throw new ApiError("The server token is empty.");
  cachedToken = value;
  return value;
}

// A dev-only escape hatch so the interface can be driven in a browser during
// verification, where there is no Tauri IPC to ask. It never reaches a release
// build: import.meta.env.DEV is false there and the branch is dropped.
function developmentConnection(): Connection | null {
  if (!import.meta.env.DEV) return null;
  const port = Number(import.meta.env.VITE_SPARRING_PORT);
  const value = import.meta.env.VITE_SPARRING_TOKEN;
  if (!Number.isInteger(port) || port <= 0 || typeof value !== "string" || value === "") return null;
  return { port, token: value };
}

export async function connect(port: number): Promise<Connection> {
  try {
    return { port, token: await token() };
  } catch (error) {
    const fallback = developmentConnection();
    if (fallback !== null) return fallback;
    throw error;
  }
}

export function developmentStatus(): SidecarStatus | null {
  const fallback = developmentConnection();
  if (fallback === null) return null;
  return { running: true, port: fallback.port, error: null };
}

async function request(
  connection: Connection,
  path: string,
  init?: { method: "POST"; body: unknown },
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:${connection.port}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${connection.token}`,
        ...(init === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(init === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  } catch (error) {
    cachedToken = null;
    throw new ApiError(
      `The local server did not answer ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text !== "") {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw new ApiError(`The local server answered ${path} with something that was not JSON.`);
    }
  }

  if (!response.ok) {
    if (response.status === 401) cachedToken = null;
    const message =
      typeof payload === "object" && payload !== null && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `HTTP ${response.status}`;
    throw new ApiError(`${path} failed: ${message}`);
  }
  return payload;
}

/* ---------- the routes ---------- */

export type Health = { ok: boolean; version: number; node: string };

export async function health(connection: Connection): Promise<Health> {
  const raw = asRecord(await request(connection, "/api/health"), "health");
  return {
    ok: raw.ok === true,
    version: asNumber(raw.version, "health version"),
    node: asText(raw.node, "health node"),
  };
}

export type Project = {
  id: string;
  name: string;
  remote: string | null;
  added: string;
  due: number;
  cards: number;
};

export async function projects(connection: Connection): Promise<Project[]> {
  return asList(await request(connection, "/api/projects"), "projects").map((item, index) => {
    const raw = asRecord(item, `project ${index}`);
    return {
      id: asText(raw.id, "project id"),
      name: asText(raw.name, "project name"),
      remote: asOptionalText(raw.remote, "project remote"),
      added: asText(raw.added, "project added"),
      due: asNumber(raw.due, "project due"),
      cards: asNumber(raw.cards, "project cards"),
    };
  });
}

export type TopicKind = "technology" | "concept" | "skill";

export type Topic = {
  id: string;
  name: string;
  parent: string | null;
  kind: TopicKind;
  cards: number;
  score: number;
  confidence: number;
};

export type TopicEdge = { topic: string; requires: string };

export type TopicGraph = { topics: Topic[]; edges: TopicEdge[] };

function asKind(value: unknown): TopicKind {
  const kind = asText(value, "topic kind");
  if (kind === "technology" || kind === "concept" || kind === "skill") return kind;
  throw new ApiError(`topic kind was ${kind}`);
}

export async function topics(connection: Connection, project: string | null): Promise<TopicGraph> {
  const query = project === null ? "" : `?project=${encodeURIComponent(project)}`;
  const raw = asRecord(await request(connection, `/api/topics${query}`), "topics");
  return {
    topics: asList(raw.topics, "topics").map((item, index) => {
      const topic = asRecord(item, `topic ${index}`);
      return {
        id: asText(topic.id, "topic id"),
        name: asText(topic.name, "topic name"),
        parent: asOptionalText(topic.parent, "topic parent"),
        kind: asKind(topic.kind),
        cards: asNumber(topic.cards, "topic cards"),
        score: asNumber(topic.score, "topic score"),
        confidence: asNumber(topic.confidence, "topic confidence"),
      };
    }),
    edges: asList(raw.edges, "topic edges").map((item, index) => {
      const edge = asRecord(item, `edge ${index}`);
      return {
        topic: asText(edge.topic, "edge topic"),
        requires: asText(edge.requires, "edge requires"),
      };
    }),
  };
}

export type Grade = "correct" | "partial" | "wrong";

/**
 * One card as the queue hands it over. There is no rubric and no grounding on
 * this shape, and that is the point: the queue route strips the rubric and
 * never joins the grounding table, so nothing on this screen can reveal them.
 */
export type QueueCard = {
  id: string;
  project: string;
  concept: string;
  ask: string;
  altitude: string;
  contexts: string[];
  due: string | null;
  reps: number;
  lapses: number;
  lastGrade: Grade | null;
};

function asGrade(value: unknown, what: string): Grade | null {
  const grade = asOptionalText(value, what);
  if (grade === null) return null;
  if (grade === "correct" || grade === "partial" || grade === "wrong") return grade;
  throw new ApiError(`${what} was ${grade}`);
}

export async function due(connection: Connection, n: number): Promise<QueueCard[]> {
  return asList(await request(connection, `/api/due?n=${n}`), "due").map((item, index) => {
    const raw = asRecord(item, `due card ${index}`);
    if ("rubric" in raw) {
      // The queue must never carry a rubric. If a future server change puts one
      // here, refuse the payload rather than render it.
      throw new ApiError("The queue carried a rubric, which must not be revealed before an answer.");
    }
    return {
      id: asText(raw.id, "card id"),
      project: asText(raw.project, "card project"),
      concept: asText(raw.concept, "card concept"),
      ask: asText(raw.ask, "card ask"),
      altitude: asText(raw.altitude, "card altitude"),
      contexts: asTextList(raw.contexts, "card contexts"),
      due: asOptionalText(raw.due, "card due"),
      reps: asOptionalNumber(raw.reps, "card reps") ?? 0,
      lapses: asOptionalNumber(raw.lapses, "card lapses") ?? 0,
      lastGrade: asGrade(raw.last_grade, "card last grade"),
    };
  });
}

export type Grounding = { path: string; line: number; commit: string | null };

/** The full card, rubric included. Only ever fetched after a commitment. */
export type CardDetail = {
  id: string;
  project: string;
  concept: string;
  ask: string;
  rubric: string[];
  altitude: string;
  grounding: Grounding[];
  topics: string[];
};

export async function card(connection: Connection, id: string): Promise<CardDetail> {
  const raw = asRecord(await request(connection, `/api/card/${encodeURIComponent(id)}`), "card");
  return {
    id: asText(raw.id, "card id"),
    project: asText(raw.project, "card project"),
    concept: asText(raw.concept, "card concept"),
    ask: asText(raw.ask, "card ask"),
    rubric: asTextList(raw.rubric, "card rubric"),
    altitude: asText(raw.altitude, "card altitude"),
    grounding: asList(raw.grounding, "card grounding").map((item, index) => {
      const ground = asRecord(item, `grounding ${index}`);
      return {
        path: asText(ground.path, "grounding path"),
        line: asNumber(ground.line, "grounding line"),
        commit: asOptionalText(ground.commit, "grounding commit"),
      };
    }),
    topics: asList(raw.topics, "card topics").map((item, index) => asText(item, `card topic ${index}`)),
  };
}

export type Schedule = {
  due: string | null;
  reps: number;
  lapses: number;
  stability: number | null;
};

export type Attempt = { card: string; grade: Grade; question: string; context: string | null; answer: string };

export async function recordAttempt(connection: Connection, attempt: Attempt): Promise<Schedule | null> {
  const payload = await request(connection, "/api/attempt", {
    method: "POST",
    body: { ...attempt, mode: "drill" },
  });
  if (payload === null || payload === undefined) return null;
  const raw = asRecord(payload, "attempt");
  return {
    due: asOptionalText(raw.due, "schedule due"),
    reps: asOptionalNumber(raw.reps, "schedule reps") ?? 0,
    lapses: asOptionalNumber(raw.lapses, "schedule lapses") ?? 0,
    stability: asOptionalNumber(raw.stability, "schedule stability"),
  };
}

export async function contestGrade(
  connection: Connection,
  attempt: string,
  userGrade: Grade,
): Promise<void> {
  await request(connection, "/api/contest", { method: "POST", body: { attempt, userGrade } });
}

export type StandingTopic = {
  topic: string;
  score: number;
  confidence: number;
  cards: number;
  attempts: number;
};

export async function standing(connection: Connection, project: string): Promise<StandingTopic[]> {
  const raw = asRecord(
    await request(connection, `/api/standing?project=${encodeURIComponent(project)}`),
    "standing",
  );
  return asList(raw.topics, "standing topics").map((item, index) => {
    const topic = asRecord(item, `standing topic ${index}`);
    return {
      topic: asText(topic.topic, "standing topic id"),
      score: asNumber(topic.score, "standing score"),
      confidence: asNumber(topic.confidence, "standing confidence"),
      cards: asNumber(topic.cards, "standing cards"),
      attempts: asNumber(topic.attempts, "standing attempts"),
    };
  });
}

export type GapAttempt = { id: string; card: string; at: string; grade: Grade };

/**
 * Recent wrong and partial attempts, grouped by topic. This is the only route
 * that returns an attempt identifier, so it is how a grade just recorded is
 * found again in order to contest it.
 */
export async function gaps(connection: Connection, days: number): Promise<GapAttempt[]> {
  const groups = asList(await request(connection, `/api/gaps?days=${days}`), "gaps");
  const attempts: GapAttempt[] = [];
  for (const group of groups) {
    const raw = asRecord(group, "gap group");
    for (const item of asList(raw.attempts, "gap attempts")) {
      const attempt = asRecord(item, "gap attempt");
      const grade = asGrade(attempt.grade, "gap grade");
      if (grade === null) continue;
      attempts.push({
        id: asText(attempt.id, "gap attempt id"),
        card: asText(attempt.card, "gap attempt card"),
        at: asText(attempt.at, "gap attempt at"),
        grade,
      });
    }
  }
  return attempts;
}
