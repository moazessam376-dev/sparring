/*
 * Every estimate is drawn with how little it is worth.
 *
 * The mastery score is a logistic fit over a handful of answers, and the
 * server hands back a confidence alongside it because the number on its own
 * would be a claim. The pale band is how wrong the number could be: it is
 * sixty-four points wide with nothing behind it and narrows only as answers
 * accumulate, so on a thinly evidenced topic it is wider than the bar.
 */

export const ACCENT = "#9ee87d";
export const WARNING = "#e8c97d";
export const DANGER = "#e88d7d";

export function tone(score: number): string {
  if (score < 0.6) return DANGER;
  if (score > 0.75) return ACCENT;
  return WARNING;
}

/** Attempts behind a score, recovered from the confidence when only that is to hand. */
export function attemptsFrom(confidence: number): number {
  return Math.round(Math.max(0, Math.min(1, confidence)) * 12);
}

export type Band = { percent: number; low: number; span: number; width: number };

export function band(score: number, attempts: number): Band {
  const percent = Math.round(Math.max(0, Math.min(1, score)) * 100);
  const width = Math.max(8, Math.round(64 / Math.sqrt(Math.max(0, attempts) + 1)));
  const low = Math.max(0, percent - Math.round(width / 2));
  return { percent, low, span: Math.min(width, 100 - low), width };
}

export function answersLabel(attempts: number, confidence: number): string {
  if (attempts === 0) return "no answers yet";
  if (confidence >= 1) return `${attempts} answers or more`;
  return `${attempts} ${attempts === 1 ? "answer" : "answers"}`;
}

type BarProps = { score: number; attempts: number; height?: number };

export function EstimateBar({ score, attempts, height = 3 }: BarProps) {
  const { percent, low, span } = band(score, attempts);
  return (
    <div
      style={{
        position: "relative",
        height,
        borderRadius: 2,
        background: "rgba(255,255,255,0.06)",
      }}
    >
      <span
        style={{
          position: "absolute",
          left: `${low}%`,
          width: `${span}%`,
          height,
          borderRadius: 2,
          background: "rgba(255,255,255,0.15)",
          display: "block",
        }}
      />
      <span
        style={{
          position: "absolute",
          left: 0,
          width: `${percent}%`,
          height,
          borderRadius: 2,
          background: tone(score),
          display: "block",
        }}
      />
    </div>
  );
}

type EstimateProps = { score: number; attempts: number; confidence: number };

export function Estimate({ score, attempts, confidence }: EstimateProps) {
  const { percent } = band(score, attempts);
  return (
    <div className="panel" style={{ padding: "15px 16px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span className="m" style={{ fontSize: 26, color: tone(score) }}>
          {percent}%
        </span>
        <span className="lbl" style={{ letterSpacing: "0.06em" }}>
          held, estimated
        </span>
        <div className="grow" />
        <span className="m" style={{ fontSize: 10, color: "var(--faint)" }}>
          {answersLabel(attempts, confidence)}
        </span>
      </div>
      <div style={{ marginTop: 11 }}>
        <EstimateBar score={score} attempts={attempts} />
      </div>
      <div className="m" style={{ marginTop: 9, fontSize: 10.5, color: "var(--dim)", lineHeight: 1.5 }}>
        the pale band is how wrong this could be
      </div>
    </div>
  );
}
