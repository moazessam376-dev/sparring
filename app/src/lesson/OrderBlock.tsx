import { useState } from "react";
import { AnswerState, BlockFrame, BlockLabel } from "./BlockFrame";
import type { BlockProps } from "./registry";
import type { OrderBlock as OrderData } from "./types";

export function OrderBlock({ block, response, busy, onCommit }: BlockProps<OrderData>) {
  const [sequence, setSequence] = useState<number[]>(() => block.steps.map((_, index) => index).reverse());
  const [held, setHeld] = useState<number | null>(null);
  const submitted = response !== null;
  const swap = (index: number) => {
    if (submitted) return;
    if (held === null) { setHeld(index); return; }
    if (held === index) { setHeld(null); return; }
    const next = [...sequence];
    const first = next[held];
    const second = next[index];
    if (first === undefined || second === undefined) return;
    next[held] = second;
    next[index] = first;
    setSequence(next);
    setHeld(null);
  };
  return (
    <BlockFrame>
      <BlockLabel>Ask · order the steps</BlockLabel>
      <h3>{block.ask}</h3>
      <div className="m lesson-footnote">{held === null ? "tap two to swap them" : "now tap where it should go"}</div>
      <div className="lesson-order">{sequence.map((step, index) => <button key={step} type="button" className={held === index ? "on" : ""} disabled={submitted || busy} onClick={() => swap(index)}><span className="m">{index + 1}</span><span>{block.steps[step]}</span><span className="m">{step + 1}</span></button>)}</div>
      {response === null ? <button type="button" className="pill go lesson-submit" disabled={busy} onClick={() => onCommit({ answer: JSON.stringify(sequence) })}>Commit order</button> : <div className="lesson-result"><AnswerState status={response.status} grade={response.grade} />{block.order !== undefined && <span className="m">answer: {block.order.map((item) => item + 1).join(" · ")}</span>}</div>}
    </BlockFrame>
  );
}
