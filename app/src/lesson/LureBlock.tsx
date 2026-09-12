import { useState } from "react";
import { AnswerState, BlockFrame, BlockLabel } from "./BlockFrame";
import type { BlockProps } from "./registry";
import type { LureBlock as LureData } from "./types";

export function LureBlock({ block, response, busy, onCommit }: BlockProps<LureData>) {
  const [selected, setSelected] = useState<number | null>(null);
  const submitted = response !== null;
  return (
    <BlockFrame>
      <BlockLabel>Ask · pick the misconception</BlockLabel>
      <h3>{block.ask}</h3>
      <div className="lesson-options">{block.options.map((option, index) => {
        const correct = option.correct === true;
        const chosen = selected === index || (response !== null && response.answer === String(index));
        const colour = submitted && chosen ? (correct ? "var(--accent)" : "var(--danger)") : "var(--hairline)";
        return <div key={option.text}><button type="button" className="lesson-option" disabled={submitted || busy} style={{ borderColor: colour }} onClick={() => setSelected(index)}><span className="lesson-radio" style={{ borderColor: colour, background: submitted && chosen ? colour : "transparent" }} />{option.text}</button>{submitted && !correct && <div className="lesson-why">{option.why}</div>}</div>;
      })}</div>
      {response === null ? <button type="button" className="pill go lesson-submit" disabled={busy || selected === null} onClick={() => onCommit({ answer: String(selected) })}>Commit choice</button> : <div className="lesson-result"><AnswerState status={response.status} grade={response.grade} /></div>}
    </BlockFrame>
  );
}
