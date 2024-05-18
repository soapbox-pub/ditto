import { Conf } from '@/config.ts';
import { insertUnattachedMedia } from '@/db/unattached-media.ts';
import { configUploader as uploader } from '@/uploaders/config.ts';

interface FileMeta {
  pubkey: string;
  description?: string;
}

/** Upload a file, track it in the database, and return the resulting media object. */
async function uploadFile(file: File, meta: FileMeta, signal?: AbortSignal): Promise<string[][]> {
  const { type, size } = file;
  const { pubkey, description } = meta;

  if (file.size > Conf.maxUploadSize) {
    throw new Error('File size is too large.');
  }

  const { url, sha256, cid } = await uploader.upload(file, { signal });

  const data: string[][] = [
    ['url', url],
    ['m', type],
    ['size', size.toString()],
  ];

  if (sha256) {
    data.push(['x', sha256]);
  }

  if (cid) {
    data.push(['cid', cid]);
  }

  if (description) {
    data.push(['alt', description]);
  }

  await insertUnattachedMedia({ pubkey, url, data });

  return data;
}

export { uploadFile };
