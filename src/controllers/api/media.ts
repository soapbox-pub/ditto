import { z } from 'zod';

import { AppController } from '@/app.ts';
import { fileSchema } from '@/schema.ts';
import { parseBody } from '@/utils/api.ts';
import { renderAttachment } from '@/views/mastodon/attachments.ts';
import { uploadFile } from '@/utils/upload.ts';
import { setMediaDescription } from '@/db/unattached-media.ts';

const mediaBodySchema = z.object({
  file: fileSchema,
  thumbnail: fileSchema.optional(),
  description: z.string().optional(),
  focus: z.string().optional(),
});

const mediaUpdateSchema = z.object({
  description: z.string(),
});

const mediaController: AppController = async (c) => {
  const pubkey = await c.get('signer')?.getPublicKey()!;
  const result = mediaBodySchema.safeParse(await parseBody(c.req.raw));
  const { signal } = c.req.raw;

  if (!result.success) {
    return c.json({ error: 'Bad request.', schema: result.error }, 422);
  }

  try {
    const { file, description } = result.data;
    const media = await uploadFile(c, file, { pubkey, description }, signal);
    return c.json(renderAttachment(media));
  } catch (e) {
    console.error(e);
    return c.json({ error: 'Failed to upload file.' }, 500);
  }
};

const updateMediaController: AppController = async (c) => {
  const result = mediaUpdateSchema.safeParse(await parseBody(c.req.raw));
  if (!result.success) {
    return c.json({ error: 'Bad request.', schema: result.error }, 422);
  }
  try {
    const { description } = result.data;
    if (!await setMediaDescription(c.req.param('id'), description)) {
      return c.json({ error: 'File with specified ID not found.' }, 404);
    }
  } catch (e) {
    console.error(e);
    return c.json({ error: 'Failed to set media description.' }, 500);
  }

  return c.json({ message: 'ok' }, 200);
};

export { mediaController, updateMediaController };
