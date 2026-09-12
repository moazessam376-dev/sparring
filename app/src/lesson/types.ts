export type Grade = "correct" | "partial" | "wrong";

export type Grounding = { path: string; line: number; commit: string | null };

export type ProseBlock = { type: "prose"; heading: string; body: string; names: string[] };
export type DiagramNode = { id: string; label: string; sub: string; focal: boolean };
export type DiagramEdge = { from: string; to: string; label: string };
export type DiagramBlock = { type: "diagram"; nodes: DiagramNode[]; edges: DiagramEdge[]; caption: string };
export type TraceStep = { text: string; file: string; line: number };
export type TraceBlock = { type: "trace"; steps: TraceStep[]; commit: string };
export type TerminalLine = { cmd: string; out: string };
export type TerminalBlock = { type: "terminal"; lines: TerminalLine[]; cwd: string };
export type ShortBlock = {
  type: "short";
  ask: string;
  rubric?: string[];
  grounding?: Grounding;
};
export type CodeBlock = {
  type: "code";
  ask: string;
  languages: string[];
  starter: string;
  reviewAgainst?: { path: string; line: number };
};
export type RecallBlock = { type: "recall"; situation: string; answer?: string; accept?: string[] };
export type LureOption = { text: string; correct?: boolean; why?: string };
export type LureBlock = { type: "lure"; ask: string; options: LureOption[] };
export type OrderBlock = { type: "order"; ask: string; steps: string[]; order?: number[] };
export type BlankItem = { at: number; answer?: string; distractors?: string[] };
export type BlankBlock = { type: "blank"; snippet: string; blanks: BlankItem[]; file?: { path: string; line: number } };
export type PlaceItem = { label: string; target?: string };
export type PlaceBlock = { type: "place"; diagram: string; place: PlaceItem[] };
export type ExplainSelfBlock = { type: "explainself"; prompt: string };
export type SchemaBlock = { type: "schema"; columns: string[]; rows: string[][]; highlight: number[] };
export type TimelineEvent = { at: number; label: string; lane: string };
export type TimelineBlock = { type: "timeline"; events: TimelineEvent[]; unit: string };
export type ReqResBlock = { type: "reqres"; request: Record<string, unknown>; response: Record<string, unknown>; focus: string };

export type LessonBlock =
  | ProseBlock
  | DiagramBlock
  | TraceBlock
  | TerminalBlock
  | ShortBlock
  | CodeBlock
  | RecallBlock
  | LureBlock
  | OrderBlock
  | BlankBlock
  | PlaceBlock
  | ExplainSelfBlock
  | SchemaBlock
  | TimelineBlock
  | ReqResBlock;

export type LessonSummary = {
  id: string;
  project: string;
  title: string;
  topics: string[];
  blocks: number;
  gradable: number;
  blockCount: number;
  gradableCount: number;
  created: string;
};

export type LessonDocument = Omit<LessonSummary, "blocks"> & { blocks: LessonBlock[] };

export type LessonAnswer = {
  id: string;
  run: string;
  lesson: string;
  block: number;
  card: string | null;
  answer: string;
  status: "awaiting" | "stored" | "graded";
  grade: Grade | null;
  feedback: string | null;
  at: string;
  updatedAt: string;
};

export type LessonRun = {
  id: string;
  lesson: string;
  at: string;
  completed: boolean;
  stoppedAtBlock: number | null;
  answers: LessonAnswer[];
};

export type LessonCommit = {
  answer: string;
  grade?: Grade;
  stored?: boolean;
  card?: string | null;
  gap?: string | null;
  feedback?: string | null;
};
