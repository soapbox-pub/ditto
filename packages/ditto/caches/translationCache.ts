import { MastodonTranslation } from '@ditto/mastoapi/types';
import { LanguageCode } from 'iso-639-1';
import { LRUCache } from 'lru-cache';

import { Conf } from '@/config.ts';

/** Translations LRU cache. */
export const translationCache = new LRUCache<`${LanguageCode}-${string}`, MastodonTranslation>({
  max: Conf.caches.translation.max,
  ttl: Conf.caches.translation.ttl,
});
