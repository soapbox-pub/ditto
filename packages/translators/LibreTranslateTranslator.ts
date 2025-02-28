import { z } from 'zod';

import { languageSchema } from './schema.ts';

import type { LanguageCode } from 'iso-639-1';
import type { DittoTranslator } from './DittoTranslator.ts';

interface LibreTranslateTranslatorOpts {
  /** Libretranslate endpoint to use. Default: 'https://libretranslate.com' */
  baseUrl?: string;
  /** Libretranslate API key. */
  apiKey: string;
  /** Custom fetch implementation. */
  fetch?: typeof fetch;
}

export class LibreTranslateTranslator implements DittoTranslator {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetch: typeof fetch;

  readonly provider = 'libretranslate.com';

  constructor(opts: LibreTranslateTranslatorOpts) {
    this.baseUrl = opts.baseUrl ?? 'https://libretranslate.com';
    this.fetch = opts.fetch ?? globalThis.fetch;
    this.apiKey = opts.apiKey;
  }

  async translate(
    texts: string[],
    source: LanguageCode | undefined,
    dest: LanguageCode,
    opts?: { signal?: AbortSignal },
  ): Promise<{ results: string[]; sourceLang: LanguageCode }> {
    const translations = await Promise.all(
      texts.map((text) => this.translateOne(text, source, dest, 'html', { signal: opts?.signal })),
    );

    return {
      results: translations.map((value) => value.translatedText),
      sourceLang: (translations[0]?.detectedLanguage?.language ?? source) as LanguageCode, // cast is ok
    };
  }

  private async translateOne(
    q: string,
    sourceLanguage: string | undefined,
    targetLanguage: string,
    format: 'html' | 'text',
    opts?: { signal?: AbortSignal },
  ) {
    const body = {
      q,
      source: sourceLanguage?.toLowerCase() ?? 'auto',
      target: targetLanguage.toLowerCase(),
      format,
      api_key: this.apiKey,
    };

    const url = new URL('/translate', this.baseUrl);

    const request = new Request(url, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
      },
      signal: opts?.signal,
    });

    const response = await this.fetch(request);
    const json = await response.json();

    if (!response.ok) {
      const result = LibreTranslateTranslator.errorSchema().safeParse(json);

      if (result.success) {
        throw new Error(result.data.error);
      } else {
        throw new Error(`Unexpected LibreTranslate error: ${response.statusText} (${response.status})`);
      }
    }

    return LibreTranslateTranslator.schema().parse(json);
  }

  /** Libretranslate response schema.
   *  https://libretranslate.com/docs/#/translate/post_translate */
  private static schema() {
    return z.object({
      translatedText: z.string(),
      /** This field is only available if the 'source' is set to 'auto' */
      detectedLanguage: z.object({
        language: languageSchema,
      }).optional(),
    });
  }

  /** Libretranslate error response schema. */
  private static errorSchema() {
    return z.object({
      error: z.string(),
    });
  }
}
