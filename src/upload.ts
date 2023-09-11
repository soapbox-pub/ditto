import { Conf } from '@/config.ts';
import { insertUnattachedMedia } from '@/db/unattached-media.ts';
import { configUploader as uploader } from '@/uploaders/config.ts';

interface FileMeta {
  pubkey: string;
  description?: string;
}

/** Upload a file, track it in the database, and return the resulting media object. */
async function uploadFile(file: File, meta: FileMeta) {
  const { name, type, size } = file;
  const { pubkey, description } = meta;

  if (file.size > Conf.maxUploadSize) {
    throw new Error('File size is too large.');
  }

  const { cid } = await uploader.upload(file);
  const url = new URL(`/ipfs/${cid}`, Conf.mediaDomain).toString();

  return insertUnattachedMedia({
    pubkey,
    url,
    data: {
      name,
      size,
      description,
      mime: type,
    },
  });
}

export { uploadFile };
