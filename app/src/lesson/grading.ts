import type { Grade, LessonBlock } from "./types";

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function parsed<T>(value: string): T | null {
  try { return JSON.parse(value) as T; } catch { return null; }
}

export function gradeDeterministic(block: LessonBlock, answer: string): Grade {
  if (block.type === "recall") {
    const accepted = block.accept ?? (block.answer === undefined ? [] : [block.answer]);
    return accepted.some((item) => normalize(item) === normalize(answer)) ? "correct" : "wrong";
  }
  if (block.type === "lure") {
    const index = Number(answer);
    return Number.isInteger(index) && block.options[index]?.correct === true ? "correct" : "wrong";
  }
  if (block.type === "order") {
    const value = parsed<number[]>(answer);
    return value !== null && value.length === block.order?.length && value.every((item, index) => item === block.order?.[index]) ? "correct" : "wrong";
  }
  if (block.type === "blank") {
    const value = parsed<string[]>(answer);
    return value !== null && value.length === block.blanks.length && value.every((item, index) => normalize(item) === normalize(block.blanks[index]?.answer ?? "")) ? "correct" : "wrong";
  }
  if (block.type === "place") {
    const value = parsed<Record<string, string>>(answer);
    return value !== null && block.place.every((item) => item.target !== undefined && value[item.label] === item.target) ? "correct" : "wrong";
  }
  return "wrong";
}

export function isDeterministic(block: LessonBlock): boolean {
  return block.type === "recall" || block.type === "lure" || block.type === "order" || block.type === "blank" || block.type === "place";
}
