import { useMemo } from 'react';

type Block = { type: 'h2' | 'h3' | 'p' | 'li'; text: string };

function parseInline(raw: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = [];
  let cursor = 0;
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(raw)) !== null) {
    if (match.index > cursor) parts.push(raw.slice(cursor, match.index));
    if (match[2]) parts.push(<strong key={key++} className="font-semibold">{match[2]}</strong>);
    else if (match[3]) parts.push(<em key={key++}>{match[3]}</em>);
    else if (match[4]) parts.push(<code key={key++} className="bg-base/50 px-1 rounded text-[12px]">{match[4]}</code>);
    cursor = match.index + match[0].length;
  }
  if (cursor < raw.length) parts.push(raw.slice(cursor));
  return parts;
}

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trimEnd();
    if (!trimmed) continue;
    if (trimmed.startsWith('### ')) { blocks.push({ type: 'h3', text: trimmed.slice(4) }); continue; }
    if (trimmed.startsWith('## ')) { blocks.push({ type: 'h2', text: trimmed.slice(3) }); continue; }
    if (/^[-*•]\s/.test(trimmed)) { blocks.push({ type: 'li', text: trimmed.replace(/^[-*•]\s+/, '') }); continue; }
    if (/^\d+[.)]\s/.test(trimmed)) { blocks.push({ type: 'li', text: trimmed.replace(/^\d+[.)]\s+/, '') }); continue; }
    blocks.push({ type: 'p', text: trimmed });
  }
  return blocks;
}

export function MiniMarkdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);

  return (
    <div className="space-y-1.5">
      {blocks.map((block, i) => {
        const inline = parseInline(block.text);
        if (block.type === 'h2') return <p key={i} className="text-[13px] font-bold text-text mt-1">{inline}</p>;
        if (block.type === 'h3') return <p key={i} className="text-[12.5px] font-semibold text-text">{inline}</p>;
        if (block.type === 'li') return (
          <p key={i} className="text-[13px] text-text leading-relaxed pl-3">
            <span className="text-muted/60 mr-1">•</span>{inline}
          </p>
        );
        return <p key={i} className="text-[13px] text-text leading-relaxed">{inline}</p>;
      })}
    </div>
  );
}
