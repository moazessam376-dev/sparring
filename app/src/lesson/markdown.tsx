import type { ReactNode } from "react";

function inline(value: string): ReactNode[] {
  const parts = value.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    return <span key={index}>{part}</span>;
  });
}

export function Markdown({ value }: { value: string }) {
  return (
    <div className="lesson-markdown">
      {value.split(/\n\s*\n/).map((paragraph, index) => (
        <p key={index}>{inline(paragraph).map((part, at) => <span key={at}>{part}</span>)}</p>
      ))}
    </div>
  );
}
