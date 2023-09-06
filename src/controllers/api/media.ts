import { AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { S3Client, z } from '@/deps.ts';
import { fileSchema } from '@/schema.ts';
import { parseBody } from '@/utils/web.ts';

const s3 = new S3Client({ ...Conf.s3 });

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

  const { file } = result.data;

  try {
    await s3.putObject('test', file.stream());
  } catch (e) {
    console.error(e);
    return c.json({ error: 'Failed to upload file.' }, 500);
  }

  return c.json({});
};

export { mediaController };
