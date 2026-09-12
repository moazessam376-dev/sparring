import { BlockFrame, BlockLabel } from "./BlockFrame";
import type { BlockProps } from "./registry";
import type { DiagramBlock as DiagramData } from "./types";

export function DiagramBlock({ block }: BlockProps<DiagramData>) {
  const positions = block.nodes.map((node, index) => ({ node, x: 90 + index * Math.max(150, 620 / Math.max(1, block.nodes.length - 1)) }));
  const position = new Map(positions.map((item) => [item.node.id, item.x]));
  return (
    <BlockFrame>
      <BlockLabel>Explain · mechanism</BlockLabel>
      <div className="lesson-diagram">
        <svg viewBox="0 0 760 190" role="img" aria-label={block.caption}>
          {block.edges.map((edge, index) => {
            const x1 = position.get(edge.from) ?? 60;
            const x2 = position.get(edge.to) ?? 700;
            return <g key={`${edge.from}-${edge.to}-${index}`}><line x1={x1} y1="90" x2={x2} y2="90" /><text x={(x1 + x2) / 2} y="75">{edge.label}</text></g>;
          })}
          {positions.map(({ node, x }) => (
            <g key={node.id}>
              <rect x={x - 58} y="68" width="116" height="52" className={node.focal ? "focal" : ""} />
              <text x={x} y="91" className="node-title">{node.label}</text>
              <text x={x} y="108" className="node-sub">{node.sub}</text>
            </g>
          ))}
        </svg>
      </div>
      <div className="lesson-caption">{block.caption}</div>
    </BlockFrame>
  );
}
