import type { ReactNode } from "react";
import type { ProgramTextBlock } from "../lib/programTexts";

// Preserve Word's bold song openings without rendering imported HTML.
function EmphasizedText({ text, phrases }: { text: string; phrases?: string[] }) {
  const ranges: { start: number; end: number }[] = [];
  for (const phrase of Array.isArray(phrases) ? phrases : []) {
    if (typeof phrase !== "string" || !phrase) continue;
    const start = text.indexOf(phrase);
    if (start >= 0) ranges.push({ start, end: start + phrase.length });
  }
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const parts: ReactNode[] = [];
  let offset = 0;
  for (const range of ranges) {
    if (range.start < offset) continue;
    parts.push(text.slice(offset, range.start));
    parts.push(<strong key={range.start}>{text.slice(range.start, range.end)}</strong>);
    offset = range.end;
  }
  parts.push(text.slice(offset));
  return <>{parts}</>;
}

export function TextBlocks({ blocks, showNotes }: {
  blocks: ProgramTextBlock[];
  showNotes: boolean;
}) {
  return blocks.map((block, index) => {
    if (block.kind === "note" && !showNotes) return null;
    const hasNotes = showNotes && Boolean(block.notes);
    return (
      <section
        key={index}
        className={[
          "program-block",
          `program-block--${block.kind}`,
          block.spaceBefore === false ? "program-block--continued" : "",
          hasNotes ? "program-block--annotated" : "",
          index === 1 && block.kind === "note" && /^\(.*\)$/.test(block.text) ? "program-block--subtitle" : "",
        ].filter(Boolean).join(" ")}
      >
        {block.kind === "heading" ? (
          <h2>{block.text}</h2>
        ) : (
          <p><EmphasizedText text={block.text} phrases={block.emphasis} /></p>
        )}
        {hasNotes && <aside className="program-inline-note">{block.notes}</aside>}
      </section>
    );
  });
}
