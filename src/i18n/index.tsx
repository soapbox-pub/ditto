import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { IntlProvider } from 'react-intl';

import de from './locales/de.json';
import ja from './locales/ja.json';
import { detectLocale, LanguageContext, LANGUAGE_STORAGE_KEY, type LanguageState } from './language';

/** Translation catalogs by locale. English needs none: it lives inline in defaultMessage. */
const MESSAGES: Record<string, Record<string, string>> = { de, ja };

export function I18nProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(() => ({
    locale: detectLocale(),
    system: !localStorage.getItem(LANGUAGE_STORAGE_KEY),
  }));

  const value = useMemo<LanguageState>(() => ({
    ...state,
    setLanguage: (code: string) => {
      if (code === 'system') {
        localStorage.removeItem(LANGUAGE_STORAGE_KEY);
        setState({ locale: detectLocale(), system: true });
      } else {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
        setState({ locale: code, system: false });
      }
    },
  }), [state]);

  // Keep <html lang> in sync for screen readers and SEO.
  useEffect(() => {
    document.documentElement.lang = state.locale;
  }, [state.locale]);

  return (
    <LanguageContext.Provider value={value}>
      <IntlProvider
        locale={state.locale}
        defaultLocale="en"
        messages={MESSAGES[state.locale]}
        onError={(err) => {
          // Missing translations fall back to the inline English defaultMessage
          // by design — catalogs are synced in batches, not on every change.
          if (err.code !== 'MISSING_TRANSLATION') console.error(err);
        }}
      >
        {children}
      </IntlProvider>
    </LanguageContext.Provider>
  );
}
