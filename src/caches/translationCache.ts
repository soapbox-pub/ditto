import { LanguageCode } from 'iso-639-1';
import { LRUCache } from 'lru-cache';

import { MastodonTranslation } from '@/entities/MastodonTranslation.ts';
import { Time } from '@/utils/time.ts';

/** Entity returned by DittoTranslator and LRUCache */
interface DittoTranslation {
  data: MastodonTranslation;
}

/** Translations LRU cache. */
export const translationCache = new LRUCache<`${LanguageCode}-${string}`, DittoTranslation>({
  max: 1000,
  ttl: Time.hours(6),
});
