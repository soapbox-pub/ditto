import { LanguageCode } from 'iso-639-1';
import { z } from 'zod';

import { DittoTranslator, SourceLanguage, TargetLanguage } from '@/translators/translator.ts';
import { languageSchema } from '@/schema.ts';

interface DeepLTranslatorOpts {
  /** DeepL endpoint to use. Default: 'https://api.deepl.com' */
  endpoint?: string;
  /** DeepL API key. */
  apiKey: string;
  /** Custom fetch implementation. */
  fetch?: typeof fetch;
}

export class DeepLTranslator implements DittoTranslator {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly fetch: typeof fetch;
  private static provider = 'DeepL.com';

  constructor(opts: DeepLTranslatorOpts) {
    this.endpoint = opts.endpoint ?? 'https://api.deepl.com';
    this.fetch = opts.fetch ?? globalThis.fetch;
    this.apiKey = opts.apiKey;
  }

  async translate(
    texts: string[],
    source: SourceLanguage | undefined,
    dest: TargetLanguage,
    opts?: { signal?: AbortSignal },
  ) {
    const data = (await this.translateMany(texts, source, dest, opts)).translations;

    return {
      results: data.map((value) => value.text),
      source_lang: data[0].detected_source_language as LanguageCode,
    };
  }

  /** DeepL translate request. */
  private async translateMany(
    texts: string[],
    source: SourceLanguage | undefined,
    targetLanguage: TargetLanguage,
    opts?: { signal?: AbortSignal },
  ) {
    const body: any = {
      text: texts,
      target_lang: targetLanguage.toUpperCase(),
      tag_handling: 'html',
      split_sentences: '1',
    };
    if (source) {
      body.source_lang = source.toUpperCase();
    }

    const headers = new Headers();
    headers.append('Authorization', 'DeepL-Auth-Key' + ' ' + this.apiKey);
    headers.append('Content-Type', 'application/json');

    const request = new Request(this.endpoint + '/v2/translate', {
      method: 'POST',
      body: JSON.stringify(body),
      headers,
      signal: opts?.signal,
    });

    const response = await this.fetch(request);
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json['message']);
    }
    const data = DeepLTranslator.schema().parse(json);

    return data;
  }

  /** DeepL response schema.
   * https://developers.deepl.com/docs/api-reference/translate/openapi-spec-for-text-translation */
  private static schema() {
    return z.object({
      translations: z.array(
        z.object({
          detected_source_language: languageSchema,
          text: z.string(),
        }),
      ),
    });
  }

  /** DeepL provider. */
  getProvider(): string {
    return DeepLTranslator.provider;
  }
}
