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
  const { ffmpegPath, ffprobePath, mediaAnalyze, mediaTranscode } = conf;

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
  const probe = mediaTranscode ? await analyzeFile(file.stream(), { ffprobePath }).catch(() => null) : null;
  const video = probe?.streams.find((stream) => stream.codec_type === 'video');
  perf.mark('probe-end');

  perf.mark('transcode-start');
  if (baseType === 'video' && mediaTranscode) {
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
      const tmp = new URL('file://' + await Deno.makeTempFile());
      await Deno.writeFile(tmp, file.stream());
      const stream = transcodeVideo(tmp, { ffmpegPath });
      const transcoded = await new Response(stream).bytes();
      file = new File([transcoded], file.name, { type: 'video/mp4' });
      await Deno.remove(tmp);
    }
  }
  perf.mark('transcode-end');

  perf.mark('upload-start');
  const tags = await uploader.upload(file, { signal });
  perf.mark('upload-end');

  const url = tags[0][1];

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

  perf.mark('analyze-start');

  if (baseType === 'video' && mediaAnalyze && mediaTranscode && video && (!image || !thumb)) {
    try {
      const tmp = new URL('file://' + await Deno.makeTempFile());
      await Deno.writeFile(tmp, file.stream());
      const frame = await extractVideoFrame(tmp, '00:00:01', { ffmpegPath });
      await Deno.remove(tmp);
      const [[, url]] = await uploader.upload(new File([frame], 'thumb.jpg', { type: 'image/jpeg' }), { signal });

      if (!image) {
        tags.push(['image', url]);
      }

      if (!dim) {
        tags.push(['dim', await getImageDim(frame)]);
      }

      if (!blurhash) {
        tags.push(['blurhash', await getBlurhash(frame)]);
      }
    } catch (e) {
      logi({ level: 'error', ns: 'ditto.upload.analyze', error: errorJson(e) });
    }
  }

  if (baseType === 'image' && mediaAnalyze && (!blurhash || !dim)) {
    try {
      const bytes = await new Response(file.stream()).bytes();

      if (!dim) {
        tags.push(['dim', await getImageDim(bytes)]);
      }

      if (!blurhash) {
        tags.push(['blurhash', await getBlurhash(bytes)]);
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

async function getImageDim(bytes: Uint8Array): Promise<`${number}x${number}`> {
  const img = sharp(bytes);
  const { width, height } = await img.metadata();

  if (!width || !height) {
    throw new Error('Image metadata is missing.');
  }

  return `${width}x${height}`;
}

/** Get a blurhash from an image file. */
async function getBlurhash(bytes: Uint8Array, maxDim = 64): Promise<string> {
  const img = sharp(bytes);

  const { width, height } = await img.metadata();

  if (!width || !height) {
    throw new Error('Image metadata is missing.');
  }

  const { data, info } = await img
    .raw()
    .ensureAlpha()
    .resize({
      width: width > height ? undefined : maxDim,
      height: height > width ? undefined : maxDim,
      fit: 'inside',
    })
    .toBuffer({ resolveWithObject: true });

  const pixels = new Uint8ClampedArray(data);

  return encode(pixels, info.width, info.height, 4, 4);
}
