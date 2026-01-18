'use client';

import { useCallback } from 'react';
import {
  Laugh,
  Wind,
  Drama,
  MessageCircle,
  Mic,
  VolumeX,
  Frown,
  Droplets
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TurboTag {
  tag: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  description: string;
}

const TURBO_TAGS: TurboTag[] = [
  {
    tag: '[laugh]',
    label: 'Laugh',
    icon: <Laugh className="w-4 h-4" />,
    color: 'bg-amber-500/20 text-amber-200 border-amber-500/30',
    description: 'Soft laugh'
  },
  {
    tag: '[chuckle]',
    label: 'Chuckle',
    icon: <Laugh className="w-4 h-4" />,
    color: 'bg-orange-500/20 text-orange-200 border-orange-500/30',
    description: 'Quiet chuckle'
  },
  {
    tag: '[sigh]',
    label: 'Sigh',
    icon: <Wind className="w-4 h-4" />,
    color: 'bg-sky-500/20 text-sky-200 border-sky-500/30',
    description: 'Expressive sigh'
  },
  {
    tag: '[gasp]',
    label: 'Gasp',
    icon: <Drama className="w-4 h-4" />,
    color: 'bg-rose-500/20 text-rose-200 border-rose-500/30',
    description: 'Surprise or shock'
  },
  {
    tag: '[cough]',
    label: 'Cough',
    icon: <MessageCircle className="w-4 h-4" />,
    color: 'bg-red-500/20 text-red-200 border-red-500/30',
    description: 'Dry cough'
  },
  {
    tag: '[clear throat]',
    label: 'Clear throat',
    icon: <Mic className="w-4 h-4" />,
    color: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30',
    description: 'Clear the throat'
  },
  {
    tag: '[sniff]',
    label: 'Sniff',
    icon: <Droplets className="w-4 h-4" />,
    color: 'bg-cyan-500/20 text-cyan-200 border-cyan-500/30',
    description: 'Nasal sound'
  },
  {
    tag: '[groan]',
    label: 'Groan',
    icon: <Frown className="w-4 h-4" />,
    color: 'bg-teal-500/20 text-teal-200 border-teal-500/30',
    description: 'Groan or complaint'
  },
  {
    tag: '[shush]',
    label: 'Shush',
    icon: <VolumeX className="w-4 h-4" />,
    color: 'bg-blue-500/20 text-blue-200 border-blue-500/30',
    description: 'Ask for silence'
  },
];

interface TurboTagsEditorProps {
  text: string;
  onTextChange: (text: string) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export function TurboTagsEditor({
  text,
  onTextChange,
  textareaRef,
}: TurboTagsEditorProps) {
  const insertTag = useCallback((tag: string) => {
    const textarea = textareaRef?.current;

    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const before = text.substring(0, start);
      const after = text.substring(end);

      const needsSpaceBefore = before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n');
      const needsSpaceAfter = after.length > 0 && !after.startsWith(' ') && !after.startsWith('\n');

      const newText = before +
        (needsSpaceBefore ? ' ' : '') +
        tag +
        (needsSpaceAfter ? ' ' : '') +
        after;

      onTextChange(newText);

      setTimeout(() => {
        textarea.focus();
        const newPosition = start + (needsSpaceBefore ? 1 : 0) + tag.length + (needsSpaceAfter ? 1 : 0);
        textarea.setSelectionRange(newPosition, newPosition);
      }, 0);
    } else {
      const needsSpace = text.length > 0 && !text.endsWith(' ') && !text.endsWith('\n');
      onTextChange(text + (needsSpace ? ' ' : '') + tag + ' ');
    }
  }, [text, onTextChange, textareaRef]);

  const renderPreview = () => {
    if (!text) return null;

    const tagPattern = /\[(laugh|chuckle|sigh|gasp|cough|clear throat|sniff|groan|shush)\]/gi;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    const matches = Array.from(text.matchAll(tagPattern));

    for (const match of matches) {
      const matchIndex = match.index ?? 0;

      if (matchIndex > lastIndex) {
        parts.push(
          <span key={`text-${lastIndex}`}>
            {text.substring(lastIndex, matchIndex)}
          </span>
        );
      }

      const matchedText = match[0];
      const tagInfo = TURBO_TAGS.find((t) => t.tag.toLowerCase() === matchedText.toLowerCase());
      parts.push(
        <span
          key={`tag-${matchIndex}`}
          className={cn(
            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border',
            tagInfo?.color || 'bg-white/5 text-foreground-muted border-glass-border'
          )}
        >
          {tagInfo?.icon}
          {matchedText}
        </span>
      );

      lastIndex = matchIndex + matchedText.length;
    }

    if (lastIndex < text.length) {
      parts.push(
        <span key={`text-${lastIndex}`}>
          {text.substring(lastIndex)}
        </span>
      );
    }

    return parts;
  };

  const hasAnyTags = TURBO_TAGS.some((t) =>
    text.toLowerCase().includes(t.tag.toLowerCase())
  );

  return (
    <div className="space-y-4 p-4 glass rounded-xl">
      <div>
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <Drama className="w-4 h-4" />
          Turbo Tags (Turbo model)
        </h3>
        <p className="text-xs text-foreground-muted mt-1">
          Click a tag to insert it at the cursor position
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TURBO_TAGS.map((tagInfo) => (
          <button
            key={tagInfo.tag}
            onClick={() => insertTag(tagInfo.tag)}
            title={tagInfo.description}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm font-medium',
              'hover:scale-105 active:scale-95 transition-all',
              tagInfo.color
            )}
          >
            {tagInfo.icon}
            {tagInfo.label}
          </button>
        ))}
      </div>

      {hasAnyTags && (
        <div className="mt-4">
          <p className="text-xs font-medium text-foreground-muted mb-2">Preview:</p>
          <div className="p-3 bg-white/5 rounded-lg border border-glass-border text-sm whitespace-pre-wrap">
            {renderPreview()}
          </div>
        </div>
      )}
    </div>
  );
}
