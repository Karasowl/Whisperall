/** Relative date for recent items, full date+time for older ones */
export function relativeDate(iso: string, locale: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const loc = locale === 'es' ? 'es-ES' : 'en-US';

  if (diffMin < 1) return locale === 'es' ? 'Ahora' : 'Just now';
  if (diffMin < 60) return `${diffMin}m`;
  if (diffH < 24) return `${diffH}h`;
  return d.toLocaleDateString(loc, { month: 'short', day: 'numeric' })
    + ', ' + d.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' });
}

/** Full date + time string */
export function formatDocDate(iso: string, locale: string): string {
  const loc = locale === 'es' ? 'es-ES' : 'en-US';
  const d = new Date(iso);
  return d.toLocaleDateString(loc, { month: 'short', day: 'numeric', year: 'numeric' })
    + ', ' + d.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' });
}

/** Smart default title with current date/time */
export function smartTitle(locale: string): string {
  const loc = locale === 'es' ? 'es-ES' : 'en-US';
  const now = new Date();
  const date = now.toLocaleDateString(loc, { month: 'short', day: 'numeric', year: 'numeric' });
  const time = now.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' });
  return `${locale === 'es' ? 'Nota' : 'Note'} — ${date}, ${time}`;
}
