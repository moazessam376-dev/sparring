import type { Grade, LessonBlock } from "./types";
import {
  gradeDeterministic as gradeDeterministicModule,
  isDeterministic as isDeterministicModule,
} from "../../../lesson/grading.mjs";

export function gradeDeterministic(block: LessonBlock, answer: string): Grade {
  return gradeDeterministicModule(block, answer);
}

export function isDeterministic(block: LessonBlock): boolean {
  return isDeterministicModule(block);
}
