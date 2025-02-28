import { logi } from '@soapbox/logi';
import { z } from 'zod';

import { AppController } from '@/app.ts';
import { dittoUploads } from '@/DittoUploads.ts';
import { fileSchema } from '@/schema.ts';
import { parseBody } from '@/utils/api.ts';
import { renderAttachment } from '@/views/mastodon/attachments.ts';
import { errorJson } from '@/utils/log.ts';
import { uploadFile } from '@/utils/upload.ts';

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
  const { user, signal, requestId } = c.var;

  const pubkey = await user!.signer.getPublicKey();
  const result = mediaBodySchema.safeParse(await parseBody(c.req.raw));

  if (!result.success) {
    return c.json({ error: 'Bad request.', schema: result.error }, 422);
  }

  try {
    const { file, description } = result.data;
    const media = await uploadFile(c, file, { pubkey, description }, signal);
    return c.json(renderAttachment(media));
  } catch (e) {
    logi({ level: 'error', ns: 'ditto.api.media', requestId, error: errorJson(e) });
    return c.json({ error: 'Failed to upload file.' }, 500);
  }
};

const updateMediaController: AppController = async (c) => {
  const result = mediaUpdateSchema.safeParse(await parseBody(c.req.raw));

  if (!result.success) {
    return c.json({ error: 'Bad request.', schema: result.error }, 422);
  }

  const id = c.req.param('id');
  const { description } = result.data;
  const upload = dittoUploads.get(id);

  if (!upload) {
    return c.json({ error: 'File with specified ID not found.' }, 404);
  }

  dittoUploads.set(id, {
    ...upload,
    tags: upload.tags.filter(([name]) => name !== 'alt').concat([['alt', description]]),
  });

  return c.json({ message: 'ok' }, 200);
};

export { mediaController, updateMediaController };
