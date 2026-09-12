import { useMemo, useState } from "react";
import { AnswerState, BlockFrame, BlockLabel } from "./BlockFrame";
import type { BlockProps } from "./registry";
import type { DiagramBlock, PlaceBlock as PlaceData } from "./types";

export function PlaceBlock({ block, response, busy, onCommit, lessonBlocks }: BlockProps<PlaceData>) {
  const [label, setLabel] = useState<string | null>(null);
  const [placements, setPlacements] = useState<Record<string, string>>({});
  const diagram = useMemo<DiagramBlock | null>(() => {
    const match = /^block:(\d+)$/.exec(block.diagram);
    if (match === null) return null;
    const candidate = lessonBlocks[Number(match[1])];
    return candidate?.type === "diagram" ? candidate : null;
  }, [block.diagram, lessonBlocks]);
  const nodes = diagram?.nodes ?? [{ id: "a", label: "A", sub: "slot", focal: false }, { id: "b", label: "B", sub: "slot", focal: false }, { id: "c", label: "C", sub: "slot", focal: false }];
  const submitted = response !== null;
  return (
    <BlockFrame>
      <BlockLabel>Ask · place it on the diagram</BlockLabel>
      <div className="lesson-place-help">{label === null ? "Choose a label, then choose where it belongs." : `Place ${label}.`}</div>
      <div className="lesson-place-grid">{nodes.map((node) => <button key={node.id} type="button" className={Object.values(placements).includes(node.id) ? "placed" : ""} disabled={submitted || busy} onClick={() => { if (label !== null) { setPlacements((current) => ({ ...current, [label]: node.id })); setLabel(null); } }}><span>{node.label}</span><small>{node.sub}</small></button>)}</div>
      <div className="lesson-place-labels">{block.place.map((item) => <button key={item.label} type="button" className={label === item.label ? "on" : ""} disabled={submitted || busy} onClick={() => setLabel(item.label)}>{item.label}{submitted && item.target !== undefined ? ` → ${item.target}` : ""}</button>)}</div>
      {response === null ? <button type="button" className="pill go lesson-submit" disabled={busy || Object.keys(placements).length !== block.place.length} onClick={() => onCommit({ answer: JSON.stringify(placements) })}>Commit placement</button> : <div className="lesson-result"><AnswerState status={response.status} grade={response.grade} /></div>}
    </BlockFrame>
  );
}
