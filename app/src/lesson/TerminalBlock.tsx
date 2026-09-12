import { BlockFrame, BlockLabel } from "./BlockFrame";
import type { BlockProps } from "./registry";
import type { TerminalBlock as TerminalData } from "./types";

export function TerminalBlock({ block }: BlockProps<TerminalData>) {
  return (
    <BlockFrame>
      <BlockLabel>Show · terminal transcript</BlockLabel>
      <div className="m lesson-terminal"><div className="lesson-footnote">cwd {block.cwd}</div>{block.lines.map((line, index) => <div key={index} className="lesson-terminal-line"><div><span className="lesson-prompt">$</span> {line.cmd}</div><div className="lesson-output">{line.out}</div></div>)}</div>
    </BlockFrame>
  );
}
