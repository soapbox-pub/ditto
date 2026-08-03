import { useEffect, useState, type ReactNode } from 'react';
import { IntlProvider } from 'react-intl';

import { useLanguage } from '@/hooks/useLanguage';
import { hasCatalog, loadCatalog, peekCatalog } from '@/i18n/language';

interface Catalog {
  locale: string;
  messages?: Record<string, string>;
}

/** Resolve a catalog without waiting: locale needs none, or its chunk is already in. */
function resolveSync(locale: string): Catalog | null {
  if (!hasCatalog(locale)) return { locale };
  const messages = peekCatalog(locale);
  return messages ? { locale, messages } : null;
}

/**
 * Feeds `react-intl` the locale from `AppConfig`, loading that locale's
 * translation catalog chunk on demand. Must render inside `AppProvider`.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const { locale } = useLanguage();
  const [catalog, setCatalog] = useState<Catalog | null>(() => resolveSync(locale));

  useEffect(() => {
    if (catalog?.locale === locale) return;

    const sync = resolveSync(locale);
    if (sync) {
      setCatalog(sync);
      return;
    }

    // Keep the previous language on screen until the new catalog arrives, so
    // switching languages never flashes untranslated English.
    let cancelled = false;
    loadCatalog(locale)
      .then((messages) => {
        if (!cancelled) setCatalog({ locale, messages });
      })
      .catch(() => {
        // Chunk failed to load: fall back to the inline English defaultMessages.
        if (!cancelled) setCatalog({ locale });
      });

    return () => {
      cancelled = true;
    };
  }, [locale, catalog]);

  // Keep <html lang> in sync for screen readers and SEO.
  useEffect(() => {
    if (catalog) document.documentElement.lang = catalog.locale;
  }, [catalog]);

  // Only reached on the very first paint of a translated locale — English and
  // already-loaded catalogs resolve synchronously.
  if (!catalog) return null;

  return (
    <IntlProvider
      locale={catalog.locale}
      defaultLocale="en"
      messages={catalog.messages}
      onError={(err) => {
        // Missing translations fall back to the inline English defaultMessage
        // by design: catalogs are synced in batches, not on every change.
        if (err.code !== 'MISSING_TRANSLATION') console.error(err);
      }}
    >
      {children}
    </IntlProvider>
  );
}
