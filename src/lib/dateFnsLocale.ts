import type { Locale } from 'date-fns';
import { de, enUS, ja } from 'date-fns/locale';

const LOCALES: Record<string, Locale> = { en: enUS, de, ja };

/**
 * date-fns locale matching an app (react-intl) locale code, e.g. `intl.locale`.
 * Falls back to English for unknown codes.
 */
export function getDateFnsLocale(locale: string): Locale {
  return LOCALES[locale] ?? LOCALES[locale.split('-')[0]] ?? enUS;
}
