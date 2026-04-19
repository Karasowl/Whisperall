/**
 * Date formatting helpers used across the notes UI.
 *
 * Single source of truth for "how long ago was this" rendering — the
 * notes home previously mixed relative ("20h") and absolute ("Mar 15,
 * 7:19 PM") labels across the same grid, which read as a bug. The
 * formatter below chooses a single shape per note based on age:
 *
 *   < 1 min                 → "Just now" / "Ahora"
 *   < 1 hour                → "Xm ago" / "hace Xm"
 *   < 24 h (same day)       → "Xh ago" / "hace Xh"
 *   yesterday               → "Yesterday 3:12 PM" / "Ayer 3:12 PM"
 *   < 7 days                → "Monday 3:12 PM"   / "lunes 3:12 PM"
 *   same calendar year      → "Mar 15, 3:12 PM"
 *   older                   → "Mar 15, 2025, 3:12 PM"
 *
 * All branches feed from the same locale, so a user on `es-ES` never
 * sees an English fallback.
 */

function isYesterday(d: Date, now: Date): boolean {
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  return d.getFullYear() === y.getFullYear() && d.getMonth() === y.getMonth() && d.getDate() === y.getDate();
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function relativeDate(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffH / 24);
  const loc = locale === 'es' ? 'es-ES' : 'en-US';
  const timeFmt: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

  // Future dates or very recent — treat as "just now".
  if (diffMin < 1) return locale === 'es' ? 'Ahora' : 'Just now';
  if (diffMin < 60) return locale === 'es' ? `hace ${diffMin}m` : `${diffMin}m ago`;
  if (isSameDay(d, now) && diffH < 24) return locale === 'es' ? `hace ${diffH}h` : `${diffH}h ago`;
  if (isYesterday(d, now)) {
    const time = d.toLocaleTimeString(loc, timeFmt);
    return locale === 'es' ? `Ayer ${time}` : `Yesterday ${time}`;
  }
  if (diffDays < 7) {
    // Day-of-week + time. `weekday: 'long'` gives "Monday" / "lunes".
    const weekday = d.toLocaleDateString(loc, { weekday: 'long' });
    const time = d.toLocaleTimeString(loc, timeFmt);
    return `${weekday} ${time}`;
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  const datePart = d.toLocaleDateString(loc, sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
  const timePart = d.toLocaleTimeString(loc, timeFmt);
  return `${datePart}, ${timePart}`;
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

/**
 * Strip common audio/video file extensions from a title so imported
 * files ("Junta TSC 9 de Marzo.m4a") become readable as titles
 * ("Junta TSC 9 de Marzo"). Preserves dots in the middle of the name.
 */
export function stripMediaExtension(title: string): string {
  if (!title) return title;
  return title.replace(/\.(m4a|mp3|mp4|wav|ogg|oga|webm|flac|aac|mkv|mov|avi|aiff)$/i, '').trim();
}

/**
 * Legacy notes were auto-titled with the timestamp-formatted string
 * `smartTitle()` used to generate ("Note — Apr 16, 2026, 3:55 PM" /
 * "Nota — 16 abr 2026, 15:55"). We dropped that behavior in v0.23 but
 * the DB still holds those titles on every note the user never renamed.
 *
 * `sanitizeDisplayTitle` detects the pattern at render time and returns
 * an empty string so the UI falls back to "Untitled", without touching
 * the stored title. Pure display-layer fix; reversible.
 *
 * Patterns accepted:
 *   EN: "Note — Mar 15, 2025, 3:12 PM"
 *   EN: "Note — Mar 15, 2025, 3:12 AM"
 *   ES: "Nota — 15 mar 2025, 3:12"
 *   ES: "Nota — 15 de marzo de 2025, 15:12"
 * We accept both `—` (em-dash) and `-` (hyphen) as separators, and
 * optional comma/AM/PM variations.
 */
const AUTO_TITLE_PATTERN = /^(?:Note|Nota)\s*[—-]\s*.+\d{1,2}:\d{2}(?:\s?[AP]M)?$/i;

export function sanitizeDisplayTitle(title: string | null | undefined): string {
  if (!title) return '';
  const trimmed = title.trim();
  if (!trimmed) return '';
  if (AUTO_TITLE_PATTERN.test(trimmed)) return '';
  return trimmed;
}
