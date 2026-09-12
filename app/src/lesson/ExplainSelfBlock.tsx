import { useState } from "react";
import { AnswerState, BlockFrame, BlockLabel } from "./BlockFrame";
import type { BlockProps } from "./registry";
import type { ExplainSelfBlock as ExplainData } from "./types";

export function ExplainSelfBlock({ block, response, busy, onCommit }: BlockProps<ExplainData>) {
  const [value, setValue] = useState("");
  return (
    <BlockFrame>
      <BlockLabel>Ask · self-explanation</BlockLabel>
      <h3>{block.prompt}</h3>
      {response === null ? <textarea rows={4} value={value} onChange={(event) => setValue(event.target.value)} placeholder="Explain it in your own words." /> : <div className="panel lesson-answer">{response.answer}</div>}
      {response === null ? <button type="button" className="pill go lesson-submit" disabled={busy || value.trim() === ""} onClick={() => onCommit({ answer: value.trim(), stored: true })}>Store explanation</button> : <div className="lesson-result"><AnswerState status="stored" grade={null} /><span>Self-explanations are kept, never graded.</span></div>}
    </BlockFrame>
  );
}
