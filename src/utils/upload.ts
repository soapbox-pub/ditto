import { HTTPException } from '@hono/hono/http-exception';

import { AppContext } from '@/app.ts';
import { Conf } from '@/config.ts';
import { DittoUpload, dittoUploads } from '@/DittoUploads.ts';

interface FileMeta {
  pubkey: string;
  description?: string;
}

/** Upload a file, track it in the database, and return the resulting media object. */
export async function uploadFile(
  c: AppContext,
  file: File,
  meta: FileMeta,
  signal?: AbortSignal,
): Promise<DittoUpload> {
  const uploader = c.get('uploader');
  if (!uploader) {
    throw new HTTPException(500, {
      res: c.json({ error: 'No uploader configured.' }),
    });
  }

  const { pubkey, description } = meta;

  if (file.size > Conf.maxUploadSize) {
    throw new Error('File size is too large.');
  }

  const tags = await uploader.upload(file, { signal });
  const url = tags[0][1];

  if (description) {
    tags.push(['alt', description]);
  }

  const upload = {
    id: crypto.randomUUID(),
    url,
    tags,
    pubkey,
    uploadedAt: new Date(),
  };

  dittoUploads.set(upload.id, upload);

  return upload;
}
