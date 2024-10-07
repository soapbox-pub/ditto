import { z } from 'zod';

import {
  DittoTranslator,
  MastodonTranslation,
  Provider,
  SourceLanguage,
  TargetLanguage,
} from '@/translators/translator.ts';

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
  private readonly provider: Provider;

  constructor(opts: LibreTranslateTranslatorOpts) {
    this.endpoint = opts.endpoint ?? 'https://libretranslate.com';
    this.fetch = opts.fetch ?? globalThis.fetch;
    this.provider = 'libretranslate.com';
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
    const mastodonTranslation: MastodonTranslation = {
      content: '',
      spoiler_text: '',
      media_attachments: [],
      poll: null,
      detected_source_language: 'en',
      provider: this.provider,
    };

    const translatedContent = await this.makeRequest(contentHTMLencoded, sourceLanguage, targetLanguage, 'html', {
      signal: opts?.signal,
    });
    mastodonTranslation.content = translatedContent;

    if (spoilerText.length) {
      const translatedSpoilerText = await this.makeRequest(spoilerText, sourceLanguage, targetLanguage, 'text', {
        signal: opts?.signal,
      });
      mastodonTranslation.spoiler_text = translatedSpoilerText;
    }

    if (mediaAttachments) {
      for (const media of mediaAttachments) {
        const translatedDescription = await this.makeRequest(
          media.description,
          sourceLanguage,
          targetLanguage,
          'text',
          {
            signal: opts?.signal,
          },
        );
        mastodonTranslation.media_attachments.push({
          id: media.id,
          description: translatedDescription,
        });
      }
    }

    if (poll) {
      mastodonTranslation.poll = {
        id: poll.id,
        options: [],
      };

      for (const option of poll.options) {
        const translatedTitle = await this.makeRequest(
          option.title,
          sourceLanguage,
          targetLanguage,
          'text',
          {
            signal: opts?.signal,
          },
        );
        mastodonTranslation.poll.options.push({
          title: translatedTitle,
        });
      }
    }

    return {
      data: mastodonTranslation,
    };
  }

  private async makeRequest(
    q: string,
    sourceLanguage: string | undefined,
    targetLanguage: string,
    format: 'html' | 'text',
    opts?: { signal?: AbortSignal },
  ): Promise<string> {
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
    const data = LibreTranslateTranslator.schema().parse(json).translatedText;

    return data;
  }

  /** Libretranslate response schema.
   *  https://libretranslate.com/docs/#/translate/post_translate */
  private static schema() {
    return z.object({
      translatedText: z.string(),
    });
  }
}
