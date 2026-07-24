import { createContext, useContext } from 'react';

/** localStorage key holding the user's explicit language choice. */
export const LANGUAGE_STORAGE_KEY = 'ditto:language';

/** Languages with a bundled translation catalog, shown in the language picker. */
export const LANGUAGE_OPTIONS = [
  { code: 'en', nativeName: 'English' },
  { code: 'de', nativeName: 'Deutsch' },
  { code: 'ja', nativeName: '日本語' },
] as const;

export const SUPPORTED_CODES: readonly string[] = LANGUAGE_OPTIONS.map((l) => l.code);

/** Detect the preferred locale: explicit picker choice first, then the browser/OS. */
export function detectLocale(): string {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored && SUPPORTED_CODES.includes(stored)) return stored;
  const nav = (navigator.languages?.[0] ?? navigator.language ?? 'en').split('-')[0];
  return SUPPORTED_CODES.includes(nav) ? nav : 'en';
}

export interface LanguageState {
  /** Active locale code, e.g. 'en', 'de', 'ja'. */
  locale: string;
  /** True when following the browser/OS locale (no explicit choice stored). */
  system: boolean;
  /** Switch language; pass 'system' to follow the browser/OS locale again. */
  setLanguage: (code: string) => void;
}

export const LanguageContext = createContext<LanguageState | null>(null);

/** Current language state and the picker's setter. */
export function useLanguage(): LanguageState {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within I18nProvider');
  return ctx;
}
