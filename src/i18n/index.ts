import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import de from './locales/de.json';
import en from './locales/en.json';

/** localStorage key the detector caches the user's explicit language choice under. */
export const LANGUAGE_STORAGE_KEY = 'i18nextLng';

/** Languages with a bundled translation catalog, shown in the language picker. */
export const LANGUAGE_OPTIONS = [
  { code: 'en', nativeName: 'English' },
  { code: 'de', nativeName: 'Deutsch' },
] as const;

const SUPPORTED_CODES = LANGUAGE_OPTIONS.map((l) => l.code);

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      de: { translation: de },
    },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_CODES,
    // Map regional variants (de-AT, en-GB) onto the base catalog.
    nonExplicitSupportedLngs: true,
    interpolation: {
      // React already escapes interpolated values against XSS.
      escapeValue: false,
    },
    detection: {
      // An explicit picker choice wins; otherwise follow the browser/OS locale.
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
    },
    returnNull: false,
  });

/** Keep the <html lang> attribute in sync for screen readers and SEO. */
function syncHtmlLang(lng: string) {
  document.documentElement.lang = lng.split('-')[0];
}
i18n.on('languageChanged', syncHtmlLang);
syncHtmlLang(i18n.resolvedLanguage || 'en');

/** True when the user has not explicitly picked a language (following the OS). */
export function isUsingSystemLanguage(): boolean {
  return !localStorage.getItem(LANGUAGE_STORAGE_KEY);
}

/**
 * Switch the UI language. Pass 'system' to follow the browser/OS locale again:
 * the detected language is applied for this session and the cached choice is
 * cleared so the next launch re-detects.
 */
export function setLanguage(lng: string) {
  if (lng === 'system') {
    const nav = (navigator.languages?.[0] ?? navigator.language ?? 'en').split('-')[0];
    const target = (SUPPORTED_CODES as readonly string[]).includes(nav) ? nav : 'en';
    // changeLanguage synchronously triggers the detector's cache write, so
    // removing the key afterwards leaves no stored preference behind.
    void i18n.changeLanguage(target);
    localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  } else {
    void i18n.changeLanguage(lng);
  }
}

export default i18n;
