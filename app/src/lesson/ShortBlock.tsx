import { useState } from "react";
import { AnswerState, BlockFrame, BlockLabel } from "./BlockFrame";
import type { BlockProps } from "./registry";
import type { ShortBlock as ShortData } from "./types";

export function ShortBlock({ block, response, busy, onCommit }: BlockProps<ShortData>) {
  const [value, setValue] = useState("");
  return (
    <BlockFrame>
      <BlockLabel>Ask · {response === null ? "commit before reveal" : "answer reviewed"}</BlockLabel>
      <h3>{block.ask}</h3>
      {response === null ? <textarea rows={5} value={value} onChange={(event) => setValue(event.target.value)} placeholder="Answer in your own words." /> : <div className="panel lesson-answer">{response.answer}</div>}
      {response === null ? <button type="button" className="pill go lesson-submit" disabled={busy || value.trim() === ""} onClick={() => onCommit({ answer: value.trim() })}>Commit answer</button> : <div className="lesson-result"><AnswerState status={response.status} grade={response.grade} />{response.feedback !== null && <span>{response.feedback}</span>}{block.rubric !== undefined && <div className="lesson-rubric">{block.rubric.map((line) => <div key={line}>{line}</div>)}</div>}</div>}
    </BlockFrame>
  );
}
