import { useState } from "react";
import { BlockFrame, BlockLabel } from "./BlockFrame";
import type { BlockProps } from "./registry";
import type { ReqResBlock as ReqResData } from "./types";

export function ReqResBlock({ block }: BlockProps<ReqResData>) {
  const [side, setSide] = useState<"request" | "response">("request");
  const value = side === "request" ? block.request : block.response;
  return (
    <BlockFrame>
      <BlockLabel>Show · request and response</BlockLabel>
      <div className="lesson-reqres-tabs"><button type="button" className={side === "request" ? "on" : ""} onClick={() => setSide("request")}>Request</button><button type="button" className={side === "response" ? "on" : ""} onClick={() => setSide("response")}>Response</button></div>
      <pre className="code lesson-json">{JSON.stringify(value, null, 2)}</pre>
      <div className="lesson-caption">Focus: {block.focus}</div>
    </BlockFrame>
  );
}
