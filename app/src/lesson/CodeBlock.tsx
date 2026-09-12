import { useState } from "react";
import { AnswerState, BlockFrame, BlockLabel } from "./BlockFrame";
import type { BlockProps } from "./registry";
import type { CodeBlock as CodeData } from "./types";

export function CodeBlock({ block, response, busy, onCommit }: BlockProps<CodeData>) {
  const [language, setLanguage] = useState(block.languages[0] ?? "text");
  const [code, setCode] = useState(block.starter);
  return (
    <BlockFrame>
      <div className="lesson-block-toolbar"><BlockLabel>Ask · code review</BlockLabel><div className="lesson-language-tabs">{block.languages.map((item) => <button type="button" key={item} className={language === item ? "on" : ""} onClick={() => setLanguage(item)}>{item}</button>)}</div></div>
      <h3>{block.ask}</h3>
      {response === null ? <textarea className="lesson-editor" rows={10} value={code} onChange={(event) => setCode(event.target.value)} spellCheck={false} aria-label={`${language} editor`} /> : <pre className="code lesson-answer">{code}</pre>}
      {response === null ? <button type="button" className="pill go lesson-submit" disabled={busy || code.trim() === ""} onClick={() => onCommit({ answer: JSON.stringify({ language, code }) })}>Send for review</button> : <div className="lesson-result"><AnswerState status={response.status} grade={response.grade} />{response.feedback !== null && <span>{response.feedback}</span>}{block.reviewAgainst !== undefined && <span className="m">review target {block.reviewAgainst.path}:{block.reviewAgainst.line}</span>}</div>}
    </BlockFrame>
  );
}
