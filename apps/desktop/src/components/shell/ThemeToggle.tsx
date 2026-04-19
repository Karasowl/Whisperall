import { useSettingsStore, type Theme } from '../../stores/settings';
import { useT } from '../../lib/i18n';

/**
 * Theme toggle.
 *
 * Convention: the icon shows the theme you will switch TO on click
 * (not the current theme). Matches iOS, Android, Chrome, Slack, VS Code.
 * A light_mode icon on a dark background means "click to go light"; a
 * dark_mode icon on a light background means "click to go dark".
 */

const ORDER: Theme[] = ['light', 'dark', 'system'];
const NEXT_ICON: Record<Theme, string> = {
  // Current theme → icon of the NEXT theme in the cycle.
  light: 'dark_mode',  // from light, click → dark
  dark: 'contrast',    // from dark, click → system
  system: 'light_mode', // from system, click → light
};
const NEXT_LABEL: Record<Theme, string> = {
  light: 'theme.dark',
  dark: 'settings.system',
  system: 'theme.light',
};

export function ThemeToggle() {
  const t = useT();
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const next = () => {
    const idx = ORDER.indexOf(theme);
    setTheme(ORDER[(idx + 1) % ORDER.length]);
  };
  const nextLabel = t(NEXT_LABEL[theme]);
  return (
    <button
      type="button"
      onClick={next}
      data-testid="theme-toggle"
      title={`${t('theme.toggle')} — ${nextLabel}`}
      aria-label={`${t('theme.toggle')}: ${nextLabel}`}
      className="p-2 rounded-lg text-muted hover:text-primary hover:bg-surface transition-colors"
    >
      <span className="material-symbols-outlined text-[18px]">{NEXT_ICON[theme]}</span>
    </button>
  );
}
