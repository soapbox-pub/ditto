import { AppController } from '@/app.ts';
import { z } from '@/deps.ts';
import { fileSchema } from '@/schema.ts';
import { parseBody } from '@/utils/web.ts';
import { renderAttachment } from '@/views/mastodon/attachments.ts';
import { uploadFile } from '@/upload.ts';

const mediaBodySchema = z.object({
  file: fileSchema,
  thumbnail: fileSchema.optional(),
  description: z.string().optional(),
  focus: z.string().optional(),
});

const mediaController: AppController = async (c) => {
  const result = mediaBodySchema.safeParse(await parseBody(c.req.raw));

  if (!result.success) {
    return c.json({ error: 'Bad request.', schema: result.error }, 422);
  }

  try {
    const { file, description } = result.data;
    const media = await uploadFile(file, { pubkey: c.get('pubkey')!, description });
    return c.json(renderAttachment(media));
  } catch (e) {
    console.error(e);
    return c.json({ error: 'Failed to upload file.' }, 500);
  }
};

export { mediaController };
