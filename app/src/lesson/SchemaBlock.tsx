import { useState } from "react";
import { BlockFrame, BlockLabel } from "./BlockFrame";
import type { BlockProps } from "./registry";
import type { SchemaBlock as SchemaData } from "./types";

export function SchemaBlock({ block }: BlockProps<SchemaData>) {
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <BlockFrame>
      <BlockLabel>Show · schema or table</BlockLabel>
      <div className="lesson-table-wrap"><table><thead><tr>{block.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{block.rows.map((row, index) => <tr key={index} className={block.highlight.includes(index) || selected === index ? "highlight" : ""} onClick={() => setSelected(index)}>{row.map((cell, at) => <td key={at}>{cell}</td>)}</tr>)}</tbody></table></div>
    </BlockFrame>
  );
}
