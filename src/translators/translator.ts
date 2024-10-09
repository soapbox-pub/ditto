import { LanguageCode } from 'iso-639-1';
import { LRUCache } from 'lru-cache';

import { Time } from '@/utils/time.ts';

/** Supported providers. */
export type Provider = 'DeepL.com' | 'libretranslate.com';

/** Original language of the post */
export type SourceLanguage = LanguageCode;

/** Content will be translated to this language */
export type TargetLanguage = LanguageCode;

/** Entity returned by DittoTranslator and LRUCache */
type DittoTranslation = {
  data: MastodonTranslation;
};

export type MastodonTranslation = {
  /** HTML-encoded translated content of the status. */
  content: string;
  /** The translated spoiler warning of the status. */
  spoiler_text: string;
  /** The translated media descriptions of the status. */
  media_attachments: { id: string; description: string }[];
  /** The translated poll of the status. */
  poll: { id: string; options: { title: string }[] } | null;
  //** The language of the source text, as auto-detected by the machine translation provider. */
  detected_source_language: SourceLanguage;
  /** The service that provided the machine translation. */
  provider: Provider;
};

/** DittoTranslator class, used for status translation. */
export interface DittoTranslator {
  /** Translate the 'content' into 'targetLanguage'. */
  translate(
    texts: string[],
    /** The language of the source text/status. */
    sourceLanguage: SourceLanguage | undefined,
    /** The status content will be translated into this language. */
    targetLanguage: TargetLanguage,
    /** Custom options. */
    opts?: { signal?: AbortSignal },
  ): Promise<{ results: string[]; source_lang: SourceLanguage }>;
  getProvider(): Provider;
}

/** Includes the TARGET language and the status id.
 *  Example: en-390f5b01b49a8ee6e13fe917420c023d889b3da8e983a14c9e84587e43d12c15
 *  The example above means:
 *  I want the status 390f5b01b49a8ee6e13fe917420c023d889b3da8e983a14c9e84587e43d12c15 translated to english (if it exists in the LRUCache). */
export type dittoTranslationsKey = `${TargetLanguage}-${string}`;

export const dittoTranslations = new LRUCache<dittoTranslationsKey, DittoTranslation>({
  max: 1000,
  ttl: Time.hours(6),
});
