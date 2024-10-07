import { z } from 'zod';

import {
  DittoTranslator,
  MastodonTranslation,
  Provider,
  SourceLanguage,
  TargetLanguage,
} from '@/translators/translator.ts';
import { languageSchema } from '@/schema.ts';

interface DeepLTranslatorOpts {
  /** DeepL endpoint to use. Default: 'https://api.deepl.com '*/
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
  private readonly provider: Provider;

  constructor(opts: DeepLTranslatorOpts) {
    this.endpoint = opts.endpoint ?? 'https://api.deepl.com';
    this.fetch = opts.fetch ?? globalThis.fetch;
    this.provider = 'DeepL.com';
    this.apiKey = opts.apiKey;
  }

  async translate(
    contentHTMLencoded: string,
    spoilerText: string,
    mediaAttachments: { id: string; description: string }[],
    poll: { id: string; options: { title: string }[] } | null,
    sourceLanguage: SourceLanguage | undefined,
    targetLanguage: TargetLanguage,
    opts?: { signal?: AbortSignal },
  ) {
    // --------------------- START explanation
    // Order of texts:
    // 1 - contentHTMLencoded
    // 2 - spoilerText
    // 3 - mediaAttachments descriptions
    // 4 - poll title options
    const medias = mediaAttachments.map((value) => value.description);

    const polls = poll?.options.map((value) => value.title) ?? [];

    const text = [contentHTMLencoded, spoilerText].concat(medias, polls);
    // --------------------- END explanation

    const body: any = {
      text,
      target_lang: targetLanguage.toUpperCase(),
      tag_handling: 'html',
      split_sentences: '1',
    };
    if (sourceLanguage) {
      body.source_lang = sourceLanguage.toUpperCase();
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
    const data = DeepLTranslator.schema().parse(json).translations;

    const mastodonTranslation: MastodonTranslation = {
      content: '',
      spoiler_text: '',
      media_attachments: [],
      poll: null,
      detected_source_language: 'en',
      provider: this.provider,
    };

    /** Used to keep track of the offset. When slicing, should be used as the start value. */
    let startIndex = 0;
    mastodonTranslation.content = data[0].text;
    startIndex++;

    mastodonTranslation.spoiler_text = data[1].text;
    startIndex++;

    if (medias.length) {
      const mediasTranslated = data.slice(startIndex, startIndex + medias.length);
      for (let i = 0; i < mediasTranslated.length; i++) {
        mastodonTranslation.media_attachments.push({
          id: mediaAttachments[i].id,
          description: mediasTranslated[i].text,
        });
      }
      startIndex += mediasTranslated.length;
    }

    if (polls.length && poll) {
      const pollsTranslated = data.slice(startIndex);
      mastodonTranslation.poll = {
        id: poll.id,
        options: [],
      };
      for (let i = 0; i < pollsTranslated.length; i++) {
        mastodonTranslation.poll.options.push({
          title: pollsTranslated[i].text,
        });
      }
      startIndex += pollsTranslated.length;
    }

    mastodonTranslation.detected_source_language = data[0].detected_source_language;

    return {
      data: mastodonTranslation,
    };
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
}
