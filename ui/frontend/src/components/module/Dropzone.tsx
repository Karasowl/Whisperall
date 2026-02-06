'use client';

import { useCallback, useState, useRef } from 'react';
import { Upload, X, FileAudio, FileVideo, FileText, File, Loader2, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type FileType = 'audio' | 'video' | 'document' | 'any';

interface DropzoneProps {
  onFile: (file: File) => void;
  file?: File | null;
  onClear?: () => void;
  accept?: string;
  fileType?: FileType;
  maxSize?: number; // bytes
  uploading?: boolean;
  uploadProgress?: number;
  error?: string | null;
  disabled?: boolean;
  title?: string;
  subtitle?: string;
  icon?: LucideIcon;
  variant?: 'card' | 'bare';
  className?: string;
}

const FILE_TYPE_CONFIG: Record<FileType, {
  icon: typeof FileAudio;
  accept: string;
  label: string;
}> = {
  audio: {
    icon: FileAudio,
    accept: 'audio/*',
    label: 'Supports MP3, WAV, M4A, FLAC',
  },
  video: {
    icon: FileVideo,
    accept: 'video/*',
    label: 'Supports MP4, WebM, MOV (max 500MB)',
  },
  document: {
    icon: FileText,
    accept: '.txt,.md,.pdf',
    label: 'Supports TXT, MD, and PDF files',
  },
  any: {
    icon: File,
    accept: '*/*',
    label: 'Drag and drop any file',
  },
};

export function Dropzone({
  onFile,
  file,
  onClear,
  accept,
  fileType = 'any',
  maxSize = 100 * 1024 * 1024, // 100MB default
  uploading = false,
  uploadProgress,
  error,
  disabled = false,
  title,
  subtitle,
  icon,
  variant = 'card',
  className,
}: DropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const config = FILE_TYPE_CONFIG[fileType];
  const FileIcon = icon || config.icon;
  const finalAccept = accept || config.accept;
  const displayError = error || localError;

  const validateFile = useCallback(
    (file: File): string | null => {
      if (maxSize && file.size > maxSize) {
        const sizeMB = Math.round(maxSize / (1024 * 1024));
        return `File too large. Maximum size is ${sizeMB}MB`;
      }

      if (fileType === 'audio' && !file.type.startsWith('audio/')) {
        return 'Please select an audio file';
      }

      if (fileType === 'video' && !file.type.startsWith('video/')) {
        return 'Please select a video file';
      }

      return null;
    },
    [maxSize, fileType]
  );

  const handleFile = useCallback(
    (selectedFile: File) => {
      setLocalError(null);
      const validationError = validateFile(selectedFile);
      if (validationError) {
        setLocalError(validationError);
        return;
      }
      onFile(selectedFile);
    },
    [onFile, validateFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled || uploading) return;

      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        handleFile(droppedFile);
      }
    },
    [handleFile, disabled, uploading]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled && !uploading) {
        setIsDragging(true);
      }
    },
    [disabled, uploading]
  );

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) {
        handleFile(selectedFile);
      }
    },
    [handleFile]
  );

  const handleClear = useCallback(() => {
    setLocalError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClear?.();
  }, [onClear]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // File selected state
  if (file) {
    return (
      <div className={cn('glass-card p-6', className)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-surface-2 border border-glass-border flex items-center justify-center text-accent-primary">
              <FileIcon className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-foreground truncate">{file.name}</p>
              <p className="text-xs text-foreground-muted">{formatFileSize(file.size)}</p>
            </div>
          </div>

          {!uploading && onClear && (
            <button
              onClick={handleClear}
              className="text-foreground-muted hover:text-foreground transition-colors"
              title="Remove file"
              aria-label="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Upload progress */}
        {uploading && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-foreground-muted">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              <span>Uploading...</span>
              {uploadProgress !== undefined && <span>{uploadProgress}%</span>}
            </div>
            {uploadProgress !== undefined && (
              <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-primary transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {displayError && (
          <p className="mt-3 text-sm text-red-400">{displayError}</p>
        )}
      </div>
    );
  }

  // Empty state / Drop zone
  return (
    <div className={cn(variant === 'card' ? 'glass-card p-6' : 'p-0', className)}>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          'border border-dashed rounded-2xl px-8 py-20 text-center transition-all',
          isDragging
            ? 'border-accent-primary/60 bg-accent-primary/10'
            : 'border-surface-3/70 bg-surface-2/40 hover:border-accent-primary/40 hover:bg-surface-2/70',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <div className="mx-auto mb-6 w-14 h-14 rounded-full bg-surface-2 border border-surface-3/60 flex items-center justify-center text-foreground-muted">
          {icon ? (
            <FileIcon
              className={cn(
                'w-7 h-7 transition-colors',
                isDragging ? 'text-accent-primary' : 'text-foreground-muted'
              )}
              aria-hidden="true"
            />
          ) : (
            <Upload
              className={cn(
                'w-7 h-7 transition-colors',
                isDragging ? 'text-accent-primary' : 'text-foreground-muted'
              )}
              aria-hidden="true"
            />
          )}
        </div>

        <p className="text-lg text-foreground mb-2">
          {title || 'Drop files to upload'}
        </p>
        <p className="text-sm text-foreground-muted mb-6">
          {subtitle || config.label}
        </p>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          className="text-xs uppercase tracking-[0.2em] font-semibold text-accent-primary hover:text-white transition-colors"
        >
          Browse Local Files
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept={finalAccept}
          onChange={handleInputChange}
          disabled={disabled || uploading}
          className="hidden"
          aria-label="File input"
        />

      </div>

      {/* Error */}
      {displayError && (
        <p className="mt-3 text-sm text-red-400">{displayError}</p>
      )}
    </div>
  );
}

export default Dropzone;
