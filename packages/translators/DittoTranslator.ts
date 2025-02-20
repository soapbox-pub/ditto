import type { LanguageCode } from 'iso-639-1';

/** DittoTranslator class, used for status translation. */
export interface DittoTranslator {
  /** Provider name, eg `DeepL.com` */
  provider: string;
  /** Translate the 'content' into 'targetLanguage'. */
  translate(
    /** Texts to translate. */
    texts: string[],
    /** The language of the source texts. */
    sourceLanguage: LanguageCode | undefined,
    /** The texts will be translated into this language. */
    targetLanguage: LanguageCode,
    /** Custom options. */
    opts?: { signal?: AbortSignal },
  ): Promise<{ results: string[]; sourceLang: LanguageCode }>;
}
