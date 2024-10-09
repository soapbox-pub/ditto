import { LanguageCode } from 'iso-639-1';
import { z } from 'zod';

import { DittoTranslator, Provider, SourceLanguage, TargetLanguage } from '@/translators/translator.ts';
import { languageSchema } from '@/schema.ts';

interface LibreTranslateTranslatorOpts {
  /** Libretranslate endpoint to use. Default: 'https://libretranslate.com' */
  endpoint?: string;
  /** Libretranslate API key. */
  apiKey: string;
  /** Custom fetch implementation. */
  fetch?: typeof fetch;
}

export class LibreTranslateTranslator implements DittoTranslator {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly fetch: typeof fetch;
  private static provider: Provider = 'libretranslate.com';

  constructor(opts: LibreTranslateTranslatorOpts) {
    this.endpoint = opts.endpoint ?? 'https://libretranslate.com';
    this.fetch = opts.fetch ?? globalThis.fetch;
    this.apiKey = opts.apiKey;
  }

  async translate(
    texts: string[],
    source: SourceLanguage | undefined,
    dest: TargetLanguage,
    opts?: { signal?: AbortSignal },
  ) {
    const translations = await Promise.all(
      texts.map((text) => this.translateOne(text, source, dest, 'html', { signal: opts?.signal })),
    );

    return {
      results: translations.map((value) => value.translatedText),
      source_lang: translations[0]?.detectedLanguage?.language ?? source as LanguageCode, // cast is ok
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

    const headers = new Headers();
    headers.append('Content-Type', 'application/json');

    const request = new Request(this.endpoint + '/translate', {
      method: 'POST',
      body: JSON.stringify(body),
      headers,
      signal: opts?.signal,
    });

    const response = await this.fetch(request);
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json['error']);
    }
    const data = LibreTranslateTranslator.schema().parse(json);

    return data;
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

  /** LibreTranslate provider. */
  getProvider(): Provider {
    return LibreTranslateTranslator.provider;
  }
}
