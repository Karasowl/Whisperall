export type TTSSupportedLanguage = 'en' | 'es' | 'fr' | 'de' | 'pt' | 'it' | 'ja' | 'ko' | 'zh';

const SUPPORTED: ReadonlySet<TTSSupportedLanguage> = new Set([
  'en', 'es', 'fr', 'de', 'pt', 'it', 'ja', 'ko', 'zh',
]);

export function normalizeLanguageCode(lang: string | undefined | null): TTSSupportedLanguage | undefined {
  const base = (lang ?? '').trim().split('-')[0].toLowerCase();
  return (SUPPORTED as ReadonlySet<string>).has(base) ? (base as TTSSupportedLanguage) : undefined;
}

function inferLanguageFromVoice(voice: string | undefined): TTSSupportedLanguage | undefined {
  const m = (voice ?? '').match(/^([a-z]{2})-/i);
  if (!m) return undefined;
  return normalizeLanguageCode(m[1]);
}

// Accents + inverted punctuation are strong Spanish signals.
const SPANISH_HINT_CHARS = /[\u00e1\u00e9\u00ed\u00f3\u00fa\u00fc\u00f1\u00bf\u00a1]/i;

// Keep these small and high-signal; this is a lightweight heuristic, not full language ID.
const ES_WORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'de', 'del', 'al', 'que', 'y', 'en', 'por', 'para', 'con', 'como',
  'pero', 'porque', 'hola', 'gracias', 'buenos', 'buenas',
  'dias', 'tardes', 'noches', 'usted', 'ustedes', 'disculpe', 'favor',
]);

const EN_WORDS = new Set([
  'the', 'and', 'to', 'of', 'in', 'is', 'it', 'for', 'on', 'with', 'as',
  'that', 'this', 'are', 'you', 'your', 'hello', 'thanks', 'good',
  'morning', 'afternoon', 'evening', 'please', 'call',
]);

function foldLatin(s: string): string {
  return s
    .replace(/[\u00e1\u00e0\u00e4\u00e2]/g, 'a')
    .replace(/[\u00e9\u00e8\u00eb\u00ea]/g, 'e')
    .replace(/[\u00ed\u00ec\u00ef\u00ee]/g, 'i')
    .replace(/[\u00f3\u00f2\u00f6\u00f4]/g, 'o')
    .replace(/[\u00fa\u00f9\u00fc\u00fb]/g, 'u')
    .replace(/[\u00f1]/g, 'n');
}

function getNavigatorLanguage(): string | undefined {
  try {
    return typeof navigator !== 'undefined' ? navigator.language : undefined;
  } catch {
    return undefined;
  }
}

export function inferTTSLanguage(
  text: string,
  opts?: { fallback?: string; voice?: string },
): TTSSupportedLanguage {
  const fromVoice = inferLanguageFromVoice(opts?.voice);
  if (fromVoice) return fromVoice;

  const sample = (text ?? '').slice(0, 1500);
  let es = 0;
  let en = 0;

  if (SPANISH_HINT_CHARS.test(sample)) es += 5;

  const tokens = sample.toLowerCase().match(/[a-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00fc\u00f1]+/gi) ?? [];
  for (const raw of tokens) {
    const w = foldLatin(raw.toLowerCase());
    if (ES_WORDS.has(w)) es += 1;
    if (EN_WORDS.has(w)) en += 1;
    if (w.endsWith('cion') || w.endsWith('ciones') || w.endsWith('mente')) es += 1;
    if (w.endsWith('tion') || w.endsWith('tions') || w.endsWith('ing')) en += 1;
  }

  const diff = es - en;
  if (diff >= 2) return 'es';
  if (diff <= -2) return 'en';
  if (es > 0 && en === 0) return 'es';
  if (en > 0 && es === 0) return 'en';

  const fallback = normalizeLanguageCode(opts?.fallback) ?? normalizeLanguageCode(getNavigatorLanguage());
  return fallback ?? 'en';
}
