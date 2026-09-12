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

export async function readSkillResourceDirectory(): Promise<string> {
  return asText(await invoke("skill_resource_dir"), "skill_resource_dir");
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
  gateStatus: string | null;
  vouched: boolean;
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
        gateStatus: asOptionalText(topic.gateStatus, "topic gate status"),
        vouched: topic.vouched === true,
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

export type VouchResult = {
  claim: string;
  status: "vouched";
  gateStatus: string | null;
  judgement: string | null;
  at: string | null;
};

export type ClaimForVouch = {
  id: string;
  type: string;
  status: Exclude<ClaimStatus, "vouched">;
  sentence: string;
  path: string | null;
  fromLine: number | null;
  toLine: number | null;
  commit: string | null;
  spanHash: string | null;
  extractor: string;
  unresolved: unknown[];
  coverage: string[];
  boundary: unknown;
  ends: unknown;
  enforcement: unknown;
  falsifier: unknown;
  constraintKind: string | null;
  identifiers: unknown;
  predicate: string | null;
};

function asGateClaimStatus(value: unknown): Exclude<ClaimStatus, "vouched"> {
  const status = asClaimStatus(value);
  if (status === "vouched") throw new ApiError("the embedded gate claim was vouched");
  return status;
}

function asClaimForVouch(value: unknown, fallback: Record<string, unknown>): ClaimForVouch {
  const raw = value === undefined || value === null
    ? { ...fallback, status: fallback.gateStatus ?? fallback.status }
    : asRecord(value, "claim evidence");
  return {
    id: asText(raw.id, "claim evidence id"),
    type: asText(raw.type, "claim evidence type"),
    status: asGateClaimStatus(raw.status),
    sentence: asText(raw.sentence, "claim evidence sentence"),
    path: asOptionalText(raw.path, "claim evidence path"),
    fromLine: asOptionalNumber(raw.fromLine, "claim evidence fromLine"),
    toLine: asOptionalNumber(raw.toLine, "claim evidence toLine"),
    commit: asOptionalText(raw.commit, "claim evidence commit"),
    spanHash: asOptionalText(raw.spanHash, "claim evidence spanHash"),
    extractor: asText(raw.extractor, "claim evidence extractor"),
    unresolved: asList(raw.unresolved ?? [], "claim evidence unresolved"),
    coverage: asTextList(raw.coverage ?? [], "claim evidence coverage"),
    boundary: raw.boundary ?? null,
    ends: raw.ends ?? null,
    enforcement: raw.enforcement ?? null,
    falsifier: raw.falsifier ?? null,
    constraintKind: asOptionalText(raw.constraintKind, "claim evidence constraintKind"),
    identifiers: raw.identifiers ?? null,
    predicate: asOptionalText(raw.predicate, "claim evidence predicate"),
  };
}

export async function vouchClaim(
  connection: Connection,
  repo: string,
  claimId: string,
  judgement: string,
): Promise<VouchResult> {
  const raw = asRecord(
    await request(connection, "/api/vouch", { method: "POST", body: { repo, claimId, judgement } }),
    "vouch",
  );
  const status = asText(raw.status, "vouch status");
  if (status !== "vouched") throw new ApiError(`vouch status was ${status}`);
  return {
    claim: asText(raw.claim, "vouch claim"),
    status,
    gateStatus: asOptionalText(raw.gateStatus, "vouch gate status"),
    judgement: asOptionalText(raw.judgement, "vouch judgement"),
    at: asOptionalText(raw.at, "vouch at"),
  };
}

export async function withdrawClaimVouch(connection: Connection, claim: string): Promise<void> {
  await request(connection, "/api/vouch/withdraw", { method: "POST", body: { claim } });
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

/* ---------- connecting an agent ---------- */

/** The one address an agent is given. The token never goes in it. */
export function mcpEndpoint(connection: Connection): string {
  return `http://127.0.0.1:${connection.port}/mcp`;
}

export type AgentPresence = { connected: boolean; lastSeen: string | null; windowSeconds: number };

export async function agentPresence(connection: Connection): Promise<AgentPresence> {
  const raw = asRecord(await request(connection, "/api/agent"), "agent");
  return {
    connected: raw.connected === true,
    lastSeen: asOptionalText(raw.lastSeen, "agent lastSeen"),
    windowSeconds: asOptionalNumber(raw.windowSeconds, "agent window") ?? 120,
  };
}

/* ---------- the survey ---------- */

export type Repository = {
  path: string;
  exists: boolean;
  git: boolean;
  root: string | null;
  name: string;
  head: string | null;
  files: number;
  language: string | null;
};

function asRepository(value: unknown): Repository {
  const raw = asRecord(value, "repository");
  return {
    path: asText(raw.path, "repository path"),
    exists: raw.exists === true,
    git: raw.git === true,
    root: asOptionalText(raw.root, "repository root"),
    name: asText(raw.name, "repository name"),
    head: asOptionalText(raw.head, "repository head"),
    files: asOptionalNumber(raw.files, "repository files") ?? 0,
    language: asOptionalText(raw.language, "repository language"),
  };
}

export async function repository(connection: Connection, path: string): Promise<Repository> {
  return asRepository(await request(connection, `/api/repository?path=${encodeURIComponent(path)}`));
}

export const CLAIM_STATUSES = ["verified", "inferred", "stale", "unchecked", "contradicted", "vouched"] as const;

export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

function asClaimStatus(value: unknown): ClaimStatus {
  const status = asText(value, "claim status");
  const found = CLAIM_STATUSES.find((candidate) => candidate === status);
  if (found === undefined) throw new ApiError(`claim status was ${status}`);
  return found;
}

export type ClaimReason = { check: string; status: string; detail: string };

export type SurveyClaim = {
  id: string;
  type: string;
  status: ClaimStatus;
  gateStatus: Exclude<ClaimStatus, "vouched"> | null;
  vouched: boolean;
  judgement: string | null;
  vouchedAt: string | null;
  declaredStatus: string | null;
  name: string;
  sentence: string;
  path: string | null;
  fromLine: number | null;
  toLine: number | null;
  reasons: ClaimReason[];
  claim: ClaimForVouch;
};

export type Coverage = {
  inspected: number;
  excluded: number;
  generated: number;
  binary: number;
  unresolved: number;
  pending: number;
};

export type SurveySummary = {
  commit: string | null;
  claims: number;
  shownAsFact: number;
  shownQualified: number;
  dropped: number;
  trackedFiles: number;
};

export type SeedTopic = {
  claim: string;
  topic: string;
  name: string;
  parent: string | null;
  kind: TopicKind;
  project: string;
  gateStatus: Exclude<ClaimStatus, "vouched">;
};

export type SeedCard = {
  claim: string;
  id: string;
  project: string;
  concept: string;
  ask: string;
  rubric: string[];
  altitude: string;
  topics: string[];
  grounding: Grounding[];
};

export type Seed = { project: string; topics: SeedTopic[]; cards: SeedCard[] };

export type SurveyView = {
  repo: string;
  repository: Repository;
  survey: {
    at: string | null;
    summary: SurveySummary;
    coverage: Coverage | null;
    claims: SurveyClaim[];
  } | null;
  seed: Seed | null;
};

function asCoverage(value: unknown): Coverage | null {
  if (value === null || value === undefined) return null;
  const raw = asRecord(value, "coverage");
  const count = (name: keyof Coverage): number => asOptionalNumber(raw[name], `coverage ${name}`) ?? 0;
  return {
    inspected: count("inspected"),
    excluded: count("excluded"),
    generated: count("generated"),
    binary: count("binary"),
    unresolved: count("unresolved"),
    pending: count("pending"),
  };
}

function asSeed(value: unknown): Seed | null {
  if (value === null || value === undefined) return null;
  const raw = asRecord(value, "seed");
  return {
    project: asText(raw.project, "seed project"),
    topics: asList(raw.topics, "seed topics").map((item, index) => {
      const topic = asRecord(item, `seed topic ${index}`);
      return {
        claim: asText(topic.claim, "seed topic claim"),
        topic: asText(topic.topic, "seed topic id"),
        name: asText(topic.name, "seed topic name"),
        parent: asOptionalText(topic.parent, "seed topic parent"),
        kind: asKind(topic.kind),
        project: asText(topic.project, "seed topic project"),
        gateStatus: asGateClaimStatus(topic.gateStatus),
      };
    }),
    cards: asList(raw.cards, "seed cards").map((item, index) => {
      const card = asRecord(item, `seed card ${index}`);
      return {
        claim: asText(card.claim, "seed card claim"),
        id: asText(card.id, "seed card id"),
        project: asText(card.project, "seed card project"),
        concept: asText(card.concept, "seed card concept"),
        ask: asText(card.ask, "seed card ask"),
        rubric: asList(card.rubric, "seed card rubric").map((line, at) => asText(line, `rubric ${at}`)),
        altitude: asText(card.altitude, "seed card altitude"),
        topics: asList(card.topics, "seed card topics").map((topic, at) => asText(topic, `card topic ${at}`)),
        grounding: asList(card.grounding, "seed card grounding").map((ground, at) => {
          const where = asRecord(ground, `grounding ${at}`);
          return {
            path: asText(where.path, "grounding path"),
            line: asNumber(where.line, "grounding line"),
            commit: asOptionalText(where.commit, "grounding commit"),
          };
        }),
      };
    }),
  };
}

export async function surveyOf(connection: Connection, repo: string): Promise<SurveyView> {
  const raw = asRecord(await request(connection, `/api/survey?repo=${encodeURIComponent(repo)}`), "survey");
  const survey = raw.survey;
  return {
    repo: asText(raw.repo, "survey repo"),
    repository: asRepository(raw.repository),
    survey:
      survey === null || survey === undefined
        ? null
        : (() => {
            const found = asRecord(survey, "survey body");
            const summary = asRecord(found.summary, "survey summary");
            return {
              at: asOptionalText(found.at, "survey at"),
              summary: {
                commit: asOptionalText(summary.commit, "survey commit"),
                claims: asOptionalNumber(summary.claims, "survey claims") ?? 0,
                shownAsFact: asOptionalNumber(summary.shownAsFact, "survey shownAsFact") ?? 0,
                shownQualified: asOptionalNumber(summary.shownQualified, "survey shownQualified") ?? 0,
                dropped: asOptionalNumber(summary.dropped, "survey dropped") ?? 0,
                trackedFiles: asOptionalNumber(summary.trackedFiles, "survey trackedFiles") ?? 0,
              },
              coverage: asCoverage(found.coverage),
              claims: asList(found.claims, "survey claims").map((item, index) => {
                const claim = asRecord(item, `claim ${index}`);
                return {
                  id: asText(claim.id, "claim id"),
                  type: asText(claim.type, "claim type"),
                  status: asClaimStatus(claim.status),
                  gateStatus: claim.gateStatus === null || claim.gateStatus === undefined
                    ? null
                    : asGateClaimStatus(claim.gateStatus),
                  vouched: claim.vouched === true,
                  judgement: asOptionalText(claim.judgement, "claim judgement"),
                  vouchedAt: asOptionalText(claim.vouchedAt, "claim vouchedAt"),
                  declaredStatus: asOptionalText(claim.declaredStatus, "claim declared status"),
                  name: asText(claim.name, "claim name"),
                  sentence: asText(claim.sentence, "claim sentence"),
                  path: asOptionalText(claim.path, "claim path"),
                  fromLine: asOptionalNumber(claim.fromLine, "claim fromLine"),
                  toLine: asOptionalNumber(claim.toLine, "claim toLine"),
                  reasons: asList(claim.reasons, "claim reasons").map((reason, at) => {
                    const line = asRecord(reason, `reason ${at}`);
                    return {
                      check: asText(line.check, "reason check"),
                      status: asText(line.status, "reason status"),
                      detail: asText(line.detail, "reason detail"),
                    };
                  }),
                  claim: asClaimForVouch(claim.claim, claim),
                };
              }),
            };
          })(),
    seed: asSeed(raw.seed),
  };
}

export type SurveyedRepository = { repo: string; commit: string | null; at: string | null; claims: number };

export async function surveys(connection: Connection): Promise<SurveyedRepository[]> {
  return asList(await request(connection, "/api/surveys"), "surveys").map((item, index) => {
    const raw = asRecord(item, `survey ${index}`);
    return {
      repo: asText(raw.repo, "survey repo"),
      commit: asOptionalText(raw.commit, "survey commit"),
      at: asOptionalText(raw.at, "survey at"),
      claims: asOptionalNumber(raw.claims, "survey claims") ?? 0,
    };
  });
}

/* ---------- writing a confirmed survey through the ordinary routes ---------- */

export async function createProject(
  connection: Connection,
  project: { project: string; name: string; remote: string | null },
): Promise<void> {
  await request(connection, "/api/projects", { method: "POST", body: project });
}

export async function createTopics(connection: Connection, entries: SeedTopic[]): Promise<number> {
  const payload = entries.map((entry) => ({
    topic: entry.topic,
    claim: entry.claim,
    name: entry.name,
    parent: entry.parent,
    kind: entry.kind,
    project: entry.project,
    gateStatus: entry.gateStatus,
  }));
  const answer = await request(connection, "/api/topics", { method: "POST", body: payload });
  return asNumber(answer, "topics added");
}

export async function createCards(connection: Connection, cards: SeedCard[]): Promise<string[]> {
  const payload = cards.map((card) => ({
    id: card.id,
    project: card.project,
    concept: card.concept,
    ask: card.ask,
    rubric: card.rubric,
    altitude: card.altitude,
    topics: card.topics,
    grounding: card.grounding,
    source: { type: "survey", ref: card.claim },
  }));
  const answer = await request(connection, "/api/cards", { method: "POST", body: payload });
  return asList(answer, "cards added").map((item, index) => asText(item, `card id ${index}`));
}

/* ---------- the window itself ---------- */

/**
 * Which window conventions this build runs under. macOS keeps its decorations
 * and overlays the real traffic lights on the left; Windows and Linux keep the
 * frameless window and the interface draws its own controls on the right.
 */
export type WindowChrome = { platform: string; overlayTitleBar: boolean; drawsOwnControls: boolean };

export async function readWindowChrome(): Promise<WindowChrome> {
  const raw = asRecord(await invoke("window_chrome"), "window_chrome");
  return {
    platform: asText(raw.platform, "window platform"),
    overlayTitleBar: raw.overlayTitleBar === true,
    drawsOwnControls: raw.drawsOwnControls === true,
  };
}
