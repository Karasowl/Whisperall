'use client';

import { useState } from 'react';
import { Copy, Check, FileText, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TextOutputPanelProps {
  content: string;
  title?: string;
  placeholder?: string;
  showCopy?: boolean;
  showDownload?: boolean;
  downloadFilename?: string;
  maxHeight?: string;
  className?: string;
}

export function TextOutputPanel({
  content,
  title = 'Output',
  placeholder = 'Output will appear here...',
  showCopy = true,
  showDownload = false,
  downloadFilename = 'output.txt',
  maxHeight = 'max-h-[400px]',
  className,
}: TextOutputPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDownload = () => {
    if (!content) return;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadFilename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const hasContent = content && content.trim().length > 0;

  return (
    <div className={cn('glass-card p-6 space-y-3', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-foreground-muted" aria-hidden="true" />
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
        </div>

        {hasContent && (
          <div className="flex items-center gap-1">
            {showDownload && (
              <button
                onClick={handleDownload}
                className="p-2 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-2 transition-colors"
                title="Download as text file"
                aria-label="Download"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
            {showCopy && (
              <button
                onClick={handleCopy}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  copied
                    ? 'text-emerald-400 bg-emerald-500/10'
                    : 'text-foreground-muted hover:text-foreground hover:bg-surface-2'
                )}
                title={copied ? 'Copied!' : 'Copy to clipboard'}
                aria-label={copied ? 'Copied' : 'Copy'}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content area */}
      <div
        className={cn(
          'bg-surface-1 rounded-lg p-4 overflow-y-auto',
          maxHeight,
          !hasContent && 'flex items-center justify-center min-h-[120px]'
        )}
      >
        {hasContent ? (
          <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">
            {content}
          </pre>
        ) : (
          <p className="text-foreground-muted text-sm">{placeholder}</p>
        )}
      </div>

      {/* Character count */}
      {hasContent && (
        <div className="text-xs text-foreground-muted text-right">
          {content.length.toLocaleString()} characters
        </div>
      )}
    </div>
  );
}

export default TextOutputPanel;
