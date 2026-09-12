import { useState, type ReactNode } from "react";
import { AnswerState, BlockFrame, BlockLabel } from "./BlockFrame";
import type { BlockProps } from "./registry";
import type { BlankBlock as BlankData } from "./types";

export function BlankBlock({ block, response, busy, onCommit }: BlockProps<BlankData>) {
  const [values, setValues] = useState<string[]>(() => block.blanks.map(() => ""));
  const choices = (index: number) => block.blanks[index]?.distractors ?? [];
  const submitted = response !== null;
  const renderSnippet = () => {
    const sorted = [...block.blanks].sort((left, right) => left.at - right.at);
    const pieces: ReactNode[] = [];
    let cursor = 0;
    sorted.forEach((blank) => {
      const index = block.blanks.indexOf(blank);
      pieces.push(<span key={`text-${blank.at}`}>{block.snippet.slice(cursor, blank.at)}</span>);
      pieces.push(submitted ? <span key={`answer-${blank.at}`} className="lesson-blank-reveal">{blank.answer}</span> : <input key={`input-${blank.at}`} value={values[index] ?? ""} onChange={(event) => setValues((current) => current.map((item, at) => at === index ? event.target.value : item))} aria-label={`blank ${index + 1}`} />);
      cursor = blank.at + 1;
    });
    pieces.push(<span key="tail">{block.snippet.slice(cursor)}</span>);
    return pieces;
  };
  return (
    <BlockFrame>
      <BlockLabel>Ask · fill the blank</BlockLabel>
      <div className="m lesson-snippet">{renderSnippet()}</div>
      {!submitted && <div className="lesson-choice-row">{block.blanks.map((_, index) => choices(index).map((choice) => <button type="button" className="m pill ghost" key={`${index}-${choice}`} onClick={() => setValues((current) => current.map((item, at) => at === index ? choice : item))}>{choice}</button>))}</div>}
      {response === null ? <button type="button" className="pill go lesson-submit" disabled={busy || values.some((value) => value.trim() === "")} onClick={() => onCommit({ answer: JSON.stringify(values.map((value) => value.trim())) })}>Check blank</button> : <div className="lesson-result"><AnswerState status={response.status} grade={response.grade} />{block.file !== undefined && <span className="m">{block.file.path}:{block.file.line}</span>}</div>}
    </BlockFrame>
  );
}
