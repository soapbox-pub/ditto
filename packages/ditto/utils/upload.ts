import { transcodeVideo } from '@ditto/transcode';
import { HTTPException } from '@hono/hono/http-exception';
import { logi } from '@soapbox/logi';
import { crypto } from '@std/crypto';
import { encodeHex } from '@std/encoding/hex';
import { encode } from 'blurhash';
import sharp from 'sharp';

import { AppContext } from '@/app.ts';
import { DittoUpload, dittoUploads } from '@/DittoUploads.ts';
import { errorJson } from '@/utils/log.ts';

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
  const { conf, uploader } = c.var;

  if (!uploader) {
    throw new HTTPException(500, {
      res: c.json({ error: 'No uploader configured.' }),
    });
  }

  const { pubkey, description } = meta;

  if (file.size > conf.maxUploadSize) {
    throw new Error('File size is too large.');
  }

  const [baseType] = file.type.split('/');

  if (baseType === 'video') {
    file = new Proxy(file, {
      get(target, prop) {
        if (prop === 'stream') {
          return () => transcodeVideo(target.stream());
        } else {
          // @ts-ignore This is fine.
          return target[prop];
        }
      },
    });
  }

  const tags = await uploader.upload(file, { signal });
  const url = tags[0][1];

  if (description) {
    tags.push(['alt', description]);
  }

  const x = tags.find(([key]) => key === 'x')?.[1];
  const m = tags.find(([key]) => key === 'm')?.[1];
  const dim = tags.find(([key]) => key === 'dim')?.[1];
  const size = tags.find(([key]) => key === 'size')?.[1];
  const blurhash = tags.find(([key]) => key === 'blurhash')?.[1];

  if (!x) {
    const sha256 = encodeHex(await crypto.subtle.digest('SHA-256', file.stream()));
    tags.push(['x', sha256]);
  }

  if (!m) {
    tags.push(['m', file.type]);
  }

  if (!size) {
    tags.push(['size', file.size.toString()]);
  }

  // If the uploader didn't already, try to get a blurhash and media dimensions.
  // This requires `MEDIA_ANALYZE=true` to be configured because it comes with security tradeoffs.
  if (conf.mediaAnalyze && (!blurhash || !dim)) {
    try {
      const bytes = await new Response(file.stream()).bytes();
      const img = sharp(bytes);

      const { width, height } = await img.metadata();

      if (!dim && (width && height)) {
        tags.push(['dim', `${width}x${height}`]);
      }

      if (!blurhash && (width && height)) {
        const pixels = await img
          .raw()
          .ensureAlpha()
          .toBuffer({ resolveWithObject: false })
          .then((buffer) => new Uint8ClampedArray(buffer));

        const blurhash = encode(pixels, width, height, 4, 4);
        tags.push(['blurhash', blurhash]);
      }
    } catch (e) {
      logi({ level: 'error', ns: 'ditto.upload.analyze', error: errorJson(e) });
    }
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
