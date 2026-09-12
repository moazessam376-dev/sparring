import type { ReactNode } from "react";

export function BlockFrame({ children }: { children: ReactNode }) {
  return <div className="lesson-block panel">{children}</div>;
}

export function BlockLabel({ children }: { children: ReactNode }) {
  return <div className="lbl lesson-block-label">{children}</div>;
}

export function AnswerState({ status, grade }: { status: "awaiting" | "stored" | "graded"; grade: string | null }) {
  const label = status === "awaiting" ? "Awaiting agent grading" : status === "stored" ? "Stored" : grade ?? "Graded";
  const colour = status === "awaiting" ? "var(--warning)" : status === "stored" ? "var(--muted)" : grade === "correct" ? "var(--accent)" : grade === "partial" ? "var(--warning)" : "var(--danger)";
  return <span className="m" style={{ fontSize: 10.5, color: colour }}>{label}</span>;
}
