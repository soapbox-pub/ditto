import { useCallback } from 'react';

import { useAppContext } from '@/hooks/useAppContext';
import { detectLocale, SUPPORTED_CODES } from '@/i18n/language';

export interface LanguageState {
  /** Active locale code, e.g. 'en', 'de', 'ja'. */
  locale: string;
  /** True when following the browser/OS locale instead of an explicit choice. */
  system: boolean;
  /** Switch language; pass 'system' to follow the browser/OS locale again. */
  setLanguage: (code: string) => void;
}

/**
 * Current language and the language picker's setter.
 *
 * The choice lives in `AppConfig.locale`, so it persists to localStorage and
 * rides along with the rest of the app config when settings sync to Nostr.
 */
export function useLanguage(): LanguageState {
  const { config, updateConfig } = useAppContext();

  // Anything that isn't a supported code — including the explicit 'system'
  // sentinel and an unset config — follows the browser/OS locale.
  const stored = config.locale;
  const locale = stored && SUPPORTED_CODES.includes(stored) ? stored : detectLocale();

  const setLanguage = useCallback((code: string) => {
    updateConfig((prev) => ({ ...prev, locale: code }));
  }, [updateConfig]);

  return { locale, system: locale !== stored, setLanguage };
}
