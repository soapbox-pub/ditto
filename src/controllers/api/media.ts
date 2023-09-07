import { AppController } from '@/app.ts';
import { z } from '@/deps.ts';
import { fileSchema } from '@/schema.ts';
import { parseBody } from '@/utils/web.ts';
import { s3Uploader } from '@/uploaders/s3.ts';

const mediaBodySchema = z.object({
  file: fileSchema.refine((file) => !!file.type),
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
    const { file } = result.data;
    const { cid } = await s3Uploader(file);

    return c.json({
      id: cid,
      type: file.type,
    });
  } catch (e) {
    console.error(e);
    return c.json({ error: 'Failed to upload file.' }, 500);
  }
};

export { mediaController };
