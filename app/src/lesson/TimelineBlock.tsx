import { useState } from "react";
import { BlockFrame, BlockLabel } from "./BlockFrame";
import type { BlockProps } from "./registry";
import type { TimelineBlock as TimelineData } from "./types";

export function TimelineBlock({ block }: BlockProps<TimelineData>) {
  const [selected, setSelected] = useState<number | null>(null);
  const max = Math.max(...block.events.map((event) => event.at), 1);
  const lanes = [...new Set(block.events.map((event) => event.lane))];
  return (
    <BlockFrame>
      <BlockLabel>Show · timeline</BlockLabel>
      <div className="lesson-timeline"><div className="lesson-timeline-axis"><span>0 {block.unit}</span><span>{max} {block.unit}</span></div>{lanes.map((lane, laneIndex) => <div className="lesson-timeline-lane" key={lane}><span className="m">{lane}</span><div className="lesson-timeline-track">{block.events.map((event, index) => event.lane === lane ? <button type="button" key={index} className={selected === index ? "on" : ""} style={{ left: `${(event.at / max) * 100}%` }} onClick={() => setSelected(index)} title={event.label}><span />{event.label}</button> : null)}</div><span className="m">{laneIndex + 1}</span></div>)}</div>
    </BlockFrame>
  );
}
