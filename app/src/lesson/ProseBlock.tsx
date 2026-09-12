import { BlockFrame, BlockLabel } from "./BlockFrame";
import { Markdown } from "./markdown";
import type { BlockProps } from "./registry";
import type { ProseBlock as ProseData } from "./types";

export function ProseBlock({ block }: BlockProps<ProseData>) {
  return (
    <BlockFrame>
      <BlockLabel>Explain</BlockLabel>
      <h2>{block.heading}</h2>
      <Markdown value={block.body} />
      <div className="lesson-names">
        {block.names.map((name) => <span key={name} className="m">{name}</span>)}
      </div>
    </BlockFrame>
  );
}
