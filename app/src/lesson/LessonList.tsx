import type { ReactNode } from "react";
import type { LessonSummary } from "./types";

type Props = { lessons: LessonSummary[]; topic: string | null; chrome: ReactNode; onOpen: (id: string) => void };

export function LessonList({ lessons, topic, chrome, onOpen }: Props) {
  const shown = topic === null ? lessons : lessons.filter((item) => item.topics.includes(topic));
  return (
    <div className="glass-content content">
      <div className="glass hair topbar" data-tauri-drag-region="deep"><span className="lbl">Lessons</span><div className="grow" /><span className="m" style={{ fontSize: 10.5, color: "var(--faint)" }}>{topic === null ? "all topics" : topic}</span>{chrome}</div>
      <div className="scroll" style={{ display: "flex", justifyContent: "center", flexGrow: 1 }}>
        <div className="lesson-list">
          <div className="rise"><div className="lesson-list-heading">Learn it once. Hold it later.</div><div className="lesson-list-subtitle">Lessons are authored by your agent and rendered here one part at a time. Checks stay committed, grounded, and honest about their uncertainty.</div></div>
          {shown.length === 0 ? <div className="notice panel"><div style={{ fontSize: 15, fontWeight: 600 }}>{topic === null ? "No lessons yet" : "No lesson covers this topic"}</div><div style={{ color: "var(--muted)", lineHeight: 1.6 }}>Ask your connected agent to author a lesson, then it will appear here.</div></div> : shown.map((item) => <button type="button" className="panel lesson-card" key={item.id} onClick={() => onOpen(item.id)}><div className="lesson-card-copy"><div className="lbl">{item.project}</div><div className="lesson-card-title">{item.title}</div><div className="lesson-card-meta">{item.blocks} {item.blocks === 1 ? "block" : "blocks"} · {item.gradable} gradable checks · about {Math.max(1, Math.ceil(item.blocks * 1.5))} min</div><div className="lesson-card-topics">{item.topics.map((itemTopic) => <span key={itemTopic}>{itemTopic}</span>)}</div></div><span className="pill go">Open</span></button>)}
        </div>
      </div>
    </div>
  );
}
