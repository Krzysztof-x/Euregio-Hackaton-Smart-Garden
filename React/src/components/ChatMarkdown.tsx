import type { ReactNode } from "react";

/** Turns **bold** parts of a line into <strong>. React escapes everything else, so no HTML gets in. */
function inline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, i) => (part.length > 4 && part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
}

/**
 * Tiny, safe Markdown renderer for the assistant's answers:
 * paragraphs, "- " / "1. " lists, "# " headings and **bold**. That's all Gemini's short tips need.
 */
export function ChatMarkdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((item, i) => <li key={i}>{inline(item)}</li>);
    blocks.push(list.ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>);
    list = null;
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);

    if (bullet || numbered) {
      const ordered = numbered !== null;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }

    flushList();
    if (!line) continue;
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    blocks.push(<p key={blocks.length}>{heading ? <strong>{inline(heading[1])}</strong> : inline(line)}</p>);
  }
  flushList();

  return <>{blocks}</>;
}
