/**
 * Build relay filter values for tag pages.
 *
 * For hashtags (`#t`), include common case variants because many relays index
 * tag values case-sensitively while users expect hashtag navigation to be
 * case-insensitive.
 */
export function buildTagFilterValues(tag: string, filterKey: '#t' | '#g'): string[] {
  const normalized = tag.trim();
  if (!normalized) return [];

  if (filterKey !== '#t') {
    return [normalized];
  }

  const values = [normalized, normalized.toLowerCase(), normalized.toUpperCase()];
  return Array.from(new Set(values));
}
