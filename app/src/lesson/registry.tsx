import { createElement, type ComponentType, type ReactNode } from "react";
import { BlankBlock } from "./BlankBlock";
import { CodeBlock } from "./CodeBlock";
import { DiagramBlock } from "./DiagramBlock";
import { ExplainSelfBlock } from "./ExplainSelfBlock";
import { LureBlock } from "./LureBlock";
import { OrderBlock } from "./OrderBlock";
import { PlaceBlock } from "./PlaceBlock";
import { ProseBlock } from "./ProseBlock";
import { RecallBlock } from "./RecallBlock";
import { ReqResBlock } from "./ReqResBlock";
import { SchemaBlock } from "./SchemaBlock";
import { ShortBlock } from "./ShortBlock";
import { TerminalBlock } from "./TerminalBlock";
import { TimelineBlock } from "./TimelineBlock";
import { TraceBlock } from "./TraceBlock";
import type { Grade, LessonAnswer, LessonBlock } from "./types";

export type LessonCommit = {
  answer: string;
  grade?: Grade;
  stored?: boolean;
  card?: string | null;
  gap?: string | null;
  feedback?: string | null;
};

export type SharedBlockProps = {
  response: LessonAnswer | null;
  busy: boolean;
  lessonBlocks: LessonBlock[];
  onCommit: (commit: LessonCommit) => void;
};

export type BlockProps<B extends LessonBlock> = SharedBlockProps & { block: B };

type ComponentMap = {
  [K in LessonBlock["type"]]: ComponentType<BlockProps<Extract<LessonBlock, { type: K }>>>;
};

export const lessonComponents = {
  prose: ProseBlock,
  diagram: DiagramBlock,
  trace: TraceBlock,
  terminal: TerminalBlock,
  short: ShortBlock,
  code: CodeBlock,
  recall: RecallBlock,
  lure: LureBlock,
  order: OrderBlock,
  blank: BlankBlock,
  place: PlaceBlock,
  explainself: ExplainSelfBlock,
  schema: SchemaBlock,
  timeline: TimelineBlock,
  reqres: ReqResBlock,
} satisfies ComponentMap;

export function renderLessonBlock(block: LessonBlock, props: SharedBlockProps): ReactNode {
  switch (block.type) {
    case "prose": return createElement(lessonComponents.prose, { ...props, block });
    case "diagram": return createElement(lessonComponents.diagram, { ...props, block });
    case "trace": return createElement(lessonComponents.trace, { ...props, block });
    case "terminal": return createElement(lessonComponents.terminal, { ...props, block });
    case "short": return createElement(lessonComponents.short, { ...props, block });
    case "code": return createElement(lessonComponents.code, { ...props, block });
    case "recall": return createElement(lessonComponents.recall, { ...props, block });
    case "lure": return createElement(lessonComponents.lure, { ...props, block });
    case "order": return createElement(lessonComponents.order, { ...props, block });
    case "blank": return createElement(lessonComponents.blank, { ...props, block });
    case "place": return createElement(lessonComponents.place, { ...props, block });
    case "explainself": return createElement(lessonComponents.explainself, { ...props, block });
    case "schema": return createElement(lessonComponents.schema, { ...props, block });
    case "timeline": return createElement(lessonComponents.timeline, { ...props, block });
    case "reqres": return createElement(lessonComponents.reqres, { ...props, block });
  }
}
