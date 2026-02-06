export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

export function formatEta(seconds: number): string {
  if (seconds < 60) {
    return `~${seconds}s`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `~${hours}h ${minutes}min`;
  }
  return `~${minutes} min`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatLinkLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    const last = pathParts[pathParts.length - 1];
    if (last) {
      return `${host}/${last}`;
    }
    return host || 'Imported link';
  } catch {
    return 'Imported link';
  }
}

export function isAbsolutePath(filePath: string): boolean {
  if (filePath.startsWith('/') || filePath.startsWith('\\')) {
    return true;
  }
  return /^[a-zA-Z]:[\\/]/.test(filePath);
}

