import { useState } from "react";
import { BlockFrame, BlockLabel } from "./BlockFrame";
import type { BlockProps } from "./registry";
import type { TraceBlock as TraceData } from "./types";

export function TraceBlock({ block }: BlockProps<TraceData>) {
  const [selected, setSelected] = useState(0);
  return (
    <BlockFrame>
      <BlockLabel>Explain · worked trace</BlockLabel>
      <div className="lesson-trace">
        {block.steps.map((step, index) => (
          <button key={`${step.file}:${step.line}`} type="button" className={selected === index ? "on" : ""} onClick={() => setSelected(index)}>
            <span className="m">{String(index + 1).padStart(2, "0")}</span>
            <span>{step.text}</span>
            <span className="m">{step.file}:{step.line}</span>
          </button>
        ))}
      </div>
      <div className="m lesson-footnote">commit {block.commit}</div>
    </BlockFrame>
  );
}
