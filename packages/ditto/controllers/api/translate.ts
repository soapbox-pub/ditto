import { cachedTranslationsSizeGauge } from '@ditto/metrics';
import { MastodonTranslation } from '@ditto/mastoapi/types';
import { logi } from '@soapbox/logi';
import { LanguageCode } from 'iso-639-1';
import { z } from 'zod';

import { AppController } from '@/app.ts';
import { translationCache } from '@/caches/translationCache.ts';
import { getEvent } from '@/queries.ts';
import { localeSchema } from '@/schema.ts';
import { parseBody } from '@/utils/api.ts';
import { renderStatus } from '@/views/mastodon/statuses.ts';
import { errorJson } from '@/utils/log.ts';

const translateSchema = z.object({
  lang: localeSchema,
});

const translateController: AppController = async (c) => {
  const { relay, user, signal, requestId } = c.var;

  const result = translateSchema.safeParse(await parseBody(c.req.raw));

  if (!result.success) {
    return c.json({ error: 'Bad request.', schema: result.error }, 422);
  }

  const translator = c.get('translator');
  if (!translator) {
    return c.json({ error: 'No translator configured.' }, 500);
  }

  const lang = result.data.lang.language.slice(0, 2) as LanguageCode;

  const id = c.req.param('id');

  const event = await getEvent(id, c.var);
  if (!event) {
    return c.json({ error: 'Record not found' }, 400);
  }

  const viewerPubkey = await user?.signer.getPublicKey();

  if (lang.toLowerCase() === event?.language?.toLowerCase()) {
    return c.json({ error: 'Source and target languages are the same. No translation needed.' }, 400);
  }

  const status = await renderStatus(relay, event, { viewerPubkey });
  if (!status?.content) {
    return c.json({ error: 'Bad request.', schema: result.error }, 400);
  }

  const cacheKey: `${LanguageCode}-${string}` = `${lang}-${id}`;
  const cached = translationCache.get(cacheKey);

  if (cached) {
    return c.json(cached, 200);
  }

  const mediaAttachments = status?.media_attachments.map((value) => {
    return {
      id: value.id,
      description: value.description ?? '',
    };
  }) ?? [];

  try {
    const texts: string[] = [];

    const mastodonTranslation: MastodonTranslation = {
      content: '',
      spoiler_text: '',
      media_attachments: [],
      poll: null,
      detected_source_language: event.language ?? 'en',
      provider: translator.provider,
    };

    if ((status?.poll as MastodonTranslation['poll'])?.options) {
      mastodonTranslation.poll = { id: (status?.poll as MastodonTranslation['poll'])?.id!, options: [] };
    }

    type TranslationIndex = {
      [key: number]: 'content' | 'spoilerText' | 'poll' | { type: 'media'; id: string };
    };
    const translationIndex: TranslationIndex = {};
    let index = 0;

    // Content
    translationIndex[index] = 'content';
    texts.push(status.content);
    index++;

    // Spoiler text
    if (status.spoiler_text) {
      translationIndex[index] = 'spoilerText';
      texts.push(status.spoiler_text);
      index++;
    }

    // Media description
    for (const [mediaIndex, value] of mediaAttachments.entries()) {
      translationIndex[index + mediaIndex] = { type: 'media', id: value.id };
      texts.push(mediaAttachments[mediaIndex].description);
      index += mediaIndex;
    }

    // Poll title
    if (status?.poll) {
      for (const [pollIndex] of (status?.poll as MastodonTranslation['poll'])!.options.entries()) {
        translationIndex[index + pollIndex] = 'poll';
        texts.push((status.poll as MastodonTranslation['poll'])!.options[pollIndex].title);
        index += pollIndex;
      }
    }

    const data = await translator.translate(texts, event.language, lang, { signal });
    const translatedTexts = data.results;

    for (let i = 0; i < texts.length; i++) {
      if (translationIndex[i] === 'content') {
        mastodonTranslation.content = translatedTexts[i];
      } else if (translationIndex[i] === 'spoilerText') {
        mastodonTranslation.spoiler_text = translatedTexts[i];
      } else if (translationIndex[i] === 'poll') {
        mastodonTranslation.poll?.options.push({ title: translatedTexts[i] });
      } else {
        const media = translationIndex[i] as { type: 'media'; id: string };
        mastodonTranslation.media_attachments.push({
          id: media.id,
          description: translatedTexts[i],
        });
      }
    }

    mastodonTranslation.detected_source_language = data.sourceLang;

    translationCache.set(cacheKey, mastodonTranslation);
    cachedTranslationsSizeGauge.set(translationCache.size);

    return c.json(mastodonTranslation, 200);
  } catch (e) {
    if (e instanceof Error && e.message.includes('not supported')) {
      return c.json({ error: `Translation of source language '${event.language}' not supported` }, 422);
    }
    logi({ level: 'error', ns: 'ditto.translate', requestId, error: errorJson(e) });
    return c.json({ error: 'Service Unavailable' }, 503);
  }
};

export { translateController };
