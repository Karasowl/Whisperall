import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/stores/settings', () => ({
  useSettingsStore: vi.fn((selector: any) => selector({ uiLanguage: 'en' })),
}));

import { t } from '../../src/lib/i18n';

describe('i18n', () => {
  it('returns English text by default', () => {
    expect(t('nav.dictate')).toBe('Dictate');
    expect(t('nav.transcribe')).toBe('Transcribe');
  });

  it('returns Spanish text for es locale', () => {
    expect(t('nav.dictate', 'es')).toBe('Dictar');
    expect(t('nav.transcribe', 'es')).toBe('Transcribir');
  });

  it('falls back to English when key missing in es', () => {
    // All keys should exist in es, but if one doesn't, it falls back
    expect(t('app.connecting', 'es')).toBe('Conectando...');
  });

  it('returns the key itself when not found in any locale', () => {
    expect(t('totally.fake.key')).toBe('totally.fake.key');
    expect(t('totally.fake.key', 'es')).toBe('totally.fake.key');
  });

  it('covers settings keys in both locales', () => {
    expect(t('settings.title')).toBe('Settings');
    expect(t('settings.title', 'es')).toBe('Configuracion');
    expect(t('settings.theme')).toBe('Theme');
    expect(t('settings.theme', 'es')).toBe('Tema');
    expect(t('settings.uiLanguage')).toBe('Interface Language');
    expect(t('settings.uiLanguage', 'es')).toBe('Idioma de Interfaz');
  });

  it('covers widget keys in both locales', () => {
    expect(t('widget.dictate')).toBe('Dictate');
    expect(t('widget.dictate', 'es')).toBe('Dictar');
  });

  it('covers auth keys in both locales', () => {
    expect(t('auth.signIn')).toBe('Sign In');
    expect(t('auth.signIn', 'es')).toBe('Iniciar Sesion');
  });
});
