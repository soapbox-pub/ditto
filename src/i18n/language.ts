/** Languages with a bundled translation catalog, shown in the language picker. */
export const LANGUAGE_OPTIONS = [
  { code: 'en', nativeName: 'English' },
  { code: 'de', nativeName: 'Deutsch' },
  { code: 'ja', nativeName: '日本語' },
] as const;

export const SUPPORTED_CODES: readonly string[] = LANGUAGE_OPTIONS.map((l) => l.code);

/**
 * Translation catalogs, imported lazily so each locale is emitted as its own
 * chunk instead of being bundled into the app entry for every user.
 * English needs no catalog: it lives inline in each `defaultMessage`.
 */
const CATALOGS: Record<string, () => Promise<{ default: Record<string, string> }>> = {
  de: () => import('./locales/de.json'),
  ja: () => import('./locales/ja.json'),
};

const loaded = new Map<string, Record<string, string>>();

/** Whether a locale has a translation catalog to load at all. */
export function hasCatalog(locale: string): boolean {
  return locale in CATALOGS;
}

/** Already-loaded catalog for a locale, if its chunk has been fetched. */
export function peekCatalog(locale: string): Record<string, string> | undefined {
  return loaded.get(locale);
}

/** Fetch a locale's catalog chunk, memoized for the lifetime of the page. */
export async function loadCatalog(locale: string): Promise<Record<string, string> | undefined> {
  const cached = loaded.get(locale);
  if (cached) return cached;

  const load = CATALOGS[locale];
  if (!load) return undefined;

  const { default: messages } = await load();
  loaded.set(locale, messages);
  return messages;
}

/** Preferred locale from the browser/OS, falling back to English. */
export function detectLocale(): string {
  const nav = (navigator.languages?.[0] ?? navigator.language ?? 'en').split('-')[0];
  return SUPPORTED_CODES.includes(nav) ? nav : 'en';
}
