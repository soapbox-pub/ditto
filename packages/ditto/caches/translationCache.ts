import { LanguageCode } from 'iso-639-1';
import { LRUCache } from 'lru-cache';

import { Conf } from '@/config.ts';
import { MastodonTranslation } from '@/entities/MastodonTranslation.ts';

/** Translations LRU cache. */
export const translationCache = new LRUCache<`${LanguageCode}-${string}`, MastodonTranslation>({
  max: Conf.caches.translation.max,
  ttl: Conf.caches.translation.ttl,
});
