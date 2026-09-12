import { useState } from "react";
import { AnswerState, BlockFrame, BlockLabel } from "./BlockFrame";
import type { BlockProps } from "./registry";
import type { RecallBlock as RecallData } from "./types";

export function RecallBlock({ block, response, busy, onCommit }: BlockProps<RecallData>) {
  const [value, setValue] = useState("");
  return (
    <BlockFrame>
      <BlockLabel>Ask · exact recall</BlockLabel>
      <h3>{block.situation}</h3>
      {response === null ? <div className="lesson-inline-form"><input value={value} onChange={(event) => setValue(event.target.value)} placeholder="Type the exact string" /><button type="button" className="pill go" disabled={busy || value.trim() === ""} onClick={() => onCommit({ answer: value.trim() })}>Check</button></div> : <div className="lesson-result"><div className="panel lesson-answer">{response.answer}</div><AnswerState status={response.status} grade={response.grade} />{block.answer !== undefined && <div className="m lesson-footnote">accepted: {block.accept?.join(" · ") ?? block.answer}</div>}</div>}
    </BlockFrame>
  );
}
