import { LanguageCode } from 'iso-639-1';
import { z } from 'zod';

import { AppController } from '@/app.ts';
import { languageSchema } from '@/schema.ts';
import { Storages } from '@/storages.ts';
import { dittoTranslations, dittoTranslationsKey } from '@/translators/translator.ts';
import { parseBody } from '@/utils/api.ts';
import { getEvent } from '@/queries.ts';
import { renderStatus } from '@/views/mastodon/statuses.ts';

const translateSchema = z.object({
  //lang: languageSchema, // Correct property name, as stated by Mastodon docs
  target_language: languageSchema, // Property name soapbox sends
});

const translateController: AppController = async (c) => {
  const result = translateSchema.safeParse(await parseBody(c.req.raw));
  const { signal } = c.req.raw;

  if (!result.success) {
    return c.json({ error: 'Bad request.', schema: result.error }, 422);
  }

  const translator = c.get('translator');
  if (!translator) {
    return c.json({ error: 'No translator configured.' }, 500);
  }

  const { target_language } = result.data;
  const targetLang = target_language;
  const id = c.req.param('id');

  const event = await getEvent(id, { signal });
  if (!event) {
    return c.json({ error: 'Record not found' }, 400);
  }

  const viewerPubkey = await c.get('signer')?.getPublicKey();

  if (targetLang.toLowerCase() === event?.language?.toLowerCase()) {
    return c.json({ error: 'Source and target languages are the same. No translation needed.' }, 400);
  }

  const status = await renderStatus(event, { viewerPubkey });

  const translatedId = `${target_language}-${id}` as dittoTranslationsKey;
  const translationCache = dittoTranslations.get(translatedId);

  if (translationCache) {
    return c.json(translationCache.data, 200);
  }

  const mediaAttachments = status?.media_attachments.map((value) => {
    return {
      id: value.id,
      description: value.description ?? '',
    };
  }) ?? [];

  try {
    const translation = await translator.translate(
      status?.content ?? '',
      status?.spoiler_text ?? '',
      mediaAttachments,
      null,
      event.language,
      targetLang,
      { signal },
    );
    dittoTranslations.set(translatedId, translation);
    return c.json(translation.data, 200);
  } catch (_) {
    return c.json({ error: 'Service Unavailable' }, 503);
  }
};

export { translateController };
