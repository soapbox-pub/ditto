import { AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { insertUnattachedMedia } from '@/db/unattached-media.ts';
import { z } from '@/deps.ts';
import { fileSchema } from '@/schema.ts';
import { configUploader as uploader } from '@/uploaders/config.ts';
import { parseBody } from '@/utils/web.ts';

const uploadSchema = fileSchema
  .refine((file) => !!file.type, 'File type is required.')
  .refine((file) => file.size <= Conf.maxUploadSize, 'File size is too large.');

const mediaBodySchema = z.object({
  file: uploadSchema,
  thumbnail: uploadSchema.optional(),
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
    const { cid } = await uploader.upload(file);

    const url = new URL(`/ipfs/${cid}`, Conf.mediaDomain).toString();

    const media = await insertUnattachedMedia({
      pubkey: c.get('pubkey')!,
      url,
      data: {
        name: file.name,
        mime: file.type,
        size: file.size,
        description,
      },
    });

    return c.json({
      id: media.id,
      type: getAttachmentType(file.type),
      url,
      preview_url: url,
      remote_url: null,
      description,
      blurhash: null,
    });
  } catch (e) {
    console.error(e);
    return c.json({ error: 'Failed to upload file.' }, 500);
  }
};

/** MIME to Mastodon API `Attachment` type. */
function getAttachmentType(mime: string): string {
  const [type] = mime.split('/');

  switch (type) {
    case 'image':
    case 'video':
    case 'audio':
      return type;
    default:
      return 'unknown';
  }
}

export { mediaController };
