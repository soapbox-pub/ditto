import { HTTPException } from '@hono/hono/http-exception';

import { AppContext } from '@/app.ts';
import { Conf } from '@/config.ts';
import { DittoUpload, dittoUploads } from '@/DittoUploads.ts';
import { getOptionalNip94Metadata, toByteArray } from '@/utils/image-metadata.ts';
import type { Nip94MetadataOptional } from '@/interfaces/Nip94Metadata.ts';
import { encodeHex } from '@std/encoding/hex';

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
  const tagMap = tags.reduce((map, value) => map.set(value[0], value.slice(1)), new Map<string, string[]>());

  const url = tags[0][1];

  if (description) {
    tags.push(['alt', description]);
  }

  let metadata: Nip94MetadataOptional | undefined;
  if (!tagMap.has('dim')) {
    // blurhash needs us to call sharp() anyway to decode the image data.
    // all getOptionalNip94Metadata does is call these in sequence, plus
    // one extra sha256 which is whatever (and actually does come in handy later.)
    metadata ??= await getOptionalNip94Metadata(file);
    tags.push(['dim', metadata.dim!]);
    if (!tagMap.has('blurhash')) {
      tags.push(['blurhash', metadata.blurhash!]);
    }
  }
  if (!tagMap.has('x') || !tagMap.has('ox')) {
    const hash = metadata?.x || await crypto.subtle.digest('SHA-256', await toByteArray(file)).then(encodeHex);
    tags.push(['x', hash!]);
    tags.push(['ox', hash!]);
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
