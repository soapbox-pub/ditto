import { analyzeFile, extractVideoFrame, transcodeVideo } from '@ditto/transcode';
import { ScopedPerformance } from '@esroyo/scoped-performance';
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
  using perf = new ScopedPerformance();
  perf.mark('start');

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

  perf.mark('probe-start');
  const probe = await analyzeFile(file.stream()).catch(() => null);
  perf.mark('probe-end');

  perf.mark('transcode-start');
  if (baseType === 'video') {
    let needsTranscode = false;

    for (const stream of probe?.streams ?? []) {
      if (stream.codec_type === 'video' && stream.codec_name !== 'h264') {
        needsTranscode = true;
        break;
      }
      if (stream.codec_type === 'audio' && stream.codec_name !== 'aac') {
        needsTranscode = true;
        break;
      }
    }

    if (needsTranscode) {
      const stream = transcodeVideo(file.stream());
      const transcoded = await new Response(stream).bytes();
      file = new File([transcoded], file.name, { type: 'video/mp4' });
    }
  }
  perf.mark('transcode-end');

  perf.mark('upload-start');
  const tags = await uploader.upload(file, { signal });
  perf.mark('upload-end');

  const url = tags[0][1];

  perf.mark('analyze-start');

  if (description) {
    tags.push(['alt', description]);
  }

  const x = tags.find(([key]) => key === 'x')?.[1];
  const m = tags.find(([key]) => key === 'm')?.[1];
  const dim = tags.find(([key]) => key === 'dim')?.[1];
  const size = tags.find(([key]) => key === 'size')?.[1];
  const image = tags.find(([key]) => key === 'image')?.[1];
  const thumb = tags.find(([key]) => key === 'thumb')?.[1];
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

  if (baseType === 'video' && (!image || !thumb)) {
    const bytes = await extractVideoFrame(file.stream());
    const [[, url]] = await uploader.upload(new File([bytes], 'thumb.jpg', { type: 'image/jpeg' }), { signal });

    if (!image) {
      tags.push(['image', url]);
    }

    const video = probe?.streams.find((stream) => stream.codec_type === 'video');

    if (video && video.width && video.height) {
      const { width, height } = video;

      if (!dim) {
        tags.push(['dim', `${width}x${height}`]);
      }

      if (!blurhash) {
        try {
          const { data, info } = await sharp(bytes)
            .raw()
            .ensureAlpha()
            .resize({
              width: width > height ? undefined : 64,
              height: height > width ? undefined : 64,
              fit: 'inside',
            })
            .toBuffer({ resolveWithObject: true });

          const blurhash = encode(new Uint8ClampedArray(data), info.width, info.height, 4, 4);
          tags.push(['blurhash', blurhash]);
        } catch (e) {
          logi({ level: 'error', ns: 'ditto.upload.analyze', error: errorJson(e) });
        }
      }
    }
  }

  // If the uploader didn't already, try to get a blurhash and media dimensions.
  // This requires `MEDIA_ANALYZE=true` to be configured because it comes with security tradeoffs.
  if (baseType === 'image' && conf.mediaAnalyze && (!blurhash || !dim)) {
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
          .resize({
            width: width > height ? undefined : 64,
            height: height > width ? undefined : 64,
            fit: 'inside',
          })
          .toBuffer({ resolveWithObject: false })
          .then((buffer) => new Uint8ClampedArray(buffer));

        const blurhash = encode(pixels, width, height, 4, 4);
        tags.push(['blurhash', blurhash]);
      }
    } catch (e) {
      logi({ level: 'error', ns: 'ditto.upload.analyze', error: errorJson(e) });
    }
  }

  perf.mark('analyze-end');

  const upload = {
    id: crypto.randomUUID(),
    url,
    tags,
    pubkey,
    uploadedAt: new Date(),
  };

  dittoUploads.set(upload.id, upload);

  const timing = [
    perf.measure('probe', 'probe-start', 'probe-end'),
    perf.measure('transcode', 'transcode-start', 'transcode-end'),
    perf.measure('upload', 'upload-start', 'upload-end'),
    perf.measure('analyze', 'analyze-start', 'analyze-end'),
  ].reduce<Record<string, number>>((acc, m) => {
    const name = m.name.split('::')[1]; // ScopedPerformance uses `::` to separate the name.
    acc[name] = m.duration / 1000; // Convert to seconds for logging.
    return acc;
  }, {});

  perf.mark('end');

  logi({
    level: 'info',
    ns: 'ditto.upload',
    upload: { ...upload, uploadedAt: upload.uploadedAt.toISOString() },
    timing,
    duration: perf.measure('total', 'start', 'end').duration / 1000,
  });

  return upload;
}
