import { Conf } from '@/config.ts';
import { insertUnattachedMedia, UnattachedMedia } from '@/db/unattached-media.ts';
import { configUploader as uploader } from '@/uploaders/config.ts';

interface FileMeta {
  pubkey: string;
  description?: string;
}

/** Upload a file, track it in the database, and return the resulting media object. */
async function uploadFile(file: File, meta: FileMeta, signal?: AbortSignal): Promise<UnattachedMedia> {
  const { pubkey, description } = meta;

  if (file.size > Conf.maxUploadSize) {
    throw new Error('File size is too large.');
  }

  const tags = await uploader.upload(file, { signal });
  const url = tags[0][1];

  if (description) {
    tags.push(['alt', description]);
  }

  return insertUnattachedMedia({
    id: crypto.randomUUID(),
    pubkey,
    url,
    data: tags,
    uploaded_at: Date.now(),
  });
}

export { uploadFile };
