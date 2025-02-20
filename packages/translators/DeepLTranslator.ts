import { z } from 'zod';

import { languageSchema } from './schema.ts';

import type { LanguageCode } from 'iso-639-1';
import type { DittoTranslator } from './DittoTranslator.ts';

interface DeepLTranslatorOpts {
  /** DeepL base URL to use. Default: 'https://api.deepl.com' */
  baseUrl?: string;
  /** DeepL API key. */
  apiKey: string;
  /** Custom fetch implementation. */
  fetch?: typeof fetch;
}

export class DeepLTranslator implements DittoTranslator {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetch: typeof fetch;

  readonly provider = 'DeepL.com';

  constructor(opts: DeepLTranslatorOpts) {
    this.baseUrl = opts.baseUrl ?? 'https://api.deepl.com';
    this.fetch = opts.fetch ?? globalThis.fetch;
    this.apiKey = opts.apiKey;
  }

  async translate(
    texts: string[],
    source: LanguageCode | undefined,
    dest: LanguageCode,
    opts?: { signal?: AbortSignal },
  ): Promise<{ results: string[]; sourceLang: LanguageCode }> {
    const { translations } = await this.translateMany(texts, source, dest, opts);

    return {
      results: translations.map((value) => value.text),
      sourceLang: translations[0]?.detected_source_language,
    };
  }

  /** DeepL translate request. */
  private async translateMany(
    texts: string[],
    source: LanguageCode | undefined,
    targetLanguage: LanguageCode,
    opts?: { signal?: AbortSignal },
  ) {
    const body = {
      text: texts,
      target_lang: targetLanguage.toUpperCase(),
      tag_handling: 'html',
      split_sentences: '1',
      source_lang: source?.toUpperCase(),
    };

    const url = new URL('/v2/translate', this.baseUrl);

    const request = new Request(url, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Authorization': `DeepL-Auth-Key ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: opts?.signal,
    });

    const response = await this.fetch(request);
    const json = await response.json();

    if (!response.ok) {
      const result = DeepLTranslator.errorSchema().safeParse(json);

      if (result.success) {
        throw new Error(result.data.message);
      } else {
        throw new Error(`Unexpected DeepL error: ${response.statusText} (${response.status})`);
      }
    }

    return DeepLTranslator.schema().parse(json);
  }

  /** DeepL response schema.
   * https://developers.deepl.com/docs/api-reference/translate/openapi-spec-for-text-translation */
  private static schema() {
    return z.object({
      translations: z.array(
        z.object({
          detected_source_language: z.string().transform((val) => val.toLowerCase()).pipe(languageSchema),
          text: z.string(),
        }),
      ),
    });
  }

  /** DeepL error response schema. */
  private static errorSchema() {
    return z.object({
      message: z.string(),
    });
  }
}
